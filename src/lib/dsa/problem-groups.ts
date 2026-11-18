/**
 * Practice bank grouping (owner, 18 Nov 2026): the default view is the problems grouped by topic in course order, the
 * topic being the problem's module (the metro map's station), so one name means one thing on the map and in the bank.
 * Pure and import-light so node --test runs it (scripts/tests/dsa-problem-groups.test.mjs).
 */
import type { FilterRow } from "./problem-filters";

export type GroupingId = "topic" | "pattern" | "level" | "company" | "none";
export const GROUPINGS: { id: GroupingId; label: string }[] = [
  { id: "topic", label: "Topic" },
  { id: "pattern", label: "Pattern" },
  { id: "level", label: "Difficulty" },
  { id: "company", label: "Company type" },
  { id: "none", label: "None" },
];
export const DEFAULT_GROUPING: GroupingId = "topic";
export const parseGrouping = (v: string | null | undefined): GroupingId => (GROUPINGS.some((g) => g.id === v) ? (v as GroupingId) : DEFAULT_GROUPING);

/** The topics in course order: the metro stations as the owner lists them, then the algorithms. A module not listed follows. */
export const TOPIC_ORDER = [
  "m0-toolkit",
  "m1-complexity",
  "m2-arrays-strings",
  "m3-hashing",
  "m4-two-pointers",
  "m5-sliding-window",
  "m6-recursion",
  "m7-sorting",
  "m8-binary-search",
  "s1-linked-lists",
  "s2-stacks",
  "s3-queues-and-deques",
  "s4-trees-and-bst",
  "s5-heaps",
  "s6-graphs",
  "s7-tries",
  "a1-graph-traversal",
  "a2-shortest-paths",
  "a3-topological-sort",
  "a4-union-find",
  "a5-greedy",
  "a6-dynamic-programming",
  "a7-string-basics",
  "a8-bits-and-maths",
  "a9-range-queries",
];

const LEVEL_RANK: Record<string, number> = { easy: 0, medium: 1, hard: 2 };
const LEVEL_TITLE: Record<string, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

export type LevelSplit = { easy: number; medium: number; hard: number };
export type BankGroup = { id: string; title: string; rows: FilterRow[]; split: LevelSplit };

export const levelSplit = (rows: FilterRow[]): LevelSplit => {
  const s: LevelSplit = { easy: 0, medium: 0, hard: 0 };
  for (const r of rows) if (r.level in s) s[r.level]++;
  return s;
};

/** Difficulty, then the problem's own order (course order across ties). */
export const byLevelThenOrder = (a: FilterRow, b: FilterRow) => (LEVEL_RANK[a.level] ?? 3) - (LEVEL_RANK[b.level] ?? 3) || a.order - b.order || a.seq - b.seq;
const byCourse = (a: FilterRow, b: FilterRow) => a.seq - b.seq || a.order - b.order;

export type GroupNames = { topic: (module: string) => string; pattern: (id: string) => string; company: (id: string) => string };

/**
 * Split rows into groups. `keepOrder` (the learner chose a sort other than Recommended) keeps the rows in the order
 * they came; otherwise a group sorts by difficulty then order (a Difficulty group by course order, its level being one).
 */
export function groupRows(rows: FilterRow[], mode: GroupingId, names: GroupNames, keepOrder = false): BankGroup[] {
  if (mode === "none") return [];
  const m = new Map<string, FilterRow[]>();
  const keyOf = (r: FilterRow) => (mode === "topic" ? r.module : mode === "pattern" ? r.patterns[0] || "" : mode === "level" ? r.level : r.companies[0] || "");
  for (const r of rows) {
    const k = keyOf(r);
    const a = m.get(k);
    if (a) a.push(r);
    else m.set(k, [r]);
  }
  const rank = (k: string, rs: FilterRow[]) => {
    if (mode === "topic") {
      const i = TOPIC_ORDER.indexOf(k);
      return i >= 0 ? i : 1000;
    }
    if (mode === "level") return LEVEL_RANK[k] ?? 9;
    if (!k) return Infinity;
    return mode === "pattern" ? Math.min(...rs.map((r) => r.seq)) : 0;
  };
  const title = (k: string) =>
    mode === "topic" ? names.topic(k) : mode === "pattern" ? (k ? names.pattern(k) : "Other patterns") : mode === "level" ? LEVEL_TITLE[k] || k : k ? names.company(k) : "Not tied to a company type";
  const groups = [...m.entries()].map(([k, rs]) => {
    const sorted = keepOrder ? rs : [...rs].sort(mode === "level" ? byCourse : byLevelThenOrder);
    return { id: k || "none", title: title(k), rows: sorted, split: levelSplit(sorted), rank: rank(k, rs) };
  });
  groups.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));
  return groups.map(({ rank: _r, ...g }) => g);
}

export const solvedIn = (g: { rows: FilterRow[] }, isSolved: (id: string) => boolean) => g.rows.reduce((n, r) => n + (isSolved(r.id) ? 1 : 0), 0);

/** The group that starts open: the first with an unsolved problem (the first group when everything is solved). */
export function firstOpenId(groups: BankGroup[], isSolved: (id: string) => boolean): string | null {
  const g = groups.find((x) => solvedIn(x, isSolved) < x.rows.length) || groups[0];
  return g ? g.id : null;
}

/** Whether a group is open: the learner's own choice if they made one, else only the first-with-unsolved group. */
export const isOpen = (stored: Record<string, boolean> | null, key: string, id: string, firstId: string | null): boolean => (stored && key in stored ? !!stored[key] : id === firstId);

/** Split a title around the search words, for highlighting. Case-insensitive; words under two letters are ignored. */
export function highlightParts(text: string, query: string): { text: string; hit: boolean }[] {
  const words = [...new Set(query.toLowerCase().split(/[^a-z0-9+#]+/).filter((w) => w.length >= 2))];
  if (!words.length) return [{ text, hit: false }];
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.split(re).flatMap((t, i) => (t ? [{ text: t, hit: i % 2 === 1 }] : []));
}
