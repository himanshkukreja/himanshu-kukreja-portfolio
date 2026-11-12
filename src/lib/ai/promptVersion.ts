/**
 * The prompt version an answer was written with (AI quality layer, 12 Nov 2026): a short hash stored on its metering row
 * (ai_calls.meta.pv) and copied onto its feedback, so thumbs and evals can be split by prompt. It hashes the prompt
 * source files' revision (next.config.ts sets AI_PROMPT_REV_SDM from src/lib/ai/prompts.ts and AI_PROMPT_REV_DSA from
 * src/lib/dsa/ai/prompts.ts + interview-prompts.ts at build time), the feature and the model (prompts are tuned per model).
 * Outside a Next build (evals, tests) the revision is "dev". Pure, no imports: works on Node and Workers alike.
 */

const DSA = new Set(["dsa-chat", "dsa-tutor", "dsa-interview"]);

/** FNV-1a, 32-bit, as 8 hex characters */
export function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function promptVersion(feature: string, model: string): string {
  const rev = (DSA.has(feature) ? process.env.AI_PROMPT_REV_DSA : process.env.AI_PROMPT_REV_SDM) || "dev";
  return fnv(`${rev}|${feature}|${model}`);
}
