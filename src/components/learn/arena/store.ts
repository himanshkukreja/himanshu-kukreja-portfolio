"use client";

/**
 * Arena state that lives in this browser: daily runs (one scored run per IST day), best scores of
 * the arena games, and the local score guests see in place of a rank. Read through
 * useSyncExternalStore so server and first client render agree (null until mounted).
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { userFetch } from "@/components/learn/progress/userFetch";
import { addDays, istDate, type BoardResponse } from "@/lib/learn/arena/shared";

export type DailyRun = { date: string; number: number; score: number; correct: number; total: number; ms: number; picks: number[]; results: boolean[]; at: number };
export type ArenaLocal = {
  daily: Record<string, DailyRun>;
  best: Record<string, number>;
  /** local points: what a guest would have scored (daily + games), for the "sign in to rank" card */
  local: number;
};

const KEY = "sd:arena:v1";
const EVT = "sd:arena-changed";
const EMPTY: ArenaLocal = { daily: {}, best: {}, local: 0 };

let cache: { raw: string | null; v: ArenaLocal } | null = null;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function readArena(): ArenaLocal {
  const raw = readRaw();
  if (cache && cache.raw === raw) return cache.v;
  let v = EMPTY;
  try {
    const p = raw ? JSON.parse(raw) : null;
    if (p && typeof p === "object") v = { daily: p.daily || {}, best: p.best || {}, local: Number(p.local) || 0 };
  } catch {
    v = EMPTY;
  }
  cache = { raw, v };
  return v;
}

export function writeArena(next: ArenaLocal) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* blocked storage: this visit only */
    cache = { raw: JSON.stringify(next), v: next };
  }
  window.dispatchEvent(new Event(EVT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** null on the server and during hydration. */
export function useArenaLocal(): ArenaLocal | null {
  return useSyncExternalStore(subscribe, readArena, () => null);
}

export function useToday(): string | null {
  return useSyncExternalStore(
    () => () => {},
    () => istDate(),
    () => null,
  );
}

export function dailyStreakLocal(daily: Record<string, DailyRun>, today: string): { current: number; best: number; today: boolean } {
  const days = new Set(Object.keys(daily));
  let d = days.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (days.has(d)) {
    current++;
    d = addDays(d, -1);
  }
  let best = 0;
  let run = 0;
  let prev = "";
  [...days].sort().forEach((x) => {
    run = prev && addDays(prev, 1) === x ? run + 1 : 1;
    best = Math.max(best, run);
    prev = x;
  });
  return { current, best: Math.max(best, current), today: days.has(today) };
}

export function recordBest(game: string, score: number): boolean {
  const cur = readArena();
  const prev = cur.best[game];
  const better = prev === undefined || score > prev;
  writeArena({ ...cur, best: better ? { ...cur.best, [game]: score } : cur.best, local: cur.local + Math.max(0, Math.round(score / 50)) });
  return better;
}

/** Leaderboard fetch; signed in → with the token (adds `me`). */
export function useBoard(period: "week" | "all") {
  const { user, loading } = useAuth();
  const [state, setState] = useState<{ key: string; data: BoardResponse | null; error: boolean } | null>(null);
  const key = `${period}|${user?.id || "guest"}`;
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (loading) return;
    let off = false;
    const url = `/api/learn/leaderboard?period=${period}`;
    (user ? userFetch(url) : fetch(url))
      .then((r) => (r.ok ? (r.json() as Promise<BoardResponse>) : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        if (!off) setState({ key, data, error: false });
      })
      .catch(() => {
        if (!off) setState({ key, data: null, error: true });
      });
    return () => {
      off = true;
    };
  }, [key, period, user, loading, nonce]);

  const cur = state && state.key === key ? state : null;
  return { data: cur?.data || null, error: !!cur?.error, loading: !cur, signedIn: !!user, reload };
}
