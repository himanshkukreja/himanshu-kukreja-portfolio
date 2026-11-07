/** The AI features, their defaults and their limits. Admin settings (ai_settings.features) override model, enabled and perDay. */
import { MODELS } from "./prices";

export type FeatureId = "lesson-qa" | "lab-hint" | "lab-review" | "explain-back" | "mock-interviewer" | "mock-coach" | "mock-scorecard" | "design-review" | "canvas-review" | "war-room" | "war-room-debrief" | "war-room-ask" | "smart-search" | "course-chat" | "chat-memory" | "chat-title" | "notes-convert" | "notes-check" | "notes-cards" | "eval" | "batch" | "snip-explain" | "paper-grade";

/** How hard Haiku 5.5 thinks when a feature thinks (adaptive thinking; output_config.effort). */
export type Effort = "low" | "medium" | "high";

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
  /** let the model think before answering (grading, explaining). Off for the live chat features,
   *  where a short in-character reply matters more than deliberation. Haiku 5.5 thinks adaptively (at `effort`);
   *  Haiku 4.5 never thinks. */
  think: boolean;
  /** Haiku 5.5's thinking effort when `think` is on (default "low") */
  effort?: Effort;
  live: boolean;
  /** "content": a content-production job run by scripts or the admin (model evaluations, batch FAQ and other
   *  content generation), never a learner request. The admin's usage views leave these out by default; the budget
   *  governor counts every call (its SQL splits live from content the same way: feature in ('eval', 'batch')). */
  kind?: "content";
};

export const FEATURES: Record<FeatureId, FeatureDef> = {
  // 7 Nov 2026 (owner's decision): every feature runs on Claude Haiku 5.5 (about 1/20 of Sonnet 5.5's price), amber
  // mode too, and the per-day caps went up about 4x (credits are dollars, so each one buys ~20x more on Haiku). Before /
  // after, from one blind 3-way pass (scripts/ai-eval EVAL_CANDIDATES, Opus judge, the same cases): Sonnet 5.5's answer,
  // the 29 Oct Haiku 5.5 prompt's, and the re-tuned one's, scored side by side (scores drift between passes, so compare
  // within a row). Cost per call: Sonnet → Haiku 5.5 as run.
  //   lesson-qa        Sonnet 3.75 · old Haiku 3.13 · new 3.88   $0.0198 → $0.0008  (thinking low; premise check, exact "Beyond this lesson:")
  //   explain-back     Sonnet 3.78 · old Haiku 4.44 · new 4.67   $0.0033 → $0.0003  verdicts 9/9 (thinking low; corrections read right)
  //   mock-interviewer Sonnet 4.14 · old Haiku 4.00 · new 3.79; after two fixes, a 2nd pass: 4.14 · 3.79 · 3.86   $0.0071 → $0.0003
  //   mock-coach       Sonnet 3.75 · old Haiku 3.38 · new 3.88   $0.0104 → $0.0004  reads 8/8
  //   mock-scorecard   Sonnet 4.50 · old Haiku 2.88 · new 4.38   $0.0418 → $0.0021  levels 8/8 (thinking medium; overall level rule)
  //   design-review    Sonnet 3.25 · old Haiku 4.25 · new 4.25   $0.0158 → $0.0012  preferred 6/8 (thinking medium)
  //   smart-search     Sonnet 4.08 · old Haiku 3.54 · new 3.85   $0.0139 → $0.0007  scope 13/13 (structured output)
  //   lab-hint, canvas-review: the re-tunes scored lower in two passes (hint 3.89 / 4.00, canvas 3.88 / 3.75) than the
  //   29 Oct setup (hint 4.33 / 4.22, canvas 4.25 / 4.13; Sonnet hint 4.67 / 4.67, canvas 3.13 / 2.88), so that setup runs:
  //   hint $0.0066 → $0.0003, canvas $0.0114 → $0.0006, thinking off.
  // think: Haiku 5.5 thinks adaptively at `effort` (client.ts); the live turn features (interviewer, coach, search, chat)
  // keep thinking off and their private plan line or check field: thinking made the interviewer slower (up to 8 s) and no better.
  // haikuMaxTokens: room for the private plan Haiku's prompts write first. Haiku 5.5 was cut off at 900 (lab-review) and
  // 500 (mock-coach); with 1500 / 800 its longest answers were 667 / 504 tokens, none cut off.
  "lesson-qa": { label: "Ask this lesson", model: MODELS.haiku55, amberModel: MODELS.haiku55, perDay: 150, maxTokens: 1000, maxInputChars: 1000, think: true, effort: "low", live: true },
  "lab-hint": { label: "Code-lab hint", model: MODELS.haiku55, amberModel: MODELS.haiku55, perDay: 120, maxTokens: 500, maxInputChars: 8000, think: false, live: true },
  // Lab review v2 (7 Nov 2026, owner: Haiku 5.5, no Sonnet): a structured rubric review (JSON via output_config.format:
  // correctness / complexity / edge cases / readability, ranked issues, 2-3 interviewer follow-ups) from a fixed, cached
  // system prompt with worked examples (prompts.ts LAB_REVIEW_V2_SYSTEM); only the lab's brief and the reader's code
  // vary. The route pins the model to Haiku 5.5 so an admin model override can't move it back to Sonnet; amber keeps
  // Haiku 5.5 too. maxTokens: the JSON ran ~350-650 tokens in testing; maxInputChars: code ≤ 8,000 + the brief ≤ 4,500.
  "lab-review": { label: "Code review after a pass", model: MODELS.haiku55, amberModel: MODELS.haiku55, perDay: 40, maxTokens: 1100, maxInputChars: 14000, think: false, live: true },
  "explain-back": { label: "Explain-it-back grade", model: MODELS.haiku55, amberModel: MODELS.haiku55, perDay: 150, maxTokens: 400, maxInputChars: 1500, think: true, effort: "low", live: true },
  "mock-interviewer": { label: "AI mock interviewer (turn)", model: MODELS.haiku55, amberModel: MODELS.haiku55, perDay: 300, maxTokens: 450, maxInputChars: 4000, think: false, live: true },
  "mock-coach": { label: "AI mock live coach (per phase)", model: MODELS.haiku55, amberModel: MODELS.haiku55, perDay: 150, maxTokens: 500, haikuMaxTokens: 800, maxInputChars: 14000, think: false, live: true },
  "mock-scorecard": { label: "AI mock scorecard", model: MODELS.haiku55, amberModel: MODELS.haiku55, perDay: 12, maxTokens: 3000, maxInputChars: 60000, think: true, effort: "medium", live: true },
  "design-review": { label: "Design review", model: MODELS.haiku55, amberModel: MODELS.haiku55, perDay: 20, maxTokens: 1500, maxInputChars: 15000, think: true, effort: "medium", live: true },
  "canvas-review": { label: "Design canvas review", model: MODELS.haiku55, amberModel: MODELS.haiku55, perDay: 20, maxTokens: 1500, maxInputChars: 12000, think: false, live: true },
  // Haiku: in the blind eval it matched Sonnet on every case at about a third of the cost; Haiku 5.5 tied Haiku 4.5 (16 runs) at a tenth of its cost
  "war-room": { label: "War room free-text", model: MODELS.haiku55, amberModel: MODELS.haiku55, perDay: 40, maxTokens: 350, maxInputChars: 600, think: false, live: true },
  // War room run review (1 Nov 2026): after a room ends, a button asks for "how a senior on-call would rate your run".
  // Haiku 5.5, thinking off, on the shared credits. The room (its answer key, postmortem, real incident and lesson list)
  // goes in the system prompt; maxInputChars caps the learner's run (picks + typed moves ≤ 600 each), sent as data.
  "war-room-debrief": { label: "War room run review", model: MODELS.haiku55, amberModel: MODELS.haiku55, perDay: 12, maxTokens: 600, maxInputChars: 8000, think: false, live: true },
  // "Ask about this incident" on a war room: one question (≤ 500 characters) answered from the room's channel so far
  // (no later beats or postmortem while the room is in progress: no spoilers) and its lesson. Haiku 5.5, no thinking.
  "war-room-ask": { label: "Ask about a war room", model: MODELS.haiku55, amberModel: MODELS.haiku55, perDay: 30, maxTokens: 450, maxInputChars: 600, think: false, live: true },
  // the learning path on /chat: picks and orders resources from the ranked candidates (JSON, no thinking: it should arrive in seconds)
  // maxTokens: room for the short cited answer (~150 tokens) on top of the path (~400-500); haikuMaxTokens: + the private
  // "check" field that leads the structured output (~80-150 tokens)
  "smart-search": { label: "Smart search learning path", model: MODELS.haiku55, amberModel: MODELS.haiku55, perDay: 120, maxTokens: 950, haikuMaxTokens: 1300, maxInputChars: 14000, think: false, live: true },
  // the course chat (/chat and the Ask panel): a tool-use conversation (lib/ai/chat). Its own quota, outside the
  // shared credits: `perDay` messages a day. Every message on Haiku 5.5 with its tuned prompt since 7 Nov 2026 (owner's
  // decision): the earlier 30 Sonnet messages a day, then "fast mode" up to a 300-message ceiling, are one limit now.
  // maxTokens caps each model turn (tool calls or the answer); no thinking: answers stream in seconds.
  "course-chat": { label: "Course chat message", model: MODELS.haiku55, amberModel: MODELS.haiku55, perDay: 500, maxTokens: 1400, haikuMaxTokens: 1600, maxInputChars: 2000, think: false, live: true },
  // the chat's long-term memory: Haiku 5.5 rewrites a learner's compact memory (goals, level, topics, quiz results, chat
  // summaries) every few messages and when a chat ends. Part of the chat's own quota (not the shared credits); no thinking.
  // perDay 80 → 200 with the chat's 500 messages a day (7 Nov 2026): one update every 4 messages (MEMORY_EVERY) + chat ends
  "chat-memory": { label: "Course chat memory update", model: MODELS.haiku55, amberModel: MODELS.haiku55, perDay: 200, maxTokens: 900, maxInputChars: 24000, think: false, live: true },
  // the course chat's titles: Haiku 5.5 names a new conversation from its first message (2-6 words) while the answer is
  // written, for the history list. Part of the chat's own quota (not the shared credits, not the message count); no thinking.
  // perDay: title calls a learner may make a day (a new chat makes one, or two when its first message had no topic);
  // 60 → 200 with the chat's raised limit (7 Nov 2026)
  "chat-title": { label: "Course chat title", model: MODELS.haiku55, amberModel: MODELS.haiku55, perDay: 200, maxTokens: 24, maxInputChars: 1200, think: false, live: true },
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
  // (thinking off) grades first; the route re-grades with a second, stricter Haiku 5.5 pass (adaptive thinking, medium
  // effort; until 7 Nov 2026 Sonnet 5.5) when the first is unsure, the answer is a diagram/design or the mark is on the
  // pass line (lib/learn/papers/grade.ts), and keeps the re-check's result: ~$0.0014 a re-check against ~$0.02 on
  // Sonnet. Both calls count here (perDay) and bill the learner's shared credits. One image: the answer sheets,
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
