"use client";

/**
 * The welcome's answers (`dsa.welcome`, kept on this device), read with useSyncExternalStore. (The old "Show everything"
 * view switch was retired on 16 Nov 2026: the whole lesson on one page lives in the lesson's Aa panel.)
 */
import { useSyncExternalStore } from "react";

const WELCOME_KEY = "dsa.welcome";
const EVENT = "dsa:view";

export type Experience = "new" | "some" | "experienced";
export type Goal = "placements" | "interviews" | "cp";
export type Welcome = { exp: Experience | null; goal: Goal | null; skipped: boolean; at: number };

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, v: string) {
  try {
    window.localStorage.setItem(key, v);
  } catch {
    /* storage blocked: the choice lasts for this page */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

let welcomeRaw: string | null | undefined;
let welcomeVal: Welcome | null = null;
function readWelcome(): Welcome | null {
  const raw = read(WELCOME_KEY);
  if (raw === welcomeRaw) return welcomeVal;
  welcomeRaw = raw;
  try {
    welcomeVal = raw ? (JSON.parse(raw) as Welcome) : null;
  } catch {
    welcomeVal = null;
  }
  return welcomeVal;
}

/**
 * The welcome's answers: `undefined` until this browser is read (the server and the first paint), `null` when the
 * learner hasn't been welcomed yet, else what they picked (or that they skipped).
 */
export function useWelcome(): Welcome | null | undefined {
  return useSyncExternalStore(subscribe, readWelcome, () => undefined);
}

export function saveWelcome(w: Omit<Welcome, "at">) {
  write(WELCOME_KEY, JSON.stringify({ ...w, at: Date.now() }));
}

export function resetWelcome() {
  try {
    window.localStorage.removeItem(WELCOME_KEY);
  } catch {
    /* storage blocked */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}
