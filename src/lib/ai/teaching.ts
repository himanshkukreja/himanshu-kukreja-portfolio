/**
 * Two ways the tutors teach (owner-approved 12 Nov 2026), shared by the course chat, DSA Mastery's chat and problem
 * tutor, and "Ask this lesson". Pure and client-safe: the pages, the routes, the memory model and the eval share it.
 *
 *   Teach me (Socratic)    a toggle: the tutor guides with ONE question at a time, checks the learner's answer, and
 *                          explains only after they have tried or ask to see it. The route adds `teachLine()` to the
 *                          learner's own turn (system prompts stay byte-identical, so they stay cached). Remembered in
 *                          memory prefs as TEACH_PREF, so it is on again on another device.
 *   Explain it differently a button under an answer: the tutor re-explains its last answer another way (an analogy, a
 *                          step-by-step worked example, a diagram described in text, or code first), rotating so the
 *                          last way is never repeated (`nextRestyle`). When the learner gives that answer a thumbs-up or
 *                          moves on after it, the way is remembered in memory prefs (`stylePref`), and the answers that
 *                          read prefs default to it (lib/learner: the brief's adapt lines, O10).
 */

export type Restyle = "analogy" | "steps" | "diagram" | "code";
export const RESTYLES: Restyle[] = ["analogy", "steps", "diagram", "code"];
export const isRestyle = (x: unknown): x is Restyle => typeof x === "string" && (RESTYLES as string[]).includes(x);

export const RESTYLE_LABEL: Record<Restyle, string> = {
  analogy: "with an analogy",
  steps: "step by step, with an example",
  diagram: "as a diagram",
  code: "code first",
};

/** What a tap sends as the learner's words (the page shows them as their message). */
export const restyleAsk = (s: Restyle) => `Explain it differently: ${RESTYLE_LABEL[s]}.`;
/** The style a message asked for, from its words (a reloaded conversation keeps only the text). */
export const restyleOf = (text: string): Restyle | null => RESTYLES.find((s) => text.trim().toLowerCase() === restyleAsk(s).toLowerCase()) ?? null;

const RESTYLE_NOTE: Record<Restyle, string> = {
  analogy:
    "Re-explain your previous answer a different way: open with ONE everyday analogy (a queue at a shop, a library, a kitchen) in one or two sentences, map at most four of its parts to the technical idea (one short line each), then one sentence on where the analogy breaks. No code. Under 150 words in all.",
  steps:
    "Re-explain your previous answer a different way: a step-by-step worked example. Pick one small concrete input (real numbers or names) and walk it through in 3-6 numbered steps, saying what happens and why at each step; end with the one-line takeaway. Under about 200 words.",
  diagram:
    "Re-explain your previous answer a different way: as a diagram described in text. Draw it as a small labelled text diagram (boxes and arrows in a code block, or a mermaid diagram if you can draw one), then 2-4 short lines that walk the reader through it. Under about 170 words of prose.",
  code:
    "Re-explain your previous answer a different way: code first. Lead with a short, runnable sketch (at most about 15 lines, in the learner's language when you know it, else Python) that shows the idea, then at most 3 short sentences on what the code shows and why, and stop there. If this is a practice problem whose solution is locked, show the idea on a different, smaller example instead, never the solution.",
};

/** The line a route adds to the learner's turn for "Explain it differently". */
export function restyleLine(s: Restyle | null | undefined): string {
  return s ? `<explain_differently>${RESTYLE_NOTE[s]} Don't repeat the previous answer's wording or structure, don't apologise, and don't say "in other words".</explain_differently>` : "";
}

/**
 * The next style for "Explain it differently": the one after the last used in RESTYLES order, never the last one again,
 * and never `avoid` (the style the answer was already written in: the learner's remembered one) when there is a choice.
 */
export function nextRestyle(last: Restyle | null | undefined, avoid?: Restyle | null): Restyle {
  const start = last ? RESTYLES.indexOf(last) + 1 : 0;
  for (let i = 0; i < RESTYLES.length; i++) {
    const s = RESTYLES[(start + i) % RESTYLES.length];
    if (s !== last && s !== avoid) return s;
  }
  return RESTYLES.find((s) => s !== last) ?? "analogy";
}

/* ------------------------------------------------------------------ teach me */

/** A message that asks to be shown the answer now ("just tell me", "I don't know", the "Just show me" tap). */
export const REVEAL_RE = /\b(just (tell|show) me|show me the (answer|explanation)|tell me the answer|give me the answer|i (don'?t|do not) know|no idea|idk|explain it( to me)?|i give up)\b/i;

/**
 * The line a route adds to the learner's turn while "Teach me" is on. `answering`: the tutor has asked before (the newest
 * message may answer it); `topic`: what the learner first asked about in this chat (the explanation covers all of it
 * when they ask to see it); `latest`: the newest message (a request to be shown the answer switches to explaining).
 */
export function teachLine(o: { answering?: boolean; topic?: string; latest?: string } = {}): string {
  const topic = (o.topic ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (o.latest && REVEAL_RE.test(o.latest))
    return `<teach_me>"Teach me" is on, and the learner now asks to see the explanation: give it now, no more questions first.
- Explain the WHOLE of what they first asked about${topic ? ` ("${topic.replace(/"/g, "'")}")` : ""}, not only your last question: every part of it (for a pattern, both what happens on a read or a miss and what happens on a write), completely but briefly, under about 130 words. Nothing beyond it: no comparison with other patterns, no "Key takeaway" box, no diagram unless they asked for one.
- Build on what they got right in this chat in a few words. No question at the end.
- Facts, citations and the course's rules stay the same as always.</teach_me>`;
  return `<teach_me>The learner switched on "Teach me": guide them to the answer with questions instead of explaining it.
- Ask exactly ONE question per reply, and end the reply with it: nothing after the question (no "take a guess", no hint, no "one word is enough"). Never two questions, never a list of questions.
- Keep each reply under about 60 words: at most ONE short sentence before the question (a tiny concrete scenario counts as that sentence; put its numbers in the question itself if needed). No headings, no tables, no bullet lists, no bold, no "Quick check" box, no lecture.
- Start from what they likely know, and make the first question small and easy to answer; each next question builds one step toward the idea${topic ? ` they asked about ("${topic.replace(/"/g, "'")}")` : ""}.
- ${o.answering ? "Their newest message likely answers your last question: first say in a few words whether it's right, partly right or not quite and why (one sentence that never gives away the answer to your next question), then ask the next single question. If they now have the whole idea, confirm it in 2-3 sentences, name the term, and stop." : "If their newest message answers a question of yours, first say in a few words whether it's right, partly right or not quite and why, then ask the next single question."}
- After two wrong tries at the same question, explain that step in two sentences, then ask the next question.
- Facts, citations and the course's rules stay the same as always.</teach_me>`;
}

/**
 * A "Teach me" reply ends with its one question: a short tail the model added after it ("One short answer is enough.")
 * is dropped. Only a tail of at most 14 words with no code, citation or second question; otherwise the text is kept.
 */
export function endAtQuestion(text: string): string {
  const i = text.lastIndexOf("?");
  if (i < 0) return text;
  const tail = text.slice(i + 1).trim().replace(/^\**\s*/, "");
  if (!tail || tail.length > 120 || /```|\[\[|\[[^\]]+\]|\?/.test(tail) || tail.split(/\s+/).length > 14) return text;
  return text.slice(0, i + 1).replace(/\*\*$/, "") + (text.slice(i + 1).trimStart().startsWith("**") ? "**" : "");
}

/** The words a "Just show me" tap sends while "Teach me" is on. */
export const TEACH_REVEAL_ASK = "Just show me the explanation.";

/* ------------------------------------------------------------------ remembered in memory prefs */

/** The memory pref that says "Teach me" is on (memory prefs, provenance "you"). */
export const TEACH_PREF = "teach me mode: guide me with questions before explaining";
export const isTeachPref = (s: string) => /^teach me mode\b/i.test(s.trim());
export const hasTeachPref = (prefs: string[]) => prefs.some(isTeachPref);

const STYLE_PREF_HEAD = "explanations that work:";
const STYLE_PREF_TEXT: Record<Restyle, string> = {
  analogy: `${STYLE_PREF_HEAD} an everyday analogy first`,
  steps: `${STYLE_PREF_HEAD} a step-by-step worked example`,
  diagram: `${STYLE_PREF_HEAD} a diagram described in text`,
  code: `${STYLE_PREF_HEAD} code first`,
};
/** The memory pref recording the explanation style that worked for this learner (one at a time). */
export const stylePref = (s: Restyle) => STYLE_PREF_TEXT[s];
export const isStylePref = (s: string) => s.trim().toLowerCase().startsWith(STYLE_PREF_HEAD);
/** The style the learner's prefs say works (the remembered one, else one the onboarding or the tutors noted), if any. */
export function workingStyleOf(prefs: string[]): Restyle | null {
  const own = prefs.find(isStylePref);
  const t = (own ?? prefs.join(" ")).toLowerCase();
  if (/analog/.test(t)) return "analogy";
  if (/code[- ]first/.test(t)) return "code";
  if (/step[- ]by[- ]step|worked example/.test(t)) return "steps";
  if (/diagram/.test(t)) return "diagram";
  return null;
}
