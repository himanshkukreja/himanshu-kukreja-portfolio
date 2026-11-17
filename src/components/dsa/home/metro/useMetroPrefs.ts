"use client";

/**
 * What the metro home remembers. The Map | List choice and "the tour was shown" are per device (localStorage, every access
 * in try/catch: a private window or blocked storage just means the defaults every visit). The goal is the learner's: the
 * game's `pref:` flag (this device for guests, synced to the account when signed in), the same store as the onboarding.
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useGame } from "@/game/GameProvider";
import type { GoalKind, GoalPref } from "@/lib/dsa/metro/model";

export type HomeView = "map" | "list";
const VIEW_KEY = "dsa:home-view:v1";
const TOUR_KEY = "dsa:metro-tour:v1";
const EVENT = "dsa:metro-prefs";
export const GOAL_FLAG = "pref:dsa-goal";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the choice lasts until the page closes */
  }
}
const mem: Record<string, string> = {};
const get = (key: string) => read(key) ?? mem[key] ?? null;
const put = (key: string, value: string) => {
  mem[key] = value;
  write(key, value);
  window.dispatchEvent(new Event(EVENT));
};
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

export function useHomeView(): [HomeView, (v: HomeView) => void] {
  const v = useSyncExternalStore(subscribe, () => (get(VIEW_KEY) === "list" ? "list" : "map"), () => "map" as HomeView);
  return [v, useCallback((n: HomeView) => put(VIEW_KEY, n), [])];
}

/** null until the client has read storage (nothing is shown before that), then whether the tour was already shown. */
export function useTourSeen(): [boolean | null, (seen: boolean) => void] {
  const v = useSyncExternalStore(
    subscribe,
    () => (get(TOUR_KEY) === "1" ? "1" : "0"),
    () => "",
  );
  return [v === "" ? null : v === "1", useCallback((s: boolean) => put(TOUR_KEY, s ? "1" : "0"), [])];
}

export function useGoal(): [GoalPref | null, (g: GoalPref) => void] {
  const { flags, setFlag } = useGame();
  const raw = flags[GOAL_FLAG] as { kind?: unknown; station?: unknown } | undefined;
  const goal = useMemo<GoalPref | null>(() => {
    const kind = raw?.kind;
    if (kind !== "scratch" && kind !== "topic" && kind !== "interview") return null;
    return { kind: kind as GoalKind, station: typeof raw?.station === "string" ? raw.station : undefined };
  }, [raw?.kind, raw?.station]);
  return [goal, useCallback((g: GoalPref) => setFlag(GOAL_FLAG, { ...g, updatedAt: Date.now() }), [setFlag])];
}

/** A media query, false on the server. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
