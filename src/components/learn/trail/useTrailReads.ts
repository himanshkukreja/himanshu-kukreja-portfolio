"use client";

/**
 * Per-learner "read" marks for reading-trail entries, kept in the game flags (hk.game.v1 in this
 * browser, and the profile's game_flags for signed-in learners): one flag per lesson,
 * trail:<week>/<slug> → { [entryId]: epochMs }, so marks on different devices merge per lesson.
 */
import { useCallback } from "react";
import { useGame } from "@/game/GameProvider";
import { track } from "@/lib/track";
import { readMarks, trailFlagKey } from "@/lib/learn/trail/types";

export function useTrailReads() {
  const { flags, setFlag, hydrated } = useGame();
  const isRead = useCallback((lesson: string, id: string) => hydrated && !!readMarks(flags[trailFlagKey(lesson)])[id], [flags, hydrated]);
  const toggle = useCallback(
    (lesson: string, id: string) => {
      const key = trailFlagKey(lesson);
      const marks = { ...readMarks(flags[key]) };
      const next = !marks[id];
      if (next) marks[id] = Date.now();
      else delete marks[id];
      setFlag(key, marks);
      track("trail_read", { lesson, id, read: next });
    },
    [flags, setFlag]
  );
  const countRead = useCallback((lesson: string) => (hydrated ? Object.keys(readMarks(flags[trailFlagKey(lesson)])).length : 0), [flags, hydrated]);
  return { isRead, toggle, countRead, hydrated };
}
