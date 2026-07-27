---
layout: post
title: '[ 롤모임 운영일지 ] - 16. 0점 입찰은 왜 자꾸 사라졌나 — falsy zero 버그 모음'
author: haeran
date: 2026-07-27 21:40:00 +0900
categories: [Journal, Development Diary]
tags: [운영일지, 버그, Lua, Redis, JavaScript, falsy]
---

실시간 경매에는 "0점 입찰"이라는 규칙이 있다. 최하위 티어(8~9티어) 매물은 시작가가 0점이라, 첫 입찰에 한해 0점으로 데려갈 수 있다. 문제는 이 0이라는 값이 지난 두 달 동안 서로 다른 자리에서 네 번이나 사라졌다는 것이다 — UI에서 한 번, DB 동기화 타이밍에서 한 번, Redis Lua 스크립트에서 한 번, 그리고 전혀 무관한 기능의 기본값 처리에서 한 번.

[03편](/journal/development%20diary/2026/07/13/lol-moim-incidents-03-auction-phase.html)에서 소개한 그 Lua 스크립트의 뒷이야기이기도 하다. 모아놓고 보면 전부 같은 뿌리다: **0은 유효한 값인데, 코드 어딘가가 0을 "없음"으로 취급했다.**

<br/>

## 배경 — 같은 규칙이 세 언어로 세 번 구현돼 있다

"0점 입찰은 아직 아무도 입찰하지 않았을 때만 허용"이라는 규칙 하나가, 이 서비스에서는 세 개의 런타임에 각각 따로 구현돼 있다. 입찰이 두 경로로 들어오기 때문이다 — WS가 연결돼 있으면 WS 서버(Redis Lua), 아니면 HTTP 폴백(Postgres).

```ts
// packages/frontend/src/pages/LiveAuctionPage.tsx
if (wsConnected) {
  wsBid(amt);          // WebSocket 경로 (초고속 ~10ms) → Redis Lua가 검증
  return;
}
// HTTP 폴백 (WebSocket 미연결 시) → Postgres가 검증
await apiFetch(`/api/auction/${sessionId}/live-bid`, { ... });
```

"아무도 입찰하지 않았다"의 판정은 각각 이렇게 생겼다.

```sql
-- REST 경로 (Prisma updateMany → SQL)
UPDATE "AuctionSession" SET ... WHERE id = ? AND "highTeamId" IS NULL
```

```lua
-- WS 경로 (server-ws.ts의 BID_SCRIPT, 도입 당시)
-- 0점 입찰: 아직 아무도 입찰하지 않은 경우(highTeamId=nil)에만 허용
if data.highTeamId ~= nil then
  return cjson.encode({rejected=true, currentHighBid=data.highBid})
end
```

```ts
// server-ws.ts의 JS 핸들러 (선배팅 우선권 체크)
if (session.highTeamId == null && session.lastBidAt) { ... }
```

SQL은 맞았고, JS도 맞았고, Lua만 틀렸다. 그 이야기는 잠시 뒤에 하고, 시간 순서대로 가자.

<br/>

## 다음 날 — 0점 낙찰이 "입찰 없음"으로 보였다

0점 입찰을 도입한(5월 19일) 바로 다음 날, 두 개의 버그가 잡혔다. 하나는 표시 버그다. 타이머 옆의 현재 입찰 현황이 이렇게 판정하고 있었다.

```tsx
// packages/frontend/src/pages/LiveAuctionPage.tsx (수정 전)
{session.highBid > 0 ? (
  <div>{session.highBid}점 · {highTeam?.name}</div>
) : (
  <div>입찰 없음</div>
)}
```

0점으로 낙찰 직전인 라운드가 화면에는 "입찰 없음"으로 떠 있던 것이다. "입찰이 있었나"를 **금액**(`highBid > 0`)으로 판정했기 때문인데, 0점 입찰이 생긴 순간부터 금액은 더 이상 입찰 유무를 말해주지 않는다. 판정 기준을 **주체**(`highTeamId !== null`)로 바꿔서 고쳤다.

다른 하나는 타이밍 버그다. WS 서버는 입찰을 Redis에 반영하고 브로드캐스트한 뒤, DB 저장은 비동기로 나중에 한다. 그런데 그 사이 다른 팀들이 REST로 "포기"를 누르면, 포기 엔드포인트는 DB를 읽는다 — 아직 동기화가 안 된 DB에는 `highTeamId`가 `null`이다. 전원 포기로 라운드가 끝나면서 이 값을 본 서버는 "입찰 없음 → 유찰"로 처리했다. 방금 들어온 0점 입찰이 통째로 증발한 것이다.

```ts
// server-ws.ts (수정 후)
// 0점 입찰: DB 먼저 sync 후 broadcast — REST pass endpoint가 highTeamId=null로 읽는 race 방지
if (amount === 0) await syncToDb(dbSync);
```

0점 입찰 라운드는 "나머지 전원 포기"로 끝나는 게 보통이라(아무도 안 데려가는 매물이니까 0점이 나온다), 이 race를 가장 잘 밟는 경로였다. 당시 수정은 0점 입찰에만 `await`를 걸었다.

<br/>

## 2주 뒤 — Lua는 JSON null을 nil로 읽지 않는다

그런데 2주 뒤, 0점 입찰이 유찰되는 일이 또 있었다. 이번엔 위의 어느 것도 아니었다. WS 경로의 Lua 스크립트가 0점 입찰을 **거부**하고 있었다.

라운드가 시작되면 Redis 스냅샷에는 `"highTeamId": null`이 명시적으로 기록된다(JS에서 `JSON.stringify({ ..., highTeamId: null })`). Lua 쪽 검증은 `data.highTeamId ~= nil`이었다 — "null이면 Lua에서 nil이겠지"라는 가정이다. 그런데 Redis의 cjson은 JSON `null`을 `nil`이 아니라 **`cjson.null`이라는 별도의 센티널(lightuserdata)로 디코드한다.** Lua 테이블은 값으로 nil을 가질 수 없어서, "null이 있었다"는 사실을 보존하려면 다른 값이 필요하기 때문이다.

이 글을 쓰면서 실제로 다시 확인해봤다. `redis:7-alpine` 컨테이너에서:

```lua
-- redis-cli EVAL
local d = cjson.decode('{"a":null,"b":5}')
if d.a == nil then return "a_is_real_nil" else return "a_is_"..type(d.a) end
-- 결과: "a_is_userdata"
```

즉 `data.highTeamId ~= nil`은 아무도 입찰하지 않은 라운드에서도 참이 되고, 0점 입찰은 "이미 입찰이 있다"며 전부 거부됐다. 수정은 한 줄이다.

```diff
// server-ws.ts BID_SCRIPT
-    if data.highTeamId ~= nil then
+    if type(data.highTeamId) == "number" then
       return cjson.encode({rejected=true, currentHighBid=data.highBid})
```

"입찰자가 있다"를 "nil이 아니다"가 아니라 "실제 팀 id(숫자)다"로 뒤집었다. cjson.null은 userdata라 이 검사에 걸리지 않는다.

이 버그가 2주나 산 이유도 경로 이원화에 있다고 본다. 같은 0점 입찰이라도 WS가 연결 안 된 유저는 REST 폴백을 탔고, 그쪽 SQL(`IS NULL`)은 정확했다. 어떤 유저는 되고 어떤 유저는 안 되니, 증상이 "가끔 유찰된다"로 보였던 것이다. 애초에 0점 입찰 자체가 최하위 티어 매물의 첫 입찰에서만 나오는 드문 이벤트이기도 하다.

여담으로, 0점 입찰을 도입한 그 커밋에는 사촌 버그 수정도 함께 있었다: 비정규 티어 문자열("배치" 등)이 `parseInt`를 거쳐 `NaN`이 되고, 그게 상한가 계산에서 기본값 20으로 폴스루하던 버그. 0과 NaN — 경계값은 몰려다닌다.

<br/>

## 두 달 뒤 — 전혀 다른 기능에서, 또

7월, 말풍선 스킨 어드민 API를 코드리뷰하다가 같은 패턴이 또 나왔다. 스킨의 캡 고정 영역 픽셀 값(`capSliceTopPx`)을 받는 코드다.

```ts
// packages/api/src/routes/bubble-skins.ts (수정 전)
capSliceTopPx: Number(body.capSliceTopPx) || 26,
```

어드민이 "고정 영역 없음"이라는 뜻으로 0을 명시해도, `0 || 26`은 26이다. 입력한 값이 소리 없이 기본값으로 바뀐다. 수정은 파서를 분리하는 것이었다.

```ts
// packages/api/src/routes/bubble-skins.ts (수정 후)
// Number(x) || 26 은 명시적 0을 falsy로 취급해 26으로 덮어써버림 — 0(고정 영역 없음)도 유효한 값이라 별도 처리.
function parseCapSlice(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 26;
}
```

경매의 0점과 말풍선의 0px는 아무 관련이 없는 코드지만, 죽는 방식은 똑같았다. `|| 기본값` 한 줄은 "값이 없으면"이 아니라 "값이 falsy면"이고, 0이 유효한 도메인에서 그 차이는 곧 버그다.

<br/>

## 정리

1. **"있냐 없냐"는 값의 크기가 아니라 존재로 판정해야 한다.** "입찰이 있었나"의 기준을 `highBid > 0`(금액)에서 `highTeamId !== null`(주체)로 바꾼 게 이 시리즈 전체의 요약이다. 0점 입찰이라는 규칙이 생기는 순간, 금액 기반 판정은 전부 잠재적 버그가 됐다.
2. **같은 규칙을 세 런타임에 세 번 구현하면, 세 번 틀릴 기회가 생긴다.** SQL의 `IS NULL`, JS의 `== null`, Lua의 `~= nil`은 같은 의도의 다른 문장이고, 그중 하나만 미묘하게 틀려도 증상은 "가끔 안 된다"로 나타나 추적이 어려워진다. 경로가 두 개면 검증 구현도 두 개라는 사실 자체가 비용이다.
3. **null은 직렬화 경계를 넘을 때마다 얼굴을 바꾼다.** JS의 `null`은 JSON을 거쳐 Lua에 도착하면 `nil`이 아니라 `cjson.null`(userdata)이다. "그쪽 언어에서도 당연히 이렇겠지"라는 가정은 경계를 넘는 순간 검증 대상이다.
4. **`|| 기본값`은 0이 유효한 필드에서 금지.** falsy 체크는 "없음"과 "0"을 구분하지 못한다. `??`를 쓰거나, 이번처럼 유효 범위를 아는 전용 파서를 두는 쪽이 의도를 코드에 남긴다.
