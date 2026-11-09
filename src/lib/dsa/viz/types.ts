/**
 * DSA Mastery's step engine: one model for every visual step-through on the site.
 *
 *   a Script   = a view id + frames; the StepPlayer (src/components/dsa/viz/StepPlayer.tsx) plays any script
 *   a Frame    = the structure's state at that step + a one-line narration + the running cost (+ optional
 *                predict-then-reveal question, code marker and variable table)
 *   a View     = a component that draws one kind of state (views.tsx): "list" (linked lists), "array",
 *                "memory" (array vs list in memory), "grid", "stack", "queue" (ring buffer, linked queue, deque, sliding-window maximum); later "tree", "heap", "graph"
 *   a Generator = a pure function (state, args) → frames: the sandbox's operations (list.ts) and the algorithm
 *                step-throughs (algorithms.ts: binary search, insertion sort, and any generated trace via fromTrace)
 *
 * Everything here is pure and dependency-free (no React), so generators are unit-testable and the server can build
 * scripts too. Structures and algorithms plug in by adding a state type, a generator and a view; the player, the
 * controls, the cost counter, narration, keyboard and screen-reader support come for free.
 */

export type NodeId = number;

/** The views the player can draw; a script names one. */
export type ViewId = "list" | "array" | "memory" | "grid" | "stack" | "queue";

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

/* ------------------------------------------------------------------ the stack state ("stack" view) */

export type StackItem = { id: NodeId; value: string };

export type StackState = {
  /** how the stack is stored: an array (cells, indexes), a linked list (nodes, next arrows) or the call stack (frames) */
  mode: "array" | "list" | "calls";
  /** the items from the bottom to the top, as drawn */
  items: StackItem[];
  /** an item in flight above the top: about to be pushed, or just popped */
  lifted: StackItem | null;
  /** array mode: cells drawn (the empty ones dashed above the items); null for the other modes */
  capacity: number | null;
  /** items lit this step */
  mark: NodeId[];
  /** items written or re-pointed this step: drawn in the accent */
  changed: NodeId[];
  /** named pointers on items: top (set by the view, not the generator), curr (a search cursor) */
  labels: Record<string, NodeId | null>;
  /** calls mode: the value a frame returns, shown on its right */
  ret: Record<NodeId, string>;
  /** memory addresses shown under items (the memory picture) */
  addrs: Record<NodeId, number>;
  /** a short result chip ("popped 7") */
  out: string | null;
};

/* ------------------------------------------------------------------ the queue state ("queue" view) */

export type QueueItem = { id: NodeId; value: string };

/** The sliding-window maximum with a monotonic deque: the stream, the window over it, the deque of indexes and the answers so far. */
export type WindowState = {
  stream: number[];
  /** the window's first and last index (it grows until it is k wide); null before the first value */
  window: [number, number] | null;
  /** the index of the value that has just arrived */
  cur: number | null;
  /** the deque's indexes, front to back (their values never go up from the front to the back) */
  deque: number[];
  /** the answers so far, one for each full window */
  results: number[];
  /** an index leaving the deque this step (from the back, or from the front because it slid out) */
  dropping: number | null;
  /** the window width k */
  k: number;
};

export type QueueState = {
  /** how it is drawn: a ring buffer (cells in a circle, head and tail), a linked list (nodes, front on the left) or the sliding-window maximum */
  mode: "ring" | "list" | "window";
  /** list mode: each node also keeps a prev link (a deque) */
  doubly: boolean;
  /** the items from the front to the back, as drawn */
  items: QueueItem[];
  /** ring mode: the item in each cell (null = a free cell); null for the other modes */
  cells: (QueueItem | null)[] | null;
  /** ring mode: the cell holding the front item, and the next free cell where the next item goes (the tail) */
  head: number;
  tail: number;
  /** an item in flight at one end: about to join, or just removed */
  lifted: QueueItem | null;
  /** the end it is at (list mode), and the cell it hovers over (ring mode) */
  liftAt: "front" | "back";
  liftCell: number | null;
  /** items lit this step */
  mark: NodeId[];
  /** items written or re-pointed this step: drawn in the accent */
  changed: NodeId[];
  /** a pointer that wrapped past the end of the ring this step ("head", "tail"): the return arrow is lit */
  wrapped: "head" | "tail" | null;
  /** named pointers on items: curr (a walk) */
  labels: Record<string, NodeId | null>;
  /** a short result chip ("dequeued 7") */
  out: string | null;
  /** ring mode: the block's start address (each cell shows base + 4 × its index); list mode: an address under each node */
  base: number | null;
  addrs: Record<NodeId, number>;
  /** window mode */
  win: WindowState | null;
};
