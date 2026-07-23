---
layout: post
title: '[ 롤모임 운영일지 ] - 05. Cloud Run 서비스를 GKE로 옮긴다면 — 매니페스트 스케치'
author: haeran
date: 2026-07-15 20:00:00 +0900
categories: [Journal, Development Diary]
tags: [운영일지, Kubernetes, GKE, 인프라, 학습]
---

> **연습/학습 목적 기록.** 실제 클러스터에 적용하지 않았고, 프로덕션 코드도 건드리지 않았다. 지금 서비스는 Cloud Run(API) + GCE VM(WS, pm2) + Supabase(Postgres+Auth) 조합으로 잘 돌아가고 있고, [지난 성능 조사]({% post_url 2026-07/2026-07-14-lol-moim-incidents-04-n-plus-one %})에서 확인했듯 지금 규모(DAU 50~70명)의 병목은 인프라가 아니라 애플리케이션 레벨 N+1 쿼리였다. 이 글은 "만약 k8s로 관리한다면"이라는 학습용 사고 실험이다.

<br/>

## 왜 이 조합인가

- **DB는 GCP 안으로, 인증은 Supabase에 남긴다.** 실제로 코드를 확인해보니 이게 잘 맞는 경계였다 — 미들웨어가 `auth.users` 테이블을 SQL로 조인하는 게 아니라 `supabase.auth.getUser(token)`으로 **API 호출**만 하고 있어서, DB(Cloud SQL)와 인증(Supabase Auth)을 분리해도 코드가 자연스럽게 나뉜다.
- **GKE Autopilot**을 가정했다. Standard 모드는 노드 OS 패치·CVE 대응·노드풀 사이징까지 직접 해야 해서, 학습 목적이라도 배보다 배꼽이 커진다.
- **Gateway API**(옛 Ingress 대신). WebSocket 업그레이드(`server-ws.ts`)를 정석으로 지원하고, GKE에서 권장하는 최신 방식이라 배울 가치가 더 크다.

<br/>

## 매니페스트 구성

```
manifests/
├── 00-namespace.yaml
├── 10-api-configmap.yaml          # 비밀 아닌 설정
├── 20-api-secret.yaml             # 구조 스켈레톤(실제 값 금지)
├── 30-secretproviderclass.yaml    # Secret Manager CSI — 20의 진짜 출처
├── 40-api-deployment.yaml         # api + Cloud SQL Auth Proxy 사이드카
├── 50-serviceaccount.yaml         # Workload Identity
├── 60-api-service.yaml
├── 70-api-hpa.yaml
├── 80-ws-deployment.yaml          # ws + Redis 사이드카 + Cloud SQL Auth Proxy
└── 90-gateway.yaml                # Gateway + HTTPRoute ×2
```

### 사이드카 패턴이 핵심이다

Cloud Run에서는 `DATABASE_URL` 하나로 Supabase의 Supavisor(트랜잭션 풀러)에 바로 붙었다. GKE에서는 그 역할을 **Cloud SQL Auth Proxy**가 대신하는데, 이건 mTLS 터널일 뿐 풀링을 안 해준다 — 그래서 파드마다 사이드카로 하나씩 붙여서 앱은 `127.0.0.1:5432`를 "로컬 DB"처럼 보게 만든다.

```yaml
# 40-api-deployment.yaml 발췌
- name: cloud-sql-proxy
  image: gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.x
  args:
    - "--port=5432"
    - "PROJECT_ID:asia-northeast3:lol-app-pg"
```

### 커넥션 예산 — 오늘 배운 걸 그대로 적용

지난 조사에서 "Cloud Run pg.Pool을 10→30으로 올리기 전에 Postgres의 실제 `max_connections`부터 재라"고 배웠다. GKE로 옮기면 이 계산을 훨씬 더 진지하게 해야 한다 — **Supavisor가 없어서 파드 수 × 풀 크기가 그대로 실제 커넥션 수가 되기 때문**이다.

| 워크로드 | replicas | 파드당 pool max | 합계 |
| --- | ---: | ---: | ---: |
| api (평시) | 2 | 5 | 10 |
| api (스케일 아웃 최대) | 4 | 5 | 20 |
| ws | 1 | 3 | 3 |
| **합계(최대)** | | | **23** |

일부러 파드당 풀을 5·3으로 작게 잡았다 — Cloud Run 때처럼 "일단 30으로 올려보자"가 아니라, **먼저 작게 시작하고 `SHOW max_connections;` / `pg_stat_activity`로 실측한 뒤에 올리는 순서**를 지키기 위해서다. 여기에 마이그레이션 스크립트·어드민 툴·모니터링 에이전트가 붙는 커넥션까지 감안해서 Cloud SQL 인스턴스 티어를 골라야 한다.

풀러가 아쉬워지면 PgBouncer를 Deployment로 하나 더 띄워서 Cloud SQL 앞단에 두는 게 다음 단계다(Supavisor 재구현에 가깝다).

<br/>

## 코드 변경 없이는 안 옮겨지는 부분

매니페스트를 짜면서 실제 코드 결합을 하나 발견했다: `server-ws.ts`가 Redis를 `127.0.0.1:6379`로 **하드코딩**하고 있다.

```ts
// server-ws.ts:17-19
const redis = new Redis({ host: "127.0.0.1", port: 6379, maxRetriesPerRequest: 3 });
const pub = new Redis({ host: "127.0.0.1", port: 6379 });
const sub = new Redis({ host: "127.0.0.1", port: 6379 });
```

지금 GCE VM에선 Redis가 같은 서버에 로컬로 떠 있다는 전제라서 문제없이 동작하지만, k8s 파드는 매번 새로 뜨는 별개 워크로드라 이 가정이 그대로는 안 통한다. 두 가지 길:

- **A안(스케치에 반영)**: Redis를 같은 파드에 사이드카로 얹어서 "같은 파드 = 로컬"이라는 지금 가정을 그대로 유지. 코드 변경 없음. 대신 파드가 재시작되면 진행 중이던 라운드 상태가 날아간다 — 근데 이건 지금 VM이 재시작될 때 감수하는 리스크와 **동등한 수준**이라 "이관"이지 "후퇴"는 아니다.
- **B안(권장, 후속 작업)**: `REDIS_HOST`를 env var로 빼서 Cloud Memorystore(관리형 Redis)를 보게 하면 코드 3줄 수정으로 파드가 완전히 stateless해진다. 그러면 그때 `@socket.io/redis-adapter`를 붙여서 `ws` replicas를 1개 이상으로 늘릴 수 있는 길도 열린다 — 지금 코드에 `pub`/`sub` 클라이언트가 이미 준비돼 있어서 어댑터를 붙이는 것 자체는 어렵지 않아 보인다.

이런 "인프라만 바꾸면 될 줄 알았는데 코드가 특정 배포 형태를 가정하고 있더라"는 게 이번 스케치에서 제일 남는 교훈이다.

<br/>

## Postgres 이관 절차(스케치 — 미실행)

1. Cloud SQL for Postgres 인스턴스 생성, 위 커넥션 예산 기준으로 티어 선택
2. `pg_dump`로 스키마 + 데이터 export (또는 다운타임을 줄이려면 논리 복제)
3. Cloud SQL로 import, Prisma `migrate diff`로 스키마 정합성 재확인
4. **컷오버 전에 반드시**: `SHOW max_connections;`로 실측 → 위 커넥션 예산표와 대조
5. `DATABASE_URL`/`DIRECT_URL`을 Cloud SQL Auth Proxy 경유로 전환
6. 트래픽 전환 후 일정 기간 Supabase Postgres를 read-only 백업으로 유지(롤백 경로)
7. Supabase 쪽은 이제 `auth.*` 스키마만 남으므로 인스턴스 사이징을 다운그레이드 가능

<br/>

## 정리

- k8s로 옮긴다고 오늘 겪은 문제(N+1 쿼리)가 저절로 없어지지 않는다 — 오히려 커넥션 풀 실수의 대가가 더 커진다(Supavisor라는 안전망이 사라지므로).
- 대신 배우는 건 확실하다: 사이드카 패턴, Workload Identity, Gateway API, 그리고 "인프라 마이그레이션은 코드가 어떤 배포 환경을 암묵적으로 가정하고 있었는지 드러낸다"는 사실.
- 다음에 실제로 해본다면: GKE Autopilot 클러스터 하나 띄우고 `api`부터 단독으로 배포 → 안정화 후 `ws` → 마지막에 DB 이관 순서를 추천한다(제일 위험한 걸 제일 나중에, 롤백 경로가 제일 쉬운 것부터).
