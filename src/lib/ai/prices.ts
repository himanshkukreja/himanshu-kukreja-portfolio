/**
 * USD per million tokens, from published price guides (25 Oct 2026). The dashboard's cost is computed
 * from these and each call's token usage; the Anthropic console bill is the source of truth, so check
 * the two agree after the first week and correct this table if not.
 */
export type Price = { input: number; output: number; cacheWrite: number; cacheRead: number };

export const MODELS = {
  haiku: "claude-haiku-4-5-20251001",
  /** Claude Haiku 5.5: the war room, and the amber fallback where it matched or beat Haiku 4.5 in the A/B
   *  (scripts/ai-eval, 29 Oct 2026). Roll a feature back by pointing it at MODELS.haiku again. */
  haiku55: "claude-haiku-5-5",
  sonnet: "claude-sonnet-5-5",
  opus: "claude-opus-5-5",
} as const;
export type ModelId = (typeof MODELS)[keyof typeof MODELS];

export const PRICES: Record<string, Price> = {
  [MODELS.haiku]: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
  // prompts up to 100k tokens (every live feature's input cap is far below that); over it: 0.5 / 2.5 / 0.625 / 0.05
  [MODELS.haiku55]: { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
  [MODELS.sonnet]: { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 },
  [MODELS.opus]: { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
};

export type Usage = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };

/** Cost of one call; batch calls are half price. Unknown models are priced as Opus (never under-count). */
export function costOf(model: string, u: Usage, batch = false): number {
  const p = PRICES[model] ?? PRICES[MODELS.opus];
  const usd =
    ((u.input_tokens ?? 0) * p.input + (u.output_tokens ?? 0) * p.output + (u.cache_read_input_tokens ?? 0) * p.cacheRead + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) / 1_000_000;
  return batch ? usd / 2 : usd;
}

/** What learners see: 1 AI credit = $0.001 of spend. */
export const USD_PER_CREDIT = 0.001;
export const creditsFor = (usd: number) => Math.max(usd > 0 ? 1 : 0, Math.ceil(usd / USD_PER_CREDIT));
