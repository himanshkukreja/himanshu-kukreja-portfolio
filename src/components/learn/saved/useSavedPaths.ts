"use client";

/**
 * Saved learning paths for the search page, the You → Saved paths view and the course chat: save, list,
 * tick a step, remove. Kept in the game flags (see src/lib/learn/saved-paths.ts): this browser for
 * everyone, the profile's game_flags for signed-in learners, so a path follows the account to any tab or
 * device with no table of its own.
 *
 * A step that is a whole lesson or side quest also counts as done when the lesson is completed in normal
 * progress (the game's `lesson:<week>/<slug>` key, set by the lesson's own completion). Ticking it here
 * doesn't complete the lesson: completion is earned by reading (and gives XP), so a tick is only this path's.
 */
import { useCallback, useMemo } from "react";
import { useGame } from "@/game/GameProvider";
import { track } from "@/lib/track";
import {
  buildSavedPath,
  cleanSavedPath,
  lessonKeyOfStep,
  listSavedPaths,
  removedSavedPath,
  savedPathId,
  savedPathKey,
  SAVED_PATHS_MAX,
  withStepDues,
  type SaveInput,
  type SavedPath,
  type SavedStep,
} from "@/lib/learn/saved-paths";

export type SaveResult = { ok: true; id: string; updated: boolean } | { ok: false; reason: "full" | "empty" | "loading" };

export function useSavedPaths() {
  const { flags, setFlag, hydrated, done } = useGame();
  const paths = useMemo(() => (hydrated ? listSavedPaths(flags) : []), [flags, hydrated]);

  const get = useCallback((id: string): SavedPath | null => cleanSavedPath(flags[savedPathKey(id)]), [flags]);

  /** The saved copy of this search (path or results), if there is one. */
  const savedFor = useCallback(
    (source: SavedPath["source"], q: string): SavedPath | null => {
      if (!hydrated || !q.trim()) return null;
      const p = get(savedPathId(source, q));
      return p && !p.deleted ? p : null;
    },
    [get, hydrated],
  );

  /** Save a learning path or a set of results (the same search again updates it and keeps its ticks). */
  const save = useCallback(
    (input: SaveInput): SaveResult => {
      if (!hydrated) return { ok: false, reason: "loading" };
      const id = savedPathId(input.source, input.q);
      const prev = get(id);
      const live = prev && !prev.deleted ? prev : null;
      if (!live && paths.length >= SAVED_PATHS_MAX) return { ok: false, reason: "full" };
      const rec = buildSavedPath(input, Date.now(), live);
      if (!rec) return { ok: false, reason: "empty" };
      setFlag(savedPathKey(id), rec);
      track("saved_path", { action: live ? "update" : "save", source: input.source, steps: rec.steps.length });
      return { ok: true, id, updated: !!live };
    },
    [get, hydrated, paths.length, setFlag],
  );

  const remove = useCallback(
    (id: string) => {
      const p = get(id);
      if (!p || p.deleted) return;
      setFlag(savedPathKey(id), removedSavedPath(p, Date.now()));
      track("saved_path", { action: "remove", source: p.source });
    },
    [get, setFlag],
  );

  /** Put back a path just removed (the undo of `remove`). */
  const restore = useCallback(
    (p: SavedPath) => {
      if (p.deleted || !p.steps.length) return;
      setFlag(savedPathKey(p.id), { ...p, updatedAt: Date.now() });
    },
    [setFlag],
  );

  /** Tick (or untick) a step of a saved path. */
  const tick = useCallback(
    (id: string, stepId: string, on?: boolean) => {
      const p = get(id);
      if (!p || p.deleted || !p.steps.some((s) => s.id === stepId)) return;
      const ticks = { ...p.ticks };
      const next = on ?? !ticks[stepId];
      if (next) ticks[stepId] = Date.now();
      else delete ticks[stepId];
      setFlag(savedPathKey(id), { ...p, ticks, updatedAt: Date.now() });
      track("saved_path", { action: next ? "tick" : "untick", source: p.source });
    },
    [get, setFlag],
  );

  /**
   * Schedule steps of a saved path: step id → yyyy-mm-dd (null clears a date). From a study plan:
   * setDues(id, planDueDates(plan)) (lib/learn/study-plan.ts).
   */
  const setDues = useCallback(
    (id: string, dues: Record<string, string | null>) => {
      const p = get(id);
      if (!p || p.deleted) return;
      const next = withStepDues(p, dues, Date.now());
      if (next === p) return;
      setFlag(savedPathKey(id), next);
      track("saved_path", { action: "schedule", source: p.source, dated: next.steps.filter((s) => s.due).length });
    },
    [get, setFlag],
  );

  /** Done: ticked here, or (a whole lesson or side quest) completed in normal lesson progress. */
  const stepState = useCallback(
    (p: SavedPath, step: SavedStep): { done: boolean; ticked: boolean; lessonDone: boolean } => {
      const lk = lessonKeyOfStep(step);
      const lessonDone = !!(lk && done[`lesson:${lk}`]);
      const ticked = !!p.ticks[step.id];
      return { done: ticked || lessonDone, ticked, lessonDone };
    },
    [done],
  );

  return { hydrated, paths, max: SAVED_PATHS_MAX, get, savedFor, save, remove, restore, tick, setDues, stepState };
}
