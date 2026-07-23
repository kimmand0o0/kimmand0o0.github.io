---
layout: post
title: '[ 롤모임 운영일지 ] - 11. 로그를 코드가 아니라 DB에게 맡기기로 한 이유'
author: haeran
date: 2026-07-21 20:00:00 +0900
categories: [Journal, Development Diary]
tags: [운영일지, PostgreSQL, 아키텍처, BetCoin]
---

BetCoin(포인트 재화)이 오갈 때마다 원장을 남기고 싶었다. 그런데 이 잔액을 바꾸는 코드가 생각보다 많았다.

## 문제 — 잔액을 바꾸는 곳이 15개 파일, 30곳 넘게 흩어져 있다

경매 낙찰, 배팅 정산, 상점 구매, 출석 보상, 확성기 구매, 멘토링 사례, 연승·내전 베팅... `BetCoin` 잔액을 바꾸는 코드를 찾아보니 15개 파일에 30곳 넘게 흩어져 있었다. 각 호출부에서 잔액을 바꿀 때마다 "언제, 얼마나, 왜 바뀌었는지"를 로그로 남기려면, 그 30곳 전부에 로깅 코드를 추가해야 한다는 뜻이었다. 그리고 그중 하나라도 빠뜨리면, 그 경로로 일어난 변동은 원장에 절대 안 남는다.

<br/>

## 해결 — 애플리케이션이 아니라 DB가 기록하게 만들기

애플리케이션 코드에 로깅을 흩뿌리는 대신, Postgres `AFTER UPDATE` 트리거로 해결했다.

```sql
CREATE TABLE IF NOT EXISTS "BetCoinLedger" (
  "id"           SERIAL PRIMARY KEY,
  "userId"       INTEGER NOT NULL,
  "delta"        INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BetCoinLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE OR REPLACE FUNCTION log_betcoin_change() RETURNS trigger AS $$
BEGIN
  IF NEW.balance <> OLD.balance THEN
    INSERT INTO "BetCoinLedger" ("userId", "delta", "balanceAfter")
    VALUES (NEW."userId", NEW.balance - OLD.balance, NEW.balance);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER betcoin_ledger_trg
  AFTER UPDATE ON "BetCoin"
  FOR EACH ROW EXECUTE FUNCTION log_betcoin_change();
```

이 방식의 핵심은 **"balance 컬럼이 바뀌는 모든 경로를 자동으로 잡는다"**는 것이다. Prisma의 `update`든 `upsert`든, 혹은 다른 raw SQL이든 — `BetCoin` 테이블의 `balance`가 바뀌기만 하면 트리거가 실행된다. 애플리케이션 코드를 단 한 줄도 안 고쳐도 되고, 앞으로 새로운 잔액 변경 경로가 30곳에서 31곳이 되어도 원장 누락 걱정이 없다.

<br/>

## 검증은 트랜잭션 롤백으로

이 트리거가 실제로 잘 작동하는지 확인해야 했는데, 운영 DB에 실제 잔액 변화를 만들 순 없었다. 그래서 트랜잭션 안에서 잔액을 실제로 바꿔보고, 원장에 로그가 남는지 확인한 뒤, `ROLLBACK`으로 그 변경 자체를 취소하는 방식으로 검증했다. 운영 데이터는 전혀 안 건드리면서 트리거 동작만 확인할 수 있는 방법이다.

<br/>

## 트레이드오프 — "왜"는 포기했다

트리거 기반 로깅에는 명확한 한계가 하나 있다. 트리거는 `UPDATE` 문 자체만 보기 때문에, **그 변경이 왜 일어났는지는 알 수가 없다.** 배팅에서 이겨서 늘어난 건지, 상점에서 뭔가를 사서 줄어든 건지, 관리자가 직접 지급한 건지 — 트리거 입장에서는 전부 그냥 "balance가 X만큼 바뀌었다"는 사실 하나뿐이다.

스키마 주석에 이 결정을 그대로 남겨뒀다.

```
// BetCoin 잔액 변동 원장 — DB 트리거(betcoin_ledger_trg)가 balance UPDATE마다 자동 기록.
// delta>0 발행, delta<0 소비. (사유는 트리거가 알 수 없어 미기록 — 총량 추적용)
```

세션 변수나 `pg_trigger_depth()` 같은 걸로 호출 맥락을 트리거에 흘려보내는 방법도 있긴 하지만, 그렇게까지 복잡하게 만들지 않기로 했다. 이 원장의 목적을 "이 유저가 왜 이렇게 됐는지 감사(audit)하는 것"이 아니라 "포인트가 전체적으로 얼마나 발행되고 소비되는지 총량을 추적하는 것"으로 명확히 좁혔기 때문이다. 실제로 이 `delta` 합계는 [06편]({% post_url 2026-07/2026-07-16-lol-moim-incidents-06-dashboard-snapshot %})에서 다룬 주간 포인트 발행/소비 그래프의 데이터 소스가 됐다.

<br/>

## 정리

- **로깅을 애플리케이션 코드가 아니라 DB 트리거에 맡기면, "누락"이라는 실패 모드 자체가 사라진다.** 30곳 넘는 호출부 중 하나를 빠뜨릴 걱정을 할 필요가 없어졌다.
- **다만 트리거는 "무엇이 바뀌었는지"만 알고 "왜 바뀌었는지"는 모른다.** 이 원장을 뭘 위해 쓸 건지(감사용인지 총량 추적용인지)를 먼저 정하고 나서 트리거 기반이냐 애플리케이션 로깅이냐를 골라야 한다는 걸 이번에 확실히 알았다.
- **운영 DB에서 위험 없이 동작을 검증하고 싶을 땐 트랜잭션 롤백이 유용하다.** 실제 변경을 걸어보고, 확인하고, 되돌리는 것만으로 운영 데이터를 안 건드리고 검증할 수 있었다.
