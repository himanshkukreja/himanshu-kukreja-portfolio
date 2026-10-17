import "server-only";
import { supabase } from "@/lib/supabase";
import { LEARN_XP } from "./types";

/**
 * Reset a learner's data (service role). Shared by the admin reset API
 * (`POST /api/admin/learners/[id]/reset`) and the learner's own reset API (`POST /api/learn/reset`,
 * userId taken from the verified token). Never trusts a client-supplied user id by itself.
 *
 * Tables / columns from migration 20261014_level_up.sql (review_cards, trial_attempts,
 * user_profiles.xp / game_done / game_flags) are used when present and skipped when not.
 */
export type ResetScope =
  | { kind: "lesson"; course: string; week: string; lesson: string }
  | { kind: "week"; course: string; week: string }
  | { kind: "course"; course: string }
  | { kind: "all" };

export type ResetParts = {
  progress?: boolean;
  mcq?: boolean;
  notes?: boolean;
  bookmarks?: boolean;
  streaks?: boolean;
  game?: boolean;
};

type PgError = { code?: string; message?: string; details?: string | null } | null;

/** Missing table or column (the migration isn't applied yet). */
function isMissing(error: PgError): boolean {
  if (!error) return false;
  if (["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code || "")) return true;
  return /does not exist|could not find the/i.test(`${error.message ?? ""} ${error.details ?? ""}`);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE = /^[A-Za-z0-9._-]{1,160}$/;

function validate(userId: string, scope: ResetScope) {
  if (!UUID.test(userId)) throw new Error("Invalid user id");
  if (!scope || !["lesson", "week", "course", "all"].includes(scope.kind)) throw new Error("Invalid scope");
  const vals: string[] = [];
  if (scope.kind !== "all") vals.push(scope.course);
  if (scope.kind === "week" || scope.kind === "lesson") vals.push(scope.week);
  if (scope.kind === "lesson") vals.push(scope.lesson);
  if (vals.some((v) => typeof v !== "string" || !SAFE.test(v))) throw new Error("Invalid scope values");
}

// supabase-js filter builders differ per table type; keep this loose on purpose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Filterable = any;

/** Apply the scope to a table that has course_id / week / lesson_slug columns. */
function scoped(q: Filterable, scope: ResetScope, cols: { course?: string; week?: string; lesson?: string } = {}) {
  const c = cols.course ?? "course_id";
  const w = cols.week ?? "week";
  const l = cols.lesson ?? "lesson_slug";
  if (scope.kind === "all") return q;
  q = q.eq(c, scope.course);
  if (scope.kind === "course") return q;
  q = q.eq(w, scope.week);
  if (scope.kind === "week") return q;
  return q.eq(l, scope.lesson);
}

async function del(table: string, build: (q: Filterable) => Filterable, optional = false): Promise<number> {
  const q = build(supabase.from(table).delete({ count: "exact" }));
  const { error, count } = await q;
  if (error) {
    if (optional && isMissing(error)) return 0;
    throw new Error(`${table}: ${error.message}`);
  }
  return count ?? 0;
}

/** True when the game_done key belongs to the scope. */
function gameKeyInScope(key: string, scope: ResetScope): boolean {
  if (scope.kind === "all" || scope.kind === "course") {
    // the course's learn keys (other game quests stay unless the whole game is reset)
    return /^(lesson|stage|trial|boss|world|sidequest|mock|offer):/.test(key);
  }
  if (scope.kind === "week") {
    const w = scope.week;
    return (
      key.startsWith(`lesson:${w}/`) ||
      key.startsWith(`stage:${w}/`) ||
      key.startsWith(`trial:${w}/`) ||
      key === `boss:${w}` ||
      key === `world:${w}` ||
      (w === "bonus-problems" && key.startsWith("sidequest:"))
    );
  }
  const lk = `${scope.week}/${scope.lesson}`;
  return key === `lesson:${lk}` || key.startsWith(`stage:${lk}/`) || key === `sidequest:${scope.lesson}`;
}

function xpForKey(key: string): number {
  const p = key.slice(0, key.indexOf(":"));
  switch (p) {
    case "lesson":
      return LEARN_XP.lesson;
    case "stage":
      return LEARN_XP.stage;
    case "trial":
      return LEARN_XP.trial;
    case "boss":
      return LEARN_XP.boss;
    case "world":
      return LEARN_XP.world;
    case "sidequest":
      return LEARN_XP.sideQuest - LEARN_XP.lesson;
    case "mock":
      return LEARN_XP.mock;
    case "offer":
      return LEARN_XP.mockOffer;
    default:
      return 0;
  }
}

/** Recompute user_profiles counters from what is left. */
async function recomputeProfile(userId: string) {
  const [{ data: lp, error: lpError }, { data: days, error: daysError }] = await Promise.all([
    supabase.from("learning_progress").select("status,time_spent").eq("user_id", userId),
    supabase.from("learning_streaks").select("activity_date").eq("user_id", userId),
  ]);
  // a failed read must not be taken as "nothing left": that wrote 0 lessons / 0 time / 0 streak
  if (lpError || daysError) throw new Error(`recompute: ${(lpError || daysError)!.message}`);
  const completed = (lp || []).filter((r) => r.status === "completed").length;
  const time = (lp || []).reduce((a, r) => a + (Number(r.time_spent) || 0), 0);
  const set = new Set((days || []).map((d) => String(d.activity_date).slice(0, 10)));
  const sorted = Array.from(set).sort();
  let longest = 0;
  let run = 0;
  let prev = "";
  for (const d of sorted) {
    run = prev && Date.parse(d) - Date.parse(prev) === 86_400_000 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  // current streak: consecutive days ending today or yesterday, in Asia/Kolkata — the day
  // learning_streaks.activity_date uses (20261015_learn_backend_fixes.sql); UTC "today" is still
  // yesterday for the first 5½ hours of an Indian morning.
  let current = 0;
  const day = (offset: number) => new Date(Date.now() + 330 * 60_000 - offset * 86_400_000).toISOString().slice(0, 10);
  let start = set.has(day(0)) ? 0 : set.has(day(1)) ? 1 : -1;
  if (start >= 0) while (set.has(day(start++))) current++;
  await supabase
    .from("user_profiles")
    .update({ total_lessons_completed: completed, total_time_spent: time, current_streak: current, longest_streak: longest })
    .eq("id", userId);
}

export async function resetLearnerData(userId: string, scope: ResetScope, parts: ResetParts): Promise<{ deleted: Record<string, number> }> {
  validate(userId, scope);
  const deleted: Record<string, number> = {};
  const byUser = (q: Filterable) => q.eq("user_id", userId);

  if (parts.progress) {
    deleted.learning_progress = await del("learning_progress", (q) => scoped(byUser(q), scope));
    deleted.review_cards = await del("review_cards", (q) => scoped(byUser(q), scope), true);
    // trials are per week (the MCQ "lesson" of that week), never per reading lesson
    if (scope.kind !== "lesson" || /mcq/i.test(scope.lesson)) {
      deleted.trial_attempts = await del(
        "trial_attempts",
        (q) => scoped(byUser(q), scope.kind === "lesson" ? { kind: "week", course: scope.course, week: scope.week } : scope),
        true
      );
    } else deleted.trial_attempts = 0;
  }

  if (parts.mcq) {
    if (scope.kind === "all") {
      deleted.mcq_user_answers = await del("mcq_user_answers", byUser);
    } else {
      const { data: as, error } = await scoped(supabase.from("mcq_assessments").select("id"), scope);
      if (error) throw new Error(`mcq_assessments: ${error.message}`);
      const ids = ((as || []) as { id: string }[]).map((a) => a.id);
      deleted.mcq_user_answers = ids.length ? await del("mcq_user_answers", (q) => byUser(q).in("assessment_id", ids)) : 0;
    }
  }

  if (parts.notes) deleted.content_notes = await del("content_notes", (q) => scoped(byUser(q), scope));
  if (parts.bookmarks) deleted.bookmarks = await del("bookmarks", (q) => scoped(byUser(q), scope));

  if (parts.streaks) {
    // streak days aren't tied to a lesson: only a course-wide or full reset clears them
    deleted.learning_streaks = scope.kind === "all" || scope.kind === "course" ? await del("learning_streaks", byUser) : 0;
  }

  if (parts.progress || parts.streaks) await recomputeProfile(userId);

  if (parts.game) {
    const { data, error } = await supabase.from("user_profiles").select("xp, game_done, game_flags").eq("id", userId).maybeSingle();
    if (error && !isMissing(error)) throw new Error(`user_profiles: ${error.message}`);
    if (!error && data) {
      const row = data as { xp: number | null; game_done: Record<string, number> | null; game_flags: Record<string, unknown> | null };
      const done = { ...(row.game_done || {}) };
      let removed = 0;
      let xp = Number(row.xp) || 0;
      if (scope.kind === "all") {
        removed = Object.keys(done).length;
        // sync:resetAt tells every other browser's stale game copy not to merge pre-reset quests
        // back in (src/game/useGameSync.ts)
        const { error: e2 } = await supabase.from("user_profiles").update({ xp: 0, game_done: {}, game_flags: { "sync:resetAt": Date.now() } }).eq("id", userId);
        if (e2) throw new Error(`user_profiles: ${e2.message}`);
        deleted.game_xp = xp;
      } else {
        for (const k of Object.keys(done)) {
          if (!gameKeyInScope(k, scope)) continue;
          xp -= xpForKey(k);
          delete done[k];
          removed++;
        }
        xp = Math.max(0, xp);
        if (removed) {
          const game_flags = { ...(row.game_flags || {}), "sync:resetAt": Date.now() };
          const { error: e2 } = await supabase.from("user_profiles").update({ xp, game_done: done, game_flags }).eq("id", userId);
          if (e2) throw new Error(`user_profiles: ${e2.message}`);
        }
        deleted.game_xp = (Number(row.xp) || 0) - xp;
      }
      deleted.game_done = removed;
    } else {
      deleted.game_done = 0;
    }
  }

  return { deleted };
}
