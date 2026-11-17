/**
 * ⌘K on a DSA page: the lessons and problems the palette can find, in the palette's own doc shape (week + slug make the link
 * /<week>/<slug>), and the merge of DSA lecture/short moments into the shared transcript index. Pure and import-free apart
 * from types, so node --test can run it. The route (src/app/api/dsa/search-index/route.ts) feeds it from the content.
 */
import type { TranscriptIndex } from "@/lib/learn/lecture/transcript";
import { CLASSIC_NAMES } from "./classics";
import { LEAN_BRANCH_WORD, LEAN_ROOT, type LeanKind } from "./kinds";
import { facetsOf } from "./taxonomy";
import { topicLabels } from "./search/items";
import type { SearchMeta } from "./search/items";

export type DsaSearchDoc = { slug: string; title: string; course: string; week: string; path: string; type: "day-content" | "problem"; order: number; content: string; excerpt: string;
  /** problems only: what the instant engine ranks on (src/lib/dsa/search/): level, other names, topics, tags, domains, lesson */
  meta?: SearchMeta };
export type DsaSearchIndex = { v: 1; docs: DsaSearchDoc[]; transcripts: TranscriptIndex };

type Concept = { id: string; module: string; order: number; title: string; status: string; summary: string; kind?: "concept" | "structure" | "algorithm" };
type Problem = { id: string; title: string; module: string; concept: string; level: string; patterns: string[]; classic: string[]; blurb?: string; own?: { structures?: string[]; algorithms?: string[] }; companyTypes?: string[]; domain?: string; signals?: string[] };

const plain = (s: string) => s.replace(/\s+/g, " ").trim();
const dash = (s: string) => s.replace(/-/g, " ");

/** The lesson's folder in the URL: /dsa/structures/<id>, /dsa/algorithms/<id>, else /dsa/concepts/<id>. */
export const lessonWeek = (c: Pick<Concept, "kind">) => (c.kind === "structure" ? "dsa/structures" : c.kind === "algorithm" ? "dsa/algorithms" : "dsa/concepts");

/** A written lean lesson (street, camp tent, set; kinds.ts) as the palette lists it. */
export type LeanDocInput = { id: string; module: string; kind: LeanKind; title: string; summary: string; /** the station's label ("2.3 Hashing"), a company set's group ("Fintech") */ where: string };

/** One doc per ready lesson (Academy and lean) and per problem. Planned lessons are left out (there is no page to open). */
export function buildDsaDocs(concepts: Concept[], problems: Problem[], stepOf: (module: string) => string = () => "", lean: LeanDocInput[] = []): DsaSearchDoc[] {
  const titles = new Map(concepts.map((c) => [c.id, c.title]));
  const lessons = concepts
    .filter((c) => c.status === "built")
    .map((c, i): DsaSearchDoc => {
      const week = lessonWeek(c);
      const step = stepOf(c.module);
      return { slug: c.id, title: c.title, course: "dsa", week, path: `${week}/${c.id}`, type: "day-content", order: i, content: plain(`${c.title} ${step} ${c.summary}`), excerpt: plain(c.summary) };
    });
  // streets, camp tents and sets: /dsa/<districts|camps|sets>/<module>/<lesson> (the palette links /<week>/<slug>)
  const leanDocs = lean.map((l, i): DsaSearchDoc => {
    const week = `dsa/${LEAN_ROOT[l.kind]}/${l.module}`;
    return { slug: l.id, title: l.title, course: "dsa", week, path: `${week}/${l.id}`, type: "day-content", order: lessons.length + i, content: plain(`${l.title} ${LEAN_BRANCH_WORD[l.kind]} ${l.where} ${l.summary}`), excerpt: plain(l.summary) };
  });
  const probs = problems.map((p, i): DsaSearchDoc => {
    const lesson = titles.get(p.concept) || "";
    const text = plain([p.title, p.blurb || "", p.level, ...p.patterns.map(dash), ...p.classic, lesson, p.domain || "", ...(p.signals || []).slice(0, 3)].join(" "));
    const f = facetsOf({ patterns: p.patterns, module: p.module, structures: p.own?.structures, algorithms: p.own?.algorithms });
    const aliases = p.classic.flatMap((c) => {
      const num = c.match(/^lc-(\d+)$/i);
      const name = CLASSIC_NAMES[c.toLowerCase()];
      return [...(name ? [name] : []), num ? `LC ${num[1]}` : c];
    });
    const level = p.level === "easy" || p.level === "hard" ? p.level : "medium";
    const meta: SearchMeta = { lv: level, al: aliases, tp: topicLabels(f), tg: p.patterns, dm: [...(p.companyTypes || []), ...(p.domain ? [p.domain] : [])], ls: lesson };
    return { meta, slug: p.id, title: p.title, course: "dsa", week: "dsa/problems", path: `dsa/problems/${p.id}`, type: "problem", order: 10_000 + i, content: text, excerpt: plain(p.blurb || `${p.level} problem${lesson ? ` · ${lesson}` : ""}`) };
  });
  return [...lessons, ...leanDocs, ...probs];
}

/** The shared transcript index with the DSA one appended: the DSA moments' lecture numbers move past the shared lectures. */
export function mergeTranscripts(base: TranscriptIndex, extra: TranscriptIndex): TranscriptIndex {
  const shift = base.l.length;
  return { v: 1, built: extra.built > base.built ? extra.built : base.built, l: [...base.l, ...extra.l], m: [...base.m, ...extra.m.map(([k, at, text]): [number, number, string] => [k + shift, at, text])] };
}
