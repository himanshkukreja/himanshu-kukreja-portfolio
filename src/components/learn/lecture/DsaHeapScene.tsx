"use client";

/**
 * DSA Mastery's `heap` scene: a binary heap stored in an array, on the lecture stage (16:9, HeapScene) and the vertical short
 * (9:16, PHeap). The drawing is the step engine's (src/components/dsa/viz/HeapDraw.tsx) in the stage's own colours: the tree
 * of the array, and the array itself under it.
 *
 * The data model (dsa-mastery README, "Structure lessons"): scene `values` is the heap's array (index 0 first), `indexes`
 * writes each cell's index, `view` is "both" (default), "tree" or "array", `kindOfHeap` is "min" (default) or "max", and
 * `costUnit` names the cost. A step may set `values` (the array after this step; a step without it keeps the last array),
 * `swap` and `compare` (two indexes), `current`, `mark` and `path` (index lists), `labels` ({ name: index }), `out` and `cost`.
 */
import type { LectureScene, LectureStep } from "@/lib/learn/lecture/types";
import type { HeapState } from "@/lib/dsa/viz/types";
import HeapDraw from "@/components/dsa/viz/HeapDraw";
import type { TreePalette } from "@/components/dsa/viz/TreeDraw";
import { clamp, easeInOut } from "./anim";
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

const pair = (a: number[] | undefined): [number, number] | null => (a && a.length === 2 ? [a[0], a[1]] : null);

/** The array a step shows: its own `values`, or the last ones set by an earlier step of the scene, or the scene's. */
function arrayAt(s: LectureScene, st: LectureStep): (number | string)[] {
  if (st.values) return st.values;
  const at = s.steps.indexOf(st);
  for (let i = at - 1; i >= 0; i--) {
    const v = s.steps[i].values;
    if (v) return v;
  }
  return (s.values as (number | string)[]) || [];
}

/** A step's data as the view's state. */
export function heapStateOf(s: LectureScene, st: LectureStep): HeapState {
  return {
    values: arrayAt(s, st).map(String),
    compare: pair(st.compare),
    swap: pair(st.swap),
    current: st.current ?? null,
    mark: st.mark ?? [],
    path: st.path ?? [],
    labels: st.labels ?? {},
    out: st.out ?? null,
    indexes: !!s.indexes,
    show: s.view === "tree" || s.view === "array" ? s.view : "both",
    kind: s.kindOfHeap ?? "min",
  };
}

function HeapSvg({ s, st, prevSt, t, big }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; big: boolean }) {
  const state = heapStateOf(s, st);
  const prev = prevSt ? heapStateOf(s, prevSt) : null;
  const move = easeInOut(clamp(t / 0.7));
  return <HeapDraw state={state} prev={prev} t={move} pal={PAL} fs={big ? 1.1 : 1} style={big ? { width: "96cqw" } : { width: "min(56cqw, 100%)" }} />;
}

function Counter({ s, st, k }: { s: LectureScene; st: LectureStep; k: number }) {
  if (st.cost === undefined) return null;
  return (
    <div className="flex items-baseline gap-[0.6em] font-mono uppercase tracking-[0.08em]" style={{ fontSize: `${1.25 * k}cqw`, color: "#a3a3a8" }}>
      <span className="font-display font-extrabold tabular-nums" style={{ fontSize: `${2.6 * k}cqw`, color: ACC }}>
        {st.cost}
      </span>
      {s.costUnit || "steps"}
    </div>
  );
}

export function HeapScene({ s, st, prevSt, t }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-[2.5cqh]">
      {s.heading && <h2 className="m-0 text-center font-display text-[3cqw] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#f3f2ee]">{s.heading}</h2>}
      <div className="flex w-full justify-center rounded-sm px-[1.5cqw] py-[1cqh]" style={{ background: accA(0.04) }}>
        <HeapSvg s={s} st={st} prevSt={prevSt} t={t} big={false} />
      </div>
      <Counter s={s} st={st} k={1} />
    </div>
  );
}

export function PHeap({ s, st, prevSt, t }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-[3cqh]">
      {s.heading && <h2 className="m-0 w-full font-display text-[7.55cqw] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#f3f2ee]">{s.heading}</h2>}
      <HeapSvg s={s} st={st} prevSt={prevSt} t={t} big />
      <Counter s={s} st={st} k={2.6} />
    </div>
  );
}
