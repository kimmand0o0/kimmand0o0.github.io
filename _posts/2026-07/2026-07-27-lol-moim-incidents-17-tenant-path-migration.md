---
layout: post
title: '[ 롤모임 운영일지 ] - 17. 주소가 곧 격리다 — 세부 페이지를 /g/:slug로 옮긴 이유'
author: haeran
date: 2026-07-27 21:50:00 +0900
categories: [Journal, Development Diary]
tags: [운영일지, 멀티테넌시, React, react-router, 라우팅]
---

[02편]({% post_url 2026-07/2026-07-12-lol-moim-incidents-02-multitenancy %})에서 멀티테넌시를 경로 방식(`X-Group-Slug` 헤더)으로 설계했고, [10편]({% post_url 2026-07/2026-07-20-lol-moim-incidents-10-cross-tenant-leak %})에서 백엔드의 격리 누락을 한바탕 잡았다. 그런데 그 뒤로도 "다른 모임 화면에 원조 모임(이세계) 멤버가 보인다"는 증상이 또 나왔다. 이번엔 백엔드가 아니었다. 백엔드는 받은 헤더대로 정확히 스코프하고 있었고, **프론트가 틀린 slug를 보내고 있었다.** 이번 편은 그 마지막 조각 — 프론트 라우팅을 `/g/:slug/*`로 옮긴 마이그레이션 기록이다.

<br/>

## 증상 — 백엔드를 다 고쳤는데 왜 또 섞이나

플랫폼 운영진 계정으로 다른 모임에 들어가서 홈을 본 다음, 멤버 목록(`/users`) 같은 세부 페이지로 이동하면 — 방금 보던 모임이 아니라 **이세계 모임의 멤버가 떴다.**

10편까지의 사고들과 결이 다른 게, 이건 DB 쿼리에서 `groupId`가 빠진 게 아니다. API 요청 자체가 "이세계 모임 것을 달라"고 하고 있었다. 격리는 완벽하게 작동했다. 요청이 틀렸을 뿐.

<br/>

## 원인 — 모임 컨텍스트가 URL 밖에 있었다

당시 구조에서 "지금 어느 모임을 보고 있는가"라는 상태는 URL에 없었다. 모임 홈만 `/g/:slug`였고, 세부 페이지는 전부 루트 경로(`/users`, `/auction`, `/calendar`...)였다. 그래서 `apiFetch`는 이렇게 동작했다.

```ts
// packages/frontend/src/lib/api.ts (당시 동작)
// URL에 /g/:slug가 있으면 그걸 쓰고, 없으면 "마지막 활성 모임"(localStorage)을 쓴다
if (typeof window !== "undefined" && !headers["X-Group-Slug"]) {
  const m = window.location.pathname.match(/^\/g\/([a-z0-9-]+)/);
  if (m) { setActiveGroupSlug(m[1]); headers["X-Group-Slug"] = m[1]; }
  else headers["X-Group-Slug"] = getActiveGroupSlug();   // ← 여기가 문제
}
```

세부 페이지는 루트 경로라 항상 else 분기 — 즉 **localStorage에 저장된 "마지막 활성 모임"** 으로 요청이 나갔다. 그리고 이 활성 모임 값은 `/g/:slug` 모임 홈을 지나갈 때만 갱신됐다.

조합하면 사고 시나리오가 완성된다. 플랫폼 운영진(활성 모임 = 이세계)이 다른 모임 홈을 열었다가, 활성 모임이 갱신되기 전에(혹은 갱신을 안 거치는 경로로) 루트 경로 세부 페이지로 이동하면 — stale한 slug로 조회가 나가고, 화면엔 이세계 멤버가 뜬다.

한 문장으로 요약하면: **"어느 모임인가"라는 상태가 URL이 아니라 localStorage에 있었고, 그 둘이 어긋날 수 있었다.**

<br/>

## 첫 수습 — 홈 진입 시 활성 모임을 확정하기

첫 수정은 모임 홈(`/g/:slug`)에 진입하는 순간 그 slug를 활성 모임으로 명시적으로 저장하는 것이었다. 커밋 메시지에도 "완화"라고 적었다 — 홈을 거쳐서 이동하는 경로는 고쳐지지만, 홈을 안 거치는 경로(딥링크, 새 탭, 뒤로가기)에서는 여전히 어긋날 수 있다는 걸 알고 있었기 때문이다.

상태를 "더 부지런히 동기화"하는 방식은 언제나 이렇다. 동기화 시점을 하나 추가할 때마다 구멍이 하나 줄어들 뿐, 구멍이 없어졌다는 보장은 끝까지 안 생긴다.

<br/>

## 근본 해결 — URL이 모임을 담게 하기

나흘 뒤, 라우팅 자체를 바꿨다. 모임에 종속되는 모든 세부 페이지를 `/g/:slug/*` 아래로 중첩시켰다. `/users`가 아니라 `/g/isegye/users`. 이러면 `apiFetch`의 URL 추출 분기가 **항상** 성공하고, localStorage 폴백은 진짜 전역 화면에서만 쓰인다.

"어느 모임을 보고 있는가"가 주소 그 자체가 되는 것이다. 주소는 stale해질 수 없다. 새 탭에서 열어도, 북마크로 진입해도, 뒤로가기를 해도 URL은 그 화면이 어느 모임인지 정확히 알고 있다.

<br/>

## 45개 파일을 "안 고치고" 고치는 법 — 드롭인 마이그레이션

문제는 규모였다. 그룹 종속 링크와 `navigate()` 호출을 가진 파일이 45개쯤 됐다. `<Link to="/users">`를 전부 `<Link to={`/g/${slug}/users`}>`로 바꾸는 건 하기도 싫고, 빠뜨리기도 쉽다.

그래서 react-router의 `Link`/`useNavigate`와 시그니처가 같은 **드롭인 래퍼**를 만들었다.

```tsx
// packages/frontend/src/lib/groupNav.tsx
// 모임(테넌트) 종속 최상위 경로 세그먼트 — 이 경로들만 /g/:slug 프리픽스가 붙는다.
export const GROUP_SEGMENTS = [
  "users", "auction", "calendar", "hall-of-fame", "notices", "admin",
  "missions", "streak-bets", "season-pass", "point-bets", "evaluator",
  "bet-store", "mentoring", "eval-feed", "lfg", "external-match", "league",
  "recap", "inventory",
] as const;

/** 모임 종속 경로면 /g/<slug> 프리픽스를 붙이고, 아니면 그대로 반환. */
export function groupHref(slug: string, to: string): string {
  return isGroupScopedPath(to) ? `/g/${slug}${to}` : to;
}

// react-router Link 드롭인. 문자열 to가 모임 종속 경로면 현재 URL의 slug를 프리픽스한다.
export const GLink = forwardRef<HTMLAnchorElement, LinkProps>(function GLink({ to, ...rest }, ref) {
  const slug = useCurrentSlug();   // useParams().slug ?? 활성 모임
  const scopedTo: To = typeof to === "string" ? groupHref(slug, to) : to;
  return <Link ref={ref} to={scopedTo} {...rest} />;
});
```

핵심은 각 파일에서 **import 한 줄만** 바꾸면 된다는 것.

```tsx
// 각 페이지 파일에서 — JSX는 한 글자도 안 바뀐다
import { GLink as Link, useGroupNav as useNavigate } from "@/lib/groupNav";
// <Link to="/users"> ... 기존 JSX 그대로
```

`<Link to="/users">`라고 쓰인 JSX는 그대로 두고, 그 `Link`가 실제로 렌더하는 주소만 `/g/<현재 slug>/users`로 바뀐다. 어떤 경로가 모임 종속인지는 `GROUP_SEGMENTS` 화이트리스트가 판단하니, `/profile`이나 `/login` 같은 전역 경로는 래퍼를 통과해도 프리픽스가 안 붙는다. 02편에서 `account.role`의 이름은 유지한 채 값을 채우는 방식만 바꿨던 것과 같은 전략이다 — **인터페이스를 유지하면 파급 범위가 줄어든다.**

결과적으로 커밋은 58개 파일을 건드렸지만, 그중 대부분은 import 한 줄 교체였고 실질적인 로직 변경은 라우터와 래퍼 모듈에 집중됐다.

<br/>

## 레거시 경로 호환 — 북마크는 죄가 없다

라우트를 옮기면 기존 주소(`/users`)로 들어오는 북마크·딥링크·구버전 링크가 전부 404가 된다. 그래서 레거시 루트 경로에는 리다이렉트를 깔았다.

```tsx
// packages/frontend/src/router.tsx
// 레거시 루트 경로(/users 등)로 진입하면 활성 모임 slug를 붙여 /g/:slug/... 로 보낸다.
// (북마크·외부 딥링크·구버전 링크 호환. in-app 링크는 GLink가 이미 slug를 담아 여기 안 옴.)
function LegacyGroupRedirect() {
  const loc = useLocation();
  const slug = getActiveGroupSlug();
  return <Navigate to={`/g/${slug}${loc.pathname}${loc.search}${loc.hash}`} replace />;
}
```

여기서만큼은 여전히 "활성 모임" localStorage 값을 쓴다 — 레거시 주소에는 모임 정보가 없으니 달리 방법이 없다. 대신 이 경로는 이제 "외부에서 옛 주소로 들어온 첫 진입" 한 번뿐이고, 리다이렉트된 순간부터는 URL이 진실이 된다. 커밋 기록 기준으로 tsc와 vite 빌드, 그리고 `groupHref` 판정 로직의 19개 케이스 검증을 통과시킨 뒤 배포했다.

<br/>

## 정리

1. **상태가 두 곳에 있으면 언젠가 어긋난다.** "지금 어느 모임인가"가 URL(일부)과 localStorage(나머지)에 나뉘어 있던 게 근본 원인이었다. 동기화를 부지런히 하는 건 완화일 뿐, 원본(source of truth)을 하나로 만드는 것만이 해결이다.
2. **웹에서 화면 컨텍스트의 원본은 URL이어야 한다.** URL은 새 탭·북마크·뒤로가기·새로고침 전부에서 살아남는 유일한 상태다. 백엔드가 헤더로 스코프하는 구조라면, 그 헤더의 출처가 URL이 되는 순간 프론트 격리도 완성된다.
3. **대량 마이그레이션은 인터페이스를 유지한 드롭인으로.** 45개 파일의 JSX를 고치는 대신 `Link`/`useNavigate`와 시그니처가 같은 래퍼를 만들어 import만 바꿨다. 빠뜨림 위험이 "모든 링크"에서 "import 한 줄"로 줄어든다.
4. **격리는 백엔드만의 일이 아니다.** 10편까지는 "서버가 틀린 데이터를 주는" 사고였고, 이번 건 "프론트가 틀린 요청을 하는" 사고였다. 테넌시는 요청이 만들어지는 곳부터 응답이 조립되는 곳까지 전 구간의 일이라는 걸, 마지막 조각을 맞추고서야 실감했다.
