/** The problem tutor's modes (shared by the room and /api/learn/ai/dsa/tutor; prompts in ./prompts.ts). */
export type TutorMode = "hint" | "debug" | "complexity" | "review" | "dryrun" | "explain" | "ask";
export const TUTOR_MODES: TutorMode[] = ["hint", "debug", "complexity", "review", "dryrun", "explain", "ask"];

/** What each quick action sends as the learner's words (the page shows them as the learner's message). */
export const TUTOR_ASK: Record<Exclude<TutorMode, "ask">, string> = {
  hint: "Give me a hint.",
  debug: "Debug my code.",
  complexity: "Check my complexity.",
  review: "Review my solution.",
  dryrun: "Dry run my code on a small input.",
  explain: "Explain this problem simply.",
};
