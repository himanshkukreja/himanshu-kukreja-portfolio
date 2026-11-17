"use client";

/**
 * Completed exercise ids, saved like quiz answers: per lesson in localStorage (`dsa.ex.<lesson>`) and as a `dsa:ex:<lesson>:<id>`
 * done key in the game store, which follows the signed-in account (src/game/GameProvider.tsx). The key is a Bits award in
 * itself (BITS_TABLE.exercise, once per exercise: awardsOf counts the key once however often it is solved or synced), and a
 * lesson with exercises counts as learnt only when they are solved (src/lib/dsa/exercise-gate.ts).
 */
import { useCallback, useState } from "react";
import { useGame } from "@/game/GameProvider";
import { useDsaAward } from "@/components/dsa/rewards/useDsaBits";
import { exerciseKey } from "@/lib/dsa/exercise-gate";

const storeKey = (lesson: string) => `dsa.ex.${lesson}`;

export function readLocalExercises(lesson: string): Record<string, number> {
  try {
    const v = JSON.parse(window.localStorage.getItem(storeKey(lesson)) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function useExerciseProgress(lesson: string, id: string, title?: string): { completed: boolean; complete: () => void } {
  const { done } = useGame();
  const { award } = useDsaAward();
  const key = exerciseKey(lesson, id);
  const [local, setLocal] = useState(() => !!readLocalExercises(lesson)[id]);
  const complete = useCallback(() => {
    setLocal(true);
    try {
      window.localStorage.setItem(storeKey(lesson), JSON.stringify({ ...readLocalExercises(lesson), [id]: Date.now() }));
    } catch {
      /* storage blocked: lasts for this visit */
    }
    award([key], title ? `Exercise solved · ${title}` : "Exercise solved");
  }, [lesson, id, key, award, title]);
  return { completed: local || !!done[key], complete };
}
