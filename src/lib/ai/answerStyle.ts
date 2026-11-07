/**
 * How the tutor answers: the learner's answer style (picked in the chat's composer and the Ask AI panel, remembered per
 * learner) and the standard follow-up actions shown as buttons under an answer. Pure and client-safe: the pages, the
 * routes, the prompts and the eval share it.
 *
 * The style never goes into a system prompt (those stay byte-identical, so they stay cached): the routes add one short
 * <answer_style> line to the learner's own turn, and the prompts say what each style means.
 */

export type AnswerStyle = "tutor" | "simple" | "detailed" | "interview" | "hinglish";

export const ANSWER_STYLES: { id: AnswerStyle; label: string; hint: string }[] = [
  { id: "tutor", label: "Tutor", hint: "Clear and visual (default)" },
  { id: "simple", label: "Simple", hint: "Plain words, an analogy first" },
  { id: "detailed", label: "Detailed", hint: "More depth and trade-offs" },
  { id: "interview", label: "Interview", hint: "How you'd say it in a round" },
  { id: "hinglish", label: "Hinglish", hint: "Hindi + English, Roman script" },
];

export const isAnswerStyle = (x: unknown): x is AnswerStyle => typeof x === "string" && ANSWER_STYLES.some((s) => s.id === x);

/** The line a route adds to the learner's turn for a style the learner picked (none for the default). */
const STYLE_NOTE: Record<Exclude<AnswerStyle, "tutor">, string> = {
  simple: "Simple: plain words, no jargon, the everyday analogy first, then a one- or two-sentence example in prose (no numbered steps); under 120 words in all; no table, no ### labels, no diagram.",
  detailed: "Detailed: the full answer with more depth: why it works, the trade-offs, the failure cases and real numbers; up to about 400 words.",
  interview: "Interview: answer as a strong candidate would say it in a system design round (assumptions, approach, trade-offs, one number), ending with a short \"In an interview, say:\" line; under about 300 words.",
  hinglish: "Hinglish: answer in natural Hinglish (Hindi in Roman script mixed with English), whatever language the message is in, with the same shape and length rules as English. Technical terms stay in English.",
};

export function styleLine(s: AnswerStyle | undefined | null): string {
  return s && s !== "tutor" ? `<answer_style>${STYLE_NOTE[s]}</answer_style>` : "";
}

/** Common Hindi words in Roman script: two or more in a message mark it as Hinglish. */
const HINGLISH = /\b(kya|kyu|kyun|kaise|kaisa|hai|hain|hota|hoti|hote|mein|mujhe|batao|samjhao|samjha|nahi|nahin|aur|toh|yeh|ye|woh|karo|karna|karte|chahiye|kuch|bhi|thoda|matlab|agar|lekin|accha|achha|theek|abhi|sirf|wala|wali)\b/gi;
/** A message that asks for a short answer ("briefly", "in short", "short mein"…). */
const SHORT = /\b(briefly|in brief|in short|keep it short|short answer|quick(?:ly)? answer|tl;?dr|short mein|ek line mein|jaldi se)\b|^\s*(?:short|briefly|quick)\b/i;

/**
 * Lines a route adds to the learner's turn from their own words, because a small model with a long prompt drifts from
 * the language and length rules (blind eval 8 Nov 2026: a Hinglish "short mein batao" got a long English answer).
 */
export function messageLines(text: string, style?: AnswerStyle | null): string[] {
  const out: string[] = [];
  if (style !== "hinglish") {
    if (/[ऀ-ॿ]/.test(text)) out.push("<language>Their message is in Hindi (Devanagari): reply in simple Hindi in Devanagari, technical terms in English.</language>");
    else if ((text.match(HINGLISH)?.length ?? 0) >= 2) out.push("<language>Their message is in Hinglish: reply in natural Hinglish (Roman script), technical terms in English.</language>");
  }
  if (SHORT.test(text)) out.push("<length>They asked for a short answer: at most 80 words, no shape, no callouts, no diagram.</length>");
  // the "In an interview, say" line only when they bring up an interview (the model added it to most answers otherwise)
  if (/\binterviews?\b|\binterviewer\b/i.test(text.replace(/\bmock interviews?\b/gi, ""))) out.push("<interview>They mention an interview: an explanation may end with one \"In an interview, say\" line.</interview>");
  return out;
}

/**
 * The standard actions under a tutor answer. `ask` is what a tap sends (the prompts know these exact words, so a
 * bare "simpler" still means "your last answer, simpler").
 */
export type FollowupAction = "simpler" | "example" | "deeper" | "quiz";
export const FOLLOWUP_ACTIONS: Record<FollowupAction, { label: string; ask: string }> = {
  simpler: { label: "Explain simpler", ask: "Explain that more simply." },
  example: { label: "Show an example", ask: "Show me a worked example." },
  deeper: { label: "Go deeper", ask: "Go deeper on that." },
  quiz: { label: "Quiz me", ask: "Quiz me on this." },
};
export const isFollowupAction = (x: unknown): x is FollowupAction => typeof x === "string" && x in FOLLOWUP_ACTIONS;
/** Cards under one answer: the answer's own questions plus actions, never more than this. */
export const MAX_CHIPS = 5;
/** the action a message is (a tap on its button sent exactly these words), if any */
export const actionOf = (text: string): FollowupAction | null => {
  const t = text.trim().toLowerCase();
  return (Object.keys(FOLLOWUP_ACTIONS) as FollowupAction[]).find((k) => FOLLOWUP_ACTIONS[k].ask.toLowerCase() === t) ?? null;
};

/**
 * The actions to offer under an answer with `questions` answer-specific follow-ups: as many as fit under MAX_CHIPS,
 * most useful first, without the one the learner just used and without any its own follow-ups already cover.
 */
export function pickActions(questions: string[], o: { asked?: string; quiz?: boolean } = {}): FollowupAction[] {
  const used = actionOf(o.asked ?? "");
  const covers = (re: RegExp) => questions.some((q) => re.test(q));
  const order: FollowupAction[] = ["simpler", "quiz", "example", "deeper"];
  return order
    .filter((a) => a !== used)
    .filter((a) => !(a === "quiz" && (o.quiz === false || covers(/\b(quiz|test) me\b/i))))
    .filter((a) => !(a === "example" && covers(/\bexample\b/i)))
    .slice(0, Math.max(0, MAX_CHIPS - questions.length));
}

/** A first name the tutor may use: the first word of the profile's name, letters only (an email-like or odd value: none). */
export function learnerFirstName(full: unknown): string | null {
  if (typeof full !== "string") return null;
  const words = full.normalize("NFC").trim().split(/\s+/);
  const first = /^(dr|mr|mrs|ms|miss|prof)\.?$/i.test(words[0] ?? "") ? words[1] : words[0];
  if (!first || !/^\p{L}[\p{L}\p{M}'’-]{1,23}$/u.test(first)) return null;
  // a name made from an email's local part ("asha") reads better capitalised
  return first === first.toLowerCase() ? first[0].toUpperCase() + first.slice(1) : first;
}
