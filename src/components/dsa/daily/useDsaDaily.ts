"use client";

/**
 * The DSA daily problem in the browser: today's pick (GET /api/dsa/daily, one request per IST day and page view, shared
 * by every component that asks), the DSA daily streak (game keys `dsa:daily:<day>`, synced to the account for signed-in
 * learners) and the hook the problem room calls after an Accepted submit.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useGame } from "@/game/GameProvider";
import { useToday } from "@/components/learn/arena/store";
import { istDate } from "@/lib/learn/arena/shared";
import { track } from "@/lib/track";
import { dailyDaysOf, dailyStreakOf, dsaDailyKey, type DsaDailyResponse } from "@/lib/dsa/daily";
import { useDsaAward } from "@/components/dsa/rewards/useDsaBits";

let cache: { day: string; p: Promise<DsaDailyResponse | null> } | null = null;

export function fetchDsaDaily(): Promise<DsaDailyResponse | null> {
  const day = istDate();
  if (cache && cache.day === day) return cache.p;
  const p = fetch("/api/dsa/daily")
    .then((r) => (r.ok ? (r.json() as Promise<DsaDailyResponse>) : null))
    .catch(() => null);
  cache = { day, p };
  // a failed fetch isn't kept: the next caller tries again
  void p.then((v) => {
    if (!v && cache?.p === p) cache = null;
  });
  return p;
}

export function useDsaDaily(): { data: DsaDailyResponse | null; loading: boolean; error: boolean } {
  const [state, setState] = useState<{ data: DsaDailyResponse | null; done: boolean }>({ data: null, done: false });
  useEffect(() => {
    let off = false;
    void fetchDsaDaily().then((data) => {
      if (!off) setState({ data, done: true });
    });
    return () => {
      off = true;
    };
  }, []);
  return { data: state.data, loading: !state.done, error: state.done && !state.data };
}

/** The DSA daily streak (null until the game state and the date are known in this browser). */
export function useDsaStreak(): { current: number; best: number; today: boolean; days: Set<string> } | null {
  const { done, hydrated } = useGame();
  const today = useToday();
  return useMemo(() => {
    if (!hydrated || !today) return null;
    const days = dailyDaysOf(done);
    return { ...dailyStreakOf(days, today), days };
  }, [done, hydrated, today]);
}

/**
 * After an Accepted submit: if this problem is today's daily problem, award the day's key (DSA_DAILY_BITS once a day,
 * DSA Mastery Bits, never SD Mastery XP) and return the daily's number; null otherwise. Never throws.
 */
export function useDailySolve() {
  const { award } = useDsaAward();
  return useCallback(
    async (problemId: string): Promise<number | null> => {
      const d = await fetchDsaDaily();
      const daily = d?.daily;
      if (!daily || daily.problem.id !== problemId || daily.date !== istDate()) return null;
      const bits = award([dsaDailyKey(daily.date)], `Daily problem #${daily.number} · solved`);
      if (bits > 0) track("dsa_daily_solve", { problem: problemId, number: daily.number });
      return daily.number;
    },
    [award],
  );
}

/** True when `problemId` is today's daily problem (false until known). */
export function useIsDaily(problemId: string): { daily: boolean; number: number | null } {
  const { data } = useDsaDaily();
  const d = data?.daily;
  return { daily: !!d && d.problem.id === problemId, number: d && d.problem.id === problemId ? d.number : null };
}
