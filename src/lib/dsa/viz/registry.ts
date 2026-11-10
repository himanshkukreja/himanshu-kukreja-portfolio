/**
 * What each structure's sandbox can do, and how a lesson's scripted demos (`::viz[id]`, from sandbox.yml `demos:`) turn
 * into scripts. Mirrors the content checker's SANDBOX_STRUCTURES (dsa-mastery tools/lib/check/structure.mjs): a new
 * structure adds its ops here, a generator file, and a view (src/components/dsa/viz/views.tsx).
 */
import { LIST_OPS, makeList, runListOp, type ListOp, type ListOpName } from "./list";
import { memoryPicture } from "./memory";
import { makeQueue, queueMemoryPicture, runQueueOp, QUEUE_OPS, type QueueOp, type QueueOpName } from "./queue";
import { makeStack, runStackOp, stackMemoryPicture, STACK_OPS, type StackOp, type StackOpName } from "./stack";
import { makeTree, runTreeOp, treeMemoryPicture, TREE_OPS, type TreeOp, type TreeOpName } from "./tree";
import { heapMemoryPicture, HEAP_OPS, makeHeap, rawHeap, runHeapOp, type HeapOp, type HeapOpName } from "./heap";
import { GRAPH_OPS, graphMemoryPicture, makeGraph, runGraphOp, verticesFor, type GraphOp, type GraphOpName } from "./graph";
import type { Frame, Script } from "./types";
import { makeTrie, runTrieOp, trieMemoryPicture, TRIE_OPS, type TrieOp, type TrieOpName } from "./trie";
import { gridSearch, parseGrid } from "./grid";
import { pathScript, type PathAlgo, type PathEdge } from "./shortest";

export type SandboxDemo = {
  id: string;
  title: string;
  view?: "list" | "memory";
  start: number[];
  /** a linked-list demo's operations, or (stack sandboxes) a stack's */
  ops?: ({ op: ListOpName | StackOpName | QueueOpName | TreeOpName | HeapOpName | GraphOpName | TrieOpName; value?: number; index?: number; weight?: number; word?: string })[];
  /** trie demos: the words stored at the start (`start` is []) */
  words?: string[];
  /** graph demos: `start` is a flat list of edge ends (u, v, u, v, ...; u, v, weight when weighted), the vertex count (default: the highest end + 1), and whether the edges are directed */
  vertices?: number;
  directed?: boolean;
  weighted?: boolean;
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
  structure: "linked-list" | "stack" | "queue" | "tree" | "heap" | "graph" | "trie";
  /** trie sandboxes: the words stored at the start (`start` is []) */
  words?: string[];
  title: string;
  start: number[];
  operations: (ListOpName | StackOpName | QueueOpName | TreeOpName | HeapOpName | GraphOpName | TrieOpName)[];
  variants: ("singly" | "doubly" | "array" | "linked" | "ring" | "bst" | "min" | "max" | "undirected" | "directed" | "words")[];
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
  tree: { ops: TREE_OPS, variants: ["bst"] as const, demoViews: ["tree", "memory"] as const },
  heap: { ops: HEAP_OPS, variants: ["min", "max"] as const, demoViews: ["heap", "memory"] as const },
  trie: { ops: TRIE_OPS, variants: ["words"] as const, demoViews: ["trie", "memory"] as const },
  graph: { ops: GRAPH_OPS, variants: ["undirected", "directed"] as const, demoViews: ["graph", "memory"] as const },
};

const toTreeOp = (o: NonNullable<SandboxDemo["ops"]>[number]): TreeOp | null => {
  const value = Number(o.value ?? 0);
  switch (o.op) {
    case "insert":
    case "search":
    case "delete":
      return { op: o.op, value };
    case "preorder":
    case "inorder":
    case "postorder":
    case "levelorder":
      return { op: o.op };
    default:
      return null;
  }
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
  if (structure === "tree") return treeDemoScript(d);
  if (structure === "heap") return heapDemoScript(d);
  if (structure === "graph") return graphDemoScript(d);
  if (structure === "trie") return trieDemoScript(d);
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

/** A tree demo as one script: its start values are inserted in order into an empty search tree, then its ops run in order, the cost running on across them. */
function treeDemoScript(d: SandboxDemo): Script {
  if (d.view === "memory") return treeMemoryPicture(d.start) as Script;
  let tree = makeTree(d.start);
  const frames: Frame<unknown>[] = [];
  let base = 0;
  const results: string[] = [];
  for (const raw of d.ops || []) {
    const op = toTreeOp(raw);
    if (!op) continue;
    const r = runTreeOp(tree, op, { predict: d.predict });
    for (const f of r.script.frames) frames.push({ ...f, cost: base + f.cost });
    base += r.script.frames[r.script.frames.length - 1]?.cost ?? 0;
    if (r.script.result) results.push(r.script.result);
    tree = r.tree;
  }
  return { view: "tree", title: d.title, costUnit: "steps", frames, result: results.join("; ") || undefined };
}

/**
 * A heap demo as one script: its start values are pushed in order into an empty min-heap, then its ops run in order, the cost
 * running on across them. With a `heapify` op the start values are laid out as given instead, and with `topk` they are the stream.
 */
function heapDemoScript(d: SandboxDemo): Script {
  if (d.view === "memory") return heapMemoryPicture(d.start) as Script;
  const first = (d.ops || [])[0]?.op;
  let heap = first === "heapify" || first === "topk" ? rawHeap(d.start) : makeHeap(d.start);
  const frames: Frame<unknown>[] = [];
  let base = 0;
  const results: string[] = [];
  for (const raw of d.ops || []) {
    const op: HeapOp | null = raw.op === "push" ? { op: "push", value: Number(raw.value ?? 0) } : raw.op === "topk" ? { op: "topk", value: Number(raw.value ?? 3) } : raw.op === "pop" || raw.op === "peek" || raw.op === "heapify" ? { op: raw.op } : null;
    if (!op) continue;
    const r = runHeapOp(heap, op, { predict: d.predict });
    for (const f of r.script.frames) frames.push({ ...f, cost: base + f.cost });
    base += r.script.frames[r.script.frames.length - 1]?.cost ?? 0;
    if (r.script.result) results.push(r.script.result);
    heap = r.heap;
  }
  return { view: "heap", title: d.title, costUnit: "steps", frames, result: results.join("; ") || undefined };
}

/** A trie demo as one script: its words make the trie, then its ops run in order (an op's `word` is the word or prefix). */
function trieDemoScript(d: SandboxDemo): Script {
  let trie = makeTrie(d.words ?? []);
  if (d.view === "memory") return trieMemoryPicture(trie) as Script;
  const frames: Frame<unknown>[] = [];
  let base = 0;
  const results: string[] = [];
  for (const raw of d.ops || []) {
    if (!raw.word || !(TRIE_OPS as string[]).includes(raw.op)) continue;
    const r = runTrieOp(trie, { op: raw.op, word: raw.word } as TrieOp, { predict: d.predict });
    for (const f of r.script.frames) frames.push({ ...f, cost: base + f.cost });
    base += r.script.frames[r.script.frames.length - 1]?.cost ?? 0;
    if (r.script.result) results.push(r.script.result);
    trie = r.trie;
  }
  return { view: "trie", title: d.title, costUnit: "letters", frames, result: results.join("; ") || undefined };
}

/**
 * A graph demo as one script: its start edges make the graph, then its ops run in order, the cost running on across them. The
 * op's `value` is the first vertex, `index` the second (and `weight` the weight of an added edge).
 */
function graphDemoScript(d: SandboxDemo): Script {
  let graph = makeGraph(d.vertices ?? verticesFor(d.start, d.weighted), d.start, { directed: d.directed, weighted: d.weighted });
  if (d.view === "memory") return graphMemoryPicture(graph) as Script;
  const frames: Frame<unknown>[] = [];
  let base = 0;
  const results: string[] = [];
  for (const raw of d.ops || []) {
    const u = Number(raw.value ?? 0);
    const v = Number(raw.index ?? 0);
    const op: GraphOp | null = raw.op === "add_edge" ? { op: "add_edge", u, v, w: raw.weight } : raw.op === "remove_edge" || raw.op === "has_edge" ? { op: raw.op, u, v } : raw.op === "neighbors" || raw.op === "degree" ? { op: raw.op, u } : null;
    if (!op) continue;
    const r = runGraphOp(graph, op, { predict: d.predict });
    for (const f of r.script.frames) frames.push({ ...f, cost: base + f.cost });
    base += r.script.frames[r.script.frames.length - 1]?.cost ?? 0;
    if (r.script.result) results.push(r.script.result);
    graph = r.graph;
  }
  return { view: "graph", title: d.title, costUnit: "reads", frames, result: results.join("; ") || undefined };
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
export type GridVisualizerSpec = {
  id: string;
  view: "grid";
  title: string;
  algorithms: ("bfs" | "dfs")[];
  cost: string;
  limits: { rows: [number, number]; cols: [number, number] };
  presets: GridPreset[];
  demos: GridDemo[];
};

/** A weighted directed map for the shortest-path visualizer (A2): `n` vertices on a ring and [from, to, cost] edges. */
export type PathPreset = { id: string; title: string; note?: string; n: number; edges: PathEdge[]; source: number; target?: number };
export type PathDemo = {
  id: string;
  title: string;
  algorithm: PathAlgo;
  /** a preset id from the visualizer, or the map itself */
  preset?: string;
  n?: number;
  edges?: PathEdge[];
  source?: number;
  target?: number;
  predict?: boolean;
};
export type PathVisualizerSpec = {
  id: string;
  view: "graph";
  title: string;
  algorithms: PathAlgo[];
  cost: string;
  limits: { vertices: [number, number]; weights: [number, number] };
  presets: PathPreset[];
  demos: PathDemo[];
};
export type VisualizerSpec = GridVisualizerSpec | PathVisualizerSpec;

export const VISUALIZER_VIEWS = { grid: { algorithms: ["bfs", "dfs"] as const }, graph: { algorithms: ["dijkstra", "bellman-ford", "kahn", "dsu"] as const } };

export const isPathDemo = (d: SandboxDemo | GridDemo | PathDemo): d is PathDemo => "algorithm" in d && (d.algorithm === "dijkstra" || d.algorithm === "bellman-ford" || d.algorithm === "kahn" || d.algorithm === "dsu");
export const isGridDemo = (d: SandboxDemo | GridDemo | PathDemo): d is GridDemo => "algorithm" in d && (d.algorithm === "bfs" || d.algorithm === "dfs");

export function pathDemoScript(d: PathDemo): Script {
  const n = d.n ?? 0;
  if (!d.edges || n < 2) return { view: "array", title: d.title, costUnit: "steps", frames: [{ state: { values: [], pointers: {}, mark: [], moved: [], dim: [] }, note: "No map.", cost: 0 }] };
  return pathScript(d.algorithm, { n, edges: d.edges }, d.source ?? 0, d.target ?? null, { predict: d.predict, title: d.title }) as Script;
}

export function gridDemoScript(d: GridDemo, presets: GridPreset[] = []): Script {
  const rows = d.grid || presets.find((p) => p.id === d.preset)?.grid || [];
  const { grid, error } = parseGrid(rows);
  if (!grid) return { view: "array", title: d.title, costUnit: "steps", frames: [{ state: { values: [], pointers: {}, mark: [], moved: [], dim: [] }, note: error || "No grid.", cost: 0 }] };
  return gridSearch(d.algorithm, grid, { predict: d.predict, title: d.title, useGoal: d.goal !== false }) as Script;
}
