"use client";

/**
 * The only notebook calls capture makes (src/lib/learn/ink/client.ts, owned by the pages part), plus the sizes a
 * clip / snip takes on a page. Everything here is in page units (types.ts: a PAGE_W × PAGE_H sheet).
 */
import { appendItem, inboxPage, openNotebookPanel, uploadSnip } from "@/lib/learn/ink/client";
import { LIMITS, PAGE_W, type ItemSource } from "@/lib/learn/ink/types";

export { appendItem, inboxPage, openNotebookPanel, uploadSnip };

/** a clip box: most of the page width, leaving the margins */
export const CLIP_W = Math.round(PAGE_W * 0.76);

/** a snip keeps its on-screen size (1 CSS px ≈ 1 page unit, a lesson column is ~700 px), shrunk to fit the page */
export function snipBox(cssW: number, cssH: number): { w: number; h: number } {
  const k = Math.min(1, (PAGE_W * 0.86) / cssW, 1000 / cssH);
  const q = (v: number) => Math.round(v * 10) / 10;
  return { w: q(cssW * k), h: q(cssH * k) };
}

/** ≤ LIMITS.clipChars, cut at a word with an ellipsis when longer */
export function trimClip(text: string): string {
  const t = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (t.length <= LIMITS.clipChars) return t;
  const cut = t.slice(0, LIMITS.clipChars - 1);
  const sp = cut.search(/\s\S*$/);
  return `${(sp > LIMITS.clipChars * 0.8 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

export function newItemId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export type CaptureSource = ItemSource;

/** the notebook's local dev stand-in is on (works signed out): development + localStorage hk.ink.dev = "1" */
export function devInk(): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  try {
    return window.localStorage.getItem("hk.ink.dev") === "1";
  } catch {
    return false;
  }
}

/** clip / snip need a notebook: signed in (or the dev stand-in) */
export const canCapture = (signedIn: boolean) => signedIn || devInk();
