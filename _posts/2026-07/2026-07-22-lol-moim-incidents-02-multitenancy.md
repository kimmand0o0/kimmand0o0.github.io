---
layout: post
title: '[ 롤모임 운영일지 ] - 02. 모임 하나짜리 서비스를 멀티테넌시로 바꾸기'
author: haeran
date: 2026-07-22 22:00:00 +0900
categories: [Journal, Development Diary]
tags: [운영일지, 멀티테넌시, 아키텍처, Prisma, PostgreSQL]
---

원래 이 서비스는 딱 하나의 롤 내전 모임("이세계롤모임")만을 위한 앱이었다. 그런데 다른 모임에서도 써보고 싶다는 얘기가 나오면서, 같은 코드베이스와 DB로 여러 "모임"을 동시에 운영하는 멀티테넌트 구조로 바꾸는 작업을 시작했다. 이번 편은 그 과정에서 세운 원칙, 실제로 짠 구조, 그리고 원칙과 다르게 흘러간 지점을 기록한다.

## 시작하기 전 세운 원칙: 함부로 시작하지 않기

멀티테넌시는 손대는 범위가 앱 전체라 잘못하면 기존 모임(이하 "원조 모임")의 데이터가 새는 사고로 직결된다. 그래서 사전 산정 문서(`docs/MULTITENANCY_ESTIMATE.md`)에 이런 게이트를 박아뒀다.

> "두 번째 모임이 실제로 들어오기로 확정되면 그때 Phase 1 시작"

즉 확정되지 않은 미래를 위해 미리 만들지 않는다는 것. 그리고 실제 Phase 1 진행 문서(`docs/PHASE1_MULTITENANCY.md`)에는 이렇게 적어뒀다.

> "한 번에 main 배포 금지. 각 하위 단계는 '기존 동작 불변'을 보장한 채 점진 적용."

이 두 문장이 이후 모든 결정의 기준이 됐다.

<br/>

## 1. 테넌트 모델 — 기존 데이터를 "group 1"로 만드는 트릭

`Group`을 새로 만들고, 모임에 종속되는 54개 모델 전부에 `groupId`를 추가했다.

```prisma
// packages/api/prisma/schema.prisma
// 멀티테넌시 토대 — 하나의 "모임"(테넌트). 기존 데이터는 모두 group 1(원조 모임)에 속한다.
model Group {
  id                Int       @id @default(autoincrement())
  name              String
  slug              String    @unique
  subscriptionUntil DateTime?
  createdAt         DateTime  @default(now())
  deletedAt         DateTime?
}
```

핵심은 `groupId Int @default(1)`이라는 기본값이다. 이 컬럼을 추가하는 순간, 이미 존재하던 모든 로우가 자동으로 "group 1"(원조 모임)에 속하게 된다. 별도의 백필 스크립트나 다운타임 없이, 스키마 변경 한 번으로 기존 서비스를 그대로 첫 번째 테넌트로 편입시킨 셈이다.

<br/>

## 2. 테넌트 구분 — 서브도메인 대신 헤더

모임마다 서브도메인을 따로 파는 대신, 프론트가 현재 보고 있는 모임의 slug를 헤더로 실어 보내는 경로 방식을 택했다.

```ts
// packages/api/src/middleware/group.ts
// 경로 방식 멀티테넌시: 프론트가 현재 모임 slug를 헤더(X-Group-Slug)로 보낸다.
//   /g/isegye/... 화면 → 모든 API 호출에 X-Group-Slug: isegye
// 헤더가 없으면 'default'(원조 모임 group 1) → 기존 동작 유지(점진 적용).
export function groupMiddleware(req, _res, next) {
  const slug = (req.header("X-Group-Slug") || "default").toLowerCase();
  resolveGroupId(slug)
    .then((groupId) => runWithGroup(groupId, () => next()))
    .catch(() => runWithGroup(1, () => next()));
}
```

알 수 없는 slug가 들어오면 무조건 group 1로 폴백한다. "점진 적용"이라는 원칙을 코드 레벨에서 지키기 위한 안전장치다. 이렇게 정해진 `groupId`는 요청 전체에서 `AsyncLocalStorage`로 들고 다닌다.

```ts
// packages/api/src/lib/group-context.ts
export const groupContext = new AsyncLocalStorage<{ groupId: number }>();
export function getGroupId(): number | null {
  return groupContext.getStore()?.groupId ?? null;
}
```

cron이나 WS 서버처럼 요청 컨텍스트 바깥에서는 `getGroupId()`가 그냥 `null`을 반환한다 — 여기서 스코핑을 억지로 흉내내지 않고, 필요하면 각자 알아서 `groupId`를 명시하도록 한 것도 의도적인 선택이다.

<br/>

## 3. 격리 방식 — 계획은 RLS였는데, 실제로는 Prisma Extension

여기가 이번 작업에서 계획과 결과가 가장 크게 갈린 지점이다. Phase 1 문서의 "핵심 결정" 항목에는 이렇게 적혀 있었다.

> "격리 방식: Postgres RLS (Prisma client extension 대비 누락 원천 차단)."

즉 원래는 Postgres의 Row Level Security로 DB 레벨에서 강제하려 했다. 이유도 명확히 적어뒀다 — RLS는 "쿼리 하나가 격리 로직을 빠뜨리는" 실수를 원천 차단할 수 있기 때문이다.

그런데 실제로 짠 건 앱 레벨의 Prisma Client Extension이다.

```ts
// packages/api/src/lib/prisma.ts
function scopeWhere(args, model) {
  if (hasSoftDelete(model) && args.where?.deletedAt === undefined) {
    args.where = { ...(args.where ?? {}), deletedAt: null };
  }
  const gid = getGroupId();
  if (hasTenant(model) && gid != null && args.where?.groupId === undefined) {
    args.where = { ...(args.where ?? {}), groupId: gid };
  }
}
```

`findMany`/`findFirst`/`count`/`aggregate`/`groupBy` 같은 조회는 `where`에 `groupId`가 자동으로 끼워지고, `create`/`upsert`는 `groupId`가 자동 태깅되고, `delete`는 아예 soft-delete `update`로 바뀐다. `findUnique`처럼 Prisma가 `where`에 유니크 컬럼만 허용하는 경우는 결과를 받은 뒤 코드에서 다시 필터링한다. 정말 어쩔 수 없이 격리를 우회해야 하는 경우를 위해 `basePrisma`라는 탈출구도 만들어뒀는데, 이건 호출하는 쪽이 직접 `groupId`/`deletedAt`을 챙겨야 한다는 경고 주석과 함께 export된다.

**그리고 문서가 걱정했던 바로 그 문제가 실제로 터졌다.** 이후 커밋 로그에 이런 게 남아있다.

```
a63c8940 fix(tenant): 크로스그룹 누출 2건 차단 (Tier 1)
d7a86cdc feat(tenant): 유니크/BetCoin/파이프라인/알림 모임별 스코프 (Tier 3-5)
cb9f2df6 fix(multitenancy): 시즌 조회 groupId 누락 전수 수정 + 크로스테넌트 캐시 누출 수정
```

Extension이 자동으로 못 걸러주는 경로 — `basePrisma`를 쓴 곳, raw SQL, 캐시에 저장된 값 등 — 에서 `groupId`를 깜빡한 채로 다른 모임의 데이터가 새는 사고가 몇 차례 있었고, 그때마다 하나씩 찾아서 막았다. RLS였다면 DB가 강제로 막아줬을 실수를, 지금 구조에서는 "빠짐없이 짜는 사람의 주의력"에 의존하고 있는 셈이다. 왜 RLS 대신 Extension을 택했는지는 기록에 남아있지 않지만, 결과적으로 "설계에서 우려했던 리스크가 그대로 실현된 뒤 하나씩 두더지 잡기로 막은" 사례라서 남겨둔다.

<br/>

## 4. 플러그인 시스템 — 기능을 모임별로 켜고 끄기

멀티테넌시와 별개로, 모임마다 필요한 기능이 다를 수 있다는 전제 하에 기능 자체를 플러그인화했다.

```prisma
model Plugin {          // 전역 카탈로그
  key            String  @unique   // "mentoring", "league", "streak-bet" ...
  active         Boolean @default(true)   // 플랫폼 전체 킬스위치
  hidden         Boolean @default(false)  // 베타: 스토어엔 안 보이지만 켜져있으면 게이트 통과
  requiresPlugin String?                  // 하위 플러그인 의존성
  price          Int     @default(0)      // 아직 결제는 미구현, 가격만 존재
}

model GroupPlugin {     // 모임별 설치/on-off 상태
  groupId  Int
  pluginId Int
  enabled  Boolean @default(true)
  @@unique([groupId, pluginId])
}
```

라우터 단위로 게이트를 건다.

```ts
// packages/api/src/middleware/plugin.ts
export function requirePlugin(key) {
  return async (req, res, next) => {
    const account = await extractAccount(req);
    if (account?.platformAdmin) return next();       // 플랫폼 관리자는 항상 통과
    const meta = await pluginMetaByKey(key);
    if (meta == null) return next();                   // 모르는 키는 fail-open
    if (!meta.active) return res.status(403).json({ pluginDisabled: key });
    const gid = getGroupId() ?? 1;
    if ((await enabledIds(gid)).has(meta.id)) return next();
    res.status(403).json({ pluginDisabled: key });
  };
}
```

```ts
// packages/api/src/index.ts
app.use("/api/streak-bets", requireMember, requirePlugin("streak-bet"), streakBetsRouter);
app.use("/api/season-pass", requireMember, requirePlugin("season-pass"), seasonPassRouter);
app.use("/api/mentoring", requireMember, requirePlugin("mentoring"), mentoringRouter);
// ...
```

`Plugin.active`(플랫폼 전체 스위치)와 `GroupPlugin.enabled`(모임별 스위치)를 이중으로 두어서, "아직 베타라 전체 배포는 안 했지만 특정 모임에서만 테스트하고 싶다"거나 반대로 "장애가 나서 전 모임에서 즉시 꺼야 한다" 같은 상황을 둘 다 커버한다. `requiresPlugin`으로 `season-pass-name-effect` 같은 하위 기능이 `season-pass`에 의존하는 체인도 표현할 수 있다.

한 가지 눈에 띄는 점: `requirePlugin`은 라우터를 마운트하는 순간에만 걸려있고, 정작 가장 먼저 만들어진 핵심 기능인 경매(auction)에는 이 게이트가 안 걸려 있다. 플러그인 시스템이 생기기 전부터 있던 기능이라 "코어"로 취급하고 있어서인데, 나중에 경매도 모임별로 켜고 끌 수 있어야 한다면 이 지점부터 손대야 한다.

<br/>

## 5. 권한 2축 모델 — 그리고 이걸 바꾸다가 운영진 권한을 다 날려먹은 사건

권한을 두 축으로 나눴다.

- **플랫폼 축** (`Account` 레벨): `platformAdmin`(슈퍼관리자), `group_creator`(모임 생성 권한, `AccountPermission`에 저장), `Group.subscriptionUntil`(모임 구독 만료일 — 신규 모임은 30일 체험)
- **모임 축** (`Membership` 레벨): 모임마다 `user < admin < sub_owner(최대 3명) < owner` 계층의 역할

문제는 기존 코드 전체가 글로벌 `Account.role`(모임 구분 없는 단일 역할 필드) 하나로 관리자 여부를 판단하고 있었다는 것. 멀티테넌시를 위해 이 글로벌 role을 없애고 모든 역할 판단을 "현재 모임 기준"으로 바꾸는 작업을 하다가, 다음 사고가 났다.

> `d286da3b` — "fix(roles): account.role을 현재 모임 역할로 치환 — 글로벌 역할 폐지로 끊긴 운영진 권한 복구"
>
> "글로벌 Account.role을 user로 내리면서 account.role===admin으로 운영진을 판정하던 경매 진행(requireAuctionHost)·LFG·미션·리그·토너먼트 등이 모두 끊김."

글로벌 `role`을 손대는 순간, 그 필드를 직접 참조하던 곳들이 전부 조용히 권한을 잃었다. 경매 진행, LFG, 미션, 리그, 토너먼트 — 운영에 쓰이는 기능 대부분이었다.

해결은 `account.role` 자체를 매 요청마다 "현재 모임의 Membership.role"로 치환해서 내려주는 방식이었다.

```ts
// packages/api/src/middleware/auth.ts (scopeRoleToGroup)
// account.role/permissions를 "현재 모임 기준"으로 치환 — 모임별 운영진·세부권한 판정의 단일 소스.
// 토큰 캐시(60초)가 다른 모임의 권한을 새어 나가게 하지 않도록 매 요청마다 현재 모임 기준으로 다시 조회
async function scopeRoleToGroup(base) {
  const gid = getGroupId() ?? 1;
  const [m, permissions] = await Promise.all([
    prisma.membership.findFirst({ where: { accountId: base.id, groupId: gid, approved: true }, select: { role: true } }),
    fetchPermissions(base.id),
  ]);
  return { ...base, role: m?.role ?? "user", permissions };
}
```

기존에 `account.role === "admin"`을 체크하던 코드는 단 한 줄도 안 바꿔도 됐다 — `account.role`이라는 이름은 그대로 두고, 그 값을 채워 넣는 방식만 "글로벌 필드 읽기"에서 "현재 모임의 Membership 조회 결과"로 바꿨기 때문이다. 여기서 60초짜리 토큰 캐시가 다른 모임의 권한을 새어 보내지 않도록 매 요청마다 다시 조회하게 만든 것도 포인트 — 캐시와 멀티테넌시를 같이 쓸 때 흔히 나는 실수를 미리 막아둔 셈이다.

<br/>

## 6. 진행 순서 — 커밋 메시지로 남긴 Phase 로그

별도 티켓 시스템 없이, 커밋 메시지 prefix로만 진행 단계를 추적했다.

| 커밋 | 내용 |
| --- | --- |
| `multitenancy 1-1` | Group(테넌트) 토대 추가 |
| `multitenancy 1-2` | 모임 종속 54개 모델에 groupId 추가 |
| `multitenancy 1-3a` | Prisma extension 기반 groupId 자동 주입 |
| `multitenancy 1-4a` | Membership(계정-모임 다대다) 토대 |
| `multitenancy 1-4b` | 미들웨어 slug 기반 모임 컨텍스트 (경로 방식) |

이후 첫 입장 화면(`/g/:slug` 모임 홈), 모임 생성/설정 플로우, 크로스그룹 누출 수정들이 순서대로 이어졌다.

<br/>

## 정리 — 배운 것

1. **"확정되지 않은 미래를 위해 미리 만들지 않는다"는 원칙이 실제로 지켜졌다.** 두 번째 모임이 확정되기 전까지 멀티테넌시에 손대지 않은 덕분에, 정말 필요해졌을 때 명확한 목표(경로 방식, X-Group-Slug)를 갖고 시작할 수 있었다.
2. **설계 문서의 우려는 대개 맞다.** RLS를 포기하고 Prisma Extension을 택한 뒤, 문서가 정확히 예견했던 "격리 누락"이 실제로 여러 번 터졌다. 설계 단계에서 "이 방식은 이런 실수를 못 막는다"고 적어뒀다면, 그 실수가 날 걸 각오하고 가는 것이다.
3. **이름을 유지한 채 값을 채우는 방식을 바꾸면, 파급 범위를 최소화할 수 있다.** `account.role`이라는 필드명과 그걸 참조하는 코드는 그대로 두고, 값을 계산하는 로직만 "글로벌 → 모임별"로 바꿔서 기존 권한 체크 코드를 하나도 안 건드리고 마이그레이션할 수 있었다. (물론 그 전환 자체는 한 번 사고를 내고서야 제대로 됐지만.)
4. **`groupId Int @default(1)`처럼 디폴트값을 이용하면 다운타임 없이 기존 데이터를 새 모델에 편입시킬 수 있다.** 스키마 변경 한 번으로 "기존 서비스 = 첫 번째 테넌트"가 자동으로 성립했다.
