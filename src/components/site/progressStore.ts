"use client";

/**
 * Global route-change progress state (the signal-orange bar at the top of the viewport).
 *
 * start: every client navigation (Link click, router.push/replace, back/forward) via
 *        `onRouterTransitionStart` in src/instrumentation-client.ts, plus plain same-origin <a>
 *        clicks that fall through to a full page load (see RouteProgress).
 * done:  when the committed pathname/search changes (RouteProgress) and no route `loading.tsx`
 *        skeleton is still on screen (those hold the bar open until the real page streams in).
 */
import { useSyncExternalStore } from "react";

export type RouteProgressSnap = { phase: "idle" | "loading" | "done"; value: number };

export const ROUTE_START_EVENT = "hk:route-start";

const IDLE: RouteProgressSnap = { phase: "idle", value: 0 };
let snap: RouteProgressSnap = IDLE;
const subs = new Set<() => void>();
let trickle = 0;
let safety = 0;
let hide = 0;
let holds = 0;
let doneWanted = false;

function emit(next: RouteProgressSnap) {
  snap = next;
  subs.forEach((f) => f());
}

function clearTimers() {
  window.clearInterval(trickle);
  window.clearTimeout(safety);
  window.clearTimeout(hide);
}

/** Same document (only the #hash differs, or the exact same URL)? Then nothing is loading. */
export function isSameDocument(href: string): boolean {
  try {
    const u = new URL(href, window.location.href);
    return u.origin === window.location.origin && u.pathname === window.location.pathname && u.search === window.location.search;
  } catch {
    return true;
  }
}

export function startRouteProgress() {
  clearTimers();
  doneWanted = false;
  emit({ phase: "loading", value: Math.max(0.14, snap.phase === "loading" ? snap.value : 0) });
  // ease towards 92% and wait there for the route to commit
  trickle = window.setInterval(() => {
    if (snap.phase !== "loading") return;
    emit({ phase: "loading", value: snap.value + (0.92 - snap.value) * (snap.value < 0.5 ? 0.16 : 0.06) });
  }, 200);
  // never leave a stuck bar behind (failed fetch, aborted navigation, same-URL refresh)
  safety = window.setTimeout(() => finish(), 15000);
}

function finish() {
  doneWanted = false;
  if (snap.phase !== "loading") return;
  clearTimers();
  emit({ phase: "done", value: 1 });
  hide = window.setTimeout(() => emit(IDLE), 420);
}

/** The route committed. Finish now unless a loading.tsx skeleton is holding the bar open. */
export function doneRouteProgress() {
  if (snap.phase !== "loading") return;
  doneWanted = true;
  // effects of the newly committed tree (holds) run in the same commit; look after them
  window.setTimeout(() => {
    if (doneWanted && holds === 0) finish();
  }, 0);
}

/** A route skeleton mounted: keep the bar running until it unmounts. Returns the release fn. */
export function holdRouteProgress() {
  holds++;
  return () => {
    holds = Math.max(0, holds - 1);
    if (holds === 0 && doneWanted) finish();
  };
}

function subscribe(f: () => void) {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}

export function useRouteProgress(): RouteProgressSnap {
  return useSyncExternalStore(subscribe, () => snap, () => IDLE);
}
