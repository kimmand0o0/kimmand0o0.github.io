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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) });
    }

    const url = new URL(request.url);
    if (url.pathname !== '/api/chat' || request.method !== 'POST') {
      return jsonResponse({ error: 'not_found' }, 404, env);
    }

    try {
      return await handleChat(request, env, ctx);
    } catch (err) {
      console.error('chat handler error:', err);
      return jsonResponse({ error: 'internal_error' }, 500, env);
    }
  },
};
