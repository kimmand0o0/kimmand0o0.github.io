# 블로그 RAG 챗봇 — Cloudflare Worker

kimmand0o0.github.io 블로그 글을 근거로 질문에 답하는 최소 구현. 설계 배경은 대화 로그 참고 —
요약하면: 매니지드 API(GPT-4o-mini) + Cloudflare Worker(서버리스) + RAG(임베딩 벡터 검색),
어뷰징 방어는 rate limit + 월 지출 캡 2단으로 시작, Turnstile은 실제 어뷰징 발생 시 추가.

## 아직 안 된 것 (수동 설정 필요)

이 커밋은 코드만 준비된 상태고, 아래는 로컬/Cloudflare 콘솔에서 직접 해야 합니다 — 계정 인증이
필요해서 자동화할 수 없었어요.

### 1. 의존성 설치

```bash
cd chat
npm install
```

### 2. Cloudflare 로그인 + KV 네임스페이스 생성

```bash
npx wrangler login
npx wrangler kv namespace create APP_KV
```

출력된 `id`를 `wrangler.toml`의 `kv_namespaces[0].id`에 붙여넣으세요 (현재
`REPLACE_WITH_KV_NAMESPACE_ID` 플레이스홀더로 되어 있음).

### 3. Rate Limit 네임스페이스 ID

`wrangler.toml`의 `[[ratelimits]]` 블록 `namespace_id = "1001"`는 임의의 정수면 되고
(Cloudflare 계정 내에서 유니크할 필요 없음, Worker 내부 식별자), 그대로 둬도 됩니다.
필요하면 `limit`/`period`만 조정하세요 (period는 10 또는 60초만 가능).

### 4. OpenAI API 키 등록

```bash
# 로컬 개발용
cp .dev.vars.example .dev.vars
# .dev.vars 열어서 실제 키로 교체

# 배포용 (Cloudflare에 secret으로 저장, wrangler.toml엔 안 들어감)
npx wrangler secret put OPENAI_API_KEY
```

### 5. 임베딩 생성 + 업로드

블로그 글이 바뀔 때마다(또는 최초 1회) 재실행:

```bash
node --env-file=.dev.vars scripts/build-embeddings.mjs
npm run upload-embeddings
```

`build-embeddings.mjs`는 원본 마크다운(`_posts/`)이 아니라 **실제 배포된 gh-pages 브랜치**를
읽어서 URL/본문을 추출합니다 — Jekyll의 permalink 규칙(카테고리 기반 경로, 한글 URL 인코딩 등)을
직접 재구현하는 대신 이미 빌드된 결과를 신뢰하는 편이 정확해서예요. 즉 이 스크립트를 돌리기 전에
최신 글이 gh-pages에 배포돼 있어야 합니다.

### 6. 로컬 테스트

```bash
npm run dev
# 다른 터미널에서
curl -X POST http://localhost:8787/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"question": "K8s 스터디에서 Pod가 뭐라고 설명했어?"}'
```

### 7. 배포

```bash
npm run deploy
```

배포되면 `https://kimmand0o0-blog-chat.<your-subdomain>.workers.dev`를 wrangler가 출력합니다.

### 8. 프론트엔드 위젯 연결 (아직 안 함)

`widget/chat-widget.js`는 아직 Jekyll 레이아웃에 연결 안 돼 있어요. 붙이려면:
1. `widget/chat-widget.js`를 Jekyll이 서빙하는 경로(예: `assets/js/chat-widget.js`)로 복사
2. `_includes/head.html` 등에 아래 한 줄 추가, `data-endpoint`는 7번에서 나온 실제 Worker URL로 교체:
   ```html
   <script src="/assets/js/chat-widget.js" data-endpoint="https://<your-worker>.workers.dev/api/chat" defer></script>
   ```

## 아키텍처 요약

```
방문자 → chat-widget.js → POST /api/chat → Worker
                                              1) Rate Limit (엣지, IP당 10건/60초)
                                              2) 월 지출 캡 체크 (KV: spend:YYYY-MM)
                                              3) 질문 임베딩 (OpenAI text-embedding-3-small)
                                              4) 코사인 유사도 검색 (KV: embeddings:v1, in-memory 캐시)
                                              5) GPT-4o-mini 호출 (system prompt + 발췌 + 질문)
                                              6) 실사용 토큰 기준 지출 기록
                                            → { answer, sources[] }
```

## 파일 구조

```
chat/
  wrangler.toml           # Worker 설정 (KV, rate limit, env vars)
  src/
    index.ts              # 요청 핸들러 (CORS, rate limit, budget, RAG, LLM 호출)
    types.ts
    prompt.ts              # 시스템 프롬프트
    search.ts               # 코사인 유사도 검색
    budget.ts                # KV 기반 월 지출 캡
  scripts/build-embeddings.mjs  # 인덱싱 파이프라인 (gh-pages 빌드 결과 기반)
  widget/chat-widget.js      # 프론트엔드 위젯 (미연결)
  data/embeddings.json       # 생성물, git 추적 안 함
```

## v1 범위 밖 (의도적으로 미룸)

- Turnstile 캡차 — `ChatRequestBody.turnstileToken` 필드만 예약, 검증 로직 없음
- 스트리밍 응답 — 단순 JSON 응답만
- 멀티턴 대화 기억 — 단발 Q&A만
