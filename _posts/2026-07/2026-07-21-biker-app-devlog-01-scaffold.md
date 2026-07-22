---
layout: post
title: '[ 바이커 앱 개발일지 ] - 01. 모노레포부터 GKE 배포 설계까지, 스캐폴딩 기록'
author: haeran
date: 2026-07-21 21:00:00 +0900
categories: [Journal, Development Diary]
tags: [개발일지, pnpm monorepo, Fastify, Drizzle, Supabase, GKE]
---

새 프로젝트를 시작했다. 오토바이 라이더를 위한 앱 — 내 바이크를 등록하고 정비 이력을 기록하면서, 동시에 사진/글을 올리는 SNS 피드도 갖춘 서비스다. 아직 기능은 거의 없고 골격(모노레포, API, 인증, 배포 설계)만 잡은 상태지만, 나중에 "왜 이렇게 짰더라"를 되짚어볼 수 있도록 지금 상태를 기록해둔다.

## TL;DR

- pnpm 워크스페이스로 모노레포를 잡았다: `apps/api`(Fastify + Drizzle), `apps/web`(Vite + React), `packages/shared-types`(zod 스키마 공유).
- 인증은 Supabase Auth(매직링크)만 쓰고, DB(Cloud SQL)·스토리지(GCS)는 GCP에 둔다 — API 서버가 Supabase JWT를 JWKS로 직접 검증하고, JIT(Just-In-Time)로 `users` 테이블을 동기화한다.
- 데이터 모델은 "정비 다이어리"와 "SNS 피드"를 한 스키마 안에 같이 설계했다: `bikes`/`maintenance_schedules`/`maintenance_logs`/`gear_items` + `posts`/`comments`/`hashtags`/`regions`.
- 배포는 GKE Autopilot + Cloud SQL Auth Proxy 사이드카(Workload Identity, 키 파일 없음)로 설계해뒀다. 아직 클러스터는 안 띄웠다.
- 지금은 헬스체크 + `/api/users/me` + `/api/bikes` CRUD 정도만 동작하는 스캐폴딩 단계. 다음 편부터는 실제로 기능을 붙이면서 부딪히는 문제들을 기록할 예정이다.

<br/>

## 1. 모노레포 구조부터 잡기

`apps/*`와 `packages/*`를 워크스페이스로 묶었다.

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
allowBuilds:
  esbuild: true
```

`packages/shared-types`에 zod 스키마(`createBikeSchema`, `updateBikeSchema`, `updateMeSchema` 등)를 두고 API와 웹이 같은 타입을 임포트하게 했다. API 라우트에서 `body = createBikeSchema.parse(request.body)`로 바로 검증하고, 웹에서도 같은 타입으로 응답을 받는 식이라 스키마가 어긋날 일이 없다.

루트 `package.json`에는 자주 쓸 스크립트만 모아뒀다.

```json
"scripts": {
  "dev:web": "pnpm --filter @biker-app/web dev",
  "dev:api": "pnpm --filter @biker-app/api dev",
  "db:generate": "pnpm --filter @biker-app/api db:generate",
  "db:migrate": "pnpm --filter @biker-app/api db:migrate",
  "db:seed": "pnpm --filter @biker-app/api db:seed"
}
```

<br/>

## 2. 인증은 Supabase, 나머지는 GCP — 역할을 쪼갠 이유

처음부터 "인증은 Supabase, DB/스토리지는 GCP(Cloud SQL + GCS)"로 나누기로 했다. 프론트엔드의 Supabase 클라이언트에도 그 경계를 주석으로 박아뒀다.

```ts
// apps/web/src/lib/supabaseClient.ts
// Auth only — DB/storage are on GCP, not Supabase.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

로그인은 매직링크(OTP) 방식이라 `LoginPage`가 이메일만 받아서 `supabase.auth.signInWithOtp({ email })`를 호출하고, 프론트는 `useSession` 훅으로 세션 상태만 구독한다. 비밀번호 폼도, 자체 세션 스토어도 안 만들었다.

API 서버는 Supabase가 발급한 JWT를 직접 검증한다. Supabase 프로젝트로 API를 호출하는 게 아니라, Supabase의 JWKS 엔드포인트로 서명을 검증하는 방식이라 요청마다 Supabase에 왕복하지 않는다.

```ts
// apps/api/src/plugins/auth.ts
const jwks = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));

const { payload } = await jwtVerify(token, jwks, {
  issuer: `${SUPABASE_URL}/auth/v1`,
  audience: "authenticated",
});
sub = payload.sub;

// JIT upsert: keeps our users table in sync with Supabase auth without a
// separate webhook — cheap indexed PK upsert, fine at MVP request volume.
await db.insert(users).values({ id: sub, email: payload.email, lastSeenAt: new Date() })
  .onConflictDoUpdate({ target: users.id, set: { email: payload.email, lastSeenAt: new Date() } });
```

Supabase 쪽에 별도 webhook을 걸어서 `users` 테이블을 동기화하는 대신, 인증된 요청이 들어올 때마다 PK 기준으로 upsert하는 JIT 방식을 택했다. 지금 트래픽 규모에서는 이 정도면 충분하다고 판단했다 — 나중에 요청량이 늘면 재고할 부분이다.

<br/>

## 3. 데이터 모델: 정비 다이어리 + SNS를 한 스키마에

이 앱의 핵심은 두 축이다.

**정비 기록 쪽**: `bikes`(VIN 형식을 체크 제약으로 검증), `bikeModelMaster`(등록 시 자동완성용 참고 데이터), `maintenanceSchedules`(주기 — km 또는 개월 중 최소 하나는 필수라는 체크 제약), `maintenanceLogs`(정비/튜닝/개조/메모 기록), `gearItems`(헬멧·장갑 등은 바이크가 아니라 유저 소유로 설계 — 여러 바이크에 걸쳐 재사용되니까).

```ts
// apps/api/src/db/schema.ts
export const bikes = pgTable("bikes", {
  // ...
  vin: varchar("vin", { length: 17 }).unique(),
  // ...
}, (t) => [
  check("bikes_vin_format", sql`${t.vin} ~ '^[A-HJ-NPR-Z0-9]{17}$'`),
]);

export const maintenanceSchedules = pgTable("maintenance_schedules", {
  // ...
}, (t) => [
  check(
    "maintenance_schedules_interval_required",
    sql`${t.intervalKm} is not null or ${t.intervalMonths} is not null`,
  ),
]);
```

**SNS 피드 쪽**: `posts` + `postMedia`(사진/영상, 업로드 상태를 `pending → uploaded → processing → ready/failed`로 추적) + `hashtags`/`postHashtags` + `postMentions` + `comments`(대댓글용 `parentCommentId`). 위치는 위경도뿐 아니라 행정안전부 행정표준코드 기준 `regions` 테이블과 `postRegions`로 연결해서 "지역별 라이딩 스팟" 같은 걸 나중에 붙일 수 있게 해뒀다.

지금 구현된 라우트는 딱 `GET/PATCH /api/users/me`, `GET/POST/GET(:id)/PATCH/DELETE /api/bikes`뿐이다. 나머지 테이블은 스키마만 있고 라우트는 아직 없다.

<br/>

## 4. 배포 설계: GKE Autopilot + Cloud SQL Auth Proxy 사이드카

배포는 GKE Autopilot을 가정하고 미리 매니페스트를 스케치해뒀다. 클러스터는 아직 안 띄웠지만, 나중에 헤매지 않으려고 지금 정리해둔다.

- **Cloud SQL 연결은 사이드카로.** API 컨테이너 옆에 `cloud-sql-proxy` 컨테이너를 붙이고, Workload Identity로 GCP IAM 서비스 계정을 impersonate하게 했다. 키 파일을 Secret으로 마운트할 필요가 없다.

```yaml
# infra/k8s/deployment.yaml
- name: cloud-sql-proxy
  image: gcr.io/cloud-sql-connectors/cloud-sql-proxy:2.14.0
  args:
    - "--structured-logs"
    - "--port=5432"
    - "<PROJECT_ID>:<REGION>:<INSTANCE_CONNECTION_NAME>"
```

- **Autopilot은 리소스 request가 없으면 파드를 거부**한다. API·프록시 컨테이너 둘 다 `resources.requests`를 명시해뒀다(안 그러면 배포 단계에서 바로 막힌다).
- **Dockerfile은 멀티스테이지**로, 빌드 스테이지에서 `pnpm install --filter @biker-app/api...`로 필요한 워크스페이스만 설치하고, 런타임 이미지에는 `dist`와 `node_modules`만 복사한다.
- `infra/gcloud/setup-gke.sh`는 실행용이 아니라 참고용으로만 만들었다 — Artifact Registry, Autopilot 클러스터, IAM 서비스 계정, Workload Identity 바인딩까지 한 번에 만드는 명령어를 순서대로 적어두고, 파일 맨 위에 "이 파일을 통째로 실행하지 말 것"이라고 못 박아뒀다. 전부 과금되는 리소스라 하나씩 확인하면서 실행하려고.

<br/>

## 5. 지금 상태

커밋은 아직 초기 커밋 하나뿐이고, 이번에 만든 스캐폴딩(`apps/`, `db/`, `packages/`, 워크스페이스 설정)은 이제 막 올릴 참이다. 프론트는 로그인하면 `/api/users/me`를 호출해서 "DB에 유저 row가 실제로 생겼는지" 확인하는 화면 하나가 전부다.

다음 편부터는 바이크 등록 폼, 정비 기록 CRUD, 이미지 업로드(GCS) 같은 실제 기능을 붙이면서 만난 문제들을 기록할 예정이다.
