/**
 * The two rankings the Practice page uses, over rows and an index built from the same rows (same order):
 *   instantRank  the typed words (and the filter words in them: easy, unsolved ...) over every row
 *   smartRank    the model's filters as chips (relaxed when they leave nothing), the rows ranked by its keywords
 * Pure.
 */
import { evaluate, emptyState, type FilterRow, type FilterState, type GroupId, type Status } from "../problem-filters";
import { buildIndex, parseQuery, search, type Hit, type ParsedQuery, type SearchIndex, type SearchItem } from "./engine";
import { RELAX_ORDER, smartBoost, smartSelection, type SmartAnswer } from "./smart";

export type Progress = { statusOf: (id: string) => Status; isSaved?: (id: string) => boolean };

/** the progress filter a query's words ask for (unsolved, solved, saved), as an item test */
export function progressTest(pq: ParsedQuery, p: Progress | undefined, byId: Map<string, string>): ((item: SearchItem) => boolean) | undefined {
  const st = pq.status;
  if (!st || !p) return undefined;
  if (st === "saved") return p.isSaved ? (it) => !!p.isSaved?.(it.id) : undefined;
  if (st === "solved") return (it) => p.statusOf(it.id) === "solved";
  return (it) => p.statusOf(it.id) !== "solved" && byId.has(it.id);
}

export function makeIndex(items: SearchItem[]): SearchIndex {
  return buildIndex(items);
}

/** Ranked hits for typed words. Level words in the query filter by difficulty; progress words filter by progress. */
export function instantRank(index: SearchIndex, query: string, p?: Progress, limit = 50): { hits: Hit[]; pq: ParsedQuery } {
  const pq = parseQuery(query);
  const lv = pq.levels;
  const ids = new Map<string, string>();
  const prog = progressTest(pq, p, new Map(index.docs.map((d) => [d.item.id, d.item.id])));
  const accept = (it: SearchItem) => (!lv.length || lv.includes(it.level)) && (!prog || prog(it));
  void ids;
  return { hits: search(index, pq, { accept, limit }), pq };
}

export type SmartRanked = { rows: FilterRow[]; sel: FilterState["sel"]; relaxed: GroupId[] };

/** an item's weight for the topics the answer picked: each of the three topic groups it hits is worth this much */
const TOPIC_BONUS = 12;

/**
 * The answer over the rows. Difficulty, status and domain are filters (the learner asked for them in words; relaxed,
 * narrowest first, if nothing passes). Topics lift the rows that are about them, the keywords rank, and the typed words
 * themselves still count a little, so a famous problem named in the sentence is found even when the model's topics miss it.
 */
export function smartRank(rows: FilterRow[], index: SearchIndex, a: SmartAnswer, statusOf: (id: string) => Status, typed = ""): SmartRanked {
  const sel = smartSelection(a);
  const hard = { ...sel, structures: [], algorithms: [], patterns: [] };
  const relaxed: GroupId[] = [];
  const run = () => evaluate(rows, { ...emptyState(), sel: hard }, statusOf).results;
  let pass = run();
  for (const g of RELAX_ORDER) {
    if (pass.length) break;
    if (!hard[g].length) continue;
    hard[g] = [];
    sel[g] = [];
    relaxed.push(g);
    pass = run();
  }
  const ok = new Set(pass.map((r) => r.id));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const bonus = (it: SearchItem) => {
    const r = byId.get(it.id);
    if (!r) return 0;
    let b = 0;
    if (sel.patterns.length && sel.patterns.some((x) => r.patterns.includes(x))) b += TOPIC_BONUS;
    if (sel.algorithms.length && sel.algorithms.some((x) => r.algorithms.includes(x))) b += TOPIC_BONUS;
    if (sel.structures.length && sel.structures.some((x) => r.structures.includes(x))) b += TOPIC_BONUS;
    return b;
  };
  const words = typed ? parseQuery(typed).terms : [];
  const hits = search(index, "", { boost: [...smartBoost(a), ...words], accept: (it) => ok.has(it.id), bonus, limit: 1000 });
  const ranked = hits.map((h) => byId.get(h.item.id)).filter((r): r is FilterRow => !!r);
  return { rows: ranked.length ? ranked : pass, sel, relaxed };
}
