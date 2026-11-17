"use client";

/**
 * What the lesson's progress engine needs to know about exercises: how many are not solved yet and where the first one is.
 * Reads the game store (so a solve on any device counts) and this device's ids, and re-reads when an exercise is solved.
 * A lesson with no exercises (or none left) never blocks; a lesson already learnt is not blocked either (see the tracker).
 */
import { useEffect, useMemo, useState } from "react";
import { useGame } from "@/game/GameProvider";
import { exerciseIdsOf, exercisesLeft } from "@/lib/dsa/exercise-gate";
import { readLocalExercises } from "./useExerciseProgress";

export type ExerciseGate = { total: number; left: number; first: string | null; ready: boolean };

export function useExerciseGate(lesson: string, html: string): ExerciseGate {
  const { done, hydrated } = useGame();
  const ids = useMemo(() => exerciseIdsOf(html), [html]);
  // this device's ids: read after mount (the server has no storage), refreshed when the game store changes
  const [local, setLocal] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocal(readLocalExercises(lesson));
  }, [lesson, done]);
  return useMemo(() => {
    if (!ids.length) return { total: 0, left: 0, first: null, ready: true };
    // until the store has loaded, do not claim anything is left (the footer would flash "2 exercises left")
    if (!hydrated || local === null) return { total: ids.length, left: 0, first: null, ready: false };
    const left = exercisesLeft(lesson, ids, done, local);
    return { total: ids.length, left: left.length, first: left[0] ?? null, ready: true };
  }, [ids, lesson, done, hydrated, local]);
}
