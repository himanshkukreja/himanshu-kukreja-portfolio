"use client";

/**
 * Reading chrome state shared by the site header, the lesson's stage bar and the phone reading
 * toolbar: on lesson pages the chrome slides away while the reader scrolls down and comes back on
 * any scroll up, so the article gets the screen. Fires `hk:chrome` on window when it flips so
 * geometry helpers can re-measure.
 */
import { useEffect, useSyncExternalStore } from "react";

let hidden = false;
const subs = new Set<() => void>();

function setHidden(v: boolean) {
  if (v === hidden) return;
  hidden = v;
  subs.forEach((f) => f());
  window.dispatchEvent(new Event("hk:chrome"));
}

function subscribe(f: () => void) {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}

export function useChromeHidden(): boolean {
  return useSyncExternalStore(subscribe, () => hidden, () => false);
}

/** Show/hide the chrome by scroll direction while `enabled`. Always visible near the top. */
export function useAutoHideChrome(enabled: boolean) {
  useEffect(() => {
    if (!enabled) {
      setHidden(false);
      return;
    }
    let last = window.scrollY;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        const dy = y - last;
        if (y < 160) {
          setHidden(false);
          last = y;
        } else if (Math.abs(dy) > 8) {
          setHidden(dy > 0);
          last = y;
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) window.cancelAnimationFrame(raf);
      setHidden(false);
    };
  }, [enabled]);
}
