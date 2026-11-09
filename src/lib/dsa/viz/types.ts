/**
 * DSA Mastery's step engine: one model for every visual step-through on the site.
 *
 *   a Script   = a view id + frames; the StepPlayer (src/components/dsa/viz/StepPlayer.tsx) plays any script
 *   a Frame    = the structure's state at that step + a one-line narration + the running cost (+ optional
 *                predict-then-reveal question, code marker and variable table)
 *   a View     = a component that draws one kind of state (views.tsx): "list" (linked lists), "array",
 *                "memory" (array vs list in memory); later "stack", "queue", "tree", "heap", "graph"
 *   a Generator = a pure function (state, args) → frames: the sandbox's operations (list.ts) and the algorithm
 *                step-throughs (algorithms.ts: binary search, insertion sort, and any generated trace via fromTrace)
 *
 * Everything here is pure and dependency-free (no React), so generators are unit-testable and the server can build
 * scripts too. Structures and algorithms plug in by adding a state type, a generator and a view; the player, the
 * controls, the cost counter, narration, keyboard and screen-reader support come for free.
 */

export type NodeId = number;

/** The views the player can draw; a script names one. */
export type ViewId = "list" | "array" | "memory";

/** A predict-then-reveal question, asked before its frame is shown. */
export type VizAsk = { prompt: string; choices: { label: string; correct: boolean; why?: string }[] };

export type Frame<S> = {
  state: S;
  /** one plain sentence: what this step does (announced to screen readers) */
  note: string;
  /** the running cost after this step, in the script's unit (pointer hops, comparisons, shifts) */
  cost: number;
  /** the code step marker this frame follows, when the script follows a template ([1], [2], …) */
  marker?: number;
  /** variables to show in a small table (algorithms) */
  vars?: Record<string, unknown>;
  ask?: VizAsk | null;
};

export type Script<S = unknown> = {
  view: ViewId;
  title: string;
  /** the cost counter's unit, plural: "pointer hops", "comparisons", "shifts" */
  costUnit: string;
  frames: Frame<S>[];
  /** what the run produced, in words ("found 30 at position 2", "middle: 7") */
  result?: string;
};

/* ------------------------------------------------------------------ the linked-list state ("list" view) */

export type ListNodeState = { id: NodeId; value: number };

export type ListState = {
  nodes: ListNodeState[];
  /** node ids left to right, as drawn (the chain's order when it is whole; during a reverse, its original order) */
  order: NodeId[];
  next: Record<NodeId, NodeId | null>;
  /** doubly linked lists only */
  prev?: Record<NodeId, NodeId | null>;
  doubly: boolean;
  /** named pointers on nodes (head, tail, curr, prev, next, slow, fast, new); null = pointing at null */
  labels: Record<string, NodeId | null>;
  /** nodes lit this step */
  mark: NodeId[];
  /** links (from → its next) changed this step: drawn in the accent, with a draw-in */
  changed: NodeId[];
  /** a node being added or removed: drawn off the chain (above it) */
  detached: NodeId[];
};

/* ------------------------------------------------------------------ the array state ("array" view) */

export type ArrayState = {
  values: (number | string | null)[];
  /** named indexes under cells (i, lo, hi, mid) */
  pointers: Record<string, number>;
  mark: number[];
  /** cells that moved this step (shifts) */
  moved: number[];
  /** cells ruled out (binary search halves) */
  dim: number[];
  /** a highlighted range [l, r] */
  range?: [number, number] | null;
};

/* ------------------------------------------------------------------ the memory picture ("memory" view) */

export type MemoryState = {
  /** the array: one block, value i at base + 4i */
  array: { base: number; values: number[]; show: boolean; lit: number | null };
  /** the list: nodes anywhere in memory, each holding its value and the next node's address */
  list: { nodes: { value: number; addr: number }[]; show: boolean; lit: number | null; showLinks: boolean; head: boolean };
};
