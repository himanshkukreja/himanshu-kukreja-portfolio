"use client";

/** The "strings" view: a text as a strip of letters, a pattern slid along it, a count array or two pointers. The drawing is StringsDraw.tsx, themed here with the site's colour variables. */
import type { StringsState } from "@/lib/dsa/viz/types";
import StringsDraw, { describeStrings } from "./StringsDraw";
import type { StringsPalette } from "./StringsDraw";

const PAL: StringsPalette = {
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

export const describeStringsState = describeStrings;

export default function StringsView({ state }: { state: StringsState; prev: StringsState | null; t: number }) {
  return <StringsDraw state={state} pal={PAL} className="mx-auto w-full" style={{ maxWidth: 640 }} />;
}
