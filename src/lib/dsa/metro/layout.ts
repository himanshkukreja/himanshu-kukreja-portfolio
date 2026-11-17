/**
 * The metro map's hand-authored layout (redesign, 17 Nov 2026, boards 16 and 19). Coordinates are on a grid in a
 * 1260 x 590 viewBox; the SVG scales to its width. Lines are the course parts, stations are the parts' modules (topics),
 * keyed by the academy region id so a renamed title never breaks the map. An interchange is a station that sits on a
 * second line (`also`). Pure data, import-free: node --test checks it against the real outline
 * (scripts/tests/dsa-metro.test.mjs): every station is a real topic and every topic has a station.
 */
export type LineId = "toolkit" | "ds" | "algo" | "pat";
/** where the station's label goes: above, below, left or right of the dot */
export type Side = "a" | "b" | "l" | "r";

/** Draw and legend order. `token` is the CSS custom property (globals.css) that holds the line's colour in each theme. */
export const LINE_ORDER: LineId[] = ["toolkit", "ds", "pat", "algo"];
export const LINE_TOKEN: Record<LineId, string> = { toolkit: "--c-m-toolkit", ds: "--c-m-ds", algo: "--c-m-algo", pat: "--c-m-pat" };
/** The part (academy.yml) each line is. A part not listed takes the next free line by its order. */
export const LINE_OF_PART: Record<string, LineId> = { "part-1": "toolkit", "part-2": "ds", "part-3": "algo", "part-4": "pat" };
/** Plain-language names for the tags and tooltips when the outline has not loaded (the real part titles win). */
export const LINE_NAME: Record<LineId, string> = { toolkit: "Toolkit", ds: "Data structures", algo: "Algorithms", pat: "Patterns" };

export const VIEW = { w: 1260, h: 590 };

export type StationSpec = {
  /** academy region id (a module) */
  id: string;
  /** the short name on the map */
  label: string;
  x: number;
  y: number;
  side: Side;
  /** second line(s) this station is on: it is an interchange */
  also?: LineId[];
  /** one plain sentence for the tooltip and the station card */
  note?: string;
};

export const STATIONS: StationSpec[] = [
  // Toolkit line, then the Data structures main line along the top
  { id: "m0-toolkit", label: "Toolkit", x: 60, y: 100, side: "a" },
  { id: "m1-complexity", label: "Complexity", x: 165, y: 100, side: "a" },
  { id: "m2-arrays-strings", label: "Arrays", x: 270, y: 100, side: "a", also: ["toolkit"], note: "where the Toolkit line meets Data structures" },
  { id: "m3-hashing", label: "Hashing", x: 375, y: 100, side: "a", also: ["pat"] },
  { id: "s1-linked-lists", label: "Linked lists", x: 480, y: 100, side: "a" },
  { id: "s2-stacks", label: "Stacks", x: 585, y: 100, side: "a", note: "queues branch off here" },
  { id: "s3-queues-and-deques", label: "Queues", x: 585, y: 195, side: "b" },
  { id: "s4-trees-and-bst", label: "Trees", x: 720, y: 100, side: "a" },
  { id: "s7-tries", label: "Tries", x: 850, y: 100, side: "a" },
  { id: "s5-heaps", label: "Heaps", x: 720, y: 245, side: "r" },
  { id: "s6-graphs", label: "Graphs", x: 720, y: 400, side: "b", also: ["algo"], note: "leads on to graph traversal and shortest paths" },
  // Patterns line drops from Hashing
  { id: "m4-two-pointers", label: "Two pointers", x: 375, y: 230, side: "b", note: "touches Arrays and Linked lists" },
  { id: "m5-sliding-window", label: "Sliding window", x: 485, y: 230, side: "b" },
  // Algorithms line along the bottom, through Graphs, then back along a second row
  { id: "m6-recursion", label: "Recursion", x: 110, y: 400, side: "b" },
  { id: "m7-sorting", label: "Sorting", x: 313, y: 400, side: "b" },
  { id: "m8-binary-search", label: "Binary search", x: 517, y: 400, side: "b" },
  { id: "a1-graph-traversal", label: "Graph traversal", x: 850, y: 400, side: "b" },
  { id: "a2-shortest-paths", label: "Shortest paths", x: 975, y: 400, side: "a" },
  { id: "a3-topological-sort", label: "Topological sort", x: 1085, y: 400, side: "b" },
  { id: "a4-union-find", label: "Union-find", x: 1195, y: 400, side: "a" },
  { id: "a5-greedy", label: "Greedy", x: 1195, y: 505, side: "b" },
  { id: "a6-dynamic-programming", label: "Dynamic programming", x: 1050, y: 505, side: "b" },
  { id: "a7-string-basics", label: "String basics", x: 910, y: 505, side: "b" },
  { id: "a8-bits-and-maths", label: "Bits and maths", x: 780, y: 505, side: "b" },
  { id: "a9-range-queries", label: "Range queries", x: 650, y: 505, side: "b" },
];

export type EdgeSpec = { line: LineId; from: string; to: string };
/** The line segments, in course order along each line. These are also the graph the route runs on. */
export const EDGES: EdgeSpec[] = [
  { line: "toolkit", from: "m0-toolkit", to: "m1-complexity" },
  { line: "toolkit", from: "m1-complexity", to: "m2-arrays-strings" },
  { line: "ds", from: "m2-arrays-strings", to: "m3-hashing" },
  { line: "ds", from: "m3-hashing", to: "s1-linked-lists" },
  { line: "ds", from: "s1-linked-lists", to: "s2-stacks" },
  { line: "ds", from: "s2-stacks", to: "s3-queues-and-deques" },
  { line: "ds", from: "s2-stacks", to: "s4-trees-and-bst" },
  { line: "ds", from: "s4-trees-and-bst", to: "s7-tries" },
  { line: "ds", from: "s4-trees-and-bst", to: "s5-heaps" },
  { line: "ds", from: "s5-heaps", to: "s6-graphs" },
  { line: "pat", from: "m3-hashing", to: "m4-two-pointers" },
  { line: "pat", from: "m4-two-pointers", to: "m5-sliding-window" },
  { line: "algo", from: "m6-recursion", to: "m7-sorting" },
  { line: "algo", from: "m7-sorting", to: "m8-binary-search" },
  { line: "algo", from: "m8-binary-search", to: "s6-graphs" },
  { line: "algo", from: "s6-graphs", to: "a1-graph-traversal" },
  { line: "algo", from: "a1-graph-traversal", to: "a2-shortest-paths" },
  { line: "algo", from: "a2-shortest-paths", to: "a3-topological-sort" },
  { line: "algo", from: "a3-topological-sort", to: "a4-union-find" },
  { line: "algo", from: "a4-union-find", to: "a5-greedy" },
  { line: "algo", from: "a5-greedy", to: "a6-dynamic-programming" },
  { line: "algo", from: "a6-dynamic-programming", to: "a7-string-basics" },
  { line: "algo", from: "a7-string-basics", to: "a8-bits-and-maths" },
  { line: "algo", from: "a8-bits-and-maths", to: "a9-range-queries" },
];

/** Faint dotted "also uses" links: not lines, and the route never runs on them. */
export const LINKS: [string, string][] = [
  ["m4-two-pointers", "m2-arrays-strings"],
  ["m4-two-pointers", "s1-linked-lists"],
];

/** The pill that names each line, placed beside its start. */
export const TAGS: { line: LineId; x: number; y: number }[] = [
  { line: "toolkit", x: 125, y: 10 },
  { line: "ds", x: 250, y: 10 },
  { line: "pat", x: 225, y: 213 },
  { line: "algo", x: 30, y: 340 },
];

/**
 * Goals ("Your route" runs from where you are to a goal station). "Learn from scratch" aims at the first milestone not yet
 * finished; "Interview prep" aims at the interview staple; "A specific topic" is the learner's pick.
 */
export const MILESTONES = ["s4-trees-and-bst", "s6-graphs", "a6-dynamic-programming", "m5-sliding-window"];
export const INTERVIEW_GOAL = "a6-dynamic-programming";
