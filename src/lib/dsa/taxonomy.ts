/**
 * The problem taxonomy: how a problem's pattern tags (tags.patterns in problem.md, `pattern:` in the curriculum) and
 * its module become the three filter groups on /dsa/problems:
 *   structures  the data structure it is about (Array, Linked list, Heap ...)
 *   algorithms  the algorithm family (Sorting, Dynamic programming ...)
 *   patterns    the named technique (Two pointers, Sliding window, Top-K ...)
 * A problem's facets are the union over its pattern tags, plus its module's topic (a problem homed in the trees module
 * is "Tree / BST" even when its tag is only tree-recursion).
 *
 * FOR CONTENT AUTHORS: a problem.md can name its own facets in the front matter, inside `tags`:
 *     tags: { patterns: [hashing], structures: [heap], algorithms: ["+greedy"] }
 *   - a plain list REPLACES what the tags would give for that group (structures: [heap] means Heap and nothing else);
 *   - a value starting with "+" ADDS to the derived list (algorithms: ["+greedy"] keeps the derived ones and adds Greedy).
 *   Use the ids or labels below (heap, "Hash map / set", dynamic-programming ...). A value that is not in the lists is
 *   ignored, and reported in development only. Pattern tags this file does not know are ignored the same way.
 *
 * Pure and import-free, so the page, the client filter and the unit tests all share it.
 */

export type FacetKind = "structures" | "algorithms" | "patterns";
export type Facet = { id: string; label: string };

export const STRUCTURES: Facet[] = [
  { id: "array", label: "Array" },
  { id: "string", label: "String" },
  { id: "hash", label: "Hash map / set" },
  { id: "linked-list", label: "Linked list" },
  { id: "stack", label: "Stack" },
  { id: "queue", label: "Queue / deque" },
  { id: "tree", label: "Tree / BST" },
  { id: "heap", label: "Heap" },
  { id: "graph", label: "Graph" },
  { id: "trie", label: "Trie" },
  { id: "matrix", label: "Matrix / grid" },
  { id: "interval", label: "Interval" },
  { id: "segment-tree", label: "Segment tree" },
];

export const ALGORITHMS: Facet[] = [
  { id: "sorting", label: "Sorting" },
  { id: "binary-search", label: "Binary search" },
  { id: "recursion", label: "Recursion" },
  { id: "backtracking", label: "Backtracking" },
  { id: "bfs", label: "BFS" },
  { id: "dfs", label: "DFS" },
  { id: "shortest-paths", label: "Shortest paths" },
  { id: "topological-sort", label: "Topological sort" },
  { id: "union-find", label: "Union-find" },
  { id: "greedy", label: "Greedy" },
  { id: "dynamic-programming", label: "Dynamic programming" },
  { id: "bit-manipulation", label: "Bit manipulation" },
  { id: "maths", label: "Maths / number theory" },
  { id: "string-algorithms", label: "String algorithms" },
  { id: "prefix-sums", label: "Prefix sums" },
];

export const PATTERNS: Facet[] = [
  { id: "two-pointers", label: "Two pointers" },
  { id: "sliding-window", label: "Sliding window" },
  { id: "monotonic-stack", label: "Monotonic stack / deque" },
  { id: "top-k", label: "Top-K" },
  { id: "k-sum", label: "K-sum" },
  { id: "merge-sorted", label: "Merge sorted" },
  { id: "fast-slow", label: "Fast & slow" },
  { id: "kadane", label: "Kadane" },
  { id: "partition", label: "Partitioning" },
  { id: "cycle-detection", label: "Cycle detection" },
  { id: "divide-and-conquer", label: "Divide and conquer" },
  { id: "binary-search-answer", label: "Binary search on the answer" },
  { id: "difference-array", label: "Difference array" },
  { id: "linear-scan", label: "Linear scan" },
  { id: "design", label: "Design a structure" },
];

export const FACETS: Record<FacetKind, Facet[]> = { structures: STRUCTURES, algorithms: ALGORITHMS, patterns: PATTERNS };

type Map3 = { s?: string[]; a?: string[]; p?: string[] };

/** pattern tag to its facets */
export const PATTERN_MAP: Record<string, Map3> = {
  hashing: { s: ["hash"] },
  "prefix-sum-hashmap": { s: ["hash", "array"], a: ["prefix-sums"] },
  "prefix-sums": { s: ["array"], a: ["prefix-sums"] },
  "difference-array": { s: ["array"], a: ["prefix-sums"], p: ["difference-array"] },
  dp: { a: ["dynamic-programming"] },
  "dp-bitmask": { a: ["dynamic-programming", "bit-manipulation"] },
  "dp-tree": { s: ["tree"], a: ["dynamic-programming"] },
  knapsack: { a: ["dynamic-programming"] },
  sorting: { a: ["sorting"] },
  "binary-search": { a: ["binary-search"] },
  "binary-search-answer": { a: ["binary-search"], p: ["binary-search-answer"] },
  "tree-recursion": { s: ["tree"], a: ["recursion"] },
  tree: { s: ["tree"] },
  greedy: { a: ["greedy"] },
  dfs: { s: ["graph"], a: ["dfs"] },
  bfs: { s: ["graph"], a: ["bfs"] },
  "grid-bfs": { s: ["matrix"], a: ["bfs"] },
  traversal: { s: ["array"], p: ["linear-scan"] },
  intervals: { s: ["interval"], a: ["sorting"] },
  heaps: { s: ["heap"] },
  "linked-lists": { s: ["linked-list"] },
  backtracking: { a: ["backtracking", "recursion"] },
  "union-find": { s: ["graph"], a: ["union-find"] },
  "topological-sort": { s: ["graph"], a: ["topological-sort"] },
  "cycle-detection": { s: ["graph"], p: ["cycle-detection"] },
  strings: { s: ["string"] },
  "string-algorithms": { s: ["string"], a: ["string-algorithms"] },
  stacks: { s: ["stack"] },
  queues: { s: ["queue"] },
  "monotonic-stack": { s: ["stack", "array"], p: ["monotonic-stack"] },
  "monotonic-deque": { s: ["queue", "array"], p: ["monotonic-stack"] },
  "bit-manipulation": { a: ["bit-manipulation"] },
  "shortest-paths": { s: ["graph"], a: ["shortest-paths"] },
  dijkstra: { s: ["graph", "heap"], a: ["shortest-paths"] },
  mst: { s: ["graph"], a: ["greedy", "union-find"] },
  graph: { s: ["graph"] },
  trie: { s: ["trie", "string"] },
  "number-theory": { a: ["maths"] },
  math: { a: ["maths"] },
  combinatorics: { a: ["maths"] },
  geometry: { a: ["maths"] },
  "game-theory": { a: ["maths"] },
  matrix: { s: ["matrix", "array"] },
  "segment-tree": { s: ["segment-tree"] },
  "fenwick-tree": { s: ["segment-tree"] },
  sqrt: { s: ["array"], a: ["maths"] },
  recursion: { a: ["recursion"] },
  "divide-and-conquer": { a: ["recursion"], p: ["divide-and-conquer"] },
  "two-pointers": { s: ["array"], p: ["two-pointers"] },
  "read-write-pointers": { s: ["array"], p: ["two-pointers"] },
  "opposite-ends": { s: ["array"], p: ["two-pointers"] },
  "fast-slow": { s: ["linked-list"], p: ["fast-slow", "two-pointers"] },
  "sliding-window-fixed": { s: ["array"], p: ["sliding-window"] },
  "sliding-window-variable": { s: ["array"], p: ["sliding-window"] },
  "window-counts": { s: ["hash"], p: ["sliding-window"] },
  "at-most-k": { p: ["sliding-window"] },
  "minimum-cover": { s: ["string", "hash"], p: ["sliding-window"] },
  "merge-sorted": { s: ["array"], a: ["sorting"], p: ["merge-sorted"] },
  "k-way-merge": { s: ["heap"], p: ["merge-sorted", "top-k"] },
  "k-sum": { s: ["array"], a: ["sorting"], p: ["k-sum", "two-pointers"] },
  "top-k": { s: ["heap"], p: ["top-k"] },
  "three-way-partition": { s: ["array"], p: ["partition", "two-pointers"] },
  kadane: { s: ["array"], a: ["dynamic-programming"], p: ["kadane"] },
  lru: { s: ["hash", "linked-list"], p: ["design"] },
  design: { p: ["design"] },
  // generic tags that name no structure or algorithm: known, so they are not reported as unknown
  complexity: {},
  implementation: {},
  constructive: {},
};

/** module id to its topic (the problem's home). Modules not listed (camps, company packs) add nothing. */
export const MODULE_MAP: Record<string, Map3> = {
  "m2-arrays-strings": { s: ["array", "string"] },
  "m3-hashing": { s: ["hash"] },
  "m4-two-pointers": { s: ["array"], p: ["two-pointers"] },
  "m5-sliding-window": { s: ["array"], p: ["sliding-window"] },
  "m6-recursion": { a: ["recursion"] },
  "m7-sorting": { a: ["sorting"] },
  "m8-binary-search": { a: ["binary-search"] },
  "s1-linked-lists": { s: ["linked-list"] },
  "s2-stacks": { s: ["stack"] },
  "s3-queues-and-deques": { s: ["queue"] },
  "s4-trees-and-bst": { s: ["tree"] },
  "s5-heaps": { s: ["heap"] },
  "s6-graphs": { s: ["graph"] },
  "s7-tries": { s: ["trie"] },
  "a1-graph-traversal": { s: ["graph"], a: ["bfs", "dfs"] },
  "a2-shortest-paths": { s: ["graph"], a: ["shortest-paths"] },
  "a3-topological-sort": { s: ["graph"], a: ["topological-sort"] },
  "a4-union-find": { a: ["union-find"] },
  "a5-greedy": { a: ["greedy"] },
  "a6-dynamic-programming": { a: ["dynamic-programming"] },
  "a7-string-basics": { s: ["string"], a: ["string-algorithms"] },
  "a8-bits-and-maths": { a: ["bit-manipulation", "maths"] },
  "a9-range-queries": { s: ["segment-tree"], a: ["prefix-sums"] },
  "d1-arrays-hashing": { s: ["array", "hash"] },
  "d2-two-pointers-windows": { s: ["array"], p: ["two-pointers", "sliding-window"] },
  "d3-sorting-intervals": { s: ["interval"], a: ["sorting"] },
  "d4-binary-search": { a: ["binary-search"] },
  "d5-linked-lists": { s: ["linked-list"] },
  "d6-stacks-queues": { s: ["stack", "queue"] },
  "d7-monotonic": { s: ["stack"], p: ["monotonic-stack"] },
  "d8-trees-i": { s: ["tree"] },
  "d9-trees-ii": { s: ["tree"] },
  "d10-heaps": { s: ["heap"] },
  "d11-graphs-i": { s: ["graph"] },
  "d12-graphs-ii": { s: ["graph"] },
  "d13-shortest-paths": { s: ["graph"], a: ["shortest-paths"] },
  "d14-union-find-mst": { s: ["graph"], a: ["union-find"] },
  "d15-backtracking": { a: ["backtracking"] },
  "d16-greedy": { a: ["greedy"] },
  "d17-dp": { a: ["dynamic-programming"] },
};

const ALL: Record<FacetKind, Set<string>> = {
  structures: new Set(STRUCTURES.map((f) => f.id)),
  algorithms: new Set(ALGORITHMS.map((f) => f.id)),
  patterns: new Set(PATTERNS.map((f) => f.id)),
};

const slug = (s: string) => s.trim().toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// ids, labels and a few loose spellings an author may type, all to the id
const ALIAS: Record<FacetKind, Record<string, string>> = { structures: {}, algorithms: {}, patterns: {} };
for (const k of Object.keys(FACETS) as FacetKind[]) {
  for (const f of FACETS[k]) {
    ALIAS[k][slug(f.id)] = f.id;
    ALIAS[k][slug(f.label)] = f.id;
  }
}
Object.assign(ALIAS.structures, { "hash-map": "hash", "hash-set": "hash", hashmap: "hash", "linked-lists": "linked-list", stacks: "stack", queues: "queue", heaps: "heap", trees: "tree", bst: "tree", grid: "matrix", intervals: "interval", strings: "string", arrays: "array", graphs: "graph" });
Object.assign(ALIAS.algorithms, { dp: "dynamic-programming", math: "maths", "number-theory": "maths", bits: "bit-manipulation" });

const warned = new Set<string>();
/** unknown tags are never an error; in development each is logged once */
function warn(what: string) {
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "development" && !warned.has(what)) {
    warned.add(what);
    console.warn(`[dsa taxonomy] ${what}`);
  }
}

export type ProblemFacets = { structures: string[]; algorithms: string[]; patterns: string[]; unknown: string[] };

function pick(into: Set<string>, kind: FacetKind, ids?: string[]) {
  for (const id of ids || []) if (ALL[kind].has(id)) into.add(id);
}

/** The author's explicit list for a group: null when absent; `replace` holds the plain values, `add` the "+x" ones. */
function explicit(kind: FacetKind, raw: unknown, unknown: string[]): { replace: string[]; add: string[] } | null {
  if (!Array.isArray(raw)) return null;
  const out = { replace: [] as string[], add: [] as string[] };
  for (const v of raw) {
    if (typeof v !== "string" || !v.trim()) continue;
    const plus = v.trim().startsWith("+");
    const id = ALIAS[kind][slug(plus ? v.trim().slice(1) : v)];
    if (!id) {
      unknown.push(`${kind}:${v}`);
      warn(`unknown ${kind} value "${v}"`);
      continue;
    }
    (plus ? out.add : out.replace).push(id);
  }
  return out;
}

/** The facets of a problem: its tags' union plus its module's topic, then its own tags.structures / tags.algorithms. */
export function facetsOf(p: { patterns?: string[]; module?: string; structures?: unknown; algorithms?: unknown }): ProblemFacets {
  const sets: Record<FacetKind, Set<string>> = { structures: new Set(), algorithms: new Set(), patterns: new Set() };
  const unknown: string[] = [];
  for (const tag of p.patterns || []) {
    const m = PATTERN_MAP[tag];
    if (!m) {
      unknown.push(tag);
      warn(`unknown pattern tag "${tag}"`);
      continue;
    }
    pick(sets.structures, "structures", m.s);
    pick(sets.algorithms, "algorithms", m.a);
    pick(sets.patterns, "patterns", m.p);
  }
  const mod = MODULE_MAP[p.module || ""];
  if (mod) {
    pick(sets.structures, "structures", mod.s);
    pick(sets.algorithms, "algorithms", mod.a);
    pick(sets.patterns, "patterns", mod.p);
  }
  for (const [kind, raw] of [["structures", p.structures], ["algorithms", p.algorithms]] as const) {
    const e = explicit(kind, raw, unknown);
    if (!e) continue;
    if (e.replace.length) sets[kind] = new Set(e.replace);
    for (const id of e.add) sets[kind].add(id);
  }
  const order = (kind: FacetKind) => FACETS[kind].map((f) => f.id).filter((id) => sets[kind].has(id));
  return { structures: order("structures"), algorithms: order("algorithms"), patterns: order("patterns"), unknown };
}

export const facetLabel = (kind: FacetKind, id: string): string => FACETS[kind].find((f) => f.id === id)?.label || id;
