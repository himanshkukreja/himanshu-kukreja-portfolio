"use client";

/**
 * DSA Mastery's `tree` scene: a binary tree (usually a search tree) on the lecture stage (16:9, TreeScene) and the vertical
 * short (9:16, PTree). The drawing is the step engine's (src/components/dsa/viz/TreeDraw.tsx) in the stage's own colours.
 *
 * The data model (dsa-mastery README, "Lectures and shorts"): scene `values` are the nodes by id, `leftOf` and `rightOf`
 * each id's left and right child id (null = none), `root` the root id (default 0), `levels` numbers the levels down the
 * left, `costUnit`. A step may set `nodes` (the ids in the tree this step; default all, so a node can join or leave),
 * `leftOf` and `rightOf` again (links changed), `lift` (a node in flight above the root, not in `nodes`), `path` (ids
 * walked so far), `current`, `found`, `mark`, `seq` and `seqTitle` (a walk's output so far), `labels` ({ name: id }), `out`
 * and `cost`.
 */
import type { LectureScene, LectureStep } from "@/lib/learn/lecture/types";
import type { TreeNodeState, TreeState } from "@/lib/dsa/viz/types";
import TreeDraw, { type TreePalette } from "@/components/dsa/viz/TreeDraw";
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

/** A step's data as the view's state. */
export function treeStateOf(s: LectureScene, st: LectureStep): TreeState {
  const values = s.values || [];
  const left = st.leftOf ?? s.leftOf ?? [];
  const right = st.rightOf ?? s.rightOf ?? [];
  const present = new Set(st.nodes ?? values.map((_, i) => i));
  const kid = (id: number | null | undefined): number | null => (id !== null && id !== undefined && present.has(id) ? id : null);
  const nodes: TreeNodeState[] = [...present]
    .filter((id) => id >= 0 && id < values.length)
    .sort((a, b) => a - b)
    .map((id) => ({ id, value: String(values[id]), left: kid(left[id]), right: kid(right[id]) }));
  const rootId = s.root ?? 0;
  const lifted = st.lift !== undefined && st.lift !== null ? { id: st.lift, value: String(values[st.lift]) } : null;
  return {
    nodes,
    root: present.has(rootId) ? rootId : null,
    path: st.path ?? [],
    current: st.current ?? null,
    found: st.found ?? null,
    mark: st.mark ?? [],
    changed: [],
    lifted,
    labels: st.labels ?? {},
    seq: st.seq ? { title: st.seqTitle ?? "", values: st.seq.map((id) => String(values[id])) } : null,
    out: st.out ?? null,
    levels: !!s.levels,
    addrs: {},
  };
}

function TreeSvg({ s, st, prevSt, t, big }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; big: boolean }) {
  const state = treeStateOf(s, st);
  const prev = prevSt ? treeStateOf(s, prevSt) : null;
  const move = easeInOut(clamp(t / 0.7));
  return <TreeDraw state={state} prev={prev} t={move} pal={PAL} fs={big ? 1.1 : 1} style={big ? { width: "96cqw", height: "auto", maxHeight: "52cqh", display: "block" } : { width: "auto", height: "52cqh", maxWidth: "80cqw", display: "block" }} />;
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

export function TreeScene({ s, st, prevSt, t }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-[2.5cqh]">
      {s.heading && <h2 className="m-0 text-center font-display text-[3cqw] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#f3f2ee]">{s.heading}</h2>}
      <div className="rounded-sm px-[1.5cqw] py-[1cqh]" style={{ background: accA(0.04) }}>
        <TreeSvg s={s} st={st} prevSt={prevSt} t={t} big={false} />
      </div>
      <Counter s={s} st={st} k={1} />
    </div>
  );
}

export function PTree({ s, st, prevSt, t }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-[3cqh]">
      {s.heading && <h2 className="m-0 w-full font-display text-[7.55cqw] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#f3f2ee]">{s.heading}</h2>}
      <TreeSvg s={s} st={st} prevSt={prevSt} t={t} big />
      <Counter s={s} st={st} k={2.6} />
    </div>
  );
}
