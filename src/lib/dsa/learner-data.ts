import "server-only";
import { supabase } from "@/lib/supabase";
import { DSA_COURSE_ID, DSA_PROBLEMS_WEEK, type DsaLang } from "./types";
import { signalsFromGame, type DsaCertSignals } from "./cert/rules";

/**
 * A learner's recorded DSA Mastery progress, read on the server with the service role (the certificate claim and the
 * public profile). Only real rows:
 *   user_profiles.game_done   dsa:p / dsa:c / dsa:cpq / dsa:boss / dsa:world / dsa:daily keys (what the map counts)
 *   learning_progress         course_id 'dsa': concepts (week = module) and problems (week 'problems', completed_stages
 *                             = the languages it was solved in)
 *   dsa_submissions           Accepted submits: the problem, the language and when
 */
export type DsaLearnerData = {
  done: Record<string, number>;
  signals: DsaCertSignals;
  /** problem → languages it has an Accepted solve in */
  langs: Map<string, Set<DsaLang>>;
  /** problem → first time it was solved (ms), when known */
  solvedAt: Map<string, number>;
  /** concepts with the lesson started but not finished */
  conceptsStarted: Set<string>;
};

const LANGS = new Set(["python", "javascript", "java", "cpp"]);

export async function dsaLearnerData(userId: string, gameDone?: Record<string, number> | null): Promise<DsaLearnerData> {
  const [profile, rows, subs] = await Promise.all([
    gameDone === undefined ? supabase.from("user_profiles").select("game_done").eq("id", userId).maybeSingle() : Promise.resolve({ data: { game_done: gameDone } }),
    supabase.from("learning_progress").select("week, lesson_slug, status, completed_stages, completed_at").eq("user_id", userId).eq("course_id", DSA_COURSE_ID).limit(3000),
    supabase.from("dsa_submissions").select("problem_id, language, created_at").eq("user_id", userId).eq("verdict", "AC").order("created_at", { ascending: true }).limit(5000),
  ]);
  const done = ((profile.data as { game_done?: Record<string, number> | null } | null)?.game_done || {}) as Record<string, number>;
  const signals = signalsFromGame(done);
  const solved = signals.solved as Set<string>;
  const concepts = signals.concepts as Set<string>;
  const langs = new Map<string, Set<DsaLang>>();
  const solvedAt = new Map<string, number>();
  const conceptsStarted = new Set<string>();
  const addLang = (p: string, l: unknown) => {
    if (typeof l !== "string" || !LANGS.has(l)) return;
    const s = langs.get(p) || new Set<DsaLang>();
    s.add(l as DsaLang);
    langs.set(p, s);
  };
  for (const r of (rows.data || []) as { week: string; lesson_slug: string; status: string | null; completed_stages: string[] | null; completed_at: string | null }[]) {
    if (r.week === DSA_PROBLEMS_WEEK) {
      if (r.status !== "completed") continue;
      solved.add(r.lesson_slug);
      (r.completed_stages || []).forEach((l) => addLang(r.lesson_slug, l));
      const t = r.completed_at ? Date.parse(r.completed_at) : NaN;
      if (Number.isFinite(t)) solvedAt.set(r.lesson_slug, Math.min(solvedAt.get(r.lesson_slug) ?? t, t));
    } else if (r.status === "completed") concepts.add(r.lesson_slug);
    else conceptsStarted.add(r.lesson_slug);
  }
  for (const s of (subs.data || []) as { problem_id: string; language: string; created_at: string }[]) {
    solved.add(s.problem_id);
    addLang(s.problem_id, s.language);
    const t = Date.parse(s.created_at);
    if (Number.isFinite(t)) solvedAt.set(s.problem_id, Math.min(solvedAt.get(s.problem_id) ?? t, t));
  }
  for (const [k, at] of Object.entries(done)) if (k.startsWith("dsa:p:") && !solvedAt.has(k.slice(6)) && Number(at) > 0) solvedAt.set(k.slice(6), Number(at));
  for (const c of concepts) conceptsStarted.delete(c);
  return { done, signals, langs, solvedAt, conceptsStarted };
}
