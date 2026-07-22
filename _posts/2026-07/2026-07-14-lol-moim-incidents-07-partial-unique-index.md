---
layout: post
title: '[ 롤모임 운영일지 ] - 07. 3분 만에 되돌린 인덱스 — partial unique의 함정'
author: haeran
date: 2026-07-14 09:00:00 +0900
categories: [Journal, Development Diary]
tags: [운영일지, PostgreSQL, Prisma, 아키텍처]
---

가장 짧게 산 결정 이야기다. 도입하고 되돌리기까지 딱 3분 걸렸다.

## 문제 — 소프트 삭제와 유니크 제약의 충돌

서비스 전체에 소프트 삭제(`deletedAt`)를 도입하면서, 이런 문제가 생겼다. 유저가 탈퇴(소프트 삭제)한 뒤 같은 닉네임으로 다시 가입하려 하면, 이미 있는 `@unique` 제약(`User.nickname`) 때문에 막힌다 — DB 입장에선 그 닉네임을 가진 row가 (삭제 표시만 됐을 뿐) 여전히 존재하니까.

해결책으로 처음 택한 건 **partial unique index**였다. "살아있는 row 사이에서만" 유니크하게 만드는 방법이다.

```sql
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_nickname_key";
DROP INDEX IF EXISTS "User_nickname_key";
CREATE UNIQUE INDEX IF NOT EXISTS "User_nickname_active_uniq"
  ON "User" ("nickname") WHERE "deletedAt" IS NULL;
```

같은 방식을 `User.nickname`뿐 아니라 `Account.supabaseId`, `Setting.key`, `ChampionPool.userId`, `Match(sessionId, gameNumber)` 등 11개 모델/컬럼에 일괄 적용했다. `schema.prisma`의 `@unique` 선언은 그대로 두고, 실제 Postgres 제약만 raw SQL로 바꿔치기하는 방식이었다(이 프로젝트는 Prisma Migrate 없이 `db push`로 스키마를 맞추는 구조라, "로컬에서 개발자가 직접 실행해 prod에 적용" 하는 식이었다).

<br/>

## 3분 뒤 — upsert가 전부 깨졌다

적용하자마자 patch note 작성, 설정 저장, MVP 투표, 이벤트 참석 체크 등 `upsert`를 쓰는 곳이 전부 에러를 뱉기 시작했다.

```
there is no unique or exclusion constraint matching the ON CONFLICT specification
```

원인은 명확했다. Prisma의 `upsert()`는 내부적으로 `INSERT ... ON CONFLICT (컬럼) DO UPDATE`로 컴파일된다. 그런데 Postgres가 `ON CONFLICT (컬럼)`을 실행하려면, 그 컬럼 조합에 대한 **조건 없는(non-partial)** 유니크 제약이나 인덱스가 있어야 한다. 지금 있는 건 `WHERE deletedAt IS NULL`이 붙은 **partial** 인덱스뿐이고, Prisma 스키마 자체는 이 인덱스가 partial이라는 걸 전혀 모른다(여전히 평범한 `@unique`로만 선언돼 있으니까) — 그러니 Prisma가 만드는 쿼리는 partial 인덱스를 타겟할 방법이 없고, Postgres는 "어떤 제약을 보고 충돌 여부를 판단해야 할지 모르겠다"며 에러를 낸다.

게다가 이건 당장 안 터져도 나중에 터질 폭탄이었다. 이 프로젝트는 스키마 변경 때마다 `db push`를 돌리는데, `db push`는 `schema.prisma`에 적힌 대로(=plain `@unique`) 제약을 다시 만들어버린다. 즉 누군가 다음에 스키마를 조금이라도 바꾸고 `db push`를 돌리는 순간, 방금 만든 partial 인덱스는 흔적도 없이 사라지고 원래의 plain unique로 되돌아간다 — 그때마다 raw SQL을 다시 실행해줘야 유지되는 구조였다.

<br/>

## 되돌리기

정확히 3분 뒤, partial-unique 전환을 도입했던 파일(`prisma/manual-sql/partial-unique.sql`)을 통째로 삭제하고 원래의 full unique 제약으로 되돌렸다. 커밋 메시지에 이 트레이드오프와 함께, "정말 소프트 삭제된 값 재사용이 필요해지면" 쓸 수 있는 대안 세 가지를 남겨뒀다.

1. 재사용하려는 대상을 아예 하드 삭제한다
2. 소프트 삭제 시점에 유니크 필드에 접미사를 붙여 값 자체를 바꿔버린다(`nickname` → `nickname__deleted_1720000000`)
3. 그 엔티티만 `upsert` 대신 "찾고 없으면 생성" 패턴으로 직접 짜서, partial unique를 유지하면서도 `ON CONFLICT`에 의존하지 않게 한다

세 가지 다 나름의 비용이 있어서, 지금 규모에서 "탈퇴 후 같은 닉네임 재사용"이 실제로 자주 발생하는 문제가 아니라면 굳이 감수할 이유가 없다고 보고 원복 상태로 남겨뒀다.

<br/>

## 정리

- **이론적으로 더 우아한 설계가 항상 더 나은 건 아니다.** partial unique index는 "소프트 삭제된 값 재사용"이라는 문제에 대해 개념적으로는 정확한 해법이지만, ORM(Prisma)이 그 개념을 모른다는 실전 제약이 이겼다.
- **되돌리는 데 3분 걸렸다는 게 오히려 다행이었다.** 로컬에서 바로 upsert 에러가 났고, 원인도 명확했다. 만약 upsert가 아니라 드물게만 실행되는 배치 작업에서만 터지는 구조였다면 훨씬 늦게 발견됐을 것이다.
- **raw SQL로 DB 상태만 바꾸고 스키마 선언은 그대로 둔 것도 되짚어볼 지점이다.** `schema.prisma`가 실제 DB 제약의 모양을 정확히 반영하지 못하는 순간, 다음 `db push`가 그걸 조용히 되돌려버릴 수 있다는 걸 이번에 직접 겪었다.
