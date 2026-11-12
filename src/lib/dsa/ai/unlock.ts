import "server-only";
/**
 * Which DSA problems a learner may see the editorial of, decided on the server from their own rows (never from what the
 * page says), for the AI tutor's no-spoiler rule (owner's default, 9 Nov 2026): the editorial's text, approach and
 * reference solutions reach the model only for these problems.
 *
 *   solved     learning_progress (course 'dsa', week 'problems', status completed: the room's accepted solve), or an AC
 *              in dsa_submissions, or dsa_problem_progress.status 'solved'
 *   unlocked   solved, or three failed submits in dsa_submissions (the room's rule), or the editorial revealed early
 *              (dsa_problem_progress.editorial_viewed, recorded by POST /api/dsa/editorial/<id>)
 *
 * A missing table (a migration not applied) just counts as no rows. The rows are the learner model's one read
 * (lib/learner/brief.ts dsaRows, a minute per learner and isolate); `forgetUnlocks` after a reveal or a solve.
 */
import { dsaRows, forgetDsaRows } from "@/lib/learner/brief";
import type { DsaLearnerRaw } from "@/lib/learner/dsa-profile";
import { DSA_PROBLEMS_WEEK } from "../types";

export type Unlocks = { solved: Set<string>; unlocked: Set<string> };

export function forgetUnlocks(userId: string) {
  forgetDsaRows(userId);
}

/** The unlock rule over the learner's rows (pure). */
export function unlocksOf(raw: DsaLearnerRaw): Unlocks {
  const solved = new Set<string>();
  const unlocked = new Set<string>();
  for (const r of raw.rows) if (r.week === DSA_PROBLEMS_WEEK && r.status === "completed") solved.add(r.lesson_slug);
  const fails = new Map<string, number>();
  for (const r of raw.subs) {
    if (r.verdict === "AC") solved.add(r.problem_id);
    else fails.set(r.problem_id, (fails.get(r.problem_id) ?? 0) + 1);
  }
  for (const r of raw.prog) {
    if (r.status === "solved") solved.add(r.problem_id);
    if (r.editorial_viewed) unlocked.add(r.problem_id);
  }
  for (const id of solved) unlocked.add(id);
  for (const [id, n] of fails) if (n >= 3) unlocked.add(id);
  return { solved, unlocked };
}

export async function unlocksFor(userId: string): Promise<Unlocks> {
  return unlocksOf(await dsaRows(userId));
}
