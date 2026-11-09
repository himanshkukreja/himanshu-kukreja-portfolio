"use client";

/**
 * DSA Mastery's two views (owner, 9 Nov 2026: everyone starts simple).
 *
 * - Simple (the default for everyone): one clear next step, fewer tabs, one language in the problem room, the small
 *   print folded into one quiet line, lessons one stage at a time with the edge cases folded.
 * - Full ("Show everything", or "experienced" in the welcome): every tab, all four languages, every chip and counter,
 *   the whole lesson on one page.
 *
 * Kept on this device (localStorage `dsa.view`); there is no account preferences store to sync it to yet. The welcome's
 * answers live beside it (`dsa.welcome`). Both are read with useSyncExternalStore: the server and the first paint
 * render the simple view, so a returning "full" learner sees the full view a frame later, never a hydration error.
 */
import { useSyncExternalStore } from "react";

const VIEW_KEY = "dsa.view";
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

const readFull = () => read(VIEW_KEY) === "full";

/** True in the full view ("Show everything"); false (simple) on the server and by default. */
export function useDsaFull(): boolean {
  return useSyncExternalStore(subscribe, readFull, () => false);
}

export function setDsaFull(full: boolean) {
  write(VIEW_KEY, full ? "full" : "simple");
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

/** The "Show everything" switch: a real switch (role="switch"), small and quiet. */
export function ShowEverything({ className = "" }: { className?: string }) {
  const full = useDsaFull();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={full}
      onClick={() => setDsaFull(!full)}
      title={full ? "Back to the simple view" : "Every tab, language, counter and the whole lesson at once"}
      className={`inline-flex min-h-9 shrink-0 items-center gap-2 font-mono text-[12px] text-fg-3 hover:text-fg [@media(pointer:coarse)]:min-h-11 ${className}`}
    >
      <span aria-hidden className={`relative inline-block h-[14px] w-[26px] border ${full ? "border-signal bg-signal" : "border-line-strong bg-surface-2"}`}>
        <span className={`absolute top-[2px] h-2 w-2 ${full ? "left-[14px] bg-on-signal" : "left-[2px] bg-fg-3"}`} />
      </span>
      Show everything
    </button>
  );
}
