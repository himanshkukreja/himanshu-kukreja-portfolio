/**
 * DSA Revise (pure; the browser runs it, the tests can too): re-solve reminders from the learner's submits, and the
 * shape of the pattern flashcards built from each concept's lesson (src/lib/dsa/revise-load.ts).
 *
 * Re-solve rule. A problem joins the queue when the learner struggled with it: a failed submit (Wrong Answer, Time
 * Limit, Runtime Error, Memory or Output Limit) before its first Accepted, or the editorial opened before solving.
 *   - Solved after the struggle: it comes back 1 day after that first Accepted, then 3 days after the first re-solve,
 *     then 7 days after the second. A re-solve is an Accepted submit on or after the due day; a failed submit on or
 *     after the due day brings it back the next day (same step). Three re-solves and it leaves the queue.
 *   - Not solved yet ("gave up" for now): due the day after the last failed submit.
 * Days are the learner's local days. Submits come from dsa_submissions (signed in, GET /api/dsa/revise) and the problem
 * room's history in this browser (`dsa.history.<id>`); duplicates of one submit don't change the result.
 */

export const RESOLVE_STEPS = [1, 3, 7] as const;
export const FAIL_VERDICTS: ReadonlySet<string> = new Set(["WA", "TLE", "RE", "MLE", "OLE"]);

export type SubmitEvent = { p: string; v: string; at: number };

export type ResolveItem = {
  id: string;
  state: "due" | "upcoming" | "done";
  /** re-solves done so far (0 to 3) */
  step: number;
  /** YYYY-MM-DD it is (or was) due; null once done */
  dueAt: string | null;
  solved: boolean;
  /** failed submits before the first Accepted, by verdict */
  fails: Record<string, number>;
  editorialEarly: boolean;
  lastAt: number;
};

export function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addLocalDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + n);
  return localDay(dt.getTime());
}

export function resolveSchedule(events: SubmitEvent[], editorialEarly: ReadonlySet<string>, today: string): ResolveItem[] {
  const by = new Map<string, SubmitEvent[]>();
  for (const e of events) {
    if (!e || !e.p || !Number.isFinite(e.at)) continue;
    const list = by.get(e.p);
    if (list) list.push(e);
    else by.set(e.p, [e]);
  }
  const out: ResolveItem[] = [];
  for (const [id, list] of by) {
    list.sort((a, b) => a.at - b.at);
    const first = list.findIndex((e) => e.v === "AC");
    const before = first < 0 ? list : list.slice(0, first);
    const fails: Record<string, number> = {};
    for (const e of before) if (FAIL_VERDICTS.has(e.v)) fails[e.v] = (fails[e.v] || 0) + 1;
    const failed = Object.keys(fails).length > 0;
    const early = editorialEarly.has(id);
    if (!failed && !early) continue;
    const lastAt = list[list.length - 1].at;
    if (first < 0) {
      if (!failed) continue; // the editorial alone, never submitted: nothing to date it by
      const lastFail = [...before].reverse().find((e) => FAIL_VERDICTS.has(e.v))!;
      const dueAt = addLocalDays(localDay(lastFail.at), 1);
      out.push({ id, state: dueAt <= today ? "due" : "upcoming", step: 0, dueAt, solved: false, fails, editorialEarly: early, lastAt });
      continue;
    }
    let step = 0;
    let dueAt: string | null = addLocalDays(localDay(list[first].at), RESOLVE_STEPS[0]);
    for (const e of list.slice(first + 1)) {
      const d = localDay(e.at);
      if (!dueAt || d < dueAt) continue;
      if (e.v === "AC") {
        step++;
        dueAt = step >= RESOLVE_STEPS.length ? null : addLocalDays(d, RESOLVE_STEPS[step]);
      } else if (FAIL_VERDICTS.has(e.v)) {
        dueAt = addLocalDays(d, 1);
      }
    }
    out.push({ id, state: !dueAt ? "done" : dueAt <= today ? "due" : "upcoming", step, dueAt, solved: true, fails, editorialEarly: early, lastAt });
  }
  return out.sort((a, b) => (a.dueAt || "9999").localeCompare(b.dueAt || "9999") || b.lastAt - a.lastAt);
}

/** "Wrong Answer ×2, Time Limit" */
const VERDICT_WORDS: Record<string, string> = { WA: "Wrong Answer", TLE: "Time Limit", RE: "Runtime Error", MLE: "Memory Limit", OLE: "Output Limit" };
export function failSummary(fails: Record<string, number>): string {
  return Object.entries(fails)
    .map(([v, n]) => `${VERDICT_WORDS[v] || v}${n > 1 ? ` ×${n}` : ""}`)
    .join(", ");
}

/* ------------------------------------------------------------------ pattern flashcards */

/**
 * One card of a concept's deck, all taken from the lesson (front matter and the mistake museum), never written here:
 *   card       the lesson's own reviewCards (front / back)
 *   invariant  "What is the invariant?" → the lesson's one-sentence invariant
 *   signals    "Which words point to it?" → the lesson's signals list
 *   ideas      the lesson's key points, as one card
 *   pitfall    a mistake-museum exhibit ("what goes wrong?") → the exhibit's closing explanation
 */
export type DsaRevCard = { id: string; kind: "card" | "invariant" | "signals" | "ideas" | "pitfall"; front: string; back: string; points?: string[] };

export type DsaDeck = { concept: string; module: string; moduleCode: string; title: string; href: string; cards: DsaRevCard[] };

export const DSA_REVISE_REF = (concept: string, card: string) => `dsa-revise:${concept}:${card}`;
