import "server-only";
import matter from "gray-matter";
import { unstable_cache } from "next/cache";
import { DSA_CONTENT_TAG, dsaFresh, readDsa } from "./content";
import { getProblemIndex, getStepLabels } from "./load";
import { stepOf } from "./steps";
import { listCheatsheets } from "./cheatsheet";
import type { DsaLevel } from "./types";

/**
 * Patterns A–Z (/dsa/patterns): DSA Mastery's glossary, built only from the content repo:
 *   resources/scenarios/library.yml  `patterns:`  the pattern ids problems are tagged with, and their names
 *   resources/concepts.yml           `terms:`     glossary definitions, aliases, refreshers, where each is taught
 *                                    `concepts:`  every lesson (built or planned) with its one-sentence summary
 *   resources/course.yml             module codes and titles; resources/worlds/product-districts.yml district titles
 *   resources/problems/<id>          tags (patterns, classic twins) and the editorial's "Same pattern elsewhere"
 *                                    list, which names each twin as "LeetCode <n>: <title>"
 * One entry per idea: a term, a pattern and a lesson that name the same thing merge (same id, or the small alias
 * tables below). Nothing is written here: an entry with no definition in the content shows none, and an idea whose
 * lesson isn't written yet shows as "coming" with the module or district it belongs to.
 */

export type PatternKind = "pattern" | "term" | "lesson";

export type PatternHome =
  | { kind: "concept"; id: string; title: string; module: string; code: string; moduleTitle: string; built: boolean }
  | { kind: "module"; module: string; code: string; moduleTitle: string; built: false }
  | { kind: "district"; code: string; title: string; built: false };

export type PatternEntry = {
  id: string;
  name: string;
  kinds: PatternKind[];
  aliases: string[];
  definition: string | null;
  refresher: string[];
  home: PatternHome | null;
  cheatsheet: string | null;
  problems: { id: string; title: string; level: DsaLevel }[];
  classic: { n: number; title: string | null }[];
  related: { id: string; name: string }[];
};

/** Glossary terms that are another name for a pattern (term id → pattern id). */
const TERM_TO_PATTERN: Record<string, string> = {
  "opposite-ends-pointers": "opposite-ends",
  "read-and-write-pointers": "read-write-pointers",
  "prefix-sum": "prefix-sums",
  "fixed-window": "sliding-window-fixed",
  "variable-window": "sliding-window-variable",
  "at-most-k-window": "at-most-k",
  "covering-window": "minimum-cover",
};

/** Lessons that teach one pattern or term under another id (concept id → entry id). */
const CONCEPT_TO_ENTRY: Record<string, string> = {
  "three-sum": "k-sum",
  "merging-sorted-sequences": "merge-sorted",
  "fixed-and-variable-windows": "sliding-window",
  "search-on-the-answer": "binary-search-answer",
  "big-o-as-growth": "big-o",
  "traversal-and-in-place-edits": "traversal",
};

/**
 * Where a pattern is taught when no term or lesson says so: an Academy lesson or module (plan §5.1), or the Product
 * District whose title names it (plan §5.2). Patterns missing here (LRU cache, k-way merge) show as coming, no module.
 */
const PATTERN_HOME: Record<string, { concept?: string; module?: string; district?: string }> = {
  hashing: { module: "m3-hashing" },
  sorting: { module: "m7-sorting" },
  "binary-search": { concept: "first-true-template" },
  "sliding-window-fixed": { concept: "fixed-and-variable-windows" },
  "sliding-window-variable": { concept: "fixed-and-variable-windows" },
  "linked-lists": { district: "d5" },
  stacks: { district: "d6" },
  queues: { district: "d6" },
  "monotonic-deque": { district: "d7" },
  "tree-recursion": { district: "d8" },
  heaps: { district: "d10" },
  "top-k": { district: "d10" },
  bfs: { district: "d11" },
  dfs: { district: "d11" },
  "grid-bfs": { district: "d11" },
  "topological-sort": { district: "d12" },
  "cycle-detection": { district: "d12" },
  dijkstra: { district: "d13" },
  "shortest-paths": { district: "d13" },
  "union-find": { district: "d14" },
  greedy: { district: "d16" },
  dp: { district: "d17" },
  knapsack: { district: "d17" },
  trie: { district: "d18" },
  "string-algorithms": { district: "d18" },
  "fenwick-tree": { district: "d18" },
  "segment-tree": { district: "d18" },
};

type Term = { id: string; term: string; aliases?: string[]; definition?: string; taught_in?: string; related?: string[]; refresher?: string[] };
type Concept = { id: string; module: string; order?: number; title: string; status?: string; summary?: string };

function yaml<T>(src: string): T {
  return matter(`---\n${src}\n---\n`, {}).data as T;
}

/** "LeetCode 643: Maximum Average Subarray I. The same fixed window…" lines in an editorial's section 11. */
function twinTitles(md: string): Map<number, string> {
  const out = new Map<number, string>();
  const at = md.search(/^###\s+11\.\s/m);
  if (at < 0) return out;
  const rest = md.slice(at).split("\n").slice(1);
  for (const line of rest) {
    if (/^#{2,3}\s/.test(line)) break;
    const m = /LeetCode (\d+): (.+?)\.(?:\s|$)/.exec(line);
    if (m && !out.has(Number(m[1]))) out.set(Number(m[1]), m[2].trim());
  }
  return out;
}

async function build(): Promise<PatternEntry[]> {
  const [librarySrc, conceptsSrc, courseSrc, districtsSrc, problems, sheets, labels] = await Promise.all([
    readDsa("resources/scenarios/library.yml"),
    readDsa("resources/concepts.yml"),
    readDsa("resources/course.yml"),
    readDsa("resources/worlds/product-districts.yml"),
    getProblemIndex().catch(() => []),
    listCheatsheets().catch(() => []),
    getStepLabels(),
  ]);
  const patterns = (librarySrc ? yaml<{ patterns?: { id: string; name: string }[] }>(librarySrc).patterns : null) || [];
  const cfile = conceptsSrc ? yaml<{ concepts?: Concept[]; terms?: Term[] }>(conceptsSrc) : {};
  const concepts = cfile.concepts || [];
  const terms = cfile.terms || [];
  const modules = new Map(((courseSrc ? yaml<{ modules?: { id: string; code: string; title: string }[] }>(courseSrc).modules : null) || []).map((m) => [m.id, m]));
  const districts = new Map(
    ((districtsSrc ? yaml<{ regions?: { id: string; code: string; title: string }[] }>(districtsSrc).regions : null) || []).map((r) => [r.code.toLowerCase(), { id: r.id, code: r.code.toUpperCase(), title: r.title }]),
  );
  const conceptById = new Map(concepts.map((c) => [c.id, c]));
  const sheetIds = new Set(sheets.map((s) => s.id));

  const conceptHome = (id: string): PatternHome | null => {
    const c = conceptById.get(id);
    if (!c) return null;
    const m = modules.get(c.module);
    return { kind: "concept", id: c.id, title: c.title, module: c.module, code: stepOf(labels, c.module).step, moduleTitle: m ? stepOf(labels, c.module).title : "", built: c.status === "built" };
  };
  const moduleHome = (id: string): PatternHome | null => {
    const m = modules.get(id);
    if (!m) return null;
    return { kind: "module", module: id, code: stepOf(labels, id).step, moduleTitle: stepOf(labels, id).title, built: false };
  };
  const districtHome = (code: string): PatternHome | null => {
    const d = districts.get(code.toLowerCase());
    return d ? { kind: "district", code: d.code, title: d.title, built: false } : null;
  };
  /** taught_in: <module>/<concept>#<beat> | <module>/<concept> | district/<district id> */
  const taughtHome = (t: string | undefined): PatternHome | null => {
    if (!t) return null;
    const [path] = t.split("#");
    const [a, b] = path.split("/");
    if (a === "district" && b) return districtHome(b.split("-")[0]);
    return (b && conceptHome(b)) || moduleHome(a);
  };

  type Draft = PatternEntry & { patternId?: string; conceptId?: string; classicIds?: string[]; relatedIds: string[] };
  const blank = (id: string, name: string): Draft => ({ id, name, kinds: [], aliases: [], definition: null, refresher: [], home: null, cheatsheet: null, problems: [], classic: [], related: [], relatedIds: [] });
  const entries = new Map<string, Draft>();

  for (const p of patterns) {
    const e = blank(p.id, p.name);
    e.kinds.push("pattern");
    e.patternId = p.id;
    entries.set(p.id, e);
  }

  const termTarget = new Map<string, string>();
  for (const t of terms) {
    const target = TERM_TO_PATTERN[t.id] || (entries.has(t.id) ? t.id : null);
    const e = target ? entries.get(target)! : blank(t.id, t.term);
    if (!target) entries.set(t.id, e);
    termTarget.set(t.id, e.id);
    if (!e.kinds.includes("term")) e.kinds.push("term");
    if (e.name !== t.term) e.aliases.push(t.term);
    e.aliases.push(...(t.aliases || []));
    if (!e.definition && t.definition) e.definition = t.definition;
    if (!e.refresher.length && t.refresher?.length) e.refresher = t.refresher;
    if (!e.home) e.home = taughtHome(t.taught_in);
    e.relatedIds.push(...(t.related || []));
  }

  for (const c of concepts) {
    const target = CONCEPT_TO_ENTRY[c.id] || (entries.has(c.id) ? c.id : null);
    const e = target && entries.has(target) ? entries.get(target)! : null;
    if (e) {
      if (!e.kinds.includes("lesson")) e.kinds.push("lesson");
      if (e.name !== c.title) e.aliases.push(c.title);
      if (!e.definition && c.summary) e.definition = c.summary;
      if (!e.home || e.home.kind !== "concept" || !e.home.built) e.home = conceptHome(c.id);
      e.conceptId = c.id;
      continue;
    }
    const n = blank(c.id, c.title);
    n.kinds.push("lesson");
    n.definition = c.summary || null;
    n.home = conceptHome(c.id);
    n.conceptId = c.id;
    entries.set(c.id, n);
  }

  for (const e of entries.values()) {
    if (!e.home && e.patternId) {
      const h = PATTERN_HOME[e.patternId];
      if (h) e.home = (h.concept && conceptHome(h.concept)) || (h.module && moduleHome(h.module)) || (h.district && districtHome(h.district)) || null;
    }
    // a built lesson with a cheat sheet links it
    if (e.home?.kind === "concept" && e.home.built && sheetIds.has(e.home.id)) e.cheatsheet = e.home.id;
  }

  // problems: by pattern tag for patterns, by lesson otherwise
  const twinsWanted = new Set<string>();
  for (const e of entries.values()) {
    const list = e.patternId ? problems.filter((p) => p.patterns.includes(e.patternId!)) : e.conceptId ? problems.filter((p) => p.concept === e.conceptId) : [];
    e.problems = list.map((p) => ({ id: p.id, title: p.title, level: p.level }));
    const counts = new Map<string, number>();
    for (const p of list) for (const c of p.classic) counts.set(c, (counts.get(c) || 0) + 1);
    const ids = [...counts.entries()].sort((a, b) => b[1] - a[1] || Number(a[0].slice(3)) - Number(b[0].slice(3))).map(([c]) => c);
    e.classic = ids.filter((c) => /^lc-\d+$/.test(c)).map((c) => ({ n: Number(c.slice(3)), title: null }));
    if (e.classic.length) for (const p of list) twinsWanted.add(p.id);
  }

  // twin titles from the problems' editorials ("Same pattern elsewhere"), read only for problems that have twins
  const titles = new Map<number, string>();
  const ids = [...twinsWanted];
  for (let i = 0; i < ids.length; i += 8) {
    const mds = await Promise.all(ids.slice(i, i + 8).map((id) => readDsa(`resources/problems/${id}/problem.md`).catch(() => null)));
    for (const md of mds) if (md) for (const [n, t] of twinTitles(md)) if (!titles.has(n)) titles.set(n, t);
  }

  const out: PatternEntry[] = [];
  for (const e of entries.values()) {
    const related = [...new Set(e.relatedIds.map((r) => termTarget.get(r) || (entries.has(r) ? r : "")).filter((r) => r && r !== e.id))].map((r) => ({ id: r, name: entries.get(r)!.name }));
    const seen = new Set([e.name.toLowerCase()]);
    out.push({
      id: e.id,
      name: e.name,
      kinds: e.kinds,
      aliases: e.aliases.filter((a) => {
        const k = a.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }),
      definition: e.definition,
      refresher: e.refresher,
      home: e.home,
      cheatsheet: e.cheatsheet,
      problems: e.problems,
      classic: e.classic.map((c) => ({ n: c.n, title: titles.get(c.n) || null })),
      related,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true }));
}

const cached = unstable_cache(build, ["dsa-patterns-az-v2"], { revalidate: 604800, tags: [DSA_CONTENT_TAG] });

export async function getPatternsAZ(): Promise<PatternEntry[]> {
  return dsaFresh() ? build() : cached();
}
