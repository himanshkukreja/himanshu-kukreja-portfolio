/**
 * ⌘K on a DSA page: the lessons and problems the palette can find, in the palette's own doc shape (week + slug make the link
 * /<week>/<slug>), and the merge of DSA lecture/short moments into the shared transcript index. Pure and import-free apart
 * from types, so node --test can run it. The route (src/app/api/dsa/search-index/route.ts) feeds it from the content.
 */
import type { TranscriptIndex } from "@/lib/learn/lecture/transcript";
import { CLASSIC_NAMES } from "./classics";
import { LEAN_BRANCH_WORD, LEAN_ROOT, type LeanKind } from "./kinds";
import { facetsOf } from "./taxonomy";
import { companyId, companyLabel } from "./problem-rows";
import { topicLabels } from "./search/items";
import type { SearchMeta } from "./search/items";

export type DsaSearchDoc = { slug: string; title: string; course: string; week: string; path: string; type: "day-content" | "problem"; order: number; content: string; excerpt: string;
  /** problems only: what the instant engine ranks on (src/lib/dsa/search/): level, other names, topics, tags, domains, lesson */
  meta?: SearchMeta };
/** What goes over the wire per doc: the fields the palette's scorer reads. course, path, type and order are derived on arrival (hydrateDoc), a problem's excerpt is never shown. */
export type DsaWireDoc = { slug: string; title: string; week: string; content: string; excerpt?: string; meta?: SearchMeta };
/** GET /api/dsa/search-index: the docs only (v 2); the lecture and short moments are a second, lazy part (?part=moments, DsaMoments). */
export type DsaSearchIndex = { v: 2; docs: DsaWireDoc[] };
/** GET /api/dsa/search-index?part=moments: the DSA lecture and short moments, in the shared transcript index's shape. */
export type DsaMoments = { v: 1; transcripts: TranscriptIndex };

export const slimDoc = (d: DsaSearchDoc): DsaWireDoc => ({ slug: d.slug, title: d.title, week: d.week, content: d.content, ...(d.type === "problem" ? {} : { excerpt: d.excerpt }), ...(d.meta ? { meta: d.meta } : {}) });
/** the palette's doc from a wire doc (order = its position in the list) */
export const hydrateDoc = (d: DsaWireDoc, i: number): DsaSearchDoc => {
  const problem = d.week === "dsa/problems";
  return { ...d, course: "dsa", path: `${d.week}/${d.slug}`, type: problem ? "problem" : "day-content", order: problem ? 10_000 + i : i, excerpt: d.excerpt ?? "" };
};

type Concept = { id: string; module: string; order: number; title: string; status: string; summary: string; kind?: "concept" | "structure" | "algorithm" };
type Problem = { role?: string; id: string; title: string; module: string; concept: string; level: string; patterns: string[]; classic: string[]; blurb?: string; own?: { structures?: string[]; algorithms?: string[] }; companyTypes?: string[]; domain?: string; signals?: string[] };

const plain = (s: string) => s.replace(/\s+/g, " ").trim();
const dash = (s: string) => s.replace(/-/g, " ");

/** The lesson's folder in the URL: /dsa/structures/<id>, /dsa/algorithms/<id>, else /dsa/concepts/<id>. */
export const lessonWeek = (c: Pick<Concept, "kind">) => (c.kind === "structure" ? "dsa/structures" : c.kind === "algorithm" ? "dsa/algorithms" : "dsa/concepts");

/** A written lean lesson (street, camp tent, set; kinds.ts) as the palette lists it. */
export type LeanDocInput = { id: string; module: string; kind: LeanKind; title: string; summary: string; /** the station's label ("2.3 Hashing"), a company set's group ("Fintech interview set") */ where: string; /** a company set's type id when the lesson names it; else read from the module (co-fintech) */ companyType?: string };

/** the words a company type is searched by: its label ("Fintech", "SaaS") and its id as words ("service mass recruiter"), once each */
const companyWords = (type: string) => {
  const id = companyId(type);
  const label = companyLabel(id);
  return [...new Set([label, id.replace(/-/g, " ")])];
};
/** the company type of a set lesson (module co-<type>), or "" */
const setCompany = (l: Pick<LeanDocInput, "module" | "companyType">) => l.companyType || (/^co-/.test(l.module) ? l.module.slice(3) : "");

/** what the palette's engine ranks a lesson on (no level: lessons are never filtered by a level word) */
const lessonMeta = (tp: string[], tg: string[], dm: string[]): SearchMeta => ({ lv: "medium", al: [], tp, tg, dm, ls: "" });

/** One doc per ready lesson (Academy and lean) and per problem. Planned lessons are left out (there is no page to open). */
export function buildDsaDocs(concepts: Concept[], problems: Problem[], stepOf: (module: string) => string = () => "", lean: LeanDocInput[] = []): DsaSearchDoc[] {
  const titles = new Map(concepts.map((c) => [c.id, c.title]));
  const lessons = concepts
    .filter((c) => c.status === "built")
    .map((c, i): DsaSearchDoc => {
      const week = lessonWeek(c);
      const step = stepOf(c.module);
      const kind = c.kind === "structure" ? "Data structure" : c.kind === "algorithm" ? "Algorithm" : "Concept";
      return { meta: lessonMeta([kind, ...(step ? [step] : [])], [], []), slug: c.id, title: c.title, course: "dsa", week, path: `${week}/${c.id}`, type: "day-content", order: i, content: plain(`${c.title} ${step} ${c.summary}`), excerpt: plain(c.summary) };
    });
  // streets, camp tents and sets: /dsa/<districts|camps|sets>/<module>/<lesson> (the palette links /<week>/<slug>)
  const leanDocs = lean.map((l, i): DsaSearchDoc => {
    const week = `dsa/${LEAN_ROOT[l.kind]}/${l.module}`;
    const co = setCompany(l);
    // a company set is not a gap set: "gap set" is the Core 150 gap sets only
    const branch = co ? "Company set" : LEAN_BRANCH_WORD[l.kind];
    // the branch ("Street", "Camp", "Gap set") and where it sits are topics; a company set's type is its domain ("Fintech", "interview set")
    const meta = lessonMeta([branch, l.where, ...(co ? ["Company interview set"] : [])], [l.module.replace(/^co-/, "")], co ? companyWords(co) : []);
    return { meta, slug: l.id, title: l.title, course: "dsa", week, path: `${week}/${l.id}`, type: "day-content", order: lessons.length + i, content: plain(`${l.title} ${branch} ${l.where} ${l.summary}`), excerpt: plain(l.summary) };
  });
  const probs = problems.map((p, i): DsaSearchDoc => {
    const lesson = titles.get(p.concept) || "";
    const types = [...new Set((p.companyTypes || []).map(companyId))];
    const text = plain([p.title, p.blurb || "", p.level, ...p.patterns.map(dash), ...p.classic, lesson, p.domain || "", ...(p.signals || []).slice(0, 4)].join(" "));
    const f = facetsOf({ patterns: p.patterns, module: p.module, structures: p.own?.structures, algorithms: p.own?.algorithms });
    const aliases = p.classic.flatMap((c) => {
      const num = c.match(/^lc-(\d+)$/i);
      const name = CLASSIC_NAMES[c.toLowerCase()];
      return [...(name ? [name] : []), num ? `LC ${num[1]}` : c];
    });
    const level = p.level === "easy" || p.level === "hard" ? p.level : "medium";
    const meta: SearchMeta = { lv: level, al: aliases, tp: topicLabels(f), tg: p.patterns, dm: [...types.flatMap(companyWords), ...(p.role === "company" ? ["Company interview set"] : []), ...(p.domain ? [p.domain] : [])], ls: lesson };
    return { meta, slug: p.id, title: p.title, course: "dsa", week: "dsa/problems", path: `dsa/problems/${p.id}`, type: "problem", order: 10_000 + i, content: text, excerpt: plain(p.blurb || `${p.level} problem${lesson ? ` · ${lesson}` : ""}`) };
  });
  return [...lessons, ...leanDocs, ...probs];
}

/** The shared transcript index with the DSA one appended: the DSA moments' lecture numbers move past the shared lectures. */
export function mergeTranscripts(base: TranscriptIndex, extra: TranscriptIndex): TranscriptIndex {
  const shift = base.l.length;
  return { v: 1, built: extra.built > base.built ? extra.built : base.built, l: [...base.l, ...extra.l], m: [...base.m, ...extra.m.map(([k, at, text]): [number, number, string] => [k + shift, at, text])] };
}
