/**
 * Where the search items come from: the Practice page's rows (FilterRow) and the ⌘K index's problem docs (which carry the
 * same facts in `meta`). Pure.
 */
import { FACETS } from "../taxonomy";
import type { FilterRow } from "../problem-filters";
import type { SearchItem } from "./engine";

const label = (k: keyof typeof FACETS, id: string) => FACETS[k].find((f) => f.id === id)?.label || id;
const nice = (id: string) => id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

/** the topic labels of a problem: its structures, algorithms and patterns */
export function topicLabels(f: { structures: string[]; algorithms: string[]; patterns: string[] }): string[] {
  return [...f.patterns.map((id) => label("patterns", id)), ...f.algorithms.map((id) => label("algorithms", id)), ...f.structures.map((id) => label("structures", id))];
}

/** One item per Practice row. `lessons` is concept id to lesson title, `companyLabel` the label of a company-type id. */
export function itemsFromRows(rows: FilterRow[], lessons: Record<string, string>, companyLabel: (id: string) => string = nice): SearchItem[] {
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    aliases: r.aliases || [],
    topics: topicLabels(r),
    tags: r.tags,
    domains: [...r.companies.map(companyLabel), ...(r.domain ? [r.domain] : [])],
    level: r.level,
    lesson: lessons[r.concept] || "",
    summary: r.text,
  }));
}

/** What a problem's ⌘K doc carries so the palette can rank it with the same engine (see src/lib/dsa/search-index.ts). */
export type SearchMeta = { lv: SearchItem["level"]; al: string[]; tp: string[]; tg: string[]; dm: string[]; ls: string };

export function itemFromDoc(d: { slug: string; title: string; content: string; meta?: SearchMeta }): SearchItem {
  const m = d.meta;
  return { id: d.slug, title: d.title, aliases: m?.al || [], topics: m?.tp || [], tags: m?.tg || [], domains: m?.dm || [], level: m?.lv || "medium", lesson: m?.ls || "", summary: d.content };
}
