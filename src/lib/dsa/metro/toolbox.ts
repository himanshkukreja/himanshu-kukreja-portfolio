/**
 * "Your toolbox" (Progress, canvas board 18): finishing a metro station earns its tool. Pure, so node --test runs it
 * (scripts/tests/dsa-toolbox.test.mjs).
 *
 * - Earned = the station is done by THE rule of the map (stationDone in model.ts: it has written lessons and every one is
 *   done), or its `dsa:tool:<station>` key is already in the game store. The key is written once, the first time the station
 *   is seen done, so a tool stays earned if later lessons arrive in the topic (like badges) and the toast is a one-time event.
 * - Earned date = when the station's last lesson was finished (the lessons' own `dsa:c:` times), else the key's time.
 * - "Used in N problems" = solved problems tagged with the station's topic (Station.solved, the map's own count).
 * - Locked = greyed, "Earn at station X · k of n lessons". A topic with no lesson written yet has no tool to earn yet and
 *   is left out of the grid and the counts (it appears when its first lesson ships).
 */
import type { Metro, Station } from "./model";
import type { LineId } from "./layout";

export type ToolIcon = "wrench" | "ruler" | "key" | "chain" | "stack" | "queue" | "tree" | "trie" | "heap" | "graph" | "loop" | "sort" | "search" | "bolt" | "grid" | "pointers" | "window" | "bits" | "bars" | "walk" | "route" | "flow" | "link" | "text" | "layers";

/** SVG path data (24x24, stroke icons), from the board. */
export const TOOL_ICON_PATH: Record<ToolIcon, string> = {
  wrench: "M14 6a4 4 0 0 1-5 5l-6 6 2 2 6-6a4 4 0 0 1 5-5l-2-2 2-2a4 4 0 0 0-2 2z",
  ruler: "M3 17 17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2",
  key: "M15 7a4 4 0 1 0-4 4l-8 8 3 3 2-2-2-2 2-2 2 2 3-3a4 4 0 0 0 2-8z",
  chain: "M10 14a4 4 0 0 1 0-6l3-3a4 4 0 0 1 6 6l-2 2M14 10a4 4 0 0 1 0 6l-3 3a4 4 0 0 1-6-6l2-2",
  stack: "M4 6h16M4 12h16M4 18h16",
  queue: "M3 12h14M13 8l4 4-4 4M3 6h4M3 18h4",
  tree: "M12 3v18M12 8 6 13M12 8l6 5M6 13v4M18 13v4",
  trie: "M12 3v5M12 8 6 14M12 8l6 6M6 14v6M18 14v6M3 20h6",
  heap: "M12 4 4 20h16z",
  graph: "M5 5h.01M19 5h.01M12 19h.01M5 5l7 14 7-14z",
  loop: "M4 12a8 8 0 1 0 3-6M4 4v4h4",
  sort: "M4 6h10M4 12h7M4 18h4M18 6v12M15 15l3 3 3-3",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7z",
  grid: "M4 4h16v16H4zM4 10h16M4 16h16M10 4v16M16 4v16",
  pointers: "M6 4v16M18 4v16M6 8h12",
  window: "M3 5h18v14H3zM8 5v14M16 5v14",
  bits: "M4 5h5v5H4zM15 14h5v5h-5zM13 6h7M4 17h7",
  bars: "M4 20h16M6 20v-6M11 20V9M16 20V4",
  walk: "M3 12h6l3-7 3 14 3-7h3",
  route: "M5 19c3-10 10 2 14-14M5 19h.01M19 5h.01",
  flow: "M5 4h5v5H5zM14 15h5v5h-5zM7.5 9v3a3 3 0 0 0 3 3H14",
  link: "M9 12h6M6 8a4 4 0 1 0 0 8M18 8a4 4 0 1 1 0 8",
  text: "M5 6h14M12 6v13M8 19h8",
  layers: "M12 3 3 8l9 5 9-5zM3 13l9 5 9-5",
};

/** The tool each station gives (keyed by the academy region id, like layout.ts). A station not listed gets a generic tool named after it. */
export const TOOLS: Record<string, { name: string; icon: ToolIcon }> = {
  "m0-toolkit": { name: "Toolkit", icon: "wrench" },
  "m1-complexity": { name: "Complexity", icon: "ruler" },
  "m2-arrays-strings": { name: "Array", icon: "grid" },
  "m3-hashing": { name: "Hash map", icon: "key" },
  "s1-linked-lists": { name: "Linked list", icon: "chain" },
  "s2-stacks": { name: "Stack", icon: "stack" },
  "s3-queues-and-deques": { name: "Queue", icon: "queue" },
  "s4-trees-and-bst": { name: "Tree", icon: "tree" },
  "s7-tries": { name: "Trie", icon: "trie" },
  "s5-heaps": { name: "Heap", icon: "heap" },
  "s6-graphs": { name: "Graph", icon: "graph" },
  "m4-two-pointers": { name: "Two pointers", icon: "pointers" },
  "m5-sliding-window": { name: "Sliding window", icon: "window" },
  "m6-recursion": { name: "Recursion", icon: "loop" },
  "m7-sorting": { name: "Sorting", icon: "sort" },
  "m8-binary-search": { name: "Binary search", icon: "search" },
  "a1-graph-traversal": { name: "Graph traversal", icon: "walk" },
  "a2-shortest-paths": { name: "Shortest paths", icon: "route" },
  "a3-topological-sort": { name: "Topological sort", icon: "flow" },
  "a4-union-find": { name: "Union-find", icon: "link" },
  "a5-greedy": { name: "Greedy", icon: "bolt" },
  "a6-dynamic-programming": { name: "DP table", icon: "grid" },
  "a7-string-basics": { name: "String toolkit", icon: "text" },
  "a8-bits-and-maths": { name: "Bit tricks", icon: "bits" },
  "a9-range-queries": { name: "Prefix sums", icon: "bars" },
};

/** The game key that records a tool as earned (its time is when it was first seen done). Not Bits, not SD Mastery XP. */
export const toolKey = (station: string) => `dsa:tool:${station}`;
export const TOOL_PREFIX = "dsa:tool:";

export type Tool = {
  /** the station's id */
  id: string;
  name: string;
  icon: ToolIcon;
  line: LineId;
  station: string;
  earned: boolean;
  /** when it was earned (ms), null when unknown */
  earnedAt: number | null;
  lessonsDone: number;
  lessons: number;
  usedIn: number;
  /** the station's next lesson (a locked tool's link) */
  href: string | null;
  nextLesson: number;
};

export type Band = { id: "foundations" | "building" | "fluent" | "interview"; label: string; min: number };
/** Skill bands by tools earned: Foundations from the start, then Building, Fluent and Interview-ready. */
export const BANDS: Band[] = [
  { id: "foundations", label: "Foundations", min: 0 },
  { id: "building", label: "Building", min: 4 },
  { id: "fluent", label: "Fluent", min: 12 },
  { id: "interview", label: "Interview-ready", min: 20 },
];

/** The band for a count, with the next one's threshold (capped at the number of tools there are, so it can always be reached). */
export function bandFor(earned: number, total: number): { index: number; band: Band; next: Band | null; nextAt: number | null } {
  const at = BANDS.map((b) => Math.min(b.min, Math.max(0, total)));
  let index = 0;
  at.forEach((m, i) => {
    if (earned >= m) index = i;
  });
  const next = BANDS[index + 1] ?? null;
  return { index, band: BANDS[index], next, nextAt: next ? at[index + 1] : null };
}

export type Toolbox = {
  tools: Tool[];
  earned: Tool[];
  locked: Tool[];
  total: number;
  /** solved problems that fall under an earned tool's topic */
  usedTotal: number;
  /** the tool to earn next: the station the learner is on if it is open, else the most advanced locked one */
  next: Tool | null;
  band: ReturnType<typeof bandFor>;
  /** per line: tools earned and tools in all */
  lines: { id: LineId; earned: number; total: number }[];
};

const dayMs = 86_400_000;

/** The time a station was finished: the latest of its lessons' `dsa:c:` times, when every one has one. */
export function finishedAt(station: Pick<Station, "lessonIds">, done: Record<string, number>): number | null {
  let at = 0;
  for (const c of station.lessonIds) {
    const t = Number(done[`dsa:c:${c}`]) || 0;
    if (!t) return null;
    at = Math.max(at, t);
  }
  return at || null;
}

export function toolbox(metro: Pick<Metro, "stations">, done: Record<string, number>, here?: string): Toolbox {
  const tools: Tool[] = [];
  for (const s of metro.stations) {
    if (s.planned) continue;
    const meta = TOOLS[s.id] ?? { name: s.label, icon: "layers" as ToolIcon };
    const key = Number(done[toolKey(s.id)]) || 0;
    const isDone = s.state === "done";
    const earned = isDone || key > 0;
    tools.push({
      id: s.id,
      name: meta.name,
      icon: meta.icon,
      line: s.line,
      station: s.label,
      earned,
      earnedAt: earned ? (isDone ? finishedAt(s, done) : null) || key || null : null,
      lessonsDone: s.done,
      lessons: s.total,
      usedIn: earned ? s.solved : 0,
      href: s.href,
      nextLesson: s.nextLesson,
    });
  }
  // earned: newest first (unknown dates last, in course order); locked: course order
  const earned = tools.filter((t) => t.earned).sort((a, b) => (b.earnedAt ?? 0) - (a.earnedAt ?? 0));
  const locked = tools.filter((t) => !t.earned);
  const next = (here && locked.find((t) => t.id === here)) || [...locked].sort((a, b) => b.lessonsDone / b.lessons - a.lessonsDone / a.lessons)[0] || null;
  const lines = [...new Set(tools.map((t) => t.line))].map((id) => ({ id, earned: earned.filter((t) => t.line === id).length, total: tools.filter((t) => t.line === id).length }));
  return {
    tools: [...earned, ...locked],
    earned,
    locked,
    total: tools.length,
    usedTotal: earned.reduce((n, t) => n + t.usedIn, 0),
    next,
    band: bandFor(earned.length, tools.length),
    lines,
  };
}

/** Earned within the last two days: the card shows a "New" tag. */
export const isFresh = (t: Pick<Tool, "earned" | "earnedAt">, now: number) => t.earned && !!t.earnedAt && now - t.earnedAt < 2 * dayMs;

/** Stations that are done by the map's rule and have no tool key yet: the ones to record (and, if fresh, to announce). */
export function newlyEarned(stations: { id: string; lessonIds: string[] }[], concepts: ReadonlySet<string>, done: Record<string, number>, now: number, freshMs = 10 * 60_000): { record: string[]; announce: string[] } {
  const record: string[] = [];
  const announce: string[] = [];
  for (const s of stations) {
    if (!s.lessonIds.length || !s.lessonIds.every((c) => concepts.has(c))) continue;
    if (done[toolKey(s.id)]) continue;
    record.push(s.id);
    const at = finishedAt(s, done);
    // an old station (finished before tools existed) is recorded quietly; one finished just now is announced
    if (at && now - at < freshMs) announce.push(s.id);
  }
  return { record, announce };
}
