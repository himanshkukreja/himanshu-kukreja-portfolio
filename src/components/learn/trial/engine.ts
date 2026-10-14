/**
 * Trial engine: seeded option shuffles, per-part records, in-progress runs and their persistence.
 *
 * Storage
 * - Everyone: localStorage `hk.trial.v1:<course>:<week>` (records + the run in progress), so a
 *   closed tab comes back to the same question.
 * - Signed in: also `trial_attempts` (migration 20261014_level_up.sql). If the table is missing or a
 *   request fails, the local copy is the source of truth and nothing is blocked.
 *
 * Answers are stored by ORIGINAL option letter, so they stay valid whatever order is shown.
 * Grading happens in the browser: the answer key is part of the lesson payload.
 */
import { supabaseClient } from "@/lib/supabase-client";
import type { MCQOption, MCQQuestion } from "@/lib/mcq-parser";

export type OptionLabel = MCQOption["label"];

/** Pass mark: 80%, rounded up (20 of 25, 12 of 15, 32 of 40). */
export const passMark = (n: number) => Math.ceil(n * 0.8);
/** Rough pace: 30 seconds a question. */
export const estimateMinutes = (n: number) => Math.max(1, Math.floor(n / 2));
/** Rest after a failed attempt. */
export const COOLDOWN_MS = 10 * 60 * 1000;
export const TRIAL_XP = 100;

export const trialXpKey = (week: string, n: number) => `trial:${week}/part-${n}`;
export const lessonXpKey = (week: string, slug: string) => `lesson:${week}/${slug}`;
export const bossXpKey = (week: string) => `boss:${week}`;

// ---------------------------------------------------------------- parts

export type TrialLesson = { slug: string; title: string; label: string };

export type TrialPart = {
  /** 1-based part number */
  n: number;
  /** "Circuit Breakers" (the "Part 3:" prefix stripped) */
  title: string;
  first: number;
  last: number;
  count: number;
  /** the lesson this part tests, when known (Day 3, Foundations Part 2, the capstone) */
  lesson: TrialLesson | null;
  /** the lesson is the week's capstone ("Unlocks with the boss") */
  boss: boolean;
};

// ---------------------------------------------------------------- seeded shuffle

export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Display order (original letters) for every question of an attempt. Balanced: across a part the
 * correct option lands in each slot about equally often (the source key is mostly "B"), and the
 * order is deterministic for a given seed, so a resumed attempt shows the same screen.
 */
export function balancedOrders(questions: MCQQuestion[], seed: string): Map<number, OptionLabel[]> {
  const rand = mulberry32(hashString(`slots:${seed}`));
  let slots: number[] = [];
  while (slots.length < questions.length) slots = slots.concat(shuffled([0, 1, 2, 3], rand));
  const orders = new Map<number, OptionLabel[]>();
  questions.forEach((q, i) => {
    const labels = q.options.map((o) => o.label);
    const qRand = mulberry32(hashString(`q:${seed}:${q.number}`));
    if (!q.correctAnswer || !labels.includes(q.correctAnswer) || labels.length < 2) {
      orders.set(q.number, shuffled(labels, qRand));
      return;
    }
    const others = shuffled(labels.filter((l) => l !== q.correctAnswer), qRand);
    const slot = Math.min(slots[i], labels.length - 1);
    const order: OptionLabel[] = [];
    let o = 0;
    for (let s = 0; s < labels.length; s++) order.push(s === slot ? q.correctAnswer : others[o++]);
    orders.set(q.number, order);
  });
  return orders;
}

/** Four-digit label shown as "SHUFFLE #4821". */
export const shuffleLabel = (seed: string) => String((hashString(seed) % 9000) + 1000);

export function newSeed(who: string, courseId: string, week: string, n: number, attempt: number) {
  const nonce = Math.random().toString(36).slice(2, 8);
  return `${who}:${courseId}:${week}:p${n}:a${attempt}:${nonce}`;
}

// ---------------------------------------------------------------- records + runs

export type AttemptSummary = {
  score: number;
  total: number;
  passed: boolean;
  at: number;
  /** 1 = correct, 0 = missed, in question order (empty when only answers are known) */
  marks: (0 | 1)[];
  answers?: Record<number, OptionLabel>;
};

export type PartRecord = {
  best: number;
  total: number;
  attempts: number;
  passed: boolean;
  last?: AttemptSummary;
};

export type RunState = {
  part: number;
  attempt: number;
  seed: string;
  /** question number -> ORIGINAL option letter */
  picks: Record<number, OptionLabel>;
  flags: Record<number, boolean>;
  i: number;
  combo: number;
  bestCombo: number;
  startedAt: number;
  /** trial_attempts row id when the attempt is stored remotely */
  remoteId?: string | null;
};

type LocalStore = { parts: Record<string, PartRecord>; runs: Record<string, RunState> };

const storeKey = (courseId: string, week: string) => `hk.trial.v1:${courseId}:${week}`;

export function readLocalStore(courseId: string, week: string): LocalStore {
  try {
    const raw = window.localStorage.getItem(storeKey(courseId, week));
    const parsed = raw ? (JSON.parse(raw) as Partial<LocalStore>) : null;
    return { parts: parsed?.parts || {}, runs: parsed?.runs || {} };
  } catch {
    return { parts: {}, runs: {} };
  }
}

export function writeLocalStore(courseId: string, week: string, store: LocalStore) {
  try {
    window.localStorage.setItem(storeKey(courseId, week), JSON.stringify(store));
  } catch {
    // storage full or blocked: the attempt still works for this visit
  }
}

/** A stable id for guests so a shuffle seed is theirs across visits. */
export function guestId(): string {
  try {
    let id = window.localStorage.getItem("hk.guest.id");
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      window.localStorage.setItem("hk.guest.id", id);
    }
    return id;
  } catch {
    return "guest";
  }
}

export function cooldownLeft(rec: PartRecord | undefined, now: number): number {
  if (!rec?.last || rec.last.passed) return 0;
  return Math.max(0, rec.last.at + COOLDOWN_MS - now);
}

export const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// ---------------------------------------------------------------- remote (trial_attempts)

/** "missing" once the table is known not to exist (migration not applied). */
let remoteState: "unknown" | "ok" | "missing" = "unknown";

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message || "").toLowerCase();
  return error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST204" || msg.includes("does not exist") || msg.includes("could not find");
}

export const remoteAvailable = () => remoteState !== "missing";

type AttemptRow = {
  id: string;
  part: number;
  seed: string;
  answers: Record<string, string> | null;
  score: number;
  total: number;
  passed: boolean;
  started_at: string;
  finished_at: string | null;
};

function cleanAnswers(raw: Record<string, string> | null): Record<number, OptionLabel> {
  const answers: Record<number, OptionLabel> = {};
  Object.entries(raw || {}).forEach(([k, v]) => {
    if (v === "A" || v === "B" || v === "C" || v === "D") answers[Number(k)] = v;
  });
  return answers;
}

export type RemoteHistory = {
  parts: Record<string, PartRecord>;
  /** latest unfinished attempt per part */
  open: Record<string, { id: string; seed: string; answers: Record<number, OptionLabel>; startedAt: number }>;
};

export async function loadRemoteHistory(userId: string, courseId: string, week: string): Promise<RemoteHistory | null> {
  if (remoteState === "missing") return null;
  try {
    const { data, error } = await supabaseClient
      .from("trial_attempts")
      .select("id, part, seed, answers, score, total, passed, started_at, finished_at")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .eq("week", week)
      .order("started_at", { ascending: false })
      .limit(500);
    if (error) {
      if (isMissingTable(error)) remoteState = "missing";
      return null;
    }
    remoteState = "ok";
    const parts: Record<string, PartRecord> = {};
    const open: RemoteHistory["open"] = {};
    (data as AttemptRow[]).forEach((row) => {
      const key = String(row.part);
      if (!row.finished_at) {
        if (!open[key] && !parts[key]) {
          open[key] = { id: row.id, seed: row.seed, answers: cleanAnswers(row.answers), startedAt: Date.parse(row.started_at) };
        }
        return;
      }
      const rec = parts[key] || { best: 0, total: row.total, attempts: 0, passed: false };
      rec.attempts += 1;
      rec.best = Math.max(rec.best, row.score);
      rec.total = row.total;
      rec.passed = rec.passed || row.passed;
      if (!rec.last) rec.last = { score: row.score, total: row.total, passed: row.passed, at: Date.parse(row.finished_at), marks: [], answers: cleanAnswers(row.answers) };
      parts[key] = rec;
    });
    return { parts, open };
  } catch {
    return null;
  }
}

export async function insertRemoteAttempt(userId: string, courseId: string, week: string, part: number, seed: string, total: number): Promise<string | null> {
  if (remoteState === "missing") return null;
  try {
    const { data, error } = await supabaseClient
      .from("trial_attempts")
      .insert({ user_id: userId, course_id: courseId, week, part, seed, answers: {}, total })
      .select("id")
      .single();
    if (error) {
      if (isMissingTable(error)) remoteState = "missing";
      return null;
    }
    remoteState = "ok";
    return (data as { id: string }).id;
  } catch {
    return null;
  }
}

export async function updateRemoteAttempt(
  id: string,
  patch: { answers?: Record<number, OptionLabel>; score?: number; passed?: boolean; finished?: boolean }
): Promise<boolean> {
  if (remoteState === "missing") return false;
  try {
    const row: Record<string, unknown> = {};
    if (patch.answers) row.answers = patch.answers;
    if (patch.score !== undefined) row.score = patch.score;
    if (patch.passed !== undefined) row.passed = patch.passed;
    if (patch.finished) row.finished_at = new Date().toISOString();
    const { error } = await supabaseClient.from("trial_attempts").update(row).eq("id", id);
    if (error) {
      if (isMissingTable(error)) remoteState = "missing";
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Mirror trial progress into learning_progress so the MCQ lesson counts toward the course:
 * progress = parts passed / parts. Never goes down, and "completed" is never undone.
 * Also marks today active for the streak (record_learning_activity, when it exists).
 */
export async function writeTrialProgress(userId: string, courseId: string, week: string, lessonSlug: string, passedParts: number, totalParts: number) {
  if (!totalParts) return;
  try {
    const { data: prev } = await supabaseClient
      .from("learning_progress")
      .select("progress_percentage, status, started_at")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .eq("week", week)
      .eq("lesson_slug", lessonSlug)
      .maybeSingle();
    const pct = Math.round((Math.min(passedParts, totalParts) / totalParts) * 100);
    const progress = Math.max(prev?.progress_percentage || 0, pct);
    const wasCompleted = prev?.status === "completed";
    const completed = wasCompleted || passedParts >= totalParts;
    const now = new Date().toISOString();
    const row: Record<string, string | number> = {
      user_id: userId,
      course_id: courseId,
      week,
      lesson_slug: lessonSlug,
      progress_percentage: progress,
      status: completed ? "completed" : "in_progress",
      last_accessed_at: now,
    };
    if (!prev?.started_at) row.started_at = now;
    if (completed && !wasCompleted) row.completed_at = now;
    await supabaseClient.from("learning_progress").upsert(row, { onConflict: "user_id,course_id,week,lesson_slug" });
  } catch {
    // progress is a mirror; the trial record itself is already saved
  }
  try {
    await supabaseClient.rpc("record_learning_activity", { p_user: userId });
  } catch {
    // function not deployed yet
  }
}

/** Lessons in this week the signed-in learner has completed (learning_progress). */
export async function loadCompletedLessons(userId: string, courseId: string, week: string): Promise<Set<string>> {
  try {
    const { data, error } = await supabaseClient
      .from("learning_progress")
      .select("lesson_slug, status")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .eq("week", week);
    if (error || !data) return new Set();
    return new Set((data as { lesson_slug: string; status: string }[]).filter((r) => r.status === "completed").map((r) => r.lesson_slug));
  } catch {
    return new Set();
  }
}
