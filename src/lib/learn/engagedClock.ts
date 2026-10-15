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

// ---------------------------------------------------------------------------------------------
// Reading rules: when does a lesson stage / case-file section count as read?
//
// A stage is read only after real engaged reading time IN that stage (≥ 35% of its estimated
// minutes, 20 s – 6 min) AND after most of it (80%) has been on screen during those reading
// seconds. A reading second needs: tab visible, input in the last 60 s (or read-aloud playing),
// the scroll position settled (moving < 1 viewport height per second, and not in the second right
// after a jump), and the reading line inside the stage. Jumps (anchors, TOC, "discussion", End,
// PageDown) and fast flicks never credit anything; neither does time spent below the article.

export const READING = {
  /** engaged time needed in a stage, as a share of its estimated reading time */
  share: 0.35,
  minSec: 20,
  maxSec: 360,
  /** share of the stage that must have been on screen while reading */
  coverage: 0.8,
  /** coverage resolution: each stage is split into this many slices (bitmask) */
  bins: 20,
  /** explicit "mark complete" unlocks at this share of the summed stage requirement */
  completeShare: 0.7,
  /** no input for this long = not reading (read-aloud excepted) */
  idleMs: 60_000,
  /** scrolling faster than this many viewport heights per second is skimming */
  flick: 1,
} as const;

/** Engaged seconds a stage of `minutes` estimated reading time needs before it counts as read. */
export function stageNeedSeconds(minutes: number | undefined): number {
  const m = minutes && minutes > 0 ? minutes : 1;
  return Math.round(Math.min(READING.maxSec, Math.max(READING.minSec, m * 60 * READING.share)));
}

/** Seconds of reading still needed before an explicit "mark complete" unlocks. */
export function completeNeedSeconds(stageNeeds: number[]): number {
  return Math.round(stageNeeds.reduce((a, b) => a + b, 0) * READING.completeShare);
}

export function popcount(mask: number): number {
  let n = 0;
  for (let m = mask >>> 0; m; m &= m - 1) n++;
  return n;
}

/** 0..1 share of the stage seen. */
export function coverageOf(mask: number | undefined): number {
  return Math.min(1, popcount(mask ?? 0) / READING.bins);
}

/** 0..1 reading progress of a stage: the lower of time and coverage, each against its bar. */
export function readProgress(seconds: number, need: number, mask: number | undefined): number {
  return Math.min(1, seconds / Math.max(1, need), coverageOf(mask) / READING.coverage);
}

export function isStageRead(seconds: number, need: number, mask: number | undefined): boolean {
  return seconds >= need && coverageOf(mask) >= READING.coverage;
}

/** Bitmask of the stage slices whose centre is inside the visible band [top, bottom]. */
export function visibleBins(rect: { top: number; height: number }, top: number, bottom: number): number {
  if (rect.height <= 0) return 0;
  let mask = 0;
  for (let i = 0; i < READING.bins; i++) {
    const c = rect.top + (rect.height * (i + 0.5)) / READING.bins;
    if (c >= top && c <= bottom) mask |= 1 << i;
  }
  return mask;
}

function readAloudPlaying() {
  try {
    return !!window.speechSynthesis?.speaking && !window.speechSynthesis.paused;
  } catch {
    return false;
  }
}

/**
 * Calls `onReadingSecond()` once per second of real reading (see the rules above; the caller then
 * decides which stage was under the reading line). Returns a stop function.
 */
export function startReadingProbe(onReadingSecond: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  let lastActive = Date.now();
  let lastTick = Date.now();
  let lastY = window.scrollY;
  let calmTicks = 0;
  const onActivity = () => {
    lastActive = Date.now();
  };
  const onVisible = () => {
    lastTick = Date.now();
    calmTicks = 0;
    if (document.visibilityState === "visible") lastActive = Date.now();
  };
  const tick = () => {
    const now = Date.now();
    const gap = now - lastTick;
    lastTick = now;
    const y = window.scrollY;
    const moved = Math.abs(y - lastY);
    lastY = y;
    // the scroll position must have been calm for this second AND the one before: a jump lands
    // between two ticks, so the second after it is never credited either
    calmTicks = moved <= window.innerHeight * READING.flick ? calmTicks + 1 : 0;
    if (gap > 2500) return; // timers were frozen (sleep, background throttling)
    if (document.visibilityState !== "visible") return;
    if (now - lastActive > READING.idleMs && !readAloudPlaying()) return;
    if (calmTicks < 2) return;
    onReadingSecond();
  };
  const timer = window.setInterval(tick, 1000);
  ACTIVITY.forEach((e) => (e === "selectionchange" ? document : window).addEventListener(e, onActivity, { passive: true }));
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.clearInterval(timer);
    ACTIVITY.forEach((e) => (e === "selectionchange" ? document : window).removeEventListener(e, onActivity));
    document.removeEventListener("visibilitychange", onVisible);
  };
}
