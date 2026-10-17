"use client";

/**
 * Progress written while offline, for signed-in learners: a queue in localStorage (`hk.sync.v1`)
 * of writes that could not reach Supabase, flushed when the connection comes back (the `online`
 * event, a successful reachability ping, the next page load, the tab coming back to the front).
 *
 * - One entry per thing (`lesson:<course>/<week>/<slug>`, `trial-progress:…`, `trial-attempt:<id>`):
 *   a newer offline write merges into the entry instead of adding another, so nothing is sent twice.
 * - Every flush re-reads the server row and merges (stages unioned, "completed" sticky, percentages
 *   and time only go up, the newer resume point wins) — it never overwrites newer server data.
 * - Trial attempts carry a client-made UUID as their row id, so a retry after a lost response is
 *   an upsert of the same row, not a duplicate.
 * - Entries belong to one account: another account signed in on this browser never receives them.
 * - Guests have nothing to sync: their progress lives in localStorage already.
 * XP and quests sync separately (src/game/useGameSync.ts merges the local game state on reconnect).
 */
import { supabaseClient } from "@/lib/supabase-client";
import { loadRemoteLesson, recordLearningActivity, saveRemoteLesson } from "@/components/learn/lesson/progress";
import { writeTrialProgress } from "@/components/learn/trial/engine";
import { isOffline } from "./connectivity";

const KEY = "hk.sync.v1";
const MAX_AGE_MS = 60 * 24 * 3600 * 1000;
const MAX_TRIES = 40;

export type LessonSync = {
  course: string;
  week: string;
  slug: string;
  stages: string[];
  lastStage: string | null;
  completed: boolean;
  completedAt: string | null;
  progress: number;
  startedAt: string | null;
  contentVersion: string;
  /** server time_spent this page view started from (0 when the row could not be read) */
  baseTime: number;
  /** engaged seconds per page view (max per view, so re-queuing never double counts) */
  sessions: Record<string, number>;
  timeCap: number;
  /** a stage or the lesson was cleared: mark the day active for the streak */
  activity: boolean;
  /** epoch ms of this local state */
  localAt: number;
};

export type TrialProgressSync = { course: string; week: string; slug: string; passedParts: number; totalParts: number };

export type TrialAttemptSync = {
  id: string;
  course: string;
  week: string;
  part: number;
  seed: string;
  total: number;
  answers: Record<number, string>;
  score: number;
  passed: boolean;
  startedAt: string;
  finishedAt: string;
};

type Entry =
  | { id: string; kind: "lesson"; userId: string; at: number; tries: number; next: number; data: LessonSync }
  | { id: string; kind: "trial-progress"; userId: string; at: number; tries: number; next: number; data: TrialProgressSync }
  | { id: string; kind: "trial-attempt"; userId: string; at: number; tries: number; next: number; data: TrialAttemptSync };

type Store = Record<string, Entry>;

function read(): Store {
  try {
    const raw = window.localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" ? (v as Store) : {};
  } catch {
    return {};
  }
}

function write(s: Store) {
  try {
    if (Object.keys(s).length) window.localStorage.setItem(KEY, JSON.stringify(s));
    else window.localStorage.removeItem(KEY);
  } catch {
    // storage full / unavailable: the local progress stores still hold everything
  }
  window.dispatchEvent(new Event("hk:sync-queue"));
}

/**
 * The account to queue for: the signed-in user, or — offline only — the account whose session is
 * stored in this browser (an expired access token can't refresh without a network, so supabase-js
 * reports "signed out" until the connection is back).
 */
export function syncUserId(userId: string | null): string | null {
  if (userId) return userId;
  if (!isOffline()) return null;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !/^sb-.+-auth-token$/.test(k)) continue;
      const v = JSON.parse(window.localStorage.getItem(k) || "null");
      const id = v?.user?.id ?? v?.currentSession?.user?.id;
      if (typeof id === "string") return id;
    }
  } catch {
    // unreadable session: nothing to attribute
  }
  return null;
}

const minIso = (a: string | null, b: string | null) => (!a ? b : !b ? a : Date.parse(a) <= Date.parse(b) ? a : b);

export function queueLesson(userId: string, d: LessonSync) {
  const s = read();
  const id = `lesson:${d.course}/${d.week}/${d.slug}`;
  const prev = s[id]?.kind === "lesson" ? (s[id].data as LessonSync) : null;
  const sessions = { ...(prev?.sessions ?? {}) };
  for (const [k, v] of Object.entries(d.sessions)) sessions[k] = Math.max(sessions[k] ?? 0, v);
  const data: LessonSync = prev
    ? {
        ...d,
        stages: Array.from(new Set([...prev.stages, ...d.stages])),
        lastStage: d.lastStage ?? prev.lastStage,
        completed: prev.completed || d.completed,
        completedAt: minIso(prev.completedAt, d.completedAt),
        progress: Math.max(prev.progress, d.progress),
        startedAt: minIso(prev.startedAt, d.startedAt),
        baseTime: Math.max(prev.baseTime, d.baseTime),
        sessions,
        activity: prev.activity || d.activity,
      }
    : { ...d, sessions };
  s[id] = { id, kind: "lesson", userId, at: Date.now(), tries: 0, next: 0, data };
  write(s);
}

export function queueTrialProgress(userId: string, d: TrialProgressSync) {
  const s = read();
  const id = `trial-progress:${d.course}/${d.week}/${d.slug}`;
  const prev = s[id]?.kind === "trial-progress" ? (s[id].data as TrialProgressSync) : null;
  s[id] = { id, kind: "trial-progress", userId, at: Date.now(), tries: 0, next: 0, data: { ...d, passedParts: Math.max(prev?.passedParts ?? 0, d.passedParts) } };
  write(s);
}

export function queueTrialAttempt(userId: string, d: TrialAttemptSync) {
  const s = read();
  const id = `trial-attempt:${d.id}`;
  s[id] = { id, kind: "trial-attempt", userId, at: Date.now(), tries: 0, next: 0, data: d };
  write(s);
}

export function pendingCount(userId: string | null): number {
  if (typeof window === "undefined") return 0;
  return Object.values(read()).filter((e) => !userId || e.userId === userId).length;
}

// ------------------------------------------------------------------------------------------------
// flushing

async function syncLesson(userId: string, d: LessonSync): Promise<boolean> {
  const { row, ok } = await loadRemoteLesson(userId, d.course, d.week, d.slug);
  if (!ok) return false;
  const r = (row ?? {}) as NonNullable<typeof row> & { last_accessed_at?: string | null };
  const completed = r.status === "completed" || d.completed;
  const remoteAt = r.last_accessed_at ? Date.parse(r.last_accessed_at) : 0;
  const local = d.baseTime + Object.values(d.sessions).reduce((a, b) => a + b, 0);
  const saved = await saveRemoteLesson({
    userId,
    course: d.course,
    week: d.week,
    slug: d.slug,
    stages: Array.from(new Set([...(Array.isArray(r.completed_stages) ? r.completed_stages : []), ...d.stages])),
    lastStage: d.localAt > remoteAt ? (d.lastStage ?? r.last_stage ?? null) : (r.last_stage ?? d.lastStage),
    completed,
    progress: Math.max(r.progress_percentage ?? 0, r.max_progress ?? 0, completed ? 100 : d.progress),
    timeSpent: Math.min(d.timeCap || Number.MAX_SAFE_INTEGER, Math.max(r.time_spent ?? 0, local)),
    startedAt: minIso(r.started_at ?? null, d.startedAt),
    completedAt: completed ? (r.completed_at ?? d.completedAt ?? new Date().toISOString()) : null,
    contentVersion: d.contentVersion,
  });
  if (saved && d.activity) await recordLearningActivity(userId);
  return saved;
}

async function syncAttempt(userId: string, d: TrialAttemptSync): Promise<boolean | "drop"> {
  try {
    const { error } = await supabaseClient.from("trial_attempts").upsert(
      {
        id: d.id,
        user_id: userId,
        course_id: d.course,
        week: d.week,
        part: d.part,
        seed: d.seed,
        answers: d.answers,
        score: d.score,
        total: d.total,
        passed: d.passed,
        started_at: d.startedAt,
        finished_at: d.finishedAt,
      },
      { onConflict: "id" }
    );
    if (!error) return true;
    // the trials table isn't there (migration not applied): nothing will ever take it
    if (error.code === "42P01" || error.code === "PGRST205") return "drop";
    return false;
  } catch {
    return false;
  }
}

let flushing: Promise<number> | null = null;

/** Send this account's queued writes (`force`: ignore retry backoff, e.g. just reconnected). Resolves to how many were synced. */
export function flushQueue(userId: string, opts: { force?: boolean } = {}): Promise<number> {
  flushing ??= (async () => {
    let synced = 0;
    try {
      const entries = Object.values(read()).filter((e) => e.userId === userId && (opts.force || !e.next || e.next <= Date.now()));
      for (const e of entries) {
        let ok: boolean | "drop" = false;
        try {
          if (e.kind === "lesson") ok = await syncLesson(userId, e.data);
          else if (e.kind === "trial-progress") ok = await writeTrialProgress(userId, e.data.course, e.data.week, e.data.slug, e.data.passedParts, e.data.totalParts);
          else ok = await syncAttempt(userId, e.data);
        } catch {
          ok = false;
        }
        const cur = read();
        const now = cur[e.id];
        if (ok) {
          if (ok === true) synced++;
          // a newer offline write landed while this one was in flight: keep it for the next flush
          if (now && now.at === e.at) delete cur[e.id];
        } else if (now) {
          now.tries += 1;
          now.next = Date.now() + Math.min(10 * 60_000, 5_000 * 2 ** Math.min(now.tries, 7));
        }
        write(cur);
        if (!ok && isOffline()) break; // the connection went again: stop, retry on the next reconnect
      }
      // very old or hopeless entries: the local stores still have the progress
      const cur = read();
      let changed = false;
      for (const e of Object.values(cur)) {
        if (Date.now() - e.at > MAX_AGE_MS || e.tries > MAX_TRIES) {
          delete cur[e.id];
          changed = true;
        }
      }
      if (changed) write(cur);
    } finally {
      flushing = null;
    }
    if (synced) window.dispatchEvent(new CustomEvent("hk:synced", { detail: { count: synced } }));
    return synced;
  })();
  return flushing;
}
