"use client";

/**
 * The "queue" view: a ring buffer (cells, head and tail that wrap round), a linked queue or deque (nodes, front on the
 * left) and the sliding-window maximum with a monotonic deque. The drawing is QueueDraw.tsx, themed here with the site's
 * colour variables; the lecture stage draws the same thing in its own colours.
 */
import type { QueueState } from "@/lib/dsa/viz/types";
import QueueDraw, { describeQueue, type QueuePalette } from "./QueueDraw";

const PAL: QueuePalette = {
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

export const describeQueueState = describeQueue;

export default function QueueView({ state, prev, t }: { state: QueueState; prev: QueueState | null; t: number }) {
  return <QueueDraw state={state} prev={prev} t={t} pal={PAL} className="mx-auto block h-auto w-full" style={{ maxHeight: 340 }} />;
}
