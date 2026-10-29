"use client";

/**
 * Follow-up drill practice in this browser only (localStorage; every access guarded):
 *   hk.drills.v1.<quest>   { a: { [itemId]: the learner's typed answer }, p: { [itemId]: practised at (ms) } }
 * Nothing is sent anywhere. Blocked storage just means it lasts for this visit.
 */
import { useSyncExternalStore } from "react";

export type DrillPractice = { a: Record<string, string>; p: Record<string, number> };

const key = (quest: string) => `hk.drills.v1.${quest}`;
const EVENT = "hk:drills-changed";
const EMPTY: DrillPractice = { a: {}, p: {} };

function read(quest: string): DrillPractice {
  try {
    const raw = window.localStorage.getItem(key(quest));
    const v = raw ? (JSON.parse(raw) as Partial<DrillPractice>) : null;
    if (!v || typeof v !== "object") return { a: {}, p: {} };
    return { a: v.a && typeof v.a === "object" ? v.a : {}, p: v.p && typeof v.p === "object" ? v.p : {} };
  } catch {
    return { a: {}, p: {} };
  }
}

// one snapshot per quest (useSyncExternalStore needs a stable object until something changes)
const cache = new Map<string, DrillPractice>();

function subscribe(cb: () => void) {
  // another tab wrote: re-read; this tab wrote: the cache already holds the new value
  const fromOtherTab = () => {
    cache.clear();
    cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", fromOtherTab);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", fromOtherTab);
  };
}

export function useDrillPractice(quest: string): DrillPractice {
  return useSyncExternalStore(
    subscribe,
    () => {
      let v = cache.get(quest);
      if (!v) cache.set(quest, (v = read(quest)));
      return v;
    },
    () => EMPTY
  );
}

export function updateDrillPractice(quest: string, fn: (p: DrillPractice) => DrillPractice) {
  const next = fn(cache.get(quest) ?? read(quest));
  try {
    window.localStorage.setItem(key(quest), JSON.stringify(next));
  } catch {
    // storage full or blocked: kept in memory for this visit
  }
  cache.set(quest, next);
  window.dispatchEvent(new Event(EVENT));
}
