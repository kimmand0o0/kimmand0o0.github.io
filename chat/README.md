# 블로그 RAG 챗봇 — Cloudflare Worker

kimmand0o0.github.io 블로그 글을 근거로 질문에 답하는 최소 구현. 설계 배경은 대화 로그 참고 —
요약하면: 매니지드 API(GPT-4o-mini) + Cloudflare Worker(서버리스) + RAG(임베딩 벡터 검색),
어뷰징 방어는 rate limit + 월 지출 캡 + 코드 레벨 패턴 필터(탈옥/OOC/시크릿낚시 등) 다단으로 시작,
Turnstile은 실제 어뷰징 발생 시 추가.

**상태: 백엔드 배포 완료, 실동작 검증 완료.**
`https://kimmand0o0-blog-chat.kimmand0o0.workers.dev/api/chat` 로 라이브. 71개 포스트 228청크
인덱싱, K8s/롤모임 등 실제 질문으로 RAG 정확도 확인, 탈옥/OOC 코드 필터 차단 확인.
남은 건 프론트엔드 위젯을 Jekyll 레이아웃에 연결하는 것뿐 (8번 항목).

## 알아두면 좋은 것들 (실제로 겪은 함정)

- **OpenAI 지역 차단**: `*.workers.dev` Worker는 Cloudflare의 아무 엣지에서나 실행돼서,
  요청이 우연히 홍콩/중국 등 OpenAI 차단 지역 엣지에서 처리되면 `unsupported_country_region_territory`
  403이 남. `src/openai-proxy-do.ts`의 Durable Object(북미서부 `wnam` 고정)로 우회함 —
  SQLite 백엔드 DO는 Workers Free 플랜에서도 무료.
- **`origin/gh-pages` 로컬 캐시 함정**: `build-embeddings.mjs`가 gh-pages 브랜치를 읽는데,
  `git fetch origin master`는 gh-pages ref를 갱신 안 해줘서 예전 스냅샷을 계속 읽을 수 있음 —
  스크립트가 매번 `git fetch origin gh-pages`를 명시적으로 하도록 고쳐둠.
- **Worker 인메모리 캐시**: `search.ts`가 임베딩을 모듈 레벨에 캐싱해서, KV를 새로 업로드해도
  이미 워밍업된 isolate는 예전 데이터를 계속 씀 — 재배포(`wrangler deploy`)하면 새 isolate로 갱신됨.
- **Rate Limit은 colo(엣지)별로 따로 셈**: Cloudflare 공식 문서에 "eventually consistent,
  정확한 카운팅 시스템 아님"이라고 명시돼있음 — 같은 IP라도 요청이 다른 엣지로 흩어지면
  10건/60초 한도가 합산되지 않을 수 있음. 진짜 백스톱은 여전히 월 지출 캡.

## 초기 설정 (완료됨 — 다른 머신에서 다시 하거나 재현할 때 참고용)

1. `cd chat && npm install`
2. `wrangler login` (또는 CI/에이전트라면 `CLOUDFLARE_API_TOKEN` 환경변수 — "Edit Cloudflare Workers"
   템플릿으로 발급) → `wrangler kv namespace create APP_KV` → 출력된 id를 `wrangler.toml`의
   `kv_namespaces[0].id`에 반영 (완료: `3f6bbb9c2012432eaadb428dfd01a0f0`)
3. workers.dev 서브도메인 등록 필요 (계정에 하나도 없으면 최초 배포 시 막힘) — 완료: `kimmand0o0.workers.dev`
4. `cp .dev.vars.example .dev.vars` → 실제 키로 교체 (로컬용) + `wrangler secret put OPENAI_API_KEY` (배포용)
5. `npm run deploy`

## 콘텐츠 갱신 시마다 (새 글 올렸을 때)

블로그에 새 글을 올리고 gh-pages 배포가 끝난 뒤:

```bash
node --env-file=.dev.vars scripts/build-embeddings.mjs
npm run upload-embeddings
npx wrangler deploy   # KV는 새로 올라가도 Worker 인메모리 캐시는 안 갱신됨 — 재배포로 새 isolate 강제
```

`build-embeddings.mjs`는 원본 마크다운(`_posts/`)이 아니라 **실제 배포된 gh-pages 브랜치**를
읽어서 URL/본문을 추출합니다 — Jekyll의 permalink 규칙(카테고리 기반 경로, 한글 URL 인코딩 등)을
직접 재구현하는 대신 이미 빌드된 결과를 신뢰하는 편이 정확해서예요. 스크립트가 매번 `git fetch
origin gh-pages`를 먼저 하므로 최신 배포본만 반영됩니다.

## 로컬 테스트

```bash
npm run dev
# 다른 터미널에서
curl -X POST http://localhost:8787/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"question": "K8s 스터디에서 Pod가 뭐라고 설명했어?"}'
```

## 프론트엔드 위젯 연결 (아직 안 함)

`widget/chat-widget.js`는 아직 Jekyll 레이아웃에 연결 안 돼 있어요. 붙이려면:
1. `widget/chat-widget.js`를 Jekyll이 서빙하는 경로(예: `assets/js/chat-widget.js`)로 복사
2. `_includes/head.html` 등에 아래 한 줄 추가, `data-endpoint`는 7번에서 나온 실제 Worker URL로 교체:
   ```html
   <script src="/assets/js/chat-widget.js" data-endpoint="https://<your-worker>.workers.dev/api/chat" defer></script>
   ```

## 아키텍처 요약

```
방문자 → chat-widget.js → POST /api/chat → Worker
                                              1) Rate Limit (엣지 colo별, IP당 10건/60초 — best-effort)
                                              2) 월 지출 캡 체크 (KV: spend:YYYY-MM)
                                              3) 코드 레벨 어뷰징 필터 (탈옥/OOC/프롬프트유출/시크릿낚시/난독화)
                                              4) 질문 임베딩 (OpenAI text-embedding-3-small, DO 경유)
                                              5) 코사인 유사도 검색 (KV: embeddings:v1, in-memory 캐시)
                                              6) GPT-4o-mini 호출 (system prompt + 발췌 + 질문, DO 경유)
                                              7) 실사용 토큰 기준 지출 기록
                                              8) D1에 대화 로그 기록 (성공/차단 모두)
                                            → { answer, sources[] }

  Worker ──(모든 OpenAI 호출)──▶ OpenAiProxyDO (Durable Object, 북미서부 wnam 고정)
                                              → OpenAI API 콜은 항상 이 고정 리전에서 나감
```

## 대화 로그 (D1)

방문자 질문/답변은 전량 `CHAT_LOGS_DB` (D1: `kimmand0o0-blog-chat-logs`) `chat_logs` 테이블에 쌓인다.
가드에 걸려 거절된 시도도 `blocked=1`로 같이 남는다 (`answer`/`sources`는 비어있고 `guard_category`만 채워짐).
IP는 원본 그대로 저장 — 방문자 개인정보라 DB 접근 권한·백업 관리에 주의.

```bash
# 최근 대화 확인
npx wrangler d1 execute kimmand0o0-blog-chat-logs --remote \
  --command "SELECT created_at, question, blocked, guard_category FROM chat_logs ORDER BY id DESC LIMIT 20"

# 로컬 dev 시엔 --remote 빼면 로컬 sqlite에 씀 (원격과 별개 데이터)
```

## 파일 구조

```
chat/
  wrangler.toml               # Worker 설정 (KV, D1, rate limit, Durable Object, env vars)
  migrations/0001_create_chat_logs.sql  # D1 스키마 (chat_logs 테이블)
  src/
    index.ts                  # 요청 핸들러 (CORS, rate limit, budget, guard, RAG, LLM 호출, D1 로깅)
    types.ts
    prompt.ts                 # 시스템 프롬프트
    guard.ts                  # 코드 레벨 어뷰징 패턴 필터
    search.ts                 # 코사인 유사도 검색
    budget.ts                 # KV 기반 월 지출 캡 + 차단 카운터
    openai-proxy-do.ts        # OpenAI 호출 고정-리전 프록시 (Durable Object)
  scripts/build-embeddings.mjs  # 인덱싱 파이프라인 (gh-pages 빌드 결과 기반)
  widget/chat-widget.js      # 프론트엔드 위젯 (미연결)
  data/embeddings.json       # 생성물, git 추적 안 함
```

## v1 범위 밖 (의도적으로 미룸)

- Turnstile 캡차 — `ChatRequestBody.turnstileToken` 필드만 예약, 검증 로직 없음
- 스트리밍 응답 — 단순 JSON 응답만
- 멀티턴 대화 기억 — 단발 Q&A만 (D1에 로그는 쌓이지만 다음 질문에 컨텍스트로 재사용되진 않음)
