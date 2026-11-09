"use client";

/**
 * The "tree" view: a binary search tree (nodes, links, the path walked, a walk's output). The drawing is TreeDraw.tsx,
 * themed here with the site's colour variables; the lecture stage draws the same thing in its own colours.
 */
import type { TreeState } from "@/lib/dsa/viz/types";
import TreeDraw, { describeTree, type TreePalette } from "./TreeDraw";

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

export const describeTreeState = describeTree;

export default function TreeView({ state, prev, t }: { state: TreeState; prev: TreeState | null; t: number }) {
  return <TreeDraw state={state} prev={prev} t={t} pal={PAL} className="mx-auto block h-auto w-full" style={{ maxHeight: 380 }} />;
}
