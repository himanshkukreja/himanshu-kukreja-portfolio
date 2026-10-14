"use client";

/**
 * Learner progress for the Learn screens, batched: ONE learning_progress query per page for
 * signed-in learners (no per-card queries), merged with the game engine's `done` record, which is
 * where guests' progress lives (localStorage) and which signed-in learners also carry:
 *   lesson:<week>/<slug>            lesson marked complete (+60)
 *   stage:<week>/<slug>/<stageId>   stage checkpoint (+10)
 *   trial:<week>/part-<n>           trial part passed (+100)
 *   boss:<week>                     boss defeated (+200)
 *   world:<week>                    world cleared bonus (+300, awarded by the hub)
 *   sidequest:<slug>                side quest bonus (+60 on top of the lesson's +60, awarded by the hub)
 * Columns added by the 20261014 migration (completed_stages, last_stage, max_progress) are read when
 * present and ignored when not.
 */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGame } from "@/game/GameProvider";
import { supabaseClient } from "@/lib/supabase-client";
import { QUEST_BY_ID } from "@/game/catalog";
import type { CourseLesson, CourseMap, CourseWeek } from "./types";
import { LEARN_XP, lessonKey } from "./types";
import { localDate } from "./review";

export type LessonProgress = {
  status: "not_started" | "in_progress" | "completed";
  /** 0-100; 100 when completed */
  pct: number;
  completedStages: string[];
  lastStage: string | null;
  /** epoch ms of the latest activity we know about */
  lastAt: number;
};

type Row = {
  week: string;
  lesson_slug: string;
  status?: string | null;
  progress_percentage?: number | null;
  max_progress?: number | null;
  completed_stages?: string[] | null;
  last_stage?: string | null;
  last_accessed_at?: string | null;
  completed_at?: string | null;
  time_spent?: number | null;
};

export type RemoteProgress = { rows: Row[]; ok: boolean };

/** One query for every lesson of the course. Never throws. */
export async function fetchCourseProgressRows(userId: string, courseId: string): Promise<RemoteProgress> {
  try {
    const { data, error } = await supabaseClient
      .from("learning_progress")
      .select("*")
      .eq("user_id", userId)
      .eq("course_id", courseId);
    if (error) return { rows: [], ok: false };
    return { rows: (data || []) as Row[], ok: true };
  } catch {
    return { rows: [], ok: false };
  }
}

function ms(s?: string | null) {
  const t = s ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? t : 0;
}

/** Merge remote rows with the game's done record into one map keyed `${week}/${slug}`. */
export function mergeProgress(rows: Row[], done: Record<string, number>): Record<string, LessonProgress> {
  const out: Record<string, LessonProgress> = {};
  const get = (k: string) =>
    (out[k] ||= { status: "not_started", pct: 0, completedStages: [], lastStage: null, lastAt: 0 });

  rows.forEach((r) => {
    if (!r.week || !r.lesson_slug) return;
    const p = get(lessonKey(r.week, r.lesson_slug));
    const pct = Math.max(r.progress_percentage || 0, r.max_progress || 0);
    if (r.status === "completed") p.status = "completed";
    else if (pct > 0 || r.status === "in_progress") p.status = "in_progress";
    p.pct = Math.max(p.pct, pct);
    (r.completed_stages || []).forEach((s) => p.completedStages.includes(s) || p.completedStages.push(s));
    if (r.last_stage) p.lastStage = r.last_stage;
    p.lastAt = Math.max(p.lastAt, ms(r.last_accessed_at), ms(r.completed_at));
  });

  const remoteLast = new Set(rows.filter((r) => r.last_stage).map((r) => lessonKey(r.week, r.lesson_slug)));
  const stageLatest: Record<string, number> = {};
  Object.entries(done).forEach(([key, at]) => {
    if (key.startsWith("lesson:")) {
      const p = get(key.slice(7));
      p.status = "completed";
      p.lastAt = Math.max(p.lastAt, at || 0);
    } else if (key.startsWith("stage:")) {
      const rest = key.slice(6);
      const i = rest.lastIndexOf("/");
      if (i <= 0) return;
      const lk = rest.slice(0, i);
      const stage = rest.slice(i + 1);
      const p = get(lk);
      if (!p.completedStages.includes(stage)) p.completedStages.push(stage);
      if (p.status === "not_started") p.status = "in_progress";
      p.lastAt = Math.max(p.lastAt, at || 0);
      // guests: the latest checkpoint is where they were
      if (!remoteLast.has(lk) && (at || 0) >= (stageLatest[lk] || 0)) {
        stageLatest[lk] = at || 0;
        p.lastStage = stage;
      }
    }
  });
  Object.values(out).forEach((p) => {
    if (p.status === "completed") p.pct = 100;
  });
  return out;
}

/** Client hook: progress for a course, guests from localStorage, signed-in from Supabase + local. */
export function useLearnProgress(courseId: string) {
  const { user, loading } = useAuth();
  const { done, hydrated } = useGame();
  const [remote, setRemote] = useState<{ userId: string; rows: Row[]; ok: boolean } | null>(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let off = false;
    fetchCourseProgressRows(userId, courseId).then((r) => {
      if (!off) setRemote({ userId, rows: r.rows, ok: r.ok });
    });
    return () => {
      off = true;
    };
  }, [userId, courseId]);

  const rows = useMemo(() => (remote && remote.userId === userId ? remote.rows : []), [remote, userId]);
  const lessons = useMemo(() => mergeProgress(rows, hydrated ? done : {}), [rows, done, hydrated]);
  const ready = hydrated && !loading && (!userId || (remote !== null && remote.userId === userId));
  return { ready, signedIn: !!userId, lessons, remoteOk: !!remote?.ok, done: hydrated ? done : {} };
}

// ---------------------------------------------------------------- derived course state

export type NodeState = "done" | "current" | "ahead";

export type WeekState = {
  week: CourseWeek;
  lessonsDone: number;
  bossDone: boolean;
  partsPassed: number[];
  nodesDone: number;
  nodesTotal: number;
  cleared: boolean;
  started: boolean;
  status: "cleared" | "in progress" | "ahead";
};

export const trialPassed = (done: Record<string, number>, week: CourseWeek, part: number) =>
  !!week.trial && (!!done[`trial:${week.trial.week}/part-${part}`] || !!done[`trial:${week.key}/part-${part}`]);

export function weekStates(map: CourseMap, lessons: Record<string, LessonProgress>, done: Record<string, number>, currentWeek: string | null): WeekState[] {
  return map.weeks.map((w) => {
    const lessonsDone = w.lessons.filter((l) => lessons[lessonKey(l.week, l.slug)]?.status === "completed").length;
    const bossDone = !!w.boss && (!!done[`boss:${w.key}`] || lessons[lessonKey(w.boss.week, w.boss.slug)]?.status === "completed");
    const partsPassed = (w.trial?.parts || []).filter((p) => trialPassed(done, w, p.n)).map((p) => p.n);
    const nodesTotal = w.lessons.length + (w.boss ? 1 : 0) + (w.trial?.parts.length || 0);
    const nodesDone = lessonsDone + (bossDone ? 1 : 0) + partsPassed.length;
    const cleared = nodesTotal > 0 && nodesDone === nodesTotal;
    const started =
      nodesDone > 0 ||
      w.lessons.some((l) => (lessons[lessonKey(l.week, l.slug)]?.status || "not_started") !== "not_started") ||
      (!!w.boss && (lessons[lessonKey(w.boss.week, w.boss.slug)]?.status || "not_started") !== "not_started");
    void currentWeek;
    return {
      week: w,
      lessonsDone,
      bossDone,
      partsPassed,
      nodesDone,
      nodesTotal,
      cleared,
      started,
      status: cleared ? "cleared" : started ? "in progress" : "ahead",
    };
  });
}

/** Every lesson in reading order (plan excluded): weeks' lessons + boss, then side quests. */
export function orderedLessons(map: CourseMap): CourseLesson[] {
  const out: CourseLesson[] = [];
  map.weeks.forEach((w) => {
    out.push(...w.lessons);
    if (w.boss) out.push(w.boss);
  });
  out.push(...map.sideQuests);
  return out;
}

export type Resume = {
  lesson: CourseLesson;
  progress: LessonProgress | null;
  /** "resume" an in-progress lesson, "next" after the last completed one, "start" for a new learner */
  mode: "resume" | "next" | "start";
};

export function findResume(map: CourseMap, lessons: Record<string, LessonProgress>): Resume | null {
  const all = orderedLessons(map);
  if (!all.length) return null;
  let best: { l: CourseLesson; p: LessonProgress } | null = null;
  let lastDone: { i: number; at: number } | null = null;
  all.forEach((l, i) => {
    const p = lessons[lessonKey(l.week, l.slug)];
    if (!p) return;
    if (p.status === "in_progress" && (!best || p.lastAt > best.p.lastAt)) best = { l, p };
    if (p.status === "completed" && (!lastDone || p.lastAt >= lastDone.at)) lastDone = { i, at: p.lastAt };
  });
  const b = best as { l: CourseLesson; p: LessonProgress } | null;
  const d = lastDone as { i: number; at: number } | null;
  if (b && (!d || b.p.lastAt >= d.at)) return { lesson: b.l, progress: b.p, mode: "resume" };
  if (d) {
    const next = all.slice(d.i + 1).find((l) => lessons[lessonKey(l.week, l.slug)]?.status !== "completed");
    if (next) return { lesson: next, progress: lessons[lessonKey(next.week, next.slug)] || null, mode: "next" };
  }
  if (b) return { lesson: b.l, progress: b.p, mode: "resume" };
  const first = all.find((l) => lessons[lessonKey(l.week, l.slug)]?.status !== "completed") || all[0];
  return { lesson: first, progress: null, mode: "start" };
}

// ---------------------------------------------------------------- activity, streaks, XP log

const REVIEW_LOG_KEY = "hk.review.log.v1";

/** Days with review activity, written by the review session. */
export function readReviewLog(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(REVIEW_LOG_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function logReviewActivity(cards = 1) {
  if (typeof window === "undefined") return;
  try {
    const log = readReviewLog();
    const d = localDate();
    log[d] = (log[d] || 0) + cards;
    window.localStorage.setItem(REVIEW_LOG_KEY, JSON.stringify(log));
  } catch {
    // ignore
  }
}

const LEARN_PREFIX = /^(lesson|stage|trial|boss|world|sidequest):/;

/** Learning activity per local day (count of learn events), from the done record + review log. */
export function activityByDay(done: Record<string, number>, extra: Record<string, number> = {}): Record<string, number> {
  const out: Record<string, number> = { ...extra };
  Object.entries(done).forEach(([k, at]) => {
    if (!LEARN_PREFIX.test(k) || !at) return;
    const d = localDate(new Date(at));
    out[d] = (out[d] || 0) + 1;
  });
  return out;
}

/** Consecutive active days ending today (or yesterday, if today isn't counted yet). */
export function streakFrom(days: Record<string, number>): { current: number; best: number; today: boolean } {
  const has = (d: string) => (days[d] || 0) > 0;
  const today = localDate();
  const step = (d: string, n: number) => {
    const [y, m, dd] = d.split("-").map(Number);
    const dt = new Date(y, m - 1, dd);
    dt.setDate(dt.getDate() + n);
    return localDate(dt);
  };
  let cur = 0;
  let d = has(today) ? today : step(today, -1);
  while (has(d)) {
    cur++;
    d = step(d, -1);
  }
  const sorted = Object.keys(days).filter(has).sort();
  let best = 0;
  let run = 0;
  let prev = "";
  sorted.forEach((x) => {
    run = prev && step(prev, 1) === x ? run + 1 : 1;
    best = Math.max(best, run);
    prev = x;
  });
  return { current: cur, best: Math.max(best, cur), today: has(today) };
}

export type XpEntry = { key: string; xp: number; what: string; at: number; href?: string };

/** Readable XP log from the game's done timestamps. */
export function xpLog(done: Record<string, number>, map: CourseMap | null): XpEntry[] {
  const byKey = new Map<string, CourseLesson>();
  const weekBy = new Map<string, CourseWeek>();
  if (map) {
    orderedLessons(map).forEach((l) => byKey.set(lessonKey(l.week, l.slug), l));
    map.weeks.forEach((w) => {
      weekBy.set(w.key, w);
      if (w.trial) weekBy.set(w.trial.week, w);
    });
  }
  const wl = (week: string) => {
    const w = weekBy.get(week);
    return w ? `W${w.code}` : week;
  };
  const out: XpEntry[] = [];
  Object.entries(done).forEach(([key, at]) => {
    if (!at) return;
    const q = QUEST_BY_ID[key];
    if (q) {
      out.push({ key, xp: q.xp, what: q.label, at });
      return;
    }
    if (key.startsWith("lesson:")) {
      const l = byKey.get(key.slice(7));
      out.push({ key, xp: LEARN_XP.lesson, what: l ? `Cleared ${l.tag.replace(/ · /g, " · ")} · ${l.title}` : `Cleared ${key.slice(7)}`, at, href: l?.href });
    } else if (key.startsWith("stage:")) {
      const rest = key.slice(6);
      const i = rest.lastIndexOf("/");
      const l = byKey.get(rest.slice(0, i));
      const stage = rest.slice(i + 1).replace(/-/g, " ");
      out.push({ key, xp: LEARN_XP.stage, what: `Stage done · ${l ? l.title : rest.slice(0, i)} · ${stage}`, at, href: l ? `${l.href}#${rest.slice(i + 1)}` : undefined });
    } else if (key.startsWith("trial:")) {
      const [week, part] = key.slice(6).split("/");
      out.push({ key, xp: LEARN_XP.trial, what: `Trial passed · ${wl(week)} · ${part.replace("-", " ")}`, at });
    } else if (key.startsWith("boss:")) {
      const w = weekBy.get(key.slice(5));
      out.push({ key, xp: LEARN_XP.boss, what: `Boss defeated · ${w ? `W${w.code} · ${w.boss?.title || w.title}` : key.slice(5)}`, at });
    } else if (key.startsWith("world:")) {
      const w = weekBy.get(key.slice(6));
      out.push({ key, xp: LEARN_XP.world, what: `World cleared · ${w ? `W${w.code} · ${w.badge}` : key.slice(6)}`, at });
    } else if (key.startsWith("sidequest:")) {
      const l = map?.sideQuests.find((s) => s.slug === key.slice(10));
      out.push({ key, xp: LEARN_XP.sideQuest - LEARN_XP.lesson, what: `Side quest bonus · ${l ? l.title : key.slice(10)}`, at, href: l?.href });
    }
  });
  return out.sort((a, b) => b.at - a.at);
}

export function timeAgo(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d}d ago`;
  const w = Math.round(d / 7);
  if (w < 5) return `${w}w ago`;
  return new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function hoursLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = minutes / 60;
  return `~${h >= 10 ? Math.round(h) : Math.round(h * 10) / 10} h`;
}
