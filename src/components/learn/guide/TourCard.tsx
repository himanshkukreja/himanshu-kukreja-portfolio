"use client";

/**
 * "New here? Take the 2-minute tour": shown on the course hub to visitors with no course activity
 * yet, until they open the guide or dismiss it (localStorage `hk.guide.tour.v1`, per browser).
 */
import Link from "next/link";
import { useCallback, useSyncExternalStore } from "react";
import { useGame } from "@/game/GameProvider";

const KEY = "hk.guide.tour.v1";
const EVT = "hk:guide-tour";

function subscribe(cb: () => void) {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
}

function dismissed(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

function dismiss() {
  try {
    window.localStorage.setItem(KEY, String(Date.now()));
  } catch {
    // storage blocked: the card simply shows again next visit
  }
  window.dispatchEvent(new Event(EVT));
}

const LEARN_KEY = /^(lesson|stage|trial|boss|quiz):/;

export default function TourCard() {
  const { done, hydrated } = useGame();
  // server and first client render: hidden (null), so nothing flashes for returning learners
  const gone = useSyncExternalStore(subscribe, dismissed, () => true);
  const close = useCallback(() => dismiss(), []);
  const fresh = hydrated && !Object.keys(done).some((k) => LEARN_KEY.test(k));
  if (gone || !fresh) return null;
  return (
    <aside aria-label="Guide to the course" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border border-signal bg-surface px-4 py-4 sm:px-6">
      <span className="flex min-w-0 flex-[1_1_420px] flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">New here?</span>
        <span className="text-[16px] font-semibold text-fg">Take the 2-minute tour of how the course works.</span>
        <span className="text-[14px] leading-snug text-fg-2">Stages, XP, the Notebook, the daily standup, trials, bosses and the Arena, with screenshots.</span>
      </span>
      <span className="flex items-center gap-2">
        <Link href="/learn/guide" onClick={close} className="inline-flex min-h-11 items-center bg-signal px-5 text-[15px] font-semibold text-on-signal hover:brightness-110">
          Take the tour →
        </Link>
        <button type="button" onClick={close} aria-label="Dismiss the tour card" className="grid h-11 w-11 place-items-center border border-line-strong text-fg-3 hover:text-fg">
          ×
        </button>
      </span>
    </aside>
  );
}
