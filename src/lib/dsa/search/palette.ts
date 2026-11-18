/**
 * ⌘K on a DSA page: one engine over every DSA doc the palette lists (Academy lessons, streets, camp tents, sets, problems), so a
 * lesson and a problem compete on the same score (title word beats topic beats statement). Pure.
 */
import { buildIndex, parseQuery, search, type Hit, type SearchIndex } from "./engine";
import { itemFromDoc, type SearchMeta } from "./items";

type PaletteDoc = { slug: string; title: string; content?: string; week: string; course?: string; meta?: SearchMeta };

/** The index over the DSA docs (course "dsa"); other courses' docs are the palette's own search. */
export function buildPaletteIndex(docs: PaletteDoc[]): SearchIndex {
  return buildIndex(docs.filter((d) => !d.course || d.course === "dsa").map((d) => itemFromDoc({ slug: d.slug, title: d.title, content: d.content || "", week: d.week, meta: d.meta })));
}

/**
 * Ranked hits for what was typed. A level word ("easy fintech") narrows the problems (a lesson has no level, it stays);
 * a query of only filter words ("easy") names nothing to look for, so it lists nothing.
 */
export function paletteHits(index: SearchIndex, query: string, limit = 8): Hit[] {
  const pq = parseQuery(query);
  if (!pq.units.length) return [];
  const lv = pq.levels;
  return search(index, pq, { limit, accept: lv.length ? (it) => !!it.path || lv.includes(it.level) : undefined });
}

/** a hit's page path: a lesson's own, a problem's /dsa/problems/<id> */
export const hitPath = (h: Hit): string => h.item.path || `dsa/problems/${h.item.id}`;

/** Fuse scores run 0 (identical) to 1; at or under this a title is the typed words, give or take a slip */
export const NEAR_EXACT = 0.05;

/**
 * The palette's lesson list: on a DSA page the DSA hits lead (a learner searching Practice means DSA), except another
 * course's lesson whose title is the query (near-exact), which still goes first. `other` is the shared search's hits with their Fuse scores.
 */
export function mergeLessonHits<T>(dsa: T[], other: { hit: T; score: number }[], limit = 10): T[] {
  const near = other.filter((o) => o.score <= NEAR_EXACT).map((o) => o.hit);
  const rest = other.filter((o) => o.score > NEAR_EXACT).map((o) => o.hit);
  return [...near, ...dsa, ...rest].slice(0, limit);
}
