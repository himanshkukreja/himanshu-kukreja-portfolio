/**
 * What each structure's sandbox can do, and how a lesson's scripted demos (`::viz[id]`, from sandbox.yml `demos:`) turn
 * into scripts. Mirrors the content checker's SANDBOX_STRUCTURES (dsa-mastery tools/lib/check/structure.mjs): a new
 * structure adds its ops here, a generator file, and a view (src/components/dsa/viz/views.tsx).
 */
import { LIST_OPS, makeList, runListOp, type ListOp, type ListOpName } from "./list";
import { memoryPicture } from "./memory";
import type { Frame, Script } from "./types";
import { gridSearch, parseGrid } from "./grid";

export type SandboxDemo = {
  id: string;
  title: string;
  view?: "list" | "memory";
  start: number[];
  ops?: ({ op: ListOpName; value?: number; index?: number })[];
  doubly?: boolean;
  /** keep a tail pointer (default true) */
  tail?: boolean;
  /** ask predict-then-reveal questions at the key steps */
  predict?: boolean;
};

export type SandboxSpec = {
  id: string;
  structure: "linked-list";
  title: string;
  start: number[];
  operations: ListOpName[];
  variants: ("singly" | "doubly")[];
  limits: { nodes: number; value: [number, number] };
  cost: string;
  demos: SandboxDemo[];
};

export const SANDBOX_STRUCTURES = {
  "linked-list": { ops: LIST_OPS, variants: ["singly", "doubly"] as const, demoViews: ["list", "memory"] as const },
};

const toOp = (o: NonNullable<SandboxDemo["ops"]>[number]): ListOp | null => {
  const value = Number(o.value ?? 0);
  switch (o.op) {
    case "push_front":
    case "push_back":
    case "delete":
    case "search":
      return { op: o.op, value };
    case "insert_after":
      return { op: "insert_after", index: Number(o.index ?? 0), value };
    case "reverse":
    case "middle":
      return { op: o.op };
    default:
      return null;
  }
};

/** A demo as one script: its ops run in order, frames joined, the cost running on across them. */
export function demoScript(d: SandboxDemo): Script {
  if (d.view === "memory") return memoryPicture(d.start) as Script;
  let list = makeList(d.start, { doubly: d.doubly, tail: d.tail });
  const frames: Frame<unknown>[] = [];
  let base = 0;
  let costUnit = "pointer hops";
  const results: string[] = [];
  for (const raw of d.ops || []) {
    const op = toOp(raw);
    if (!op) continue;
    const r = runListOp(list, op, { predict: d.predict });
    costUnit = r.script.costUnit;
    // the first frame of a later op repeats the previous end state: skip it only when nothing changed
    for (const f of r.script.frames) frames.push({ ...f, cost: base + f.cost });
    base += r.script.frames[r.script.frames.length - 1]?.cost ?? 0;
    if (r.script.result) results.push(r.script.result);
    list = r.list;
  }
  return { view: "list", title: d.title, costUnit, frames, result: results.join("; ") || undefined };
}

/* ------------------------------------------------------------------ algorithm visualizers (Academy Part 3) */

/**
 * An algorithm lesson's visualizer (dsa-mastery visualizer.yml, `::visualizer[id]`) and its scripted demos
 * (`::viz[id]`). Mirrors the content checker's VISUALIZER_VIEWS (tools/lib/check/algorithm.mjs). Grids are rows of
 * `.#SG` (src/lib/dsa/viz/grid.ts).
 */
export type GridPreset = { id: string; title: string; grid: string[]; note?: string };
export type GridDemo = {
  id: string;
  title: string;
  algorithm: "bfs" | "dfs";
  /** a preset id from the visualizer, or the grid itself */
  preset?: string;
  grid?: string[];
  predict?: boolean;
  /** stop at G (default true when the grid has one); false explores every reachable cell (flood fill) */
  goal?: boolean;
};
export type VisualizerSpec = {
  id: string;
  view: "grid";
  title: string;
  algorithms: ("bfs" | "dfs")[];
  cost: string;
  limits: { rows: [number, number]; cols: [number, number] };
  presets: GridPreset[];
  demos: GridDemo[];
};

export const VISUALIZER_VIEWS = { grid: { algorithms: ["bfs", "dfs"] as const } };

export const isGridDemo = (d: SandboxDemo | GridDemo): d is GridDemo => "algorithm" in d;

export function gridDemoScript(d: GridDemo, presets: GridPreset[] = []): Script {
  const rows = d.grid || presets.find((p) => p.id === d.preset)?.grid || [];
  const { grid, error } = parseGrid(rows);
  if (!grid) return { view: "array", title: d.title, costUnit: "steps", frames: [{ state: { values: [], pointers: {}, mark: [], moved: [], dim: [] }, note: error || "No grid.", cost: 0 }] };
  return gridSearch(d.algorithm, grid, { predict: d.predict, title: d.title, useGoal: d.goal !== false }) as Script;
}
