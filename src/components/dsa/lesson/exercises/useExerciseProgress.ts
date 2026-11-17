"use client";

/**
 * Completed exercise ids, saved like quiz answers: per lesson in localStorage (`dsa.ex.<lesson>`) and as a `dsa:ex:<lesson>:<id>`
 * done key in the game store, which follows the signed-in account (src/game/GameProvider.tsx). The key is not a Bits award
 * (awardsOf ignores unknown `dsa:` keys), so exercises never change a learner's Bits or belt.
 */
import { useCallback, useState } from "react";
import { useGame } from "@/game/GameProvider";

const storeKey = (lesson: string) => `dsa.ex.${lesson}`;

function read(lesson: string): Record<string, number> {
  try {
    const v = JSON.parse(window.localStorage.getItem(storeKey(lesson)) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function useExerciseProgress(lesson: string, id: string): { completed: boolean; complete: () => void } {
  const { done, markDone } = useGame();
  const key = `dsa:ex:${lesson}:${id}`;
  const [local, setLocal] = useState(() => !!read(lesson)[id]);
  const complete = useCallback(() => {
    setLocal(true);
    try {
      window.localStorage.setItem(storeKey(lesson), JSON.stringify({ ...read(lesson), [id]: Date.now() }));
    } catch {
      /* storage blocked: lasts for this visit */
    }
    markDone([key]);
  }, [lesson, id, key, markDone]);
  return { completed: local || !!done[key], complete };
}
