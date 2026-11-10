"use client";

/** The "dp" view: a table filled cell by cell, or a recursion tree. The drawing is DpDraw.tsx, themed here with the site's colour variables. */
import type { DpState } from "@/lib/dsa/viz/types";
import DpDraw, { describeDp } from "./DpDraw";
import type { DpPalette } from "./DpDraw";

const PAL: DpPalette = {
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

export const describeDpState = describeDp;

export default function DpView({ state }: { state: DpState; prev: DpState | null; t: number }) {
  return <DpDraw state={state} pal={PAL} className="mx-auto w-full" style={{ maxWidth: 640 }} />;
}
