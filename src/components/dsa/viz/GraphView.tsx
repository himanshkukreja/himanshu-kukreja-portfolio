"use client";

/**
 * The "graph" view: a graph drawn as vertices and edges, with its adjacency list and matrix (GraphDraw.tsx), themed here with the
 * site's colour variables; the lecture stage draws the same thing in its own colours.
 */
import type { GraphState } from "@/lib/dsa/viz/types";
import GraphDraw, { describeGraph } from "./GraphDraw";
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

export const describeGraphState = describeGraph;

export default function GraphView({ state }: { state: GraphState; prev: GraphState | null; t: number }) {
  return <GraphDraw state={state} pal={PAL} className="mx-auto w-full" style={{ maxWidth: 640 }} />;
}
