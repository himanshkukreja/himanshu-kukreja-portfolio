"use client";

/**
 * Capture (clip + snip) wiring that has no React in it: the "start a snip" request, the capture toast, and the
 * registry of mounted capture hosts (one host per page renders the snip overlay and the toast; the Snip button
 * only shows where a host is listening).
 */

export const SNIP_START = "hk:snip-start";
export const CAPTURE_TOAST = "hk:capture-toast";

/** A viewport rectangle in CSS pixels. */
export type Box = { x: number; y: number; w: number; h: number };

export type SnipStart = {
  /** start with this box (e.g. the selected passage); otherwise the learner drags one */
  box?: Box;
  /** opened from the keyboard: start with a box and put focus on it */
  keyboard?: boolean;
};

/** Enter snip mode (the capture host on this page opens the overlay). */
export function startSnip(opts: SnipStart = {}): void {
  window.dispatchEvent(new CustomEvent<SnipStart>(SNIP_START, { detail: opts }));
}

export type CaptureToastDetail =
  /** `explain`: a snip the host still holds, so the toast offers "explain" too */
  | { kind: "clip" | "snip"; pageId: string; pageTitle: string; note?: string; explain?: boolean }
  | { kind: "error"; message: string }
  | { kind: "info"; message: string };

export function captureToast(detail: CaptureToastDetail): void {
  window.dispatchEvent(new CustomEvent<CaptureToastDetail>(CAPTURE_TOAST, { detail }));
}

/* ------------------------------------------------------------------ host registry (first mounted host is active) */

let hosts: symbol[] = [];
const listeners = new Set<() => void>();

export function registerHost(id: symbol): () => void {
  hosts = [...hosts, id];
  listeners.forEach((l) => l());
  return () => {
    hosts = hosts.filter((h) => h !== id);
    listeners.forEach((l) => l());
  };
}

export function subscribeHosts(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export const activeHost = (): symbol | null => hosts[0] ?? null;

/** true while the learner is typing somewhere (single-key shortcuts must not fire) */
export function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}
