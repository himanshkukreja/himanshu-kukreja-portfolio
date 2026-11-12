/**
 * "Ask this lesson" follow-ups (/api/learn/ai/ask): the panel sends the learner's last question and the answer it got
 * (`previous`), so "explain that more simply" or the answer to a quick check works. That exchange is the panel's own
 * context, not something the learner typed now: it never counts toward the feature's input cap (FEATURES["lesson-qa"]
 * .maxInputChars), only the new question does. Counting it made every follow-up after a normal-length answer fail as
 * "too long" (1,129 characters against a 1,000 cap; AI audit 12 Nov 2026, probe 10).
 *
 * Pure (no imports), so the route and the tests share it.
 */

export const PREVIOUS_Q_CHARS = 300;
export const PREVIOUS_A_CHARS = 900;

/** `s` cut to at most `max` characters at a sentence or word end (never mid-word), with "…" when cut. */
export function clipAtBoundary(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max - 1);
  // the latest sentence end in the second half, else the latest word end
  const floor = Math.floor(max * 0.5);
  let cut = -1;
  for (const m of head.matchAll(/[.!?]["')\]]?(?=\s)/g)) cut = m.index + m[0].length;
  if (cut >= floor) return `${head.slice(0, cut)} …`;
  const sp = head.lastIndexOf(" ");
  return `${(sp >= floor ? head.slice(0, sp) : head).trimEnd()}…`;
}

/** The previous exchange as the route uses it, or null when it isn't a pair of strings. */
export function clipPrevious(p: { q?: unknown; a?: unknown } | null | undefined): { q: string; a: string } | null {
  if (!p || typeof p.q !== "string" || typeof p.a !== "string") return null;
  const q = clipAtBoundary(p.q.replace(/\s+/g, " "), PREVIOUS_Q_CHARS);
  const a = clipAtBoundary(p.a.replace(/\n{3,}/g, "\n\n"), PREVIOUS_A_CHARS);
  return q && a ? { q, a } : null;
}

/** What counts toward lesson-qa's input cap: the learner's new question only (the selection is clipped on its own). */
export const askCapChars = (question: string) => question.length;
