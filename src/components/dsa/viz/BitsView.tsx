"use client";

/** The "bits" view: numbers as rows of bit cells with the result under a rule. The drawing is BitsDraw.tsx, themed here with the site's colour variables. */
import type { BitsState } from "@/lib/dsa/viz/types";
import BitsDraw, { describeBits } from "./BitsDraw";
import type { BitsPalette } from "./BitsDraw";

const PAL: BitsPalette = {
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

export const describeBitsState = describeBits;

export default function BitsView({ state }: { state: BitsState; prev: BitsState | null; t: number }) {
  return <BitsDraw state={state} pal={PAL} className="mx-auto w-full" style={{ maxWidth: 640 }} />;
}
