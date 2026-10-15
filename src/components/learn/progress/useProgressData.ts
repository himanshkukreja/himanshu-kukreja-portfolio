"use client";

/**
 * Data for /learn/dashboard. Guests: this browser only (game done keys, hk.lesson.v1, trial
 * stores, review log, goal). Signed in: one /api/learn/progress call (rows, streak days, profile
 * counters, notebook counts, trial scores, goal) merged with this browser's copy.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGame } from "@/game/GameProvider";
import type { CourseMap } from "@/lib/learn/types";
import { mergeProgress, readReviewLog, withGuestLessons } from "@/lib/learn/progress";
import { DEFAULT_GOAL, GOAL_STORAGE_KEY, cleanGoal, parseLearningGoal, type LearningGoal } from "./goal";
import { guestLessonsForImport, readGuestLessons, readTrialStores, type GuestLesson, type TrialPartRecord } from "./localData";
import type { ProgressSummary } from "./types";
import { userJson } from "./userFetch";

type Local = {
  guest: Record<string, GuestLesson>;
  trials: Record<string, Record<string, TrialPartRecord>>;
  reviewLog: Record<string, number>;
  goal: LearningGoal | null;
  importable: ReturnType<typeof guestLessonsForImport>;
};

function readLocal(courseId: string): Local {
  let goal: LearningGoal | null = null;
  try {
    const raw = window.localStorage.getItem(GOAL_STORAGE_KEY);
    goal = raw ? cleanGoal(JSON.parse(raw)) : null;
  } catch {
    goal = null;
  }
  return { guest: readGuestLessons(), trials: readTrialStores(courseId), reviewLog: readReviewLog(), goal, importable: guestLessonsForImport(courseId) };
}

export function useProgressData(map: CourseMap) {
  const { user, profile, loading } = useAuth();
  const { xp, done: gameDone, hydrated } = useGame();
  const userId = user?.id ?? null;
  const [local, setLocal] = useState<Local | null>(null);
  const [summary, setSummary] = useState<{ userId: string; data: ProgressSummary | null; error: string | null } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // localStorage is only readable after mount; a 0ms timer keeps the first render server-identical.
    const t = window.setTimeout(() => setLocal(readLocal(map.courseId)), 0);
    const onStore = () => setLocal(readLocal(map.courseId));
    window.addEventListener("storage", onStore);
    window.addEventListener("hk:lesson-progress", onStore);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("storage", onStore);
      window.removeEventListener("hk:lesson-progress", onStore);
    };
  }, [map.courseId, tick]);

  useEffect(() => {
    if (!userId) return;
    let off = false;
    userJson<ProgressSummary>(`/api/learn/progress?course=${encodeURIComponent(map.courseId)}`)
      .then((data) => !off && setSummary({ userId, data, error: null }))
      .catch((e: Error) => !off && setSummary({ userId, data: null, error: e.message || "Could not load your account progress" }));
    return () => {
      off = true;
    };
  }, [userId, map.courseId, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const done = useMemo(() => (hydrated ? gameDone : {}), [hydrated, gameDone]);
  const mine = summary && summary.userId === userId ? summary : null;
  const rows = useMemo(() => (mine?.data?.rows || []) as Parameters<typeof mergeProgress>[0], [mine]);
  const lessons = useMemo(() => withGuestLessons(mergeProgress(rows, done), local?.guest || {}, map.courseId), [rows, done, local, map.courseId]);

  const goal = useMemo<{ goal: LearningGoal | null; source: "account" | "browser" | "none" }>(() => {
    if (userId && mine?.data) {
      const g = parseLearningGoal(mine.data.profile?.learningGoal).goal;
      if (g) return { goal: g, source: "account" };
    }
    if (local?.goal) return { goal: local.goal, source: "browser" };
    return { goal: null, source: "none" };
  }, [userId, mine, local]);

  const ready = hydrated && !loading && local !== null && (!userId || mine !== null);

  return {
    ready,
    signedIn: !!userId,
    user,
    profile,
    xp: hydrated ? xp : 0,
    done,
    lessons,
    rows,
    local,
    summary: mine?.data ?? null,
    summaryError: mine?.error ?? null,
    goal: goal.goal,
    goalSource: goal.source,
    defaultGoal: DEFAULT_GOAL,
    refresh,
  };
}

export type ProgressData = ReturnType<typeof useProgressData>;
