"use client";

/**
 * The lesson page's two remembered choices (kept on this device, like the rest of DSA's view settings):
 * - Learn mode: Watch, Read or Listen (`dsa.learnMode`); Read on the first visit, then the last one used.
 * - Whole lesson: Read shows the whole lesson on one page instead of one beat at a time (`dsa.lesson.whole`). It lives
 *   in the Aa reading panel. It replaces the old "Show everything" switch; a learner who had that on starts with it on.
 * Read with useSyncExternalStore: the server and the first paint use the defaults, so there is never a hydration error.
 */
import { useSyncExternalStore } from "react";

export type LearnMode = "watch" | "read" | "listen";
const MODE_KEY = "dsa.learnMode";
const WHOLE_KEY = "dsa.lesson.whole";
const OLD_VIEW_KEY = "dsa.view";
const EVENT = "dsa:lesson-prefs";

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

const readMode = (): LearnMode => {
  const v = read(MODE_KEY);
  return v === "watch" || v === "listen" || v === "read" ? v : "read";
};
export const useLearnMode = (): [LearnMode, (m: LearnMode) => void] => [useSyncExternalStore(subscribe, readMode, () => "read" as LearnMode), (m) => write(MODE_KEY, m)];

const readWhole = (): boolean => {
  const v = read(WHOLE_KEY);
  if (v === "1") return true;
  if (v === "0") return false;
  return read(OLD_VIEW_KEY) === "full";
};
export const useWholeLesson = (): [boolean, (on: boolean) => void] => [useSyncExternalStore(subscribe, readWhole, () => false), (on) => write(WHOLE_KEY, on ? "1" : "0")];
