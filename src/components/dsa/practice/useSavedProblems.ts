"use client";

/**
 * "Save for later" on a problem, read by Practice > Saved. Stored as game flags `dsa:saved:<id>` (a time, or 0 once
 * removed): this browser for guests, the profile's game_flags for signed-in learners, so a saved problem follows the
 * account like the reading preferences do (no table, no schema change; src/game/useGameSync.ts).
 *
 * The problem page's first version wrote a device-only list (localStorage `dsa.saved`). It is read here too, and moved
 * into the flags the first time this hook runs, so nothing saved before is lost.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useGame } from "@/game/GameProvider";
import { track } from "@/lib/track";
import { SAVED_FLAG, SAVED_LEGACY_KEY, savedFrom } from "@/lib/dsa/lists";

function readLegacy(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(SAVED_LEGACY_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function useSavedProblems(): { ready: boolean; saved: Set<string>; isSaved: (id: string) => boolean; toggle: (id: string) => void } {
  const { flags, setFlag, hydrated } = useGame();
  const [legacy, setLegacy] = useState<string[]>([]);
  const [read, setRead] = useState(false);

  useEffect(() => {
    // device state, readable only after hydration
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLegacy(readLegacy());
    setRead(true);
  }, []);

  // the device-only list moves into the flags (once; an explicit un-save already in the flags is kept)
  useEffect(() => {
    if (!hydrated || !read || !legacy.length) return;
    for (const id of legacy) if (flags[SAVED_FLAG + id] === undefined) setFlag(SAVED_FLAG + id, Date.now());
    try {
      window.localStorage.removeItem(SAVED_LEGACY_KEY);
    } catch {
      /* storage blocked */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLegacy([]);
  }, [hydrated, read, legacy, flags, setFlag]);

  const saved = useMemo(() => new Set(hydrated && read ? savedFrom(flags, legacy) : []), [flags, legacy, hydrated, read]);
  const toggle = useCallback(
    (id: string) => {
      const on = !saved.has(id);
      setFlag(SAVED_FLAG + id, on ? Date.now() : 0);
      track("dsa_save_for_later", { problem: id, saved: on, from: "practice" });
    },
    [saved, setFlag],
  );
  return { ready: hydrated && read, saved, isSaved: (id: string) => saved.has(id), toggle };
}
