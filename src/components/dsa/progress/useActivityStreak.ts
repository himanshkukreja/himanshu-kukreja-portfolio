"use client";

/**
 * The learner's main DSA streak (days in a row with any dated progress key or a submit on this device): the same
 * numbers as Progress's "Activity and streak" panel (src/lib/dsa/stats.ts computeStats), so the home's Today card
 * and Progress never disagree. The daily-problem streak (useDsaStreak) is a separate, narrower count.
 */
import { useEffect, useMemo, useState } from "react";
import { useGame } from "@/game/GameProvider";
import { SOLVE_BITS } from "@/lib/dsa/rewards";
import { warmDaysOf } from "@/lib/dsa/warmup";
import { computeStats, type HistoryRow } from "@/lib/dsa/stats";

function readHistories(): Record<string, HistoryRow[]> {
  const out: Record<string, HistoryRow[]> = {};
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i) || "";
      const m = k.match(/^dsa\.history\.(.+)$/);
      if (!m) continue;
      const rows = JSON.parse(window.localStorage.getItem(k) || "[]") as HistoryRow[];
      if (Array.isArray(rows) && rows.length) out[m[1]] = rows;
    }
  } catch {
    /* storage blocked: no device history */
  }
  return out;
}

/** { current, best } of the main streak; null until the game state and this device's history are read. */
export function useActivityStreak(): { current: number; best: number } | null {
  const { done, hydrated } = useGame();
  const [histories, setHistories] = useState<Record<string, HistoryRow[]> | null>(null);
  const [clock] = useState(() => ({ now: Date.now(), tz: new Date().getTimezoneOffset() }));
  useEffect(() => {
    // device state, readable only after hydration
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistories(readHistories());
  }, []);
  return useMemo(() => {
    if (!hydrated || !histories) return null;
    const a = computeStats({ extraDays: warmDaysOf(done), done, solved: new Set(), rows: [], histories, solveBits: {}, tiers: SOLVE_BITS, awards: [], now: clock.now, tzOffsetMin: clock.tz, weeks: 1 }).activity;
    return { current: a.current, best: a.longest };
  }, [hydrated, done, histories, clock]);
}
