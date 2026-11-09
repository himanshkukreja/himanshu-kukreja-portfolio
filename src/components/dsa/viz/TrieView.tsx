"use client";

/** The "trie" view: words stored letter by letter. The drawing is TrieDraw.tsx, themed here with the site's colour variables. */
import type { TrieState } from "@/lib/dsa/viz/types";
import TrieDraw, { describeTrie } from "./TrieDraw";
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

export const describeTrieState = describeTrie;

export default function TrieView({ state }: { state: TrieState; prev: TrieState | null; t: number }) {
  return <TrieDraw state={state} pal={PAL} className="mx-auto w-full" style={{ maxWidth: 640 }} />;
}
