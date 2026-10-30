"use client";

/**
 * How the Notebook panel sits on this screen:
 *   side    landscape and >= 1024 px (iPad landscape, laptops): a right-hand split, the page reflows to its left
 *   bottom  portrait and >= 700 px (every iPad held upright: mini 744, Air 820/834, Pro 1024): a bottom split, the
 *           page on top and still scrollable, the notebook below, its top edge drags between snap points
 *   sheet   phones (and small landscape windows): a full-height sheet over the page
 */
import { useSyncExternalStore } from "react";

export type PanelMode = "side" | "bottom" | "sheet";

const SIDE_Q = "(min-width: 1024px) and (orientation: landscape)";
const BOTTOM_Q = "(min-width: 700px) and (orientation: portrait)";

export function panelMode(): PanelMode {
  if (typeof window === "undefined") return "sheet";
  if (window.matchMedia(SIDE_Q).matches) return "side";
  if (window.matchMedia(BOTTOM_Q).matches) return "bottom";
  return "sheet";
}

const subscribe = (cb: () => void) => {
  const qs = [window.matchMedia(SIDE_Q), window.matchMedia(BOTTOM_Q)];
  qs.forEach((q) => q.addEventListener("change", cb));
  return () => qs.forEach((q) => q.removeEventListener("change", cb));
};

export const usePanelMode = () => useSyncExternalStore(subscribe, panelMode, () => "sheet" as PanelMode);

/** Bottom split heights, as a share of the window: the snap points, and the bounds while dragging. */
export const SNAPS = [0.4, 0.5, 0.7] as const;
export const MIN_SHARE = 0.28;
export const MAX_SHARE = 0.82;
const H_KEY = "hk.ink.panelH";

export function storedShare(): number {
  try {
    const n = Number(window.localStorage.getItem(H_KEY));
    if (n >= MIN_SHARE && n <= MAX_SHARE) return n;
  } catch {
    // ignore
  }
  return 0.5;
}
export function storeShare(n: number) {
  try {
    window.localStorage.setItem(H_KEY, String(n));
  } catch {
    // ignore
  }
}
export const nearestSnap = (n: number) => SNAPS.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best), SNAPS[0] as number);
