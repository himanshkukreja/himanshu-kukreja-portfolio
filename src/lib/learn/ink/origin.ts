"use client";

/**
 * Where a full-screen notebook page was opened from (this tab only): the Notebook panel's full-screen button
 * remembers the page it sat beside, so /notebook/page/<id> can close back to it and keep that course's look
 * (DSA Mastery's teal when it came from /dsa/…). Without it a DSA learner landed in the System Design notebook
 * with no way back but the SDM course (9 Nov 2026).
 */
const KEY = "hk.ink.from";

const safe = (p: string | null | undefined): string | null =>
  typeof p === "string" && p.startsWith("/") && !p.startsWith("//") && !p.startsWith("/notebook") ? p : null;

export function rememberInkOrigin(path: string): void {
  const p = safe(path);
  if (!p) return;
  try {
    window.sessionStorage.setItem(KEY, p);
  } catch {
    // storage blocked: the page still opens, it just closes to the notebook
  }
}

export function readInkOrigin(): string | null {
  try {
    return safe(window.sessionStorage.getItem(KEY));
  } catch {
    return null;
  }
}
