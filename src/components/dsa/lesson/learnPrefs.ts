"use client";

/**
 * The lesson page's two remembered choices (kept on this device, like the rest of DSA's view settings):
 * - Learn mode: Watch, Read or Listen (`dsa.learnMode`); Read on the first visit, then the last one used.
 * - Whole lesson: Read shows the whole lesson on one page (`dsa.lesson.whole`), the default since 17 Nov 2026 (the owner:
 *   one beat per page made the lessons look thin). Off pages through one beat at a time. It lives in the Aa reading
 *   panel and in the "Read it all on one page" button of the paged view.
 * Read with useSyncExternalStore: the server and the first paint use the defaults, so there is never a hydration error.
 */
import { useSyncExternalStore } from "react";

export type LearnMode = "watch" | "read" | "listen";
const MODE_KEY = "dsa.learnMode";
const WHOLE_KEY = "dsa.lesson.whole";
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
  // on unless the learner turned it off (the old "Show everything" switch, dsa.view, no longer matters: on is the default)
  return read(WHOLE_KEY) !== "0";
};
export const useWholeLesson = (): [boolean, (on: boolean) => void] => [useSyncExternalStore(subscribe, readWhole, () => true), (on) => write(WHOLE_KEY, on ? "1" : "0")];
