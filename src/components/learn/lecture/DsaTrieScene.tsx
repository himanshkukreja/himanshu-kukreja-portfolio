"use client";

/**
 * DSA Mastery's `trie` scene: words stored letter by letter, on the lecture stage (16:9, TrieScene) and the vertical short
 * (9:16, PTrie). The drawing is the step engine's (src/components/dsa/viz/TrieDraw.tsx) in the stage's own colours.
 *
 * The data model (dsa-mastery README, "Structure lessons"): scene `words` are the words stored at the start (lowercase letters),
 * `costUnit` names the cost. A step may set `words` (the words after this step; a step without it keeps the last), `grow` (a word
 * half inserted: its prefixes are drawn without an end marker), `walk` (the prefix walked so far, which is also the node in
 * focus), `fresh` and `lit` (prefix lists), `endAt` (the end marker in focus), `out` and `cost`.
 */
import type { LectureScene, LectureStep } from "@/lib/learn/lecture/types";
import type { TrieState } from "@/lib/dsa/viz/types";
import TrieDraw from "@/components/dsa/viz/TrieDraw";
import type { TreePalette } from "@/components/dsa/viz/TreeDraw";
import { ACC, accA, INK } from "./DsaScenes";

const PAL: TreePalette = {
  ink: "#f3f2ee",
  sub: "#8a8a90",
  surface: "#141416",
  stroke: "#6a6a72",
  faint: "#5a5a62",
  sig: ACC,
  hl: accA(0.16),
  onSig: INK,
  pillBg: "#f3f2ee",
  pillInk: INK,
  bad: "#ef4444",
  badInk: "#f3f2ee",
};

/** The words a step shows: its own `words`, or the last ones set by an earlier step of the scene, or the scene's. */
function wordsAt(s: LectureScene, st: LectureStep): string[] {
  if (st.words) return st.words;
  const at = s.steps.indexOf(st);
  for (let i = at - 1; i >= 0; i--) {
    const w = s.steps[i].words;
    if (w) return w;
  }
  return s.words || [];
}

/** A step's data as the view's state. */
export function trieStateOf(s: LectureScene, st: LectureStep): TrieState {
  return {
    words: wordsAt(s, st),
    grow: st.grow ?? "",
    walk: st.walk ?? "",
    current: st.walk !== undefined ? st.walk : null,
    fresh: st.fresh ?? [],
    lit: st.lit ?? [],
    endAt: st.endAt ?? null,
    out: st.out ?? null,
  };
}

function Counter({ s, st, k }: { s: LectureScene; st: LectureStep; k: number }) {
  if (st.cost === undefined) return null;
  return (
    <div className="flex items-baseline gap-[0.6em] font-mono uppercase tracking-[0.08em]" style={{ fontSize: `${1.25 * k}cqw`, color: "#a3a3a8" }}>
      <span className="font-display font-extrabold tabular-nums" style={{ fontSize: `${2.6 * k}cqw`, color: ACC }}>
        {st.cost}
      </span>
      {s.costUnit || "letters"}
    </div>
  );
}

export function TrieScene({ s, st }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-[2.5cqh]">
      {s.heading && <h2 className="m-0 text-center font-display text-[3cqw] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#f3f2ee]">{s.heading}</h2>}
      <div className="flex w-full justify-center rounded-sm px-[1.5cqw] py-[1cqh]" style={{ background: accA(0.04) }}>
        <TrieDraw state={trieStateOf(s, st)} pal={PAL} style={{ width: "min(70cqw, 100%)" }} />
      </div>
      <Counter s={s} st={st} k={1} />
    </div>
  );
}

export function PTrie({ s, st }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-[3cqh]">
      {s.heading && <h2 className="m-0 w-full font-display text-[7.55cqw] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#f3f2ee]">{s.heading}</h2>}
      <TrieDraw state={trieStateOf(s, st)} pal={PAL} fs={1.15} style={{ width: "96cqw" }} />
      <Counter s={s} st={st} k={2.6} />
    </div>
  );
}
