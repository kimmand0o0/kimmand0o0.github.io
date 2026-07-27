---
layout: post
title: '[ 롤모임 운영일지 ] - 15. 서비스가 자기 자신을 DDoS하던 날 — 무한 요청 루프 2연타'
author: haeran
date: 2026-07-27 21:30:00 +0900
categories: [Journal, Development Diary]
tags: [운영일지, React, useEffect, useCallback, 프론트엔드]
---

[04편](/journal/development%20diary/2026/07/14/lol-moim-incidents-04-n-plus-one.html)에서 "요청 1개가 쿼리 130개로 터지는" N+1 이야기를 했는데, 이번 편은 그보다 한 단계 더 나쁜 케이스다. 요청 1개가 쿼리 N개가 되는 게 아니라, **요청 자체가 무한**이 되는 버그. 그것도 일주일 사이에 두 번, 서로 다른 훅에서 같은 원리로 터졌다.

서버 입장에서 보면 이건 사실상 DDoS다. 다만 공격자가 외부가 아니라 우리가 배포한 프론트엔드 코드라는 점이 다를 뿐이다.

## TL;DR

- 테넌시 마이그레이션 다음날 아침, Cloud Run 로그에서 **동일 클라이언트가 같은 API를 초당 10회 이상 무한 호출**하는 걸 발견했다. 원인은 새로 만든 `useGroupNav()` 훅이 매 렌더마다 새 함수를 리턴한 것.
- 6일 뒤, 시즌패스 코스메틱을 출시하고 **15분 만에** 같은 종류의 버그가 또 터졌다. 이번엔 훅이 아니라 소비자 쪽 — `usePlugins()`가 주는 함수를 `useEffect` deps에 그대로 넣은 것.
- 두 사건의 공통 엔진은 같다: **fetch → setState → 리렌더 → 새 참조 → effect 재실행 → fetch**. 참조가 불안정한 값이 deps에 들어가는 순간, 데이터를 받아오는 effect는 영구기관이 된다.

<br/>

## 1. 사건 1 — 마이그레이션 다음날 아침, 초당 10회

7월 7일에 세부 페이지들을 `/g/:slug/*` 경로로 옮기는 테넌시 마이그레이션([17편](/journal/development%20diary/2026/07/27/lol-moim-incidents-17-tenant-path-migration.html)에서 자세히 다룬다)을 배포했다. 이때 `useNavigate`를 감싸서 모임 슬러그를 자동으로 붙여주는 `useGroupNav()`라는 훅을 새로 만들어 앱 전체에 깔았다.

다음날 아침부터 "사이트가 렉 걸린다", "로딩이 무한반복된다", "Failed to fetch가 계속 뜬다"는 증상이 몰려왔다. Cloud Run 로그를 열어보니 동일 클라이언트가 같은 경매 세션의 `/live-bid?slim=1`을 **초당 10회 이상** 쉬지 않고 호출하고 있었다.

문제의 훅은 이렇게 생겼었다.

```tsx
// packages/frontend/src/lib/groupNav.tsx (수정 전)
export function useGroupNav() {
  const navigate = useNavigate();
  const slug = useCurrentSlug();
  return (to: To | number, options?: NavigateOptions) => {   // 매 렌더마다 새 함수
    if (typeof to === "number") return navigate(to);
    const scoped: To = typeof to === "string" ? groupHref(slug, to) : to;
    return navigate(scoped, options);
  };
}
```

훅 자체는 아무 잘못이 없어 보인다. 그냥 `navigate`를 감싼 함수를 리턴할 뿐이니까. 문제는 이 함수가 **호출될 때마다 새로 만들어진다**는 것, 그리고 이 훅이 `useNavigate`의 드롭인 교체라서 소비자들이 기존 습관대로 리턴값을 의존성 배열에 넣는다는 것이다.

라이브 경매 페이지가 정확히 그 패턴이었다. `loadData`가 `navigate`를 의존성으로 가진 `useCallback`이고, 그 `loadData`를 의존성으로 가진 `useEffect`가 데이터를 fetch한다. 그러면 이런 체인이 돈다.

```
렌더 → useGroupNav()가 새 함수 리턴
     → loadData(useCallback) 재생성
     → useEffect "deps 바뀌었네?" → 재실행 → fetch
     → 응답 도착 → setState
     → 리렌더 → 다시 처음부터
```

한 바퀴 도는 데 걸리는 시간이 API 응답 시간(수십~수백 ms)이니, 클라이언트 한 명당 초당 수 회~10회 이상의 요청이 나온다. 유저가 뭘 잘못한 것도 아니고, 그냥 페이지를 열어둔 것만으로.

수정은 `useCallback` 한 겹이다.

```tsx
// packages/frontend/src/lib/groupNav.tsx (수정 후)
export function useGroupNav() {
  const navigate = useNavigate();
  const slug = useCurrentSlug();
  // 매 렌더마다 새 함수를 리턴하면 안 됨 — 이걸 의존성으로 쓰는 useCallback/useEffect가
  // 매 렌더 재생성/재실행되어 무한 재조회 루프에 빠짐.
  return useCallback(
    (to: To | number, options?: NavigateOptions) => {
      if (typeof to === "number") return navigate(to);
      const scoped: To = typeof to === "string" ? groupHref(slug, to) : to;
      return navigate(scoped, options);
    },
    [navigate, slug],
  );
}
```

배포하고 로그의 폭주는 멈췄다. 마이그레이션 배포부터 이 수정까지 하루가 채 안 걸렸지만, 그 사이 서비스는 프론트엔드가 만들어낸 트래픽에 스스로 짓눌려 있었다.

<br/>

## 2. 사건 2 — 코스메틱 출시 15분 만에

6일 뒤인 7월 14일, 시즌패스 코스메틱(칭호 테두리, 네임이펙트 등)을 출시했다. 커밋 로그를 보면 그날 오후가 그대로 재현된다 — 17시 47분에 기능 출시, 17시 55분에 어드민 우회 누락 수정, 그리고 **18시 2분에 "무한 요청 루프 긴급 수정"**. 출시 15분 만에 같은 종류의 버그가 또 터진 것이다.

이번 범인은 코스메틱 조회 훅이었다.

```tsx
// packages/frontend/src/hooks/useSeasonCosmetics.ts (수정 전)
export function useSeasonCosmetic(userId?: number) {
  const { has } = usePlugins();
  const { isPlatformAdmin } = usePermissions();
  const [equipped, setEquipped] = useState({});

  useEffect(() => {
    setEquipped({});
    if (!userId || !(has("season-pass") || isPlatformAdmin)) return;
    apiFetch(`/api/season-pass/cosmetics/user/${userId}`)
      .then(/* ... setEquipped ... */);
  }, [userId, has, isPlatformAdmin]);   // ← has가 문제
  // ...
}
```

`usePlugins()`가 리턴하는 `has`는 객체 리터럴 안의 인라인 화살표 함수라서 **매 렌더마다 새 참조**다. 그걸 deps에 넣었으니 사건 1과 완전히 같은 엔진이 돈다: fetch → `setEquipped` → 리렌더 → 새 `has` → effect 재실행 → fetch.

더 아픈 건 이 훅이 걸려 있는 위치였다. `useSeasonCosmetic`은 닉네임을 그리는 공용 `Nickname` 컴포넌트에서 호출되는데, 이 컴포넌트는 랭킹·멤버 목록·채팅 등 [04편](/journal/development%20diary/2026/07/14/lol-moim-incidents-04-n-plus-one.html)에서 세어봤듯 22개 페이지에서 재사용된다. 유저 목록 하나에 닉네임이 50개 있으면 무한 루프도 50개다. 사이트 전반이 느려지고 요청이 무더기로 실패하는 것처럼 보인 이유다.

수정은 deps에서 함수를 빼고, effect가 실제로 의존하는 **판정 결과(원시값)**만 남기는 것이었다.

```tsx
// packages/frontend/src/hooks/useSeasonCosmetics.ts (수정 후)
const { has } = usePlugins();
const { isPlatformAdmin } = usePermissions();
// has는 매 렌더마다 새 함수 참조 — deps에 함수 자체를 넣으면 무한 반복된다.
// 원시값(boolean)만 의존성으로 둔다.
const enabled = !!userId && (has("season-pass") || isPlatformAdmin);

useEffect(() => {
  if (!userId || !enabled) return;
  // ... fetch ...
}, [userId, enabled]);   // boolean은 값이 같으면 재실행 안 됨
```

`boolean`은 참조가 아니라 값으로 비교되니, 플러그인 상태가 실제로 바뀌지 않는 한 effect는 다시 돌지 않는다.

<br/>

## 3. 두 사건은 같은 버그의 양면이다

일주일 사이 두 번 터진 게 우연이 아니라는 게 이번 편의 요점이다. 두 사건은 정확히 대칭이다.

| | 사건 1 (useGroupNav) | 사건 2 (useSeasonCosmetic) |
| --- | --- | --- |
| 불안정한 참조를 만든 쪽 | **훅(생산자)** — 매 렌더 새 함수를 리턴 | `usePlugins`도 새 함수를 리턴하지만... |
| 루프를 완성한 쪽 | 소비자는 관례대로 deps에 넣었을 뿐 | **소비자** — 함수를 deps에 그대로 넣음 |
| 수정 위치 | 생산자에 `useCallback` | 소비자 deps를 원시값으로 |

그리고 루프가 완성되려면 재료가 하나 더 필요하다: **effect 안의 setState**. 참조가 불안정해도 effect가 setState를 안 하면 리렌더가 안 일어나서 루프는 한 바퀴로 끝난다. 하필 "데이터를 fetch해서 state에 넣는" effect가 프론트엔드에서 가장 흔한 패턴이라, 불안정한 참조 하나가 deps에 섞이는 순간 그대로 영구기관이 된다.

N+1과 비교하면 성격이 더 나쁘다. N+1은 요청 1번에 쿼리 130개로 "끝나는" 문제고, 유저가 페이지를 닫으면 멈춘다. 무한 루프는 페이지를 열어두는 것만으로 계속 돈다. 그리고 lint(`react-hooks/exhaustive-deps`)는 "deps에 빠진 게 있다"는 방향은 잘 잡아주지만, "deps에 넣은 그 값이 매 렌더 새 참조라서 루프가 된다"는 반대 방향은 잡아주지 못한다. 오히려 lint를 성실히 따를수록 함수를 deps에 넣게 된다.

<br/>

## 4. 남은 불씨

솔직하게 적어두면, `usePlugins()`의 `has`는 지금도 매 렌더 새 참조를 리턴한다. 사건 2를 소비자 쪽에서 고쳤기 때문이다. 즉 "usePlugins의 리턴값을 deps에 직접 넣지 않는다"는 컨벤션으로만 방어되고 있는 상태고, 새 코드가 이 지뢰를 다시 밟을 가능성은 열려 있다. 생산자 쪽(`useCallback` 또는 안정된 객체 리턴)도 고치는 게 맞다 — 다음 리팩터링 때 처리할 항목으로 남겨둔다.

무한까지는 아니어도 "겹치는" 요청 문제도 같은 주에 하나 더 잡았다. `usePlugins()`와 시즌 분위기 훅이 모듈 캐시(`cache === null`이면 fetch) 방식이었는데, 같은 렌더 tick에 여러 컴포넌트가 동시에 마운트되면 각자 `null`을 보고 **중복 요청**을 쏘는 race가 있었다. in-flight promise 가드 + 구독자 패턴으로 요청을 1회로 합쳤다. 무한 루프의 사촌쯤 되는 버그다.

<br/>

## 정리

1. **"매 렌더 새 참조 + deps + effect 안의 setState" 세 개가 모이면 무조건 무한 루프다.** 각각은 흔하고 무해해 보이는 코드라서, 조합이 완성되기 전까지는 아무 경고도 없다.
2. **공용 훅이 리턴하는 함수는 반드시 참조가 안정돼야 한다.** 훅은 소비자가 리턴값을 deps에 넣을 것이라고 가정하고 설계해야 한다. 특히 `useNavigate`처럼 기존 API의 드롭인 교체라면, 소비자는 원본과 같은 참조 안정성을 기대한다.
3. **effect deps에는 가능하면 원시값을 넣는다.** 함수나 객체 대신 그 함수로 계산한 boolean/string을 넣으면, 참조 안정성 문제 자체가 사라진다.
4. **이런 버그는 코드 리뷰보다 서버 로그가 먼저 알려준다.** 클라이언트에서는 "좀 느린데?" 정도로 보이지만, 서버 로그에서는 동일 클라이언트의 같은 요청이 초당 10회씩 찍히는 게 한눈에 보인다. 프론트엔드 버그를 백엔드 로그로 잡았다.
5. **출시 15분 만의 긴급 수정도 기록할 가치가 있다.** 같은 원리로 두 번 터졌다는 걸 나란히 놓고 보니, 개별 버그가 아니라 패턴이 보였다.
