import type { Env } from './types';

// Per-1M-token USD pricing. Update if you change CHAT_MODEL / EMBEDDING_MODEL
// in wrangler.toml — this map is not looked up dynamically from OpenAI.
const PRICING_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
};

function currentMonthKey(): string {
  const now = new Date();
  return `spend:${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING_PER_MILLION_TOKENS[model];
  if (!pricing) return 0; // unknown model — don't block on a pricing gap, but this should be filled in
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

/** Returns true if this month's spend is already at or over the configured cap. */
export async function isBudgetExceeded(env: Env): Promise<boolean> {
  const capUsd = Number(env.MONTHLY_BUDGET_USD);
  if (!Number.isFinite(capUsd) || capUsd <= 0) return false; // no cap configured

  const spentRaw = await env.APP_KV.get(currentMonthKey());
  const spent = spentRaw ? Number(spentRaw) : 0;
  return spent >= capUsd;
}

/** Call after every LLM/embedding call that actually ran, with its real cost. */
export async function recordSpend(env: Env, costUsd: number): Promise<void> {
  const key = currentMonthKey();
  const spentRaw = await env.APP_KV.get(key);
  const spent = spentRaw ? Number(spentRaw) : 0;
  // 32-day TTL: comfortably covers a full month even if this write happens
  // right at month start, and self-cleans old monthly keys automatically.
  await env.APP_KV.put(key, String(spent + costUsd), { expirationTtl: 60 * 60 * 24 * 32 });
}
