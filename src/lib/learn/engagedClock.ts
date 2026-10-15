"use client";

/**
 * Engaged reading time. Counts a second only while the tab is visible AND the reader did something
 * (scroll, pointer, key, touch) in the last IDLE_MS — or the browser is reading the page aloud.
 * Replaces "now − page opened", which credited hidden tabs, idle laptops and sleeping machines
 * (rows of 45 "days" on one lesson).
 */
const IDLE_MS = 90_000;
const ACTIVITY = ["scroll", "wheel", "pointerdown", "pointermove", "keydown", "touchstart", "selectionchange"] as const;

export type EngagedClock = {
  /** engaged seconds since the clock started */
  seconds: () => number;
  stop: () => void;
};

export function startEngagedClock(): EngagedClock {
  if (typeof window === "undefined") return { seconds: () => 0, stop: () => {} };
  let total = 0;
  let lastActive = Date.now();
  let lastTick = Date.now();
  const onActivity = () => {
    lastActive = Date.now();
  };
  const speaking = () => {
    try {
      return !!window.speechSynthesis?.speaking && !window.speechSynthesis.paused;
    } catch {
      return false;
    }
  };
  const tick = () => {
    const now = Date.now();
    // a long gap between ticks means timers were frozen (sleep, background throttling): never credit it
    const step = Math.min(now - lastTick, 2000);
    lastTick = now;
    if (document.visibilityState !== "visible") return;
    if (now - lastActive > IDLE_MS && !speaking()) return;
    total += step;
  };
  const timer = window.setInterval(tick, 1000);
  const onVisible = () => {
    lastTick = Date.now();
    if (document.visibilityState === "visible") lastActive = Date.now();
  };
  ACTIVITY.forEach((e) => (e === "selectionchange" ? document : window).addEventListener(e, onActivity, { passive: true }));
  document.addEventListener("visibilitychange", onVisible);
  return {
    seconds: () => Math.floor(total / 1000),
    stop: () => {
      window.clearInterval(timer);
      ACTIVITY.forEach((e) => (e === "selectionchange" ? document : window).removeEventListener(e, onActivity));
      document.removeEventListener("visibilitychange", onVisible);
    },
  };
}

/** Upper bound for the time one lesson can hold: 2× its reading time, 10 min – 3 h (matches the admin cap). */
export function lessonTimeCap(readingMinutes: number | undefined): number {
  const minutes = readingMinutes && readingMinutes > 0 ? readingMinutes : 30;
  return Math.min(3 * 3600, Math.max(600, minutes * 2 * 60));
}
