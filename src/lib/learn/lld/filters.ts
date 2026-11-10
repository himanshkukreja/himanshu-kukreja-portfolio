/**
 * The LLD home's pure logic: filters over the case-study cards, the pattern map, the suggested path
 * and the filter ↔ URL query round trip. No imports from the app (types only), so node --test runs it
 * (scripts/tests/lld.test.mjs).
 */
import type { CaseMeta, Difficulty, PatternMeta } from "./meta";

export type CaseCompany = { slug: string; name: string; reported: boolean };
/** A case-study card: the site's metadata plus what the content knows (title, href, companies). */
export type CaseRow = CaseMeta & { title: string; href: string; companies: CaseCompany[] };

export type Filters = { pattern: string | null; difficulty: Difficulty | null; company: string | null };
export const NO_FILTERS: Filters = { pattern: null, difficulty: null, company: null };

const DIFFS = new Set<string>(["Medium", "Hard", "Expert"]);

/** Cards matching every active filter (an empty filter matches all). Keeps the original order. */
export function filterCases(rows: CaseRow[], f: Filters): CaseRow[] {
  return rows.filter(
    (r) => (!f.pattern || r.patterns.includes(f.pattern)) && (!f.difficulty || r.difficulty === f.difficulty) && (!f.company || r.companies.some((c) => c.slug === f.company)),
  );
}

export type Facet<T> = { value: T; count: number };

/**
 * Facet counts: how many cards each option would show given the OTHER active filters, so picking
 * "Hard" shows how many Hard cards use each pattern. Options with 0 are kept (disabled in the UI),
 * except companies, where only companies that appear at all are listed.
 */
export function facets(rows: CaseRow[], f: Filters, patterns: PatternMeta[]) {
  const countWith = (over: Partial<Filters>) => filterCases(rows, { ...f, ...over }).length;
  const used = new Set(rows.flatMap((r) => r.patterns));
  const companies = new Map<string, { name: string; reported: boolean }>();
  for (const r of rows) for (const c of r.companies) if (!companies.has(c.slug)) companies.set(c.slug, { name: c.name, reported: c.reported });
  return {
    patterns: patterns.filter((p) => used.has(p.slug)).map((p) => ({ value: p, count: countWith({ pattern: p.slug }) })) as Facet<PatternMeta>[],
    difficulties: (["Medium", "Hard", "Expert"] as Difficulty[]).map((d) => ({ value: d, count: countWith({ difficulty: d }) })) as Facet<Difficulty>[],
    companies: [...companies.entries()]
      .map(([slug, c]) => ({ value: { slug, name: c.name }, count: countWith({ company: slug }) }))
      .sort((a, b) => b.count - a.count || a.value.name.localeCompare(b.value.name)) as Facet<{ slug: string; name: string }>[],
  };
}

/** Pattern slug → the case studies that use it, in lesson order. Patterns no case uses are absent. */
export function patternMap(rows: CaseRow[]): Record<string, CaseRow[]> {
  const out: Record<string, CaseRow[]> = {};
  for (const r of [...rows].sort((a, b) => a.n - b.n)) for (const p of r.patterns) (out[p] ||= []).push(r);
  return out;
}

export type PathStage = { id: "foundations" | "core" | "easy" | "hard"; title: string; note: string; patterns: string[]; cases: string[] };

/**
 * The suggested path: foundations → core patterns → easy case studies → hard ones. Patterns come from
 * the catalogue (so a stage lists only what exists), cases from the metadata; each case appears once.
 */
export function suggestedPath(rows: CaseRow[], patterns: PatternMeta[], core: string[]): PathStage[] {
  const sorted = [...rows].sort((a, b) => a.n - b.n);
  const foundations = patterns.filter((p) => p.group === "foundations").map((p) => p.slug);
  const coreSlugs = core.filter((s) => patterns.some((p) => p.slug === s));
  return [
    { id: "foundations", title: "Foundations", note: "Composition, injection, SOLID and how to read a class diagram.", patterns: foundations, cases: [] },
    { id: "core", title: "Core patterns", note: "The few patterns most rounds lean on.", patterns: coreSlugs, cases: [] },
    { id: "easy", title: "Easy case studies", note: "Medium problems: one idea each, run end to end.", patterns: [], cases: sorted.filter((r) => r.difficulty === "Medium").map((r) => r.slug) },
    { id: "hard", title: "Hard case studies", note: "Concurrency, state and money: the rounds that separate offers.", patterns: [], cases: sorted.filter((r) => r.difficulty !== "Medium").map((r) => r.slug) },
  ];
}

/** Where to start: the first path item the learner has not finished (done = slugs of finished case studies). */
export function nextOnPath(path: PathStage[], doneCases: ReadonlySet<string>): { stage: PathStage["id"]; case: string } | null {
  for (const s of path) {
    const next = s.cases.find((c) => !doneCases.has(c));
    if (next) return { stage: s.id, case: next };
  }
  return null;
}

/* ------------------------------------------------------------------ URL */

/** ?pattern=strategy&difficulty=Hard&company=flipkart → Filters; anything unknown is dropped. */
export function parseFilters(q: URLSearchParams | Record<string, string | undefined>, known: { patterns: string[]; companies: string[] }): Filters {
  const get = (k: string) => (q instanceof URLSearchParams ? q.get(k) : q[k]) ?? null;
  const pattern = get("pattern");
  const difficulty = get("difficulty");
  const company = get("company");
  return {
    pattern: pattern && known.patterns.includes(pattern) ? pattern : null,
    difficulty: difficulty && DIFFS.has(difficulty) ? (difficulty as Difficulty) : null,
    company: company && known.companies.includes(company) ? company : null,
  };
}

export function filtersToQuery(f: Filters): string {
  const q = new URLSearchParams();
  if (f.pattern) q.set("pattern", f.pattern);
  if (f.difficulty) q.set("difficulty", f.difficulty);
  if (f.company) q.set("company", f.company);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const hasFilters = (f: Filters) => !!(f.pattern || f.difficulty || f.company);

/** A learner's progress on a case study, 0 to 100 (for the card's bar), from the shared lesson progress record. */
export function casePct(p: { status: string; pct: number } | undefined): number {
  if (!p) return 0;
  return p.status === "completed" ? 100 : Math.max(0, Math.min(99, Math.round(p.pct || 0)));
}
