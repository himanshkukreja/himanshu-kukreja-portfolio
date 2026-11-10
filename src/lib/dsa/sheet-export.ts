/**
 * The "Export problem sheet" rows: which columns, how the problems are grouped, what each cell holds. Pure and shared by
 * the dialog, the file writers (sheet-file.ts) and scripts/tests/dsa-sheet-export.test.mjs.
 * Links are absolute on the current origin; the video and editorial links open the problem room (no spoilers in the file).
 */
import type { FilterRow, FilterState, GroupId, Status } from "./problem-filters";
import { GROUPS } from "./problem-filters";
import { facetLabel } from "./taxonomy";

export type ColumnId = "num" | "problem" | "level" | "step" | "topic" | "algorithms" | "patterns" | "kind" | "time" | "twin" | "video" | "editorial" | "status" | "solved" | "notes" | "revise";
export type GroupBy = "course" | "level" | "topic" | "flat";
export type Format = "xlsx" | "csv";

export type ColumnDef = { id: ColumnId; label: string; on: boolean; width: number };

/** In file order; the learner only switches them on and off. */
export const COLUMNS: ColumnDef[] = [
  { id: "num", label: "#", on: true, width: 5 },
  { id: "problem", label: "Problem", on: true, width: 40 },
  { id: "level", label: "Difficulty", on: true, width: 12 },
  { id: "step", label: "Course step", on: true, width: 22 },
  { id: "topic", label: "Topic", on: true, width: 22 },
  { id: "algorithms", label: "Algorithms", on: false, width: 26 },
  { id: "patterns", label: "Patterns", on: false, width: 26 },
  { id: "kind", label: "Kind", on: false, width: 12 },
  { id: "time", label: "Est. time", on: true, width: 11 },
  { id: "twin", label: "Classic twin", on: false, width: 13 },
  { id: "video", label: "Solution video", on: true, width: 16 },
  { id: "editorial", label: "Editorial", on: true, width: 12 },
  { id: "status", label: "Status", on: true, width: 13 },
  { id: "solved", label: "Solved on", on: false, width: 13 },
  { id: "notes", label: "My notes", on: true, width: 34 },
  { id: "revise", label: "Revise on", on: false, width: 13 },
];
export const defaultColumns = (): ColumnId[] => COLUMNS.filter((c) => c.on).map((c) => c.id);

export const GROUP_BYS: { id: GroupBy; label: string }[] = [
  { id: "course", label: "Course order" },
  { id: "level", label: "By difficulty" },
  { id: "topic", label: "By topic" },
  { id: "flat", label: "One flat list" },
];

export const STATUS_LABEL: Record<Status, string> = { todo: "Not started", tried: "Tried", solved: "Solved" };
const LEVEL_LABEL = { easy: "Easy", medium: "Medium", hard: "Hard" } as const;
const KIND_LABEL = { "warm-up": "Warm-up", practice: "Practice", checkpoint: "Checkpoint", district: "Extra practice" } as const;

export type Cell = { text: string; link?: string; level?: FilterRow["level"] };
export type Section = { title: string | null; rows: Cell[][] };
export type Sheet = { header: string[]; columns: ColumnId[]; sections: Section[]; count: number };

export type SheetContext = {
  /** "https://example.com" (no trailing slash) */
  origin: string;
  /** module id to "2.2 Hashing" */
  stepLabel: (module: string) => string;
  statusOf: (id: string) => Status;
  /** epoch ms the learner solved it, or null */
  solvedAt: (id: string) => number | null;
};

export const problemUrl = (origin: string, id: string) => `${origin}/dsa/problems/${id}`;
export const editorialUrl = (origin: string, id: string) => `${problemUrl(origin, id)}?tab=editorial`;
export const videoUrl = (origin: string, id: string) => `${problemUrl(origin, id)}?tab=editorial#solution-video`;

export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const course = (a: FilterRow, b: FilterRow) => a.seq - b.seq || a.order - b.order || a.title.localeCompare(b.title);
const rate = (r: FilterRow) => r.rating ?? ({ easy: 3, medium: 5, hard: 8 }[r.level]);
const LEVEL_ORDER = ["easy", "medium", "hard"];

/** The chosen columns in the fixed order (an empty pick falls back to the problem alone). */
export const orderColumns = (picked: Iterable<ColumnId>): ColumnId[] => {
  const set = new Set(picked);
  const out = COLUMNS.filter((c) => set.has(c.id)).map((c) => c.id);
  return out.length ? out : ["problem"];
};

function cellFor(col: ColumnId, r: FilterRow, n: number, ctx: SheetContext): Cell {
  switch (col) {
    case "num": return { text: String(n) };
    case "problem": return { text: r.title, link: problemUrl(ctx.origin, r.id) };
    case "level": return { text: LEVEL_LABEL[r.level], level: r.level };
    case "step": return { text: ctx.stepLabel(r.module) };
    case "topic": return { text: r.structures.map((id) => facetLabel("structures", id)).join(", ") };
    case "algorithms": return { text: r.algorithms.map((id) => facetLabel("algorithms", id)).join(", ") };
    case "patterns": return { text: r.patterns.map((id) => facetLabel("patterns", id)).join(", ") };
    case "kind": return { text: KIND_LABEL[r.kind] };
    case "time": return { text: r.minutes ? `${r.minutes} min` : "" };
    case "twin": return { text: r.twin || "" };
    case "video": return r.video ? { text: "Watch", link: videoUrl(ctx.origin, r.id) } : { text: "—" };
    case "editorial": return { text: "Read", link: editorialUrl(ctx.origin, r.id) };
    case "status": return { text: STATUS_LABEL[ctx.statusOf(r.id)] };
    case "solved": {
      const at = ctx.statusOf(r.id) === "solved" ? ctx.solvedAt(r.id) : null;
      return { text: at ? isoDay(at) : "" };
    }
    case "notes":
    case "revise": return { text: "" };
  }
}

/** Sections of rows; "course" gets a step header per course step, "level" and "topic" one per value, "flat" none. */
export function buildSheet(rows: FilterRow[], opts: { columns: Iterable<ColumnId>; groupBy: GroupBy }, ctx: SheetContext): Sheet {
  const columns = orderColumns(opts.columns);
  const sorted = [...rows].sort(opts.groupBy === "level" ? (a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) || rate(a) - rate(b) || course(a, b) : course);
  const keyOf = (r: FilterRow): string => {
    if (opts.groupBy === "course") return ctx.stepLabel(r.module);
    if (opts.groupBy === "level") return LEVEL_LABEL[r.level];
    if (opts.groupBy === "topic") return r.structures[0] ? facetLabel("structures", r.structures[0]) : "Other";
    return "";
  };
  let order: string[] = [];
  const buckets = new Map<string, FilterRow[]>();
  for (const r of sorted) {
    const k = keyOf(r);
    if (!buckets.has(k)) {
      buckets.set(k, []);
      order.push(k);
    }
    buckets.get(k)!.push(r);
  }
  if (opts.groupBy === "topic") order = [...order].sort((a, b) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)));
  let n = 0;
  const sections: Section[] = order.map((k) => ({
    title: opts.groupBy === "flat" ? null : k,
    rows: buckets.get(k)!.map((r) => {
      n++;
      return columns.map((c) => cellFor(c, r, n, ctx));
    }),
  }));
  return { header: columns.map((c) => COLUMNS.find((x) => x.id === c)!.label), columns, sections, count: n };
}

/** "Difficulty: Easy, Medium · Topic: Array" from a filter state, for the About sheet and the analytics event. */
export function describeFilters(s: FilterState, titleOf: (g: GroupId) => string, labelOf: (g: GroupId, v: string) => string): string {
  const parts: string[] = [];
  if (s.q.trim()) parts.push(`Search: “${s.q.trim()}”`);
  for (const g of GROUPS) if (s.sel[g].length) parts.push(`${titleOf(g)}: ${s.sel[g].map((v) => labelOf(g, v)).join(", ")}`);
  return parts.join(" · ");
}

export const exportFileName = (format: Format, d = new Date()) => `dsa-mastery-sheet-${isoDay(d.getTime())}.${format}`;
