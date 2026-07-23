import type { Env } from './types';

// Per-1M-token USD pricing. Update if you change CHAT_MODEL / EMBEDDING_MODEL
// in wrangler.toml — this map is not looked up dynamically from OpenAI.
const PRICING_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
};

function monthKey(prefix: string): string {
  const now = new Date();
  return `${prefix}:${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

const MONTH_TTL_SECONDS = 60 * 60 * 24 * 32; // 32 days — covers a full month, self-cleans old keys

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING_PER_MILLION_TOKENS[model];
  if (!pricing) return 0; // unknown model — don't block on a pricing gap, but this should be filled in
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

/** Returns true if this month's spend is already at or over the configured cap. */
export async function isBudgetExceeded(env: Env): Promise<boolean> {
  const capUsd = Number(env.MONTHLY_BUDGET_USD);
  if (!Number.isFinite(capUsd) || capUsd <= 0) return false; // no cap configured

  const spentRaw = await env.APP_KV.get(monthKey('spend'));
  const spent = spentRaw ? Number(spentRaw) : 0;
  return spent >= capUsd;
}

/** Call after every LLM/embedding call that actually ran, with its real cost. */
export async function recordSpend(env: Env, costUsd: number): Promise<void> {
  const key = monthKey('spend');
  const spentRaw = await env.APP_KV.get(key);
  const spent = spentRaw ? Number(spentRaw) : 0;
  await env.APP_KV.put(key, String(spent + costUsd), { expirationTtl: MONTH_TTL_SECONDS });
}

/**
 * Call whenever the code-level abuse guard blocks a request (see guard.ts).
 * Purely observational — a monthly counter so abuse trends are visible
 * without storing any request content. Never blocks anything itself.
 */
export async function recordBlockedAttempt(env: Env): Promise<void> {
  const key = monthKey('blocked');
  const countRaw = await env.APP_KV.get(key);
  const count = countRaw ? Number(countRaw) : 0;
  await env.APP_KV.put(key, String(count + 1), { expirationTtl: MONTH_TTL_SECONDS });
}
