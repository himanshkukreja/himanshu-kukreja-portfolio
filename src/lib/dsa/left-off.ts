/**
 * The sentence(s) on the DSA home's "Your tutor · where you left off" card: rule-based, from the learner's progress in the
 * current lesson and their failed submits (no AI call). Pure and import-free (scripts/tests/dsa-continue.test.mjs).
 */

const VERDICT_WORDS: Record<string, string> = { WA: "a wrong answer", TLE: "a time-limit error", RE: "a runtime error", MLE: "a memory error", OLE: "an output error" };

export type PracticeRef = { id: string; title: string };

/** The sentence(s) for the card, from what the learner has done in the current lesson. Pure, so it can be tested. */
export function leftOffText(args: { lesson: string; solved: number; total: number; problems: PracticeRef[]; fails: Record<string, Record<string, number>>; nextTitle: string | null }): string {
  const { lesson, solved, total, problems, fails, nextTitle } = args;
  const parts: string[] = [];
  if (total > 0) parts.push(`You solved ${solved} of ${total} practice problems in "${lesson}".`);
  else parts.push(`You are partway through "${lesson}".`);
  // the problem of this lesson that took the most failed submits before it was solved
  let worst: { title: string; n: number; verdict: string } | null = null;
  for (const p of problems) {
    const f = fails[p.id];
    if (!f) continue;
    for (const [v, n] of Object.entries(f)) if (n >= 2 && (!worst || n > worst.n)) worst = { title: p.title, n, verdict: v };
  }
  if (worst) parts.push(`"${worst.title}" gave you ${VERDICT_WORDS[worst.verdict] || "an error"} ${worst.n === 2 ? "twice" : `${worst.n} times`}: read its hints once before the next try.`);
  if (nextTitle) parts.push(`Next up: "${nextTitle}".`);
  return parts.join(" ");
}

