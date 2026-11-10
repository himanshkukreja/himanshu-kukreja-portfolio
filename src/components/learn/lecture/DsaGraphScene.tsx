"use client";

/**
 * DSA Mastery's `graph` scene: a graph with its adjacency list and matrix, on the lecture stage (16:9, GraphScene) and the
 * vertical short (9:16, PGraph). The drawing is the step engine's (src/components/dsa/viz/GraphDraw.tsx) in the stage's own colours.
 *
 * The data model (dsa-mastery README, "Structure lessons"): scene `vertices` is the vertex count (ids 0 to n - 1), `edges` the
 * starting edges (each [from, to] or [from, to, weight]), `directed` makes them arrows, `view` is "both" (the graph and its list,
 * default), "graph", "list", "matrix" or "all", and `costUnit` names the cost. A step may set `edges` (the edges after this step; a
 * step without it keeps the last ones), `edge` (the edge in focus), `show` (what to draw from this step on), `current` (a vertex),
 * `mark` and `path` (vertex lists), `labels` ({ name: vertex }), `out` and `cost`.
 */
import type { LectureScene, LectureStep } from "@/lib/learn/lecture/types";
import type { GraphState } from "@/lib/dsa/viz/types";
import GraphDraw from "@/components/dsa/viz/GraphDraw";
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

type Show = GraphState["show"];

/** The edges a step shows: its own `edges`, or the last ones set by an earlier step of the scene, or the scene's. */
function edgesAt(s: LectureScene, st: LectureStep): number[][] {
  if (st.edges) return st.edges;
  const at = s.steps.indexOf(st);
  for (let i = at - 1; i >= 0; i--) {
    const e = s.steps[i].edges;
    if (e) return e;
  }
  return s.edges || [];
}

/** What a step draws: the latest `show` set by this or an earlier step, or the scene's `view`. */
function showAt(s: LectureScene, st: LectureStep): Show {
  const at = s.steps.indexOf(st);
  for (let i = at; i >= 0; i--) {
    const v = s.steps[i].show;
    if (v) return v;
  }
  const v = s.view;
  return v === "graph" || v === "list" || v === "matrix" || v === "all" ? v : "both";
}

/** A shortest-path field (`dist`, `done` or `heap`): the latest one set by this or an earlier step of the scene. */
function stickyOf<K extends "dist" | "done" | "heap" | "indeg" | "ready" | "topo" | "stuck">(s: LectureScene, st: LectureStep, key: K): LectureStep[K] | undefined {
  const at = s.steps.indexOf(st);
  for (let i = at; i >= 0; i--) if (s.steps[i][key] !== undefined) return s.steps[i][key];
  return undefined;
}

/** A step's data as the view's state. */
export function graphStateOf(s: LectureScene, st: LectureStep): GraphState {
  const e = st.edge;
  const dist = stickyOf(s, st, "dist");
  const done = stickyOf(s, st, "done");
  const heap = stickyOf(s, st, "heap");
  const indeg = stickyOf(s, st, "indeg");
  const ready = stickyOf(s, st, "ready");
  const topo = stickyOf(s, st, "topo");
  const stuck = stickyOf(s, st, "stuck");
  return {
    n: s.vertices ?? 5,
    edges: edgesAt(s, st).map((x) => ({ a: x[0], b: x[1], w: x.length > 2 ? x[2] : null })),
    directed: !!s.directed,
    current: st.current ?? null,
    mark: st.mark ?? [],
    path: st.path ?? [],
    edge: e && e.length === 2 ? [e[0], e[1]] : null,
    labels: st.labels ?? {},
    out: st.out ?? null,
    show: showAt(s, st),
    ...(dist ? { dist, done: done ?? [] } : {}),
    ...(indeg ? { indeg, ready: ready ?? [], topo: topo ?? [], ...(stuck ? { stuck } : {}) } : {}),
    ...(heap ? { heap: heap.map((h) => (h.length > 2 ? ([h[0], h[1], h[2]] as [number, number, number]) : ([h[0], h[1]] as [number, number]))) } : {}),
  };
}

function GraphSvg({ s, st, big }: { s: LectureScene; st: LectureStep; big: boolean }) {
  const state = graphStateOf(s, st);
  return <GraphDraw state={state} pal={PAL} fs={big ? 1.15 : 1} stack={big} style={big ? { width: "96cqw" } : { width: "min(74cqw, 100%)" }} />;
}

function Counter({ s, st, k }: { s: LectureScene; st: LectureStep; k: number }) {
  if (st.cost === undefined) return null;
  return (
    <div className="flex items-baseline gap-[0.6em] font-mono uppercase tracking-[0.08em]" style={{ fontSize: `${1.25 * k}cqw`, color: "#a3a3a8" }}>
      <span className="font-display font-extrabold tabular-nums" style={{ fontSize: `${2.6 * k}cqw`, color: ACC }}>
        {st.cost}
      </span>
      {s.costUnit || "reads"}
    </div>
  );
}

export function GraphScene({ s, st }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-[2.5cqh]">
      {s.heading && <h2 className="m-0 text-center font-display text-[3cqw] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#f3f2ee]">{s.heading}</h2>}
      <div className="flex w-full justify-center rounded-sm px-[1.5cqw] py-[1cqh]" style={{ background: accA(0.04) }}>
        <GraphSvg s={s} st={st} big={false} />
      </div>
      <Counter s={s} st={st} k={1} />
    </div>
  );
}

export function PGraph({ s, st }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-[3cqh]">
      {s.heading && <h2 className="m-0 w-full font-display text-[7.55cqw] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#f3f2ee]">{s.heading}</h2>}
      <GraphSvg s={s} st={st} big />
      <Counter s={s} st={st} k={2.6} />
    </div>
  );
}
