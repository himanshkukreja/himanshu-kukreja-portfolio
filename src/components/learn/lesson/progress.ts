/**
 * Stage-based lesson progress: storage layer.
 *
 * - Guests: localStorage key `hk.lesson.v1` → { "<course>/<week>/<slug>": GuestLessonRecord }.
 * - Signed in: the `learning_progress` row. The stage columns (completed_stages / last_stage /
 *   max_progress / content_version) come from migration 20261014_level_up.sql; until it is applied
 *   the first write that hits a "column does not exist" error flips `legacyColumns` and every later
 *   write sends only the original columns.
 * - Completion never regresses: status "completed" is sticky, percentages only go up.
 */
import { supabaseClient } from "@/lib/supabase-client";

export const GUEST_PROGRESS_KEY = "hk.lesson.v1";

export type GuestLessonRecord = {
  /** stage ids marked done */
  stages: string[];
  /** stage to resume at */
  last: string | null;
  completed: boolean;
  completedAt?: number;
  /** highest progress percentage ever reached (0-100) */
  max: number;
  /** renderer content hash the stage ids belong to */
  v?: string;
  updatedAt: number;
  /** engaged reading seconds per stage id (see READING in lib/learn/engagedClock) */
  dwell?: Record<string, number>;
  /** per stage id: bitmask of the slices that were on screen while reading */
  seen?: Record<string, number>;
};

export type RemoteLessonRow = {
  status: string | null;
  progress_percentage: number | null;
  time_spent: number | null;
  started_at: string | null;
  completed_at: string | null;
  completed_stages?: string[] | null;
  last_stage?: string | null;
  max_progress?: number | null;
};

export const lessonKey = (course: string, week: string, slug: string) => `${course}/${week}/${slug}`;

function readAll(): Record<string, GuestLessonRecord> {
  try {
    const raw = window.localStorage.getItem(GUEST_PROGRESS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, GuestLessonRecord>) : {};
  } catch {
    return {};
  }
}

/** Every guest record (used by the week rail for ticks). */
export function readGuestProgress(): Record<string, GuestLessonRecord> {
  if (typeof window === "undefined") return {};
  return readAll();
}

export function readGuestLesson(course: string, week: string, slug: string): GuestLessonRecord | null {
  if (typeof window === "undefined") return null;
  return readAll()[lessonKey(course, week, slug)] ?? null;
}

export function writeGuestLesson(course: string, week: string, slug: string, rec: GuestLessonRecord) {
  try {
    const all = readAll();
    const key = lessonKey(course, week, slug);
    const prev = all[key];
    // never regress what was stored before
    const stages = Array.from(new Set([...(prev?.stages ?? []), ...rec.stages]));
    all[key] = {
      ...rec,
      dwell: rec.dwell ?? prev?.dwell,
      seen: rec.seen ?? prev?.seen,
      stages,
      completed: !!(prev?.completed || rec.completed),
      completedAt: prev?.completedAt ?? rec.completedAt,
      max: Math.max(prev?.max ?? 0, rec.max),
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(GUEST_PROGRESS_KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent("hk:lesson-progress", { detail: { key } }));
  } catch {
    // storage unavailable (private mode): progress lives for this visit only
  }
}

/**
 * Per-stage reading time for this device, kept inside the lesson's `hk.lesson.v1` record (so the
 * learner's "reset progress" clears it too). Merges up: seconds take the max, seen slices are OR-ed.
 * Silent: no `hk:lesson-progress` event, it changes nothing the rails show.
 */
export function writeGuestDwell(course: string, week: string, slug: string, dwell: Record<string, number>, seen: Record<string, number>) {
  try {
    const all = readAll();
    const key = lessonKey(course, week, slug);
    const prev: GuestLessonRecord = all[key] ?? { stages: [], last: null, completed: false, max: 0, updatedAt: 0 };
    const d = { ...(prev.dwell ?? {}) };
    for (const [id, secs] of Object.entries(dwell)) d[id] = Math.max(d[id] ?? 0, Math.round(secs));
    const sn = { ...(prev.seen ?? {}) };
    for (const [id, mask] of Object.entries(seen)) sn[id] = ((sn[id] ?? 0) | mask) >>> 0;
    all[key] = { ...prev, dwell: d, seen: sn };
    window.localStorage.setItem(GUEST_PROGRESS_KEY, JSON.stringify(all));
  } catch {
    // storage unavailable: reading time lives for this visit only
  }
}

const OWNER_KEY = "hk.lesson.owner";

/**
 * May this browser's `hk.lesson.v1` records be merged into `userId`'s account? The store is also
 * written while signed in, so after one person signs out and another signs in on the same browser,
 * the first person's completed lessons used to be merged into the second account. The first
 * account to sign in here claims the store; any other account skips the merge.
 */
export function claimGuestProgress(userId: string): boolean {
  try {
    const owner = window.localStorage.getItem(OWNER_KEY);
    if (owner && owner !== userId) return false;
    if (!owner) window.localStorage.setItem(OWNER_KEY, userId);
    return true;
  } catch {
    return true; // storage unavailable: there is nothing stored to leak either
  }
}

// ---------------------------------------------------------------------------------------------
// Supabase

/** Flipped once the live DB reports that the stage columns don't exist yet. */
let legacyColumns = false;

type PgError = { code?: string; message?: string; details?: string | null; hint?: string | null } | null;

export function isMissingColumnError(error: PgError): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") return true;
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  return /column .* does not exist|could not find the .* column/i.test(text);
}

export async function loadRemoteLesson(userId: string, course: string, week: string, slug: string): Promise<{ row: RemoteLessonRow | null; ok: boolean }> {
  try {
    // "*" never fails on missing columns, so the same query works before and after the migration.
    const { data, error } = await supabaseClient
      .from("learning_progress")
      .select("*")
      .eq("user_id", userId)
      .eq("course_id", course)
      .eq("week", week)
      .eq("lesson_slug", slug)
      .maybeSingle();
    if (error) return { row: null, ok: false };
    return { row: (data as RemoteLessonRow | null) ?? null, ok: true };
  } catch {
    return { row: null, ok: false };
  }
}

export type RemoteSave = {
  userId: string;
  course: string;
  week: string;
  slug: string;
  stages: string[];
  lastStage: string | null;
  completed: boolean;
  progress: number;
  timeSpent: number;
  startedAt: string | null;
  completedAt: string | null;
  contentVersion: string;
};

export async function saveRemoteLesson(s: RemoteSave): Promise<boolean> {
  const now = new Date().toISOString();
  const base: Record<string, unknown> = {
    user_id: s.userId,
    course_id: s.course,
    week: s.week,
    lesson_slug: s.slug,
    status: s.completed ? "completed" : "in_progress",
    progress_percentage: s.progress,
    time_spent: s.timeSpent,
    last_accessed_at: now,
    started_at: s.startedAt ?? now,
  };
  if (s.completed) base.completed_at = s.completedAt ?? now;

  const extended = {
    ...base,
    completed_stages: s.stages,
    last_stage: s.lastStage,
    max_progress: s.progress,
    content_version: s.contentVersion,
  };

  const upsert = (row: Record<string, unknown>) =>
    supabaseClient.from("learning_progress").upsert(row, { onConflict: "user_id,course_id,week,lesson_slug" });

  try {
    if (!legacyColumns) {
      const { error } = await upsert(extended);
      if (!error) return true;
      if (!isMissingColumnError(error)) return false;
      legacyColumns = true;
    }
    const { error } = await upsert(base);
    return !error;
  } catch {
    return false;
  }
}

/** Streak bookkeeping (migration function). Missing function or any error is ignored. */
export async function recordLearningActivity(userId: string) {
  try {
    await supabaseClient.rpc("record_learning_activity", { p_user: userId });
  } catch {
    // optional until the migration is applied
  }
}

/** Status rows for several lessons (week rail ticks). */
export async function loadRemoteWeekStatus(userId: string, course: string, weeks: string[]) {
  try {
    const { data, error } = await supabaseClient
      .from("learning_progress")
      .select("week, lesson_slug, status, progress_percentage")
      .eq("user_id", userId)
      .eq("course_id", course)
      .in("week", weeks);
    if (error || !data) return [];
    return data as { week: string; lesson_slug: string; status: string | null; progress_percentage: number | null }[];
  } catch {
    return [];
  }
}
