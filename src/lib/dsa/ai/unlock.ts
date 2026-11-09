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
 * A missing table (a migration not applied) just counts as no rows. Kept a minute per learner and isolate; `forgetUnlocks`
 * after a reveal.
 */
import { supabase } from "@/lib/supabase";
import { DSA_COURSE_ID, DSA_PROBLEMS_WEEK } from "../types";

export type Unlocks = { solved: Set<string>; unlocked: Set<string> };

const cache = new Map<string, { at: number; p: Promise<Unlocks> }>();

export function forgetUnlocks(userId: string) {
  cache.delete(userId);
}

export function unlocksFor(userId: string): Promise<Unlocks> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < 60_000) return hit.p;
  const p = (async (): Promise<Unlocks> => {
    const [lp, subs, prog] = await Promise.all([
      supabase.from("learning_progress").select("lesson_slug, status").eq("user_id", userId).eq("course_id", DSA_COURSE_ID).eq("week", DSA_PROBLEMS_WEEK).limit(5000),
      supabase.from("dsa_submissions").select("problem_id, verdict").eq("user_id", userId).order("created_at", { ascending: false }).limit(5000),
      supabase.from("dsa_problem_progress").select("problem_id, status, editorial_viewed").eq("user_id", userId).limit(5000),
    ]);
    const solved = new Set<string>();
    const unlocked = new Set<string>();
    for (const r of (lp.error ? [] : lp.data ?? []) as { lesson_slug: string; status: string | null }[]) if (r.status === "completed") solved.add(r.lesson_slug);
    const fails = new Map<string, number>();
    for (const r of (subs.error ? [] : subs.data ?? []) as { problem_id: string; verdict: string }[]) {
      if (r.verdict === "AC") solved.add(r.problem_id);
      else fails.set(r.problem_id, (fails.get(r.problem_id) ?? 0) + 1);
    }
    for (const r of (prog.error ? [] : prog.data ?? []) as { problem_id: string; status: string; editorial_viewed: boolean }[]) {
      if (r.status === "solved") solved.add(r.problem_id);
      if (r.editorial_viewed) unlocked.add(r.problem_id);
    }
    for (const id of solved) unlocked.add(id);
    for (const [id, n] of fails) if (n >= 3) unlocked.add(id);
    return { solved, unlocked };
  })();
  cache.set(userId, { at: Date.now(), p });
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  p.catch(() => cache.delete(userId));
  return p;
}
