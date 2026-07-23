---
layout: post
title: '[ 롤모임 운영일지 ] - 08. 같은 버그를 두 번 고친 이야기 — 9티어 오분류'
author: haeran
date: 2026-07-18 20:00:00 +0900
categories: [Journal, Development Diary]
tags: [운영일지, 버그, 랭킹, 동시성]
---

한 번 고쳤다고 생각했는데, 45분 뒤 "진짜 원인은 따로 있었다"는 걸 알게 된 이야기다.

## 사고 — 배치 안 끝난 유저가 최하위 티어로 분류됨

경매(옥션)에서 매물로 나온 유저의 입찰 상한은 그 유저의 `numericTier`(1~9)로 정해진다. 그런데 몇몇 유저가 실력과 무관하게 계속 9티어(입찰 상한 20점)로 잡히는 게 발견됐다.

원인을 추적해보니, 자격(eligible) 판정 로직이 문제였다.

```ts
// 수정 전
const isActive = games >= MIN_RANKED_GAMES && recentEnough;
```

여기서 `games`는 시즌 내전 판수(`InternalTierHistory`)였다. 그런데 이 서비스는 Glicko-2 기반 배치 시스템도 같이 쓰는데, 배치가 끝나지 않은 유저(`glickoGames < 5`)는 배치 전략에서 점수 0을 받는다. 문제는 `isActive` 판정이 `glickoGames`는 전혀 안 보고 `games`(시즌 판수)만 봤다는 것 — 시즌 판수는 충분히 쌓였지만 배치는 안 끝난 유저가 "자격 있음"으로 판정되고, 점수 0으로 백분위 최하위(9티어)에 꽂혀버린 것이다.

```ts
// 수정 후
const placementDone = !placementActive || glickoGames >= PLACEMENT_GAMES;
const isActive = games >= MIN_RANKED_GAMES && recentEnough && placementDone;
```

`PLACEMENT_GAMES = 5`라는 기준은 이미 다른 곳(`isPlacementComplete()`)에 정의돼 있었는데, 정작 자격 판정 로직은 그 기준을 참조하지 않고 있었다. 실제 DB를 확인해 영향받은 유저 4명을 찾아 고쳤다.

<br/>

## 45분 뒤 — "어라, 다른 유저는 왜 여전히 그래?"

이 정도로 끝났으면 좋았을 텐데, 수정을 배포하고도 여전히 9티어에 갇힌 유저가 있었다. 다시 보니 **애초에 이 그룹은 배치(Glicko) 전략을 아예 안 쓰고 있었다.** 첫 수정은 "배치 시스템 문제"라고 진단했지만, 실제로 이 그룹이 쓰는 랭킹 파이프라인은 `eval`(평가) + `winrate`(승률) 조합이었다.

진짜 원인은 다른 곳에 있었다. `eval` 전략은 그 시즌 평가자 수(`evaluatorCount`)가 3명 미만이면 점수 0을 반환하는데, 이번에도 자격 판정이 이 기준을 전혀 안 보고 있었다. 랭킹 리더보드에서는 이미 "3명 미만이면 랭크 제외"라는 기준(`isRanked` 임계값)이 있었는데, 자격 판정 로직만 그 기준을 재사용하지 않고 있었던 것.

```ts
const MIN_EVALUATORS = 3; // 리더보드의 isRanked 임계값과 동일하게
```

`loadEvaluatorCounts()`를 새로 만들어 평가자 수를 조회하고, 파이프라인에 `eval` 전략이 포함된 그룹에서만(`pipeline.stages.some(s => s.strategyKey === "eval")`) 이 기준을 적용하도록 게이트를 걸었다. 실운영 DB에서 재계산을 돌려 유저 2명이 정상 티어로 돌아온 걸 확인했다.

<br/>

## 진짜 교훈 — 첫 진단이 틀렸다는 걸 인정하는 것

첫 수정(`glickoGames` 체크 추가)은 그 자체로는 맞는 수정이었다 — 배치 전략을 쓰는 그룹에겐 필요한 로직이다. 문제는 **"9티어 오분류"라는 증상을 보고 배치 시스템 탓이라고 성급하게 결론 내린 것**이었다. 45분 뒤 "다른 그룹은 배치를 안 쓴다"는 사실을 다시 확인하지 않았다면 두 번째 원인은 영영 못 찾았을 수도 있다.

한 가지 더: 이번 수정 과정에서 `loadInternalStats`가 현재 시즌을 조회할 때 `groupId` 필터 없이 `prisma.season.findFirst({ where: { isCurrent: true } })`를 쓰고 있다는 걸 우연히 발견했다. 6개 모임이 있는 지금 구조에서는 다른 모임의 시즌 시작일을 잘못 가져올 수 있는 잠재적 버그다. 이번에 건드린 두 쿼리(`loadInternalStats`, `loadEvaluatorCounts`)만 고치고, 같은 패턴이 있는 나머지 약 20곳(`evaluation-score.ts`, `seasons.ts`, `userStats.ts`, `auction.ts` 등)은 커밋 메시지에 명시적으로 남겨두고 이번 수정 범위에서는 손대지 않았다.

<br/>

## 정리

1. **자격 판정 기준이 여러 군데 흩어져 있으면, 한쪽만 고치고 다른 쪽은 놓치기 쉽다.** `PLACEMENT_GAMES`, `MIN_EVALUATORS` 둘 다 다른 곳엔 이미 정의돼 있었는데, 자격 판정 로직만 따로 놀고 있었다.
2. **"고쳤다"고 생각한 뒤에도 증상이 남아있으면, 첫 진단을 의심해야 한다.** 이번엔 다행히 45분 만에 재확인해서 진짜 원인(다른 전략 조합)을 찾았다.
3. **버그를 고치다가 발견한 더 큰 문제는, 발견했다는 사실 자체를 기록하고 범위를 넓히지 않는 게 맞을 때도 있다.** `groupId` 누락 패턴이 20곳 더 있다는 걸 알았지만, 이번 수정 범위에 욱여넣지 않고 별도로 남겨뒀다.
