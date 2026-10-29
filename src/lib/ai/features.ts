/** The AI features, their defaults and their limits. Admin settings (ai_settings.features) override model, enabled and perDay. */
import { MODELS } from "./prices";

export type FeatureId = "lesson-qa" | "lab-hint" | "lab-review" | "explain-back" | "mock-interviewer" | "mock-coach" | "mock-scorecard" | "design-review" | "canvas-review" | "war-room" | "smart-search" | "eval" | "batch";

export type FeatureDef = {
  label: string;
  /** default model; the eval decides, the admin can change it */
  model: string;
  /** cheaper model used in amber mode (null: the feature pauses in amber) */
  amberModel: string | null;
  /** calls per user per day (0 = not a learner-facing feature) */
  perDay: number;
  /** hard cap on the answer length */
  maxTokens: number;
  /** Haiku's cap, when it needs more room: its tuned prompt writes a private plan first, and Haiku doesn't
   *  think, so the plan is its thinking and counts against max_tokens (thinking models get THINK_HEADROOM) */
  haikuMaxTokens?: number;
  /** cap on what the learner sends, in characters */
  maxInputChars: number;
  /** let the model think before answering (grading, explaining). Off for the live chat features,
   *  where a short in-character reply matters more than deliberation. Haiku never thinks. */
  think: boolean;
  live: boolean;
};

export const FEATURES: Record<FeatureId, FeatureDef> = {
  "lesson-qa": { label: "Ask this lesson", model: MODELS.sonnet, amberModel: MODELS.haiku55, perDay: 40, maxTokens: 1000, maxInputChars: 1000, think: true, live: true },
  "lab-hint": { label: "Code-lab hint", model: MODELS.sonnet, amberModel: MODELS.haiku55, perDay: 30, maxTokens: 500, maxInputChars: 8000, think: true, live: true },
  // amber: Haiku 5.5 with its tuned prompt beat Haiku 4.5 head to head (Opus judge, 29 Oct 2026): lab-review 3.50 vs 2.13,
  // mock-interviewer 3.71 vs 3.21, mock-coach 3.88 vs 3.00, mock-scorecard 4.38 vs 2.38 (levels 8/8 vs 6/8), design-review
  // 4.13 vs 3.00, with no format failures or cut-offs; explain-back stays on Haiku 4.5 (4.44 vs 4.22). Sonnet stays the
  // model: tuned Haiku 5.5 didn't reach it on any of these (scores in prompts.ts, TUNED_FOR_HAIKU55).
  // haikuMaxTokens: room for the private plan Haiku's prompts write first. Haiku 5.5 was cut off at 900 (lab-review) and
  // 500 (mock-coach); with 1500 / 800 its longest answers were 667 / 504 tokens, Haiku 4.5's 836 / 336, none cut off.
  "lab-review": { label: "Code review after a pass", model: MODELS.sonnet, amberModel: MODELS.haiku55, perDay: 10, maxTokens: 900, haikuMaxTokens: 1500, maxInputChars: 8000, think: true, live: true },
  "explain-back": { label: "Explain-it-back grade", model: MODELS.sonnet, amberModel: MODELS.haiku, perDay: 40, maxTokens: 400, maxInputChars: 1500, think: true, live: true },
  "mock-interviewer": { label: "AI mock interviewer (turn)", model: MODELS.sonnet, amberModel: MODELS.haiku55, perDay: 80, maxTokens: 450, maxInputChars: 4000, think: false, live: true },
  "mock-coach": { label: "AI mock live coach (per phase)", model: MODELS.sonnet, amberModel: MODELS.haiku55, perDay: 40, maxTokens: 500, haikuMaxTokens: 800, maxInputChars: 14000, think: false, live: true },
  "mock-scorecard": { label: "AI mock scorecard", model: MODELS.sonnet, amberModel: MODELS.haiku55, perDay: 3, maxTokens: 3000, maxInputChars: 60000, think: true, live: true },
  "design-review": { label: "Design review", model: MODELS.sonnet, amberModel: MODELS.haiku55, perDay: 5, maxTokens: 1500, maxInputChars: 15000, think: true, live: true },
  "canvas-review": { label: "Design canvas review", model: MODELS.sonnet, amberModel: MODELS.haiku55, perDay: 5, maxTokens: 1500, maxInputChars: 12000, think: true, live: true },
  // Haiku: in the blind eval it matched Sonnet on every case at about a third of the cost; Haiku 5.5 tied Haiku 4.5 (16 runs) at a tenth of its cost
  "war-room": { label: "War room free-text", model: MODELS.haiku55, amberModel: MODELS.haiku55, perDay: 40, maxTokens: 350, maxInputChars: 600, think: false, live: true },
  // the learning path on /learn/search: picks and orders resources from the ranked candidates (JSON, no thinking: it should arrive in seconds)
  "smart-search": { label: "Smart search learning path", model: MODELS.sonnet, amberModel: MODELS.haiku55, perDay: 30, maxTokens: 700, maxInputChars: 14000, think: false, live: true },
  // maxTokens: the largest live cap (mock-scorecard), so an eval answer gets the room its feature has in production
  eval: { label: "Model evaluation", model: MODELS.haiku, amberModel: MODELS.haiku, perDay: 0, maxTokens: 3000, maxInputChars: 200000, think: true, live: false },
  batch: { label: "Batch content jobs", model: MODELS.opus, amberModel: MODELS.opus, perDay: 0, maxTokens: 8000, maxInputChars: 400000, think: true, live: false },
};
export const FEATURE_IDS = Object.keys(FEATURES) as FeatureId[];

/** The answer cap a feature's call gets on this model (Haiku may have more room for its private plan). */
export const answerTokens = (feature: FeatureId, model: string): number => (/haiku/.test(model) && FEATURES[feature].haikuMaxTokens) || FEATURES[feature].maxTokens;
