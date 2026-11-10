/**
 * DSA Mastery's step engine: one model for every visual step-through on the site.
 *
 *   a Script   = a view id + frames; the StepPlayer (src/components/dsa/viz/StepPlayer.tsx) plays any script
 *   a Frame    = the structure's state at that step + a one-line narration + the running cost (+ optional
 *                predict-then-reveal question, code marker and variable table)
 *   a View     = a component that draws one kind of state (views.tsx): "list" (linked lists), "array",
 *                "memory" (array vs list in memory), "grid", "stack", "queue" (ring buffer, linked queue, deque, sliding-window maximum), "tree" (binary search tree: nodes, links, a highlighted path, the four walks); "heap" (a binary heap in an array, drawn as a tree and as the array); "graph" (a graph drawn as vertices and edges, with its adjacency list and matrix)
 *   a Generator = a pure function (state, args) → frames: the sandbox's operations (list.ts) and the algorithm
 *                step-throughs (algorithms.ts: binary search, insertion sort, and any generated trace via fromTrace)
 *
 * Everything here is pure and dependency-free (no React), so generators are unit-testable and the server can build
 * scripts too. Structures and algorithms plug in by adding a state type, a generator and a view; the player, the
 * controls, the cost counter, narration, keyboard and screen-reader support come for free.
 */

export type NodeId = number;

/** The views the player can draw; a script names one. */
export type ViewId = "list" | "array" | "memory" | "grid" | "stack" | "queue" | "tree" | "heap" | "graph" | "trie" | "intervals";

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

/* ------------------------------------------------------------------ the tree state ("tree" view) */

export type TreeNodeState = { id: NodeId; value: string; left: NodeId | null; right: NodeId | null };

/**
 * A binary tree (a search tree) as drawn: nodes joined by links, laid out by in-order position across and depth down. A
 * step lights the path walked so far, the node being looked at, a node found or just linked in, and a walk's output so
 * far. A value in flight (about to be inserted) hovers above the root.
 */
export type TreeState = {
  /** the nodes in the tree this step, with their links */
  nodes: TreeNodeState[];
  root: NodeId | null;
  /** the ids walked so far (root down): the path is drawn in the accent */
  path: NodeId[];
  /** the node being looked at */
  current: NodeId | null;
  /** a node that was found, or has just been linked in */
  found: NodeId | null;
  /** nodes lit this step */
  mark: NodeId[];
  /** nodes whose links changed this step: drawn with a heavy accent outline */
  changed: NodeId[];
  /** a value in flight above the root: about to be inserted */
  lifted: { id: NodeId; value: string } | null;
  /** named pills beside nodes (root, parent, child, subtree, ...) */
  labels: Record<string, NodeId | null>;
  /** a walk's output so far: a title and the values in the order visited; null = no output row */
  seq: { title: string; values: string[] } | null;
  /** a short result chip ("found 50") */
  out: string | null;
  /** number the levels down the left side (the lecture's vocabulary scene) */
  levels: boolean;
  /** an address under each node (the memory picture), with a null stub under each missing child */
  addrs: Record<NodeId, number>;
};

/* ------------------------------------------------------------------ the heap state ("heap" view) */

/**
 * A binary heap as drawn: its array (index 0 first), shown as a complete tree and as a row of cells under it. A step lights
 * the two cells being compared, the two just swapped, the cell being worked on, and the path an item has climbed or sunk.
 */
export type HeapState = {
  /** the heap's array, cell by cell */
  values: string[];
  /** the two indexes being compared this step */
  compare: [number, number] | null;
  /** the two indexes just swapped this step */
  swap: [number, number] | null;
  /** the cell being worked on */
  current: number | null;
  /** cells lit this step */
  mark: number[];
  /** indexes along the path walked (parent to child, ascending) */
  path: number[];
  /** named pills beside cells (parent, left, right, ...) */
  labels: Record<string, number | null>;
  /** a short result chip ("5 on top") */
  out: string | null;
  /** write each cell's index under it */
  indexes: boolean;
  /** what to draw: the tree and the array (default), only the tree, or only the array */
  show: "both" | "tree" | "array";
  /** a min-heap (default) or a max-heap: names the picture */
  kind: "min" | "max";
};

/* ------------------------------------------------------------------ the graph state ("graph" view) */

/**
 * A graph as drawn: n vertices numbered 0 to n - 1 on a ring, the edges between them, and (by `show`) the adjacency list and
 * the adjacency matrix built from the same edges. A step lights the vertex being worked on (its list row and matrix row),
 * the edge being added, removed or checked (one entry in a list row, one matrix cell, or two when the graph is undirected),
 * and the vertices walked so far.
 */
export type GraphState = {
  n: number;
  /** each edge once, as it was added: a to b (both ways when the graph is undirected), with a weight or null */
  edges: { a: number; b: number; w: number | null }[];
  directed: boolean;
  /** the vertex being worked on */
  current: number | null;
  /** vertices lit this step */
  mark: number[];
  /** vertices walked so far, in order */
  path: number[];
  /** the edge added, removed, read or checked this step: [from, to] */
  edge: [number, number] | null;
  /** named pills beside vertices */
  labels: Record<string, number | null>;
  /** a short result chip ("degree 3") */
  out: string | null;
  /** what to draw: the graph alone, the list alone, the matrix alone, the graph and its list (default), or all three */
  show: "graph" | "list" | "matrix" | "both" | "all";
  /** shortest-path runs (Academy Part 3, A2): each vertex's best known distance (null: not reached yet), drawn as a distance table beside the graph */
  dist?: (number | null)[];
  /** the vertices whose distance is final */
  done?: number[];
  /** Dijkstra's waiting heap, smallest first: (distance, vertex), with a third item of 1 when the entry is stale */
  heap?: [number, number, number?][];
  /** topological sort runs (A3): each vertex's in-degree (edges still pointing at it), drawn as a table beside the graph */
  indeg?: number[];
  /** Kahn's ready queue, front first */
  ready?: number[];
  /** the order built so far */
  topo?: number[];
  /** vertices stuck in a cycle: drawn in the warning colour */
  stuck?: number[];
  /** union-find runs (A4): each vertex's parent (a root is its own parent). The graph view then draws the trees of the forest instead of a ring, and a table of parents and sizes beside them */
  parent?: number[];
  /** each group's size, read at its root (the number at an item that is not a root is out of date, so the table leaves it out) */
  size?: number[];
};

/* ------------------------------------------------------------------ the trie state ("trie" view) */

/**
 * A trie as drawn: the words it stores as a tree of letters. A node is named by its prefix ("" is the root); an edge is the
 * letter that leads to it; a node that ends a word carries an end marker. A step lights the path walked so far (root down), the
 * node being looked at, the nodes just created, the end marker in focus, and (for a prefix question) the nodes below the prefix.
 */
export type TrieState = {
  /** the stored words (each one is an end-of-word node) */
  words: string[];
  /** a word being inserted: its prefixes are drawn as nodes, but without an end marker until it is finished */
  grow: string;
  /** the prefix walked so far: that path is drawn in the accent */
  walk: string;
  /** the node being looked at (a prefix) */
  current: string | null;
  /** nodes created this insert (prefixes): heavy outline */
  fresh: string[];
  /** nodes lit this step (prefixes) */
  lit: string[];
  /** the end marker in focus (a prefix of a stored word) */
  endAt: string | null;
  /** a short result chip ("yes") */
  out: string | null;
};

/* ------------------------------------------------------------------ the intervals state ("intervals" view) */

/**
 * Greedy choices (A5): talks as bars on an hour axis. `spans` are [start, end] in whole hours (talk 0 is A, talk 1 is B, ...). The
 * talks a rule has taken are filled, the talks it skipped are crossed out, `current` is the talk being looked at, `lit` are talks in
 * focus, and `lastEnd` draws a line at the end of the last talk taken (earliest finish keeps it; the other rules do not).
 */
export type IntervalsState = {
  spans: [number, number][];
  picked: number[];
  skipped: number[];
  lit: number[];
  current: number | null;
  lastEnd: number | null;
  out: string | null;
};
