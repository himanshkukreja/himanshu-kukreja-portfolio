"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGame } from "@/game/GameProvider";
import { lessonKey, loadRemoteWeekStatus, readGuestProgress, type GuestLessonRecord } from "./progress";

export type NodeStatus = "done" | "started" | "none";

/**
 * Completion ticks for the week rail: the visitor's own guest records, the game engine's
 * lesson / boss / trial keys, and (signed in) their learning_progress rows. Nothing is invented:
 * before hydration everything reads as "none".
 */
export function useRailStatus(course: string, weeks: string[]) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { done, hydrated } = useGame();
  const [guest, setGuest] = useState<Record<string, GuestLessonRecord>>({});
  const [remote, setRemote] = useState<Record<string, NodeStatus>>({});
  const weeksKey = weeks.join("|");

  useEffect(() => {
    const read = () => setGuest(readGuestProgress());
    read();
    window.addEventListener("hk:lesson-progress", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("hk:lesson-progress", read);
      window.removeEventListener("storage", read);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    loadRemoteWeekStatus(userId, course, weeksKey.split("|").filter(Boolean)).then((rows) => {
      if (cancelled) return;
      const map: Record<string, NodeStatus> = {};
      for (const r of rows) {
        map[`${r.week}/${r.lesson_slug}`] = r.status === "completed" ? "done" : (r.progress_percentage ?? 0) > 0 || r.status === "in_progress" ? "started" : "none";
      }
      setRemote(map);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, course, weeksKey]);

  const status = useCallback(
    (week: string, slug: string): NodeStatus => {
      if (hydrated && (done[`lesson:${week}/${slug}`] || (slug.includes("capstone") && done[`boss:${week}`]))) return "done";
      const g = guest[lessonKey(course, week, slug)];
      const r = userId ? remote[`${week}/${slug}`] : undefined;
      if (g?.completed || r === "done") return "done";
      if ((g && (g.stages.length > 0 || g.last)) || r === "started") return "started";
      return "none";
    },
    [hydrated, done, guest, remote, userId, course]
  );

  const trialPassed = useCallback(
    (week: string): number => {
      if (!hydrated) return 0;
      const prefix = `trial:${week}/part-`;
      return Object.keys(done).filter((k) => k.startsWith(prefix)).length;
    },
    [hydrated, done]
  );

  return useMemo(() => ({ status, trialPassed, hydrated }), [status, trialPassed, hydrated]);
}
