import "server-only";
/**
 * The database evidence the earning rules read (service role, never the browser's copy):
 *   learning_progress   status = 'completed' for each core lesson (+ time_spent, completed_at)
 *   trial_attempts      finished attempts; their answers are re-scored against the answer key
 *                       (src/lib/certificates/keys.ts); the row's own score / passed are ignored
 *   mcq_user_answers    the older quiz screen's saved answers, scored per part the same way
 *                       (only for parts no attempt covers)
 *   user_profiles       game_done `boss:<week>` (boss beaten), game_done `offer:<id>` + game_flags
 *                       `mock:<id>` (mock scorecard: best verdict + level), full_name (name prefill)
 * Guests' progress lives in their browser only, so certificates need an account (lessons read as a
 * guest can be imported from the Progress page).
 */
import { supabase } from "@/lib/supabase";
import { lessonKey, OFFER_VERDICTS, rescoreAttempts, scoreSavedAnswers, type AttemptRow, type CertCourse, type LearnerEvidence, type MockResult, type TrialPass } from "./core";
import { trialKeys } from "./keys";

type PgError = { code?: string; message?: string; details?: string | null } | null;
export function isMissing(error: PgError): boolean {
  if (!error) return false;
  if (["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code || "")) return true;
  return /does not exist|could not find the/i.test(`${error.message ?? ""} ${error.details ?? ""}`);
}

export type LoadedLearner = { evidence: LearnerEvidence; fullName: string | null };

const VERDICTS = ["strong-no-hire", "no-hire", "lean-no-hire", "lean-hire", "hire", "strong-hire"];

function readMock(v: unknown): MockResult | null {
  if (!v || typeof v !== "object") return null;
  const best = (v as { best?: Partial<MockResult> }).best;
  if (!best || typeof best.verdict !== "string" || !VERDICTS.includes(best.verdict)) return null;
  return { verdict: best.verdict, level: typeof best.level === "string" ? best.level : "sde", pct: Number(best.pct) || 0, at: Number(best.at) || 0 };
}

/** Bosses + mocks from the synced game state (pure, also used by the fixtures). */
export function gameEvidence(course: CertCourse, done: Record<string, unknown>, flags: Record<string, unknown>): Pick<LearnerEvidence, "bosses" | "offers" | "bestMock"> {
  const bosses: Record<string, number> = {};
  for (const w of course.worlds) {
    const at = Number(done[`boss:${w.key}`]);
    if (w.boss && at > 0) bosses[w.key] = at;
  }
  const offers: Record<string, MockResult> = {};
  let bestMock: LearnerEvidence["bestMock"] = null;
  for (const m of course.mocks) {
    const r = readMock(flags[`mock:${m.id}`]);
    if (!r || !(Number(done[`mock:${m.id}`]) > 0)) continue;
    if (!bestMock || VERDICTS.indexOf(r.verdict) > VERDICTS.indexOf(bestMock.verdict)) bestMock = { id: m.id, ...r };
    // both the offer key and a Hire+ scorecard: one alone isn't enough
    if (Number(done[`offer:${m.id}`]) > 0 && (OFFER_VERDICTS as readonly string[]).includes(r.verdict)) offers[m.id] = r;
  }
  return { bosses, offers, bestMock };
}

async function legacyPasses(userId: string, courseId: string, course: CertCourse, keys: Record<string, Awaited<ReturnType<typeof trialKeys>>[string]>): Promise<Record<string, TrialPass>> {
  const trials = course.worlds.filter((w) => w.trial).map((w) => w.trial!);
  const assess = await supabase.from("mcq_assessments").select("id, week, lesson_slug").eq("course_id", courseId);
  if (assess.error) return {};
  const list = ((assess.data || []) as { id: string; week: string; lesson_slug: string }[]).filter((a) => trials.some((t) => t.week === a.week && t.slug === a.lesson_slug));
  if (!list.length) return {};
  const ans = await supabase
    .from("mcq_user_answers")
    .select("assessment_id, question_number, selected_option")
    .eq("user_id", userId)
    .in(
      "assessment_id",
      list.map((a) => a.id)
    )
    .limit(5000);
  if (ans.error) return {};
  const byWeek: Record<string, Record<string, string>> = {};
  ((ans.data || []) as { assessment_id: string; question_number: number; selected_option: string | null }[]).forEach((r) => {
    const a = list.find((x) => x.id === r.assessment_id);
    if (a && r.selected_option) (byWeek[a.week] ||= {})[String(r.question_number)] = r.selected_option;
  });
  const out: Record<string, TrialPass> = {};
  Object.entries(byWeek).forEach(([week, answers]) => {
    if (keys[week]) Object.assign(out, scoreSavedAnswers(week, answers, keys[week]));
  });
  return out;
}

/** Everything the rules need for one learner. Throws when the course or the database can't be read. */
export async function loadLearner(userId: string, courseId: string, course: CertCourse): Promise<LoadedLearner> {
  const [keys, progress, attempts, profile] = await Promise.all([
    trialKeys(course),
    supabase.from("learning_progress").select("week, lesson_slug, status, completed_at, time_spent").eq("user_id", userId).eq("course_id", courseId).eq("status", "completed").limit(2000),
    supabase.from("trial_attempts").select("week, part, answers, score, total, passed, started_at, finished_at").eq("user_id", userId).eq("course_id", courseId).not("finished_at", "is", null).limit(5000),
    supabase.from("user_profiles").select("*").eq("id", userId).maybeSingle(),
  ]);
  if (progress.error) throw new Error(`learning_progress: ${progress.error.message}`);
  if (profile.error) throw new Error(`user_profiles: ${profile.error.message}`);
  // trial_attempts missing (level_up not applied) → no attempts; any other error is a real failure
  if (attempts.error && !isMissing(attempts.error)) throw new Error(`trial_attempts: ${attempts.error.message}`);

  const lessons: LearnerEvidence["lessons"] = {};
  ((progress.data || []) as { week: string; lesson_slug: string; status: string; completed_at: string | null; time_spent: number | null }[]).forEach((r) => {
    if (r.status === "completed") lessons[lessonKey(r.week, r.lesson_slug)] = { at: r.completed_at, seconds: Math.max(0, Math.min(10_800, r.time_spent || 0)) };
  });

  const { passes, recordedOnly } = rescoreAttempts((attempts.data || []) as AttemptRow[], keys);
  const trials: Record<string, TrialPass> = { ...passes };
  const allParts = course.worlds.flatMap((w) => (w.trial?.parts || []).map((p) => `${w.trial!.week}|${p.n}`));
  if (allParts.some((id) => !trials[id])) {
    const legacy = await legacyPasses(userId, courseId, course, keys).catch(() => ({}) as Record<string, TrialPass>);
    Object.entries(legacy).forEach(([id, t]) => (trials[id] ||= t));
  }

  const p = (profile.data || {}) as { full_name?: string | null; game_done?: Record<string, unknown> | null; game_flags?: Record<string, unknown> | null };
  const game = gameEvidence(course, p.game_done || {}, p.game_flags || {});
  return {
    evidence: { lessons, trials, trialsRecordedOnly: recordedOnly.filter((id) => !trials[id]), ...game },
    fullName: p.full_name || null,
  };
}
