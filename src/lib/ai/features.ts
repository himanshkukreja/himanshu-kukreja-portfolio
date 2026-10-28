/** The AI features, their defaults and their limits. Admin settings (ai_settings.features) override model, enabled and perDay. */
import { MODELS } from "./prices";

export type FeatureId = "lesson-qa" | "lab-hint" | "lab-review" | "explain-back" | "mock-interviewer" | "mock-coach" | "mock-scorecard" | "design-review" | "canvas-review" | "war-room" | "eval" | "batch";

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
  /** cap on what the learner sends, in characters */
  maxInputChars: number;
  /** let the model think before answering (grading, explaining). Off for the live chat features,
   *  where a short in-character reply matters more than deliberation. Haiku never thinks. */
  think: boolean;
  live: boolean;
};

export const FEATURES: Record<FeatureId, FeatureDef> = {
  "lesson-qa": { label: "Ask this lesson", model: MODELS.sonnet, amberModel: MODELS.haiku, perDay: 40, maxTokens: 1000, maxInputChars: 1000, think: true, live: true },
  "lab-hint": { label: "Code-lab hint", model: MODELS.sonnet, amberModel: MODELS.haiku, perDay: 30, maxTokens: 500, maxInputChars: 8000, think: true, live: true },
  "lab-review": { label: "Code review after a pass", model: MODELS.sonnet, amberModel: MODELS.haiku, perDay: 10, maxTokens: 900, maxInputChars: 8000, think: true, live: true },
  "explain-back": { label: "Explain-it-back grade", model: MODELS.sonnet, amberModel: MODELS.haiku, perDay: 40, maxTokens: 400, maxInputChars: 1500, think: true, live: true },
  "mock-interviewer": { label: "AI mock interviewer (turn)", model: MODELS.sonnet, amberModel: MODELS.haiku, perDay: 80, maxTokens: 450, maxInputChars: 4000, think: false, live: true },
  "mock-coach": { label: "AI mock live coach (per phase)", model: MODELS.sonnet, amberModel: MODELS.haiku, perDay: 40, maxTokens: 500, maxInputChars: 14000, think: false, live: true },
  "mock-scorecard": { label: "AI mock scorecard", model: MODELS.sonnet, amberModel: MODELS.haiku, perDay: 3, maxTokens: 3000, maxInputChars: 60000, think: true, live: true },
  "design-review": { label: "Design review", model: MODELS.sonnet, amberModel: MODELS.haiku, perDay: 5, maxTokens: 1500, maxInputChars: 15000, think: true, live: true },
  "canvas-review": { label: "Design canvas review", model: MODELS.sonnet, amberModel: MODELS.haiku, perDay: 5, maxTokens: 1500, maxInputChars: 12000, think: true, live: true },
  "war-room": { label: "War room free-text", model: MODELS.sonnet, amberModel: null, perDay: 40, maxTokens: 350, maxInputChars: 600, think: false, live: true },
  eval: { label: "Model evaluation", model: MODELS.haiku, amberModel: MODELS.haiku, perDay: 0, maxTokens: 2000, maxInputChars: 200000, think: true, live: false },
  batch: { label: "Batch content jobs", model: MODELS.opus, amberModel: MODELS.opus, perDay: 0, maxTokens: 8000, maxInputChars: 400000, think: true, live: false },
};
export const FEATURE_IDS = Object.keys(FEATURES) as FeatureId[];
