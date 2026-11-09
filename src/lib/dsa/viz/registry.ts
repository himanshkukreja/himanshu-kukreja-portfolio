/**
 * What each structure's sandbox can do, and how a lesson's scripted demos (`::viz[id]`, from sandbox.yml `demos:`) turn
 * into scripts. Mirrors the content checker's SANDBOX_STRUCTURES (dsa-mastery tools/lib/check/structure.mjs): a new
 * structure adds its ops here, a generator file, and a view (src/components/dsa/viz/views.tsx).
 */
import { LIST_OPS, makeList, runListOp, type ListOp, type ListOpName } from "./list";
import { memoryPicture } from "./memory";
import { makeQueue, queueMemoryPicture, runQueueOp, QUEUE_OPS, type QueueOp, type QueueOpName } from "./queue";
import { makeStack, runStackOp, stackMemoryPicture, STACK_OPS, type StackOp, type StackOpName } from "./stack";
import type { Frame, Script } from "./types";
import { gridSearch, parseGrid } from "./grid";

export type SandboxDemo = {
  id: string;
  title: string;
  view?: "list" | "memory";
  start: number[];
  /** a linked-list demo's operations, or (stack sandboxes) a stack's */
  ops?: ({ op: ListOpName | StackOpName | QueueOpName; value?: number; index?: number })[];
  doubly?: boolean;
  /** stack demos: how the stack is stored (default array) and the cells the array starts with */
  backing?: "array" | "linked" | "ring" | "list" | "doubly";
  capacity?: number;
  /** queue demos: the ring's head cell at the start (so the demo can wrap round) */
  head?: number;
  /** keep a tail pointer (default true) */
  tail?: boolean;
  /** ask predict-then-reveal questions at the key steps */
  predict?: boolean;
};

export type SandboxSpec = {
  id: string;
  structure: "linked-list" | "stack" | "queue";
  title: string;
  start: number[];
  operations: (ListOpName | StackOpName | QueueOpName)[];
  variants: ("singly" | "doubly" | "array" | "linked" | "ring")[];
  /** stack sandboxes: the array's starting cells */
  capacity?: number;
  limits: { nodes: number; value: [number, number] };
  cost: string;
  demos: SandboxDemo[];
};

export const SANDBOX_STRUCTURES = {
  "linked-list": { ops: LIST_OPS, variants: ["singly", "doubly"] as const, demoViews: ["list", "memory"] as const },
  stack: { ops: STACK_OPS, variants: ["array", "linked"] as const, demoViews: ["stack", "memory"] as const },
  queue: { ops: QUEUE_OPS, variants: ["ring", "linked", "doubly"] as const, demoViews: ["queue", "memory"] as const },
};

const toQueueOp = (o: NonNullable<SandboxDemo["ops"]>[number]): QueueOp | null => {
  const value = Number(o.value ?? 0);
  switch (o.op) {
    case "enqueue":
    case "push_back":
    case "push_front":
    case "window_max":
      return { op: o.op, value };
    case "dequeue":
    case "pop_front":
    case "pop_back":
    case "peek":
      return { op: o.op };
    default:
      return null;
  }
};

const toStackOp = (o: NonNullable<SandboxDemo["ops"]>[number]): StackOp | null => {
  const value = Number(o.value ?? 0);
  switch (o.op) {
    case "push":
    case "search":
    case "calls":
      return { op: o.op, value };
    case "pop":
    case "peek":
    case "overflow":
      return { op: o.op };
    default:
      return null;
  }
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
export function demoScript(d: SandboxDemo, structure: SandboxSpec["structure"] = "linked-list"): Script {
  if (structure === "stack") return stackDemoScript(d);
  if (structure === "queue") return queueDemoScript(d);
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

/** A stack demo as one script: its ops run in order on one stack, frames joined, the cost running on across them. */
function stackDemoScript(d: SandboxDemo): Script {
  if (d.view === "memory") return stackMemoryPicture(d.start) as Script;
  let stack = makeStack(d.start, { backing: d.backing === "linked" ? "list" : "array", capacity: d.capacity });
  const frames: Frame<unknown>[] = [];
  let base = 0;
  let costUnit = "steps";
  const results: string[] = [];
  for (const raw of d.ops || []) {
    const op = toStackOp(raw);
    if (!op) continue;
    const r = runStackOp(stack, op, { predict: d.predict });
    costUnit = r.script.costUnit;
    const reset = op.op === "calls" || op.op === "overflow";
    for (const f of r.script.frames) frames.push({ ...f, cost: reset ? f.cost : base + f.cost });
    if (!reset) base += r.script.frames[r.script.frames.length - 1]?.cost ?? 0;
    if (r.script.result) results.push(r.script.result);
    stack = r.stack;
  }
  return { view: "stack", title: d.title, costUnit, frames, result: results.join("; ") || undefined };
}

/** A queue demo as one script: its ops run in order on one queue, frames joined, the cost running on across them. */
function queueDemoScript(d: SandboxDemo): Script {
  if (d.view === "memory") return queueMemoryPicture(d.start) as Script;
  const backing = d.backing === "linked" || d.backing === "list" ? "list" : d.backing === "doubly" || d.doubly ? "doubly" : "ring";
  let queue = makeQueue(d.start, { backing, capacity: d.capacity, head: d.head });
  const frames: Frame<unknown>[] = [];
  let base = 0;
  let costUnit = "steps";
  let view = "queue" as "queue" | "stack";
  const results: string[] = [];
  for (const raw of d.ops || []) {
    const op = toQueueOp(raw);
    if (!op) continue;
    const r = runQueueOp(queue, op, { predict: d.predict });
    costUnit = r.script.costUnit;
    view = r.script.view as "queue";
    const reset = op.op === "window_max";
    for (const f of r.script.frames) frames.push({ ...f, cost: reset ? f.cost : base + f.cost });
    if (!reset) base += r.script.frames[r.script.frames.length - 1]?.cost ?? 0;
    if (r.script.result) results.push(r.script.result);
    queue = r.queue;
  }
  return { view, title: d.title, costUnit, frames, result: results.join("; ") || undefined };
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
