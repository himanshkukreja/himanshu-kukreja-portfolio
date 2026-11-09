"use client";

/**
 * The "heap" view: a binary heap drawn as a tree and as the array that holds it (HeapDraw.tsx), themed here with the
 * site's colour variables; the lecture stage draws the same thing in its own colours.
 */
import type { HeapState } from "@/lib/dsa/viz/types";
import HeapDraw, { describeHeap } from "./HeapDraw";
import type { TreePalette } from "./TreeDraw";

const PAL: TreePalette = {
  ink: "var(--c-fg)",
  sub: "var(--c-fg-3)",
  surface: "var(--c-surface)",
  stroke: "var(--c-fg-2)",
  faint: "var(--c-line-strong, var(--c-fg-3))",
  sig: "var(--c-signal)",
  hl: "var(--c-dsa-hl)",
  onSig: "var(--c-on-signal)",
  pillBg: "var(--c-fg)",
  pillInk: "var(--c-bg)",
  bad: "var(--c-bad-text, #b3261e)",
  badInk: "var(--c-bg)",
};

export const describeHeapState = describeHeap;

export default function HeapView({ state, prev, t }: { state: HeapState; prev: HeapState | null; t: number }) {
  return <HeapDraw state={state} prev={prev} t={t} pal={PAL} className="mx-auto w-full" style={{ maxWidth: 640 }} />;
}
