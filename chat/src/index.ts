import type { ChatRequestBody, ChatResponseBody, Env } from './types';
// wrangler resolves durable_objects.bindings[].class_name against exports of
// the main entry file — must be re-exported here even though it's unused
// directly in this file.
export { OpenAiProxyDO } from './openai-proxy-do';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';
import { searchRelevantChunks } from './search';
import { estimateCostUsd, isBudgetExceeded, recordBlockedAttempt, recordSpend } from './budget';
import { checkAbusePatterns } from './guard';

const MAX_QUESTION_LENGTH = 500;

// Same wording the system prompt uses for its own off-topic refusal — kept
// identical on purpose so a code-level block and a model-level refusal are
// indistinguishable from the client's point of view (don't hand an attacker
// a way to fingerprint "did I trip the filter or just go off-topic").
const REFUSAL_MESSAGE = '만두봇은 블로그 글이나 혜란에 대한 질문에만 답하도록 만들어졌어요.';

function corsHeaders(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(body: unknown, status: number, env: Env): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env) },
  });
}

// Every OpenAI call is routed through a single Durable Object pinned to
// western North America — see openai-proxy-do.ts for why (region-block
// avoidance). "pinned" is an arbitrary fixed name; using the same name every
// time means every request reuses the same DO instance/location.
async function callOpenAi(env: Env, path: string, body: unknown): Promise<Response> {
  const stub = env.OPENAI_PROXY.getByName('pinned', { locationHint: 'wnam' });
  return stub.fetch('https://openai-proxy.internal/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, body }),
  });
}

async function embedQuestion(env: Env, question: string): Promise<{ vector: number[]; costUsd: number }> {
  const res = await callOpenAi(env, '/v1/embeddings', {
    model: env.EMBEDDING_MODEL,
    input: question,
    dimensions: Number(env.EMBEDDING_DIMENSIONS),
  });

  if (!res.ok) {
    throw new Error(`embeddings API error: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as {
    data: Array<{ embedding: number[] }>;
    usage: { prompt_tokens: number; total_tokens: number };
  };

  const costUsd = estimateCostUsd(env.EMBEDDING_MODEL, data.usage.total_tokens, 0);
  return { vector: data.data[0].embedding, costUsd };
}

async function callChatModel(
  env: Env,
  userPrompt: string
): Promise<{ answer: string; costUsd: number }> {
  const res = await callOpenAi(env, '/v1/chat/completions', {
    model: env.CHAT_MODEL,
    max_tokens: 500,
    temperature: 0.3,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  });

  if (!res.ok) {
    throw new Error(`chat completions API error: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage: { prompt_tokens: number; completion_tokens: number };
  };

  const costUsd = estimateCostUsd(env.CHAT_MODEL, data.usage.prompt_tokens, data.usage.completion_tokens);
  return { answer: data.choices[0].message.content.trim(), costUsd };
}

// Fire-and-forget insert — a logging failure must never break the chat
// response for a visitor, so this only ever console.errors, never throws.
async function logChatTurn(
  env: Env,
  fields: {
    question: string;
    answer: string | null;
    sources: Array<{ title: string; url: string }> | null;
    blocked: boolean;
    guardCategory: string | null;
    ip: string;
    userAgent: string | null;
    referrer: string | null;
    costUsd: number | null;
    latencyMs: number;
  }
): Promise<void> {
  try {
    await env.CHAT_LOGS_DB.prepare(
      `INSERT INTO chat_logs
        (question, answer, sources, blocked, guard_category, ip, user_agent, referrer, chat_model, embedding_model, cost_usd, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        fields.question,
        fields.answer,
        fields.sources ? JSON.stringify(fields.sources) : null,
        fields.blocked ? 1 : 0,
        fields.guardCategory,
        fields.ip,
        fields.userAgent,
        fields.referrer,
        env.CHAT_MODEL,
        env.EMBEDDING_MODEL,
        fields.costUsd,
        fields.latencyMs
      )
      .run();
  } catch (err) {
    console.error('chat_logs insert failed:', err);
  }
}

async function handleChat(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const startedAt = Date.now();

  // 1. Rate limit — keyed by client IP, checked at the edge before any paid work happens.
  const clientIp = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const userAgent = request.headers.get('User-Agent');
  const referrer = request.headers.get('Referer');
  const rateLimitResult = await env.CHAT_RATE_LIMITER.limit({ key: clientIp });
  if (!rateLimitResult.success) {
    return jsonResponse({ error: 'rate_limited' }, 429, env);
  }

  // 2. Monthly spend cap — checked before calling any paid API.
  if (await isBudgetExceeded(env)) {
    return jsonResponse(
      { error: 'budget_exceeded', message: '이번 달 챗봇 답변 한도에 도달해서 일시적으로 답변이 제한돼 있어요.' },
      503,
      env
    );
  }

  // 3. Parse + validate input.
  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400, env);
  }

  const question = body.question?.trim();
  if (!question) {
    return jsonResponse({ error: 'missing_question' }, 400, env);
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return jsonResponse({ error: 'question_too_long' }, 400, env);
  }
  // body.turnstileToken is accepted but not verified in v1 — reserved for
  // when abuse actually shows up (see design doc).

  // 4. Code-level abuse guard — jailbreak/OOC-injection/prompt-extraction/
  // secret-fishing/obfuscation. Runs before any paid API call; a match short
  // -circuits straight to the same refusal a legitimate off-topic question
  // would get, with zero LLM spend.
  const guard = checkAbusePatterns(question);
  if (guard.blocked) {
    await recordBlockedAttempt(env);
    // waitUntil — DB write finishes after the response is already sent, so
    // it never adds to a visitor's perceived latency (see logChatTurn's own
    // try/catch for why a write failure still can't break the response).
    ctx.waitUntil(
      logChatTurn(env, {
        question,
        answer: null,
        sources: null,
        blocked: true,
        guardCategory: guard.category ?? null,
        ip: clientIp,
        userAgent,
        referrer,
        costUsd: null,
        latencyMs: Date.now() - startedAt,
      })
    );
    const responseBody: ChatResponseBody = { answer: REFUSAL_MESSAGE, sources: [] };
    return jsonResponse(responseBody, 200, env);
  }

  // 5. RAG: embed the question, retrieve relevant post excerpts.
  let totalCostUsd = 0;
  const { vector, costUsd: embedCost } = await embedQuestion(env, question);
  totalCostUsd += embedCost;

  const chunks = await searchRelevantChunks(env, vector, 3);

  // 6. Generate the answer grounded in retrieved excerpts.
  const userPrompt = buildUserPrompt(
    question,
    chunks.map((c) => ({ title: c.title, chunk: c.chunk }))
  );
  const { answer, costUsd: chatCost } = await callChatModel(env, userPrompt);
  totalCostUsd += chatCost;

  // 7. Record real spend (not an estimate) for the budget cap.
  await recordSpend(env, totalCostUsd);

  // De-dupe sources — multiple retrieved chunks can come from the same post.
  // Chunks with url === null are private (no public page to cite) — the
  // model still sees their content in the prompt, but they never appear in
  // the citation list, so a visitor can't tell there's a hidden source.
  const seen = new Set<string>();
  const sources = chunks
    .filter((c): c is typeof c & { url: string } => c.url !== null)
    .filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)))
    .map((c) => ({ title: c.title, url: c.url }));

  ctx.waitUntil(
    logChatTurn(env, {
      question,
      answer,
      sources,
      blocked: false,
      guardCategory: null,
      ip: clientIp,
      userAgent,
      referrer,
      costUsd: totalCostUsd,
      latencyMs: Date.now() - startedAt,
    })
  );

  const responseBody: ChatResponseBody = { answer, sources };
  return jsonResponse(responseBody, 200, env);
}

// 블로그 글 조회수 — 글 페이지에서 1회 ping, 검색 페이지가 상위 목록을 읽어간다.
// 정렬 가능한 집계가 필요해 KV 대신 D1을 쓴다(원자적 UPSERT + ORDER BY).
async function handleViewPing(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { path?: unknown } | null;
  const path = typeof body?.path === 'string' ? body.path : '';

  // 이 워커에 임의의 키를 쌓지 못하게, 블로그 글 URL 형태만 받는다
  if (!path.startsWith('/') || !path.endsWith('.html') || path.length > 300) {
    return jsonResponse({ error: 'invalid_path' }, 400, env);
  }

  await env.CHAT_LOGS_DB.prepare(
    `INSERT INTO post_views (path, views, updated_at) VALUES (?, 1, ?)
     ON CONFLICT(path) DO UPDATE SET views = views + 1, updated_at = excluded.updated_at`
  )
    .bind(path, new Date().toISOString())
    .run();

  return jsonResponse({ ok: true }, 200, env);
}

/** 추천 토글 — 브라우저가 "이미 눌렀는지"를 기억하고, 서버는 합계만 증감한다 */
async function handleLike(request: Request, env: Env): Promise<Response> {
  const clientIp = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const { success } = await env.COMMENT_RATE_LIMITER.limit({ key: `like:${clientIp}` });
  if (!success) return jsonResponse({ error: 'rate_limited' }, 429, env);

  const body = (await request.json().catch(() => null)) as
    | { path?: unknown; action?: unknown }
    | null;
  const path = body?.path;
  const remove = body?.action === 'remove';
  if (!isPostPath(path)) return jsonResponse({ error: 'invalid_path' }, 400, env);

  const now = new Date().toISOString();
  if (remove) {
    // 0 밑으로는 내려가지 않게
    await env.CHAT_LOGS_DB.prepare(
      'UPDATE post_likes SET likes = MAX(likes - 1, 0), updated_at = ? WHERE path = ?'
    )
      .bind(now, path)
      .run();
  } else {
    await env.CHAT_LOGS_DB.prepare(
      `INSERT INTO post_likes (path, likes, updated_at) VALUES (?, 1, ?)
       ON CONFLICT(path) DO UPDATE SET likes = likes + 1, updated_at = excluded.updated_at`
    )
      .bind(path, now)
      .run();
  }

  const row = await env.CHAT_LOGS_DB.prepare('SELECT likes FROM post_likes WHERE path = ?')
    .bind(path)
    .first<{ likes: number }>();

  return jsonResponse({ likes: row?.likes ?? 0 }, 200, env);
}

async function handleTopLikes(url: URL, env: Env): Promise<Response> {
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 10, 1), 1000);
  const { results } = await env.CHAT_LOGS_DB.prepare(
    'SELECT path, likes FROM post_likes WHERE likes > 0 ORDER BY likes DESC, path ASC LIMIT ?'
  )
    .bind(limit)
    .all<{ path: string; likes: number }>();

  return jsonResponse({ items: results ?? [] }, 200, env);
}

async function handleTopViews(url: URL, env: Env): Promise<Response> {
  // 목록/글 페이지가 조회수를 한 번에 받아 채우므로 전체 글 수(수백)까지 허용한다
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 10, 1), 1000);
  const { results } = await env.CHAT_LOGS_DB.prepare(
    'SELECT path, views FROM post_views ORDER BY views DESC, path ASC LIMIT ?'
  )
    .bind(limit)
    .all<{ path: string; views: number }>();

  return jsonResponse({ items: results ?? [] }, 200, env);
}

// ── 댓글 ────────────────────────────────────────────────────────────
// 로그인 없는 익명 댓글. 방어는 3겹 — 레이트리밋 / 입력 길이·형식 / 수동 숨김.
const MAX_AUTHOR = 30;
const MAX_BODY = 1000;

/** 블로그 글 URL 형태만 허용 — 임의 키로 테이블을 채우지 못하게 */
function isPostPath(p: unknown): p is string {
  return typeof p === 'string' && p.startsWith('/') && p.endsWith('.html') && p.length <= 300;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function handleListComments(url: URL, env: Env): Promise<Response> {
  const path = url.searchParams.get('path');
  if (!isPostPath(path)) return jsonResponse({ error: 'invalid_path' }, 400, env);

  const { results } = await env.CHAT_LOGS_DB.prepare(
    'SELECT id, author, body, created_at, is_bot, parent_id FROM comments WHERE path = ? AND hidden = 0 ORDER BY id ASC LIMIT 500'
  )
    .bind(path)
    .all<{ id: number; author: string; body: string; created_at: string; is_bot: number; parent_id: number | null }>();

  return jsonResponse({ items: results ?? [] }, 200, env);
}

const BOT_NAME = '만두봇';

/**
 * 댓글이 달리면 (1) 스팸인지 판정하고 (2) 스팸이 아니면 대댓글을 단다.
 * 응답을 기다리게 하지 않으려고 ctx.waitUntil 로 뒤에서 돈다.
 * 실패는 전부 삼킨다 — 봇이 죽어도 댓글 자체는 남아야 한다.
 */
async function moderateAndReply(
  env: Env,
  comment: { id: number; path: string; author: string; body: string; parentId: number | null }
): Promise<void> {
  try {
    // 봇이 자기 말에 다시 답하는 무한 루프를 막는 1차 방어
    if (comment.author === BOT_NAME) return;
    if (await isBudgetExceeded(env)) return;

    // 1) 스팸 판정 — 애매하면 통과시킨다(오탐으로 진짜 댓글을 숨기는 쪽이 더 나쁘다)
    const verdictRes = await callOpenAi(env, '/v1/chat/completions', {
      model: env.CHAT_MODEL,
      max_tokens: 5,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            '너는 개인 기술 블로그의 댓글 스팸 필터다. 광고, 도박/성인 사이트 홍보, 무의미한 문자열, 링크 낚시만 스팸으로 본다. ' +
            '비판·반말·짧은 감상은 스팸이 아니다. 확신이 없으면 ham 이라고 답한다. ' +
            'spam 또는 ham 한 단어로만 답하라.',
        },
        { role: 'user', content: `작성자: ${comment.author}\n내용: ${comment.body}` },
      ],
    });

    if (verdictRes.ok) {
      const v = (await verdictRes.json()) as { choices: Array<{ message: { content: string } }> };
      if (v.choices[0].message.content.trim().toLowerCase().startsWith('spam')) {
        await env.CHAT_LOGS_DB.prepare('UPDATE comments SET hidden = 1 WHERE id = ?')
          .bind(comment.id)
          .run();
        return; // 스팸에는 답하지 않는다
      }
    }

    // 2) 대댓글 — 글 제목(경로)과 댓글만 근거로, 짧게
    const { answer } = await callChatModel(
      env,
      `블로그 글 "${comment.path}" 에 아래 댓글이 달렸어. 블로그 주인을 대신하지 말고, ` +
        `블로그 도우미 "${BOT_NAME}" 로서 2~3문장으로 짧고 친근하게 답해줘. ` +
        `모르는 내용은 아는 척하지 말고, 글 내용에 대한 질문이면 아는 범위에서만 답해.\n\n` +
        `작성자: ${comment.author}\n댓글: ${comment.body}`
    );

    if (!answer) return;

    await env.CHAT_LOGS_DB.prepare(
      'INSERT INTO comments (path, author, body, created_at, is_bot, parent_id) VALUES (?, ?, ?, ?, 1, ?)'
    )
      .bind(
        comment.path,
        BOT_NAME,
        answer.slice(0, MAX_BODY),
        new Date().toISOString(),
        comment.parentId ?? comment.id
      )
      .run();
  } catch (err) {
    console.error('moderateAndReply failed:', err);
  }
}

/** 목록 화면이 글마다 댓글 수를 한 번에 채우기 위한 집계 */
async function handleCommentCounts(env: Env): Promise<Response> {
  const { results } = await env.CHAT_LOGS_DB.prepare(
    'SELECT path, COUNT(*) AS count FROM comments WHERE hidden = 0 GROUP BY path'
  ).all<{ path: string; count: number }>();

  return jsonResponse({ items: results ?? [] }, 200, env);
}

async function handleCreateComment(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const clientIp = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const { success } = await env.COMMENT_RATE_LIMITER.limit({ key: clientIp });
  if (!success) return jsonResponse({ error: 'rate_limited' }, 429, env);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonResponse({ error: 'invalid_body' }, 400, env);

  // 봇이 자동으로 모든 입력을 채우는 걸 잡는 미끼 필드 — 사람은 비워둔다
  if (typeof body.website === 'string' && body.website.length > 0) {
    return jsonResponse({ ok: true }, 200, env); // 조용히 무시
  }

  const path = body.path;
  const author = typeof body.author === 'string' ? body.author.trim() : '';
  const text = typeof body.body === 'string' ? body.body.trim() : '';

  if (!isPostPath(path)) return jsonResponse({ error: 'invalid_path' }, 400, env);
  if (!author || author.length > MAX_AUTHOR) return jsonResponse({ error: 'invalid_author' }, 400, env);
  if (!text || text.length > MAX_BODY) return jsonResponse({ error: 'invalid_comment' }, 400, env);

  // 답글 대상 — 같은 글의 살아있는 댓글이어야 하고, 답글의 답글이면 그 부모로 끌어올린다
  let parentId: number | null = null;
  if (Number.isInteger(body.parentId)) {
    const row = await env.CHAT_LOGS_DB.prepare(
      'SELECT id, parent_id FROM comments WHERE id = ? AND path = ? AND hidden = 0'
    )
      .bind(body.parentId, path)
      .first<{ id: number; parent_id: number | null }>();
    if (row) parentId = row.parent_id ?? row.id;
  }

  const now = new Date().toISOString();
  const ipHash = (await sha256(clientIp)).slice(0, 16);

  const { meta } = await env.CHAT_LOGS_DB.prepare(
    'INSERT INTO comments (path, author, body, created_at, ip_hash, parent_id) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(path, author, text, now, ipHash, parentId)
    .run();

  // 스팸 판정 + 대댓글은 응답을 막지 않고 뒤에서 처리한다
  ctx.waitUntil(
    moderateAndReply(env, {
      id: Number(meta.last_row_id),
      path,
      author,
      body: text,
      parentId,
    })
  );

  return jsonResponse(
    { item: { id: meta.last_row_id, author, body: text, created_at: now } },
    201,
    env
  );
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) });
    }

    const url = new URL(request.url);

    try {
      if (url.pathname === '/api/view' && request.method === 'POST') {
        return await handleViewPing(request, env);
      }
      if (url.pathname === '/api/views/top' && request.method === 'GET') {
        return await handleTopViews(url, env);
      }
      if (url.pathname === '/api/comments' && request.method === 'GET') {
        return await handleListComments(url, env);
      }
      if (url.pathname === '/api/comments' && request.method === 'POST') {
        return await handleCreateComment(request, env, ctx);
      }
      if (url.pathname === '/api/like' && request.method === 'POST') {
        return await handleLike(request, env);
      }
      if (url.pathname === '/api/likes/top' && request.method === 'GET') {
        return await handleTopLikes(url, env);
      }
      if (url.pathname === '/api/comments/counts' && request.method === 'GET') {
        return await handleCommentCounts(env);
      }
      if (url.pathname === '/api/chat' && request.method === 'POST') {
        return await handleChat(request, env, ctx);
      }
      return jsonResponse({ error: 'not_found' }, 404, env);
    } catch (err) {
      console.error('handler error:', err);
      return jsonResponse({ error: 'internal_error' }, 500, env);
    }
  },
};
