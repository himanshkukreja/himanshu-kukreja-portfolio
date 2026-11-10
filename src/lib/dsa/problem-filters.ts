/**
 * The filter logic behind /dsa/problems: pure functions over a compact row per problem, shared by the page, the client
 * component and the unit tests (scripts/tests/dsa-problem-filters.test.mjs).
 *
 *   OR inside a group, AND across groups. A facet's count is what picking it would give: the rows that pass every OTHER
 *   group's selection and carry that option (so a selected group still shows its sibling options' own counts).
 *   The state lives in the URL (?q=&ds=&alg=&pat=&lvl=&st=&step=&kind=&video=1&co=&time=&sort=), comma-joined values.
 * Import-free apart from types.
 */

export type DsaLevelId = "easy" | "medium" | "hard";
export type Kind = "warm-up" | "practice" | "checkpoint";
export type Status = "todo" | "tried" | "solved";
export type TimeBucket = "quick" | "mid" | "long";
export type SortId = "course" | "easiest" | "hardest" | "quickest";

/** One problem as the client holds it: short fields, a lower-cased search text instead of the statement. */
export type FilterRow = {
  id: string;
  title: string;
  /** place in the course: step rank of its module, then concept, then order (precomputed sort key) */
  seq: number;
  order: number;
  concept: string;
  module: string;
  level: DsaLevelId;
  /** 1 to 10, or null */
  rating: number | null;
  minutes: number | null;
  kind: Kind;
  structures: string[];
  algorithms: string[];
  patterns: string[];
  companies: string[];
  video: boolean;
  /** the pattern tags as written, for the row's small print */
  tags: string[];
  /** lower-cased: title, statement words, pattern names, classic twin (number and name) */
  text: string;
};

export type GroupId = "structures" | "algorithms" | "patterns" | "level" | "status" | "step" | "kind" | "video" | "company" | "time";
export const GROUPS: GroupId[] = ["structures", "algorithms", "patterns", "level", "status", "step", "kind", "video", "company", "time"];

export type FilterState = { q: string; sel: Record<GroupId, string[]>; sort: SortId };

export const PARAM: Record<GroupId, string> = {
  structures: "ds",
  algorithms: "alg",
  patterns: "pat",
  level: "lvl",
  status: "st",
  step: "step",
  kind: "kind",
  video: "video",
  company: "co",
  time: "time",
};

export const SORTS: { id: SortId; label: string }[] = [
  { id: "course", label: "Course order" },
  { id: "easiest", label: "Easiest first" },
  { id: "hardest", label: "Hardest first" },
  { id: "quickest", label: "Quickest first" },
];

export const emptyState = (): FilterState => ({ q: "", sel: Object.fromEntries(GROUPS.map((g) => [g, []])) as unknown as Record<GroupId, string[]>, sort: "course" });

export const timeBucket = (m: number | null): TimeBucket | null => (m == null ? null : m <= 15 ? "quick" : m <= 30 ? "mid" : "long");

/* ------------------------------------------------------------------ URL */

const csv = (s: string | null | undefined) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : []);

/** The state from a query string; unknown params and values are kept (a stale link just matches nothing for that value). */
export function parseState(search: string | URLSearchParams): FilterState {
  const sp = typeof search === "string" ? new URLSearchParams(search) : search;
  const s = emptyState();
  s.q = (sp.get("q") || "").slice(0, 120);
  for (const g of GROUPS) s.sel[g] = g === "video" ? (sp.get(PARAM.video) === "1" ? ["1"] : []) : [...new Set(csv(sp.get(PARAM[g])))];
  const sort = sp.get("sort");
  s.sort = SORTS.some((x) => x.id === sort) ? (sort as SortId) : "course";
  return s;
}

/** The query string for a state (no leading "?"), omitting defaults so the plain page has a clean URL. */
export function serializeState(s: FilterState): string {
  const sp = new URLSearchParams();
  if (s.q.trim()) sp.set("q", s.q.trim());
  for (const g of GROUPS) if (s.sel[g].length) sp.set(PARAM[g], g === "video" ? "1" : s.sel[g].join(","));
  if (s.sort !== "course") sp.set("sort", s.sort);
  return sp.toString();
}

export const activeCount = (s: FilterState): number => GROUPS.reduce((n, g) => n + s.sel[g].length, 0);
export const isFiltered = (s: FilterState): boolean => activeCount(s) > 0 || !!s.q.trim();

/* ------------------------------------------------------------------ matching */

/** "LC 1", "lc1" and "lc-1" all become "lc-1"; other words are only lower-cased. */
export function normaliseQuery(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/\blc[\s-]?(\d+)\b/g, "lc-$1")
    .split(/\s+/)
    .filter(Boolean);
}

/** Every term must appear. A twin number ("lc-1") must match whole, so "lc-1" does not find lc-15. */
export function matchesText(row: FilterRow, terms: string[]): boolean {
  if (!terms.length) return true;
  const hay = ` ${row.text} `;
  return terms.every((t) => (/^lc-\d+$/.test(t) ? hay.includes(` ${t} `) : hay.includes(t)));
}

/** the row's values for a group (the thing the learner picks) */
export function valuesOf(row: FilterRow, g: GroupId, status: Status): string[] {
  switch (g) {
    case "structures": return row.structures;
    case "algorithms": return row.algorithms;
    case "patterns": return row.patterns;
    case "level": return [row.level];
    case "status": return [status];
    case "step": return [row.module];
    case "kind": return [row.kind];
    case "video": return row.video ? ["1"] : [];
    case "company": return row.companies;
    case "time": {
      const b = timeBucket(row.minutes);
      return b ? [b] : [];
    }
  }
}

export type Evaluated = { results: FilterRow[]; counts: Record<GroupId, Map<string, number>>; total: number };

/**
 * One pass over the rows: the sorted results, and every option's count. A row that fails exactly one group counts
 * only toward that group's options (what switching that group's selection would add); a row that fails none counts
 * everywhere. `statusOf` is the learner's progress, read at call time.
 */
export function evaluate(rows: FilterRow[], s: FilterState, statusOf: (id: string) => Status): Evaluated {
  const terms = normaliseQuery(s.q);
  const counts = Object.fromEntries(GROUPS.map((g) => [g, new Map<string, number>()])) as Record<GroupId, Map<string, number>>;
  const active = GROUPS.filter((g) => s.sel[g].length);
  const results: FilterRow[] = [];
  for (const row of rows) {
    if (!matchesText(row, terms)) continue;
    const status = statusOf(row.id);
    let failed: GroupId | null = null;
    let fails = 0;
    for (const g of active) {
      const vals = valuesOf(row, g, status);
      if (!s.sel[g].some((v) => vals.includes(v))) {
        fails++;
        failed = g;
        if (fails > 1) break;
      }
    }
    if (fails > 1) continue;
    if (fails === 0) results.push(row);
    for (const g of fails === 0 ? GROUPS : [failed as GroupId]) {
      const m = counts[g];
      for (const v of valuesOf(row, g, status)) m.set(v, (m.get(v) || 0) + 1);
    }
  }
  return { results: sortRows(results, s.sort), counts, total: results.length };
}

export function sortRows(rows: FilterRow[], sort: SortId): FilterRow[] {
  const out = [...rows];
  const course = (a: FilterRow, b: FilterRow) => a.seq - b.seq || a.order - b.order || a.title.localeCompare(b.title);
  const rate = (r: FilterRow) => r.rating ?? ({ easy: 3, medium: 5, hard: 8 }[r.level]);
  if (sort === "easiest") out.sort((a, b) => rate(a) - rate(b) || course(a, b));
  else if (sort === "hardest") out.sort((a, b) => rate(b) - rate(a) || course(a, b));
  else if (sort === "quickest") out.sort((a, b) => (a.minutes ?? 999) - (b.minutes ?? 999) || course(a, b));
  else out.sort(course);
  return out;
}

/* ------------------------------------------------------------------ state edits */

export function toggle(s: FilterState, g: GroupId, v: string): FilterState {
  const cur = s.sel[g];
  return { ...s, sel: { ...s.sel, [g]: cur.includes(v) ? cur.filter((x) => x !== v) : g === "video" ? [v] : [...cur, v] } };
}

export const clearAll = (s: FilterState): FilterState => ({ ...emptyState(), sort: s.sort });
