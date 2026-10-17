"use client";

/**
 * Are we actually online? navigator.onLine alone says yes on plane wifi with no internet, so the
 * state also tracks reachability: the page was answered from the offline cache (the service
 * worker tells us), or a tiny no-store ping (/api/offline/ping) failed. While unreachable it
 * re-pings every 15 s, so "back online" is noticed even when onLine never flipped.
 */
import { useSyncExternalStore } from "react";

export type PageSource = "network" | "saved" | "recent" | "shell" | "fallback" | null;

type State = { onLine: boolean; reachable: boolean | null; source: PageSource };

let state: State = { onLine: true, reachable: null, source: null };
const listeners = new Set<() => void>();
let started = false;
let timer: number | null = null;
let pinging: Promise<boolean> | null = null;

function set(patch: Partial<State>) {
  const next = { ...state, ...patch };
  if (next.onLine === state.onLine && next.reachable === state.reachable && next.source === state.source) return;
  const wasOffline = isOfflineState(state);
  state = next;
  listeners.forEach((l) => l());
  if (wasOffline && !isOfflineState(state)) window.dispatchEvent(new Event("hk:reconnected"));
  schedule();
}

const isOfflineState = (s: State) => !s.onLine || s.reachable === false;

function schedule() {
  if (timer) window.clearTimeout(timer);
  timer = null;
  if (isOfflineState(state) && state.onLine) timer = window.setTimeout(() => void ping(), 15_000);
}

/** One no-store request to our own origin; true when it answered. */
export function ping(): Promise<boolean> {
  pinging ??= (async () => {
    try {
      const ctl = new AbortController();
      const t = window.setTimeout(() => ctl.abort(), 5000);
      const res = await fetch(`/api/offline/ping?t=${Date.now()}`, { cache: "no-store", signal: ctl.signal });
      window.clearTimeout(t);
      set({ reachable: res.ok || res.status === 204, onLine: true });
      return res.ok || res.status === 204;
    } catch {
      set({ reachable: false, onLine: navigator.onLine });
      return false;
    } finally {
      pinging = null;
      schedule(); // still unreachable: try again later (set() only reschedules on a change)
    }
  })();
  return pinging;
}

export function startConnectivity() {
  if (started || typeof window === "undefined") return;
  started = true;
  state = { ...state, onLine: navigator.onLine };
  window.addEventListener("online", () => {
    set({ onLine: true });
    // the network can take a moment to really work after "online": retry a few times
    void (async () => {
      for (const wait of [0, 1500, 4000, 8000]) {
        if (wait) await new Promise((r) => window.setTimeout(r, wait));
        if (!navigator.onLine || (await ping())) return;
      }
    })();
  });
  window.addEventListener("offline", () => set({ onLine: false, reachable: false }));
  if (!navigator.onLine) set({ reachable: false });
}

export function setPageSource(source: PageSource) {
  set({ source, ...(source && source !== "network" ? { reachable: false } : {}) });
}

/** A request just failed for network reasons: re-check instead of trusting onLine. */
export function reportNetworkFailure() {
  void ping();
}

export function isOffline(): boolean {
  if (typeof window === "undefined") return false;
  return !navigator.onLine || state.reachable === false;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const SERVER: State = { onLine: true, reachable: null, source: null };

export function useConnectivity(): { offline: boolean; source: PageSource } {
  const s = useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER
  );
  return { offline: isOfflineState(s), source: s.source };
}

/** Network-ish failure from fetch / supabase-js (no HTTP status at all). */
export function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  const e = err as { message?: string; name?: string; code?: string; status?: number };
  const msg = `${e.name ?? ""} ${e.message ?? ""}`;
  return /Failed to fetch|NetworkError|Load failed|network|fetch failed|ERR_INTERNET|ERR_NETWORK/i.test(msg) || (typeof navigator !== "undefined" && !navigator.onLine);
}
