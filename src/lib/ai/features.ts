/** The AI features, their defaults and their limits. Admin settings (ai_settings.features) override model, enabled and perDay. */
import { MODELS } from "./prices";

export type FeatureId = "lesson-qa" | "lab-hint" | "lab-review" | "explain-back" | "mock-interviewer" | "mock-coach" | "mock-scorecard" | "design-review" | "canvas-review" | "war-room" | "smart-search" | "course-chat" | "chat-memory" | "chat-title" | "notes-convert" | "notes-check" | "notes-cards" | "eval" | "batch" | "snip-explain" | "paper-grade";

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
  /** cap on what the learner sends, in characters (text blocks; images have their own caps below) */
  maxInputChars: number;
  /** images a call may carry (0 or unset: none; the notebook page features take the page image) */
  maxImages?: number;
  /** cap on each image's decoded size, in bytes (default 1.5 MB, lib/ai/image.ts) */
  maxImageBytes?: number;
  /** cap on each image's longer side, in pixels (default 2000) */
  maxImageSide?: number;
  /** course chat only: messages a day on the cheaper model once the `perDay` main-model messages are used
   *  (an anti-abuse ceiling, not a budget; the chat's own quota, separate from the shared AI credits) */
  ceiling?: number;
  /** let the model think before answering (grading, explaining). Off for the live chat features,
   *  where a short in-character reply matters more than deliberation. Haiku never thinks. */
  think: boolean;
  live: boolean;
  /** "content": a content-production job run by scripts or the admin (model evaluations, batch FAQ and other
   *  content generation), never a learner request. The admin's usage views leave these out by default; the budget
   *  governor counts every call (its SQL splits live from content the same way: feature in ('eval', 'batch')). */
  kind?: "content";
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
  // the learning path on /learn/chat: picks and orders resources from the ranked candidates (JSON, no thinking: it should arrive in seconds)
  // maxTokens: room for the short cited answer (~150 tokens) on top of the path (~400-500)
  "smart-search": { label: "Smart search learning path", model: MODELS.sonnet, amberModel: MODELS.haiku55, perDay: 30, maxTokens: 950, maxInputChars: 14000, think: false, live: true },
  // the course chat (/learn/chat and the Ask panel): a tool-use conversation (lib/ai/chat). Its own quota, outside the
  // shared credits: `perDay` messages a day on Sonnet, then Haiku 5.5 with its tuned prompt ("fast mode") up to `ceiling`.
  // maxTokens caps each model turn (tool calls or the answer); no thinking: answers stream in seconds.
  "course-chat": { label: "Course chat message", model: MODELS.sonnet, amberModel: MODELS.haiku55, perDay: 30, ceiling: 300, maxTokens: 1400, haikuMaxTokens: 1600, maxInputChars: 2000, think: false, live: true },
  // the chat's long-term memory: Haiku 5.5 rewrites a learner's compact memory (goals, level, topics, quiz results, chat
  // summaries) every few messages and when a chat ends. Part of the chat's own quota (not the shared credits); no thinking.
  "chat-memory": { label: "Course chat memory update", model: MODELS.haiku55, amberModel: MODELS.haiku55, perDay: 80, maxTokens: 900, maxInputChars: 24000, think: false, live: true },
  // the course chat's titles: Haiku 5.5 names a new conversation from its first message (2-6 words) while the answer is
  // written, for the history list. Part of the chat's own quota (not the shared credits, not the message count); no thinking.
  // perDay: title calls a learner may make a day (a new chat makes one, or two when its first message had no topic)
  "chat-title": { label: "Course chat title", model: MODELS.haiku55, amberModel: MODELS.haiku55, perDay: 60, maxTokens: 24, maxInputChars: 1200, think: false, live: true },
  // notebook pages (owner-approved 31 Oct 2026): Haiku 5.5 (thinking off) on a handwritten page, billed to the learner's
  // shared daily credits like every feature but the chat. Measured on five handwritten test pages (31 Oct 2026): every
  // call under $0.001, so 1 credit each: convert ~$0.0004 (≈3,000 input tokens with the image, 1.5-2.9 s), check
  // ~$0.0005-0.0009 (2.7-4 s), cards ~$0.0002-0.0003 (1.8-2.9 s). Handwriting word error rate 0% on neat pages, 1.4% messy.
  // notes-convert: the page image (1000 x 1414 PNG, about 1,900 image tokens) + the typed text of its clips and text
  // boxes → Markdown. maxTokens: the test pages typed in 130-240 tokens; 1600 leaves room for a dense page.
  "notes-convert": { label: "Notebook page to typed notes", model: MODELS.haiku55, amberModel: MODELS.haiku55, perDay: 30, maxTokens: 1600, maxInputChars: 10000, maxImages: 1, maxImageBytes: 1_500_000, maxImageSide: 2000, think: false, live: true },
  // notes-check: the typed notes against the lesson's most relevant sections (the lesson goes in the cached system prompt)
  "notes-check": { label: "Notebook page check against the lesson", model: MODELS.haiku55, amberModel: MODELS.haiku55, perDay: 20, maxTokens: 1200, maxInputChars: 13000, think: false, live: true },
  // notes-cards: 3-8 question/answer review cards from the typed notes (JSON)
  "notes-cards": { label: "Notebook page review cards", model: MODELS.haiku55, amberModel: MODELS.haiku55, perDay: 20, maxTokens: 1000, maxInputChars: 13000, think: false, live: true },
  // "Explain this" on a snip (31 Oct 2026, owner's ask): the snip's image (≤ 1568 px, WebP/PNG) + the exact text of the
  // page inside the box + where it was taken; the lesson section around it (or a lecture's narration at that moment) goes
  // in the system prompt (~6k characters). Haiku 5.5, thinking off, on the learner's shared credits (~1 credit a call).
  // maxInputChars: the snip text (≤ 4,000) and its headers; the image has its own caps.
  // Ask your own question + follow-ups (31 Oct 2026): one call per turn (~1 credit), so perDay 40 → 80 (a snip with
  // four follow-ups is five calls). maxInputChars 6000 → 16000: the first turn (snip text ≤ 4,000) + ≤ 5 earlier turns
  // (question ≤ 500, answer ≤ 1,500 each) + the new question (≤ 500); still one image a call (the snip, first turn only).
  "snip-explain": { label: "Explain a snip", model: MODELS.haiku55, amberModel: MODELS.haiku55, perDay: 80, maxTokens: 700, maxInputChars: 16000, maxImages: 1, maxImageBytes: 1_500_000, maxImageSide: 2000, think: false, live: true },
  // Written papers (owner-approved 31 Oct 2026): grade one handwritten answer against its marking scheme. Haiku 5.5
  // (thinking off) grades first; the route re-grades with Sonnet 5.5 (MODELS.sonnet, passed as the call's model) when
  // Haiku is unsure, the answer is a diagram/design or the mark is on the pass line (lib/learn/papers/grade.ts), and keeps
  // Sonnet's result. Both calls count here (perDay) and bill the learner's shared credits. One image: the answer sheets,
  // cropped to what is written and stacked (≤ 2000 px a side, PNG); the question, scheme and model answer as text.
  // maxTokens: the JSON (≤ 16 points with evidence + a 120-word reading) ran 300-700 tokens in the tests.
  "paper-grade": { label: "Written paper answer grading", model: MODELS.haiku55, amberModel: MODELS.haiku55, perDay: 60, maxTokens: 1500, maxInputChars: 16000, maxImages: 1, maxImageBytes: 1_500_000, maxImageSide: 2000, think: false, live: true },
  // maxTokens: the largest live cap (mock-scorecard), so an eval answer gets the room its feature has in production
  eval: { label: "Model evaluation", model: MODELS.haiku, amberModel: MODELS.haiku, perDay: 0, maxTokens: 3000, maxInputChars: 200000, think: true, live: false, kind: "content" },
  batch: { label: "Batch content jobs", model: MODELS.opus, amberModel: MODELS.opus, perDay: 0, maxTokens: 8000, maxInputChars: 400000, think: true, live: false, kind: "content" },
};
export const FEATURE_IDS = Object.keys(FEATURES) as FeatureId[];
/** Content-production jobs (scripts/ai-eval, scripts/ai-batch): not learner usage. */
export const CONTENT_FEATURES = FEATURE_IDS.filter((id) => FEATURES[id].kind === "content");
export const isContentFeature = (id: string) => (CONTENT_FEATURES as string[]).includes(id);

/** The answer cap a feature's call gets on this model (Haiku may have more room for its private plan). */
export const answerTokens = (feature: FeatureId, model: string): number => (/haiku/.test(model) && FEATURES[feature].haikuMaxTokens) || FEATURES[feature].maxTokens;
