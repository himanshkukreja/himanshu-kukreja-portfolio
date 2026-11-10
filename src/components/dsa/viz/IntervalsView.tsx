"use client";

/** The "intervals" view: talks as bars on an hour axis. The drawing is IntervalsDraw.tsx, themed here with the site's colour variables. */
import type { IntervalsState } from "@/lib/dsa/viz/types";
import IntervalsDraw, { describeIntervals } from "./IntervalsDraw";
import type { IntervalsPalette } from "./IntervalsDraw";

const PAL: IntervalsPalette = {
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

export const describeIntervalsState = describeIntervals;

export default function IntervalsView({ state }: { state: IntervalsState; prev: IntervalsState | null; t: number }) {
  return <IntervalsDraw state={state} pal={PAL} className="mx-auto w-full" style={{ maxWidth: 640 }} />;
}
