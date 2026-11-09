import "server-only";
/**
 * DSA Mastery's retrieval for the AI tutor (/dsa/ask, the Ask panel on DSA pages, the problem room's tutor). Built from the
 * content loader's own sources (src/lib/dsa/content.ts), never from the SD Mastery search Worker, and sized for Workers:
 *
 *   1. The catalog: one small entry per built concept (title, summary, invariant, key points, signals) and per problem
 *      (title, concept, patterns, classic ids, signals, the task's first lines). ~0.6 KB each, so ~600 KB at 1,000
 *      problems: one data-cache item, tokenised once per isolate.
 *   2. Shards, one data-cache item per concept (its lesson in heading chunks, with the page anchor, and its lecture's
 *      narration) and per problem (its statement, signature, constraints and target complexity, the hint rungs, and the
 *      editorial with the reference solutions). A question only ever loads the shards of the few catalog hits.
 *
 * `searchDsa` ranks the catalog with BM25 for the question (plus the learner's previous message for a short follow-up,
 * and the page they're on), opens the shards of the top concepts and problems (and the page's own), ranks their chunks
 * with BM25 and returns the best few within a character budget. Editorial chunks are only ever candidates for problems
 * in `unlocked` (lib/dsa/ai/unlock.ts: solved, three failed submits, or the editorial revealed), so a locked editorial
 * never reaches the model. Hints aren't search results: only the problem tutor reads them, rung by rung.
 *
 * Cost: no model call and no network beyond the cached items. Measured locally on 7 concepts and 41 problems: the
 * catalog builds in ~150 ms cold (once per revalidation), a search with warm shards takes ~1–3 ms.
 */
import matter from "gray-matter";
import { unstable_cache } from "next/cache";
import { DSA_CONTENT_TAG, dsaFresh, readDsa, readDsaJson } from "../content";
import { conceptHref, conceptLectureHref, getConcept, getConceptIndex, getProblemIndex, problemHref } from "../load";
import type { DsaLang, DsaSignature } from "../types";
import { bm25Index, bm25Scores, plainMd, sectionChunks, tokens, type Bm25 } from "./text";

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CACHE = { revalidate: 604800, tags: [DSA_CONTENT_TAG] };

/** A data-cache item (skipped while developing against DSA_LOCAL_DIR), plus a per-isolate copy for `memoMs`. */
function cached<A extends string[], R>(fn: (...a: A) => Promise<R>, key: string, memoMs = 10 * 60_000): (...a: A) => Promise<R> {
  const c = unstable_cache(fn, [key], CACHE);
  const memo = new Map<string, { at: number; p: Promise<R> }>();
  return (...a: A) => {
    const k = a.join("|");
    const ttl = dsaFresh() ? 30_000 : memoMs;
    const hit = memo.get(k);
    if (hit && Date.now() - hit.at < ttl) return hit.p;
    const p = dsaFresh() ? fn(...a) : c(...a);
    memo.set(k, { at: Date.now(), p });
    if (memo.size > 200) memo.delete(memo.keys().next().value as string);
    p.catch(() => memo.delete(k));
    return p;
  };
}

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/* ------------------------------------------------------------------ the catalog */

export type CatalogEntry = { kind: "concept" | "problem"; id: string; title: string; sub: string; href: string; text: string; concept?: string };

type LessonFront = { title?: string; invariant?: string; keyPoints?: string[]; signals?: string[]; line?: string };
type ProblemFront = { title?: string; concept?: string; level?: string; tags?: { patterns?: string[]; classic?: string[]; signals?: string[] } };

/** "## Your task" (or the given heading) of a problem body, as plain text. */
function sectionOf(body: string, title: string): string {
  const re = new RegExp(`^##\\s+${title}\\s*$`, "im");
  const m = re.exec(body);
  if (!m) return "";
  const rest = body.slice(m.index + m[0].length);
  const end = rest.search(/^##\s+/m);
  return (end < 0 ? rest : rest.slice(0, end)).trim();
}

export const getCatalog = cached(async (): Promise<CatalogEntry[]> => {
  const [concepts, problems] = await Promise.all([getConceptIndex(), getProblemIndex()]);
  const built = concepts.filter((c) => c.status === "built");
  const titleOf = new Map(concepts.map((c) => [c.id, c.title]));
  const out: CatalogEntry[] = [];
  for (const c of built) {
    const md = await readDsa(`resources/modules/${c.module}/${c.id}/lesson.md`).catch(() => null);
    const f = (md ? matter(md, {}).data : {}) as LessonFront;
    out.push({
      kind: "concept",
      id: c.id,
      title: f.title || c.title,
      sub: "Concept",
      href: conceptHref(c.id),
      text: [c.summary, f.invariant, ...(f.keyPoints || []), (f.signals || []).join(", ")].filter(Boolean).join("\n"),
    });
  }
  for (let i = 0; i < problems.length; i += 8) {
    const batch = await Promise.all(
      problems.slice(i, i + 8).map(async (p) => {
        const md = await readDsa(`resources/problems/${p.id}/problem.md`).catch(() => null);
        if (!md) return null;
        const { data, content } = matter(md, {});
        const f = data as ProblemFront;
        const task = oneLine(plainMd(sectionOf(content, "Your task"), { codeLines: 0 }));
        return {
          kind: "problem" as const,
          id: p.id,
          title: p.title,
          sub: `Problem · ${p.level}${titleOf.get(p.concept) ? ` · ${titleOf.get(p.concept)}` : ""}`,
          href: problemHref(p.id),
          concept: p.concept,
          text: [p.line, (f.tags?.patterns || p.patterns).join(" "), (f.tags?.classic || p.classic).join(" "), (f.tags?.signals || []).join(", "), clip(task, 400)].filter(Boolean).join("\n"),
        };
      }),
    );
    for (const b of batch) if (b) out.push(b);
  }
  return out;
}, "dsa-ai-catalog-v1");

/** The catalog's BM25 index, one per isolate (rebuilt when the catalog item changes). */
let catalogIx: { from: CatalogEntry[]; ix: Bm25 } | null = null;
async function catalogIndex(): Promise<{ entries: CatalogEntry[]; ix: Bm25 }> {
  const entries = await getCatalog();
  if (!catalogIx || catalogIx.from !== entries) catalogIx = { from: entries, ix: bm25Index(entries.map((e) => `${e.title} ${e.title} ${e.title}\n${e.text}`)) };
  return { entries, ix: catalogIx.ix };
}

/* ------------------------------------------------------------------ shards */

export type DsaChunk = { key: string; kind: "lesson" | "lecture" | "problem" | "editorial"; owner: string; title: string; sub: string; href: string; text: string };

/** A concept's lesson (heading chunks with their page anchors) and its lecture's narration. */
const conceptShard = cached(async (id: string): Promise<DsaChunk[]> => {
  const c = (await getConceptIndex()).find((x) => x.id === id);
  if (!c || c.status !== "built") return [];
  const dir = `resources/modules/${c.module}/${id}`;
  const [md, lecture, page] = await Promise.all([
    readDsa(`${dir}/lesson.md`),
    readDsaJson<{ title?: string; scenes?: { title?: string; heading?: string; steps?: { say?: string }[] }[] }>(`${dir}/lecture.json`).catch(() => null),
    getConcept(id).catch(() => null),
  ]);
  const title = page?.title || c.title;
  // the source card's second line: the module ("M5 Sliding window")
  const where = page?.moduleTitle || "";
  // heading text → the page's anchor (the renderer's own ids, so a citation opens the right section)
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const anchors = new Map((page?.toc || []).map((t) => [norm(t.text), t.id]));
  const out: DsaChunk[] = [];
  if (md) {
    const { content } = matter(md, {});
    let n = 0;
    for (const ch of sectionChunks(plainMd(content))) {
      if (/^(review cards|practice ladder|checkpoint)$/i.test(ch.h3) || !ch.text.trim()) continue;
      const head = ch.h3 || ch.h2;
      const anchor = anchors.get(norm(ch.h3)) || anchors.get(norm(ch.h2));
      out.push({ key: `c:${id}:${n++}`, kind: "lesson", owner: id, title: head ? `${title} › ${head.replace(/^\d+\.\s*/, "")}` : title, sub: where, href: `${conceptHref(id)}${anchor ? `#${anchor}` : ""}`, text: ch.text });
    }
  }
  if (lecture?.scenes?.length) {
    let acc = "";
    let first = "";
    let n = 0;
    const flush = () => {
      if (acc.trim()) out.push({ key: `l:${id}:${n++}`, kind: "lecture", owner: id, title: `${title} lecture${first ? ` › ${first}` : ""}`, sub: where, href: conceptLectureHref(id), text: acc.trim() });
      acc = "";
      first = "";
    };
    for (const s of lecture.scenes) {
      const said = (s.steps || []).map((x) => x.say || "").filter(Boolean).join(" ");
      if (!said) continue;
      if (!first) first = s.title || s.heading || "";
      acc += `${acc ? "\n\n" : ""}${said}`;
      if (acc.length > 1200) flush();
    }
    flush();
  }
  return out;
}, "dsa-ai-concept-v1");

export type ProblemShard = {
  id: string;
  title: string;
  level: string;
  concept: string;
  conceptTitle: string;
  signature: DsaSignature | null;
  complexity: { time: string; space: string } | null;
  /** scenario, task, examples, constraints (plain markdown) */
  statement: string;
  /** the five authored rungs of the Hints tab, in ladder order */
  rungs: { title: string; text: string }[];
  /** "Scenario to model": the scenario as a model table (the room's hint material, given with the first rung) */
  model: string;
  /** the editorial (plain markdown) and the reference solutions: only ever used for a learner who unlocked it */
  editorial: string;
  solutions: Partial<Record<DsaLang, string>>;
  chunks: DsaChunk[];
};

const SOLUTION_FILES: [DsaLang, string][] = [
  ["python", "solution.py"],
  ["javascript", "solution.js"],
  ["java", "Solution.java"],
  ["cpp", "solution.cpp"],
];

const problemShardCached = cached(async (id: string): Promise<ProblemShard | null> => {
  const md = await readDsa(`resources/problems/${id}/problem.md`);
  if (!md) return null;
  const { data, content } = matter(md, {});
  const f = data as ProblemFront & { signature?: DsaSignature; complexity?: { time?: string; space?: string }; title?: string };
  const concepts = await getConceptIndex();
  const conceptTitle = concepts.find((c) => c.id === f.concept)?.title || f.concept || "";
  const title = f.title || id;
  const part = (t: string) => plainMd(sectionOf(content, t));
  const statement = [["Scenario", part("Scenario")], ["Your task", part("Your task")], ["Examples", part("Examples")], ["Constraints", part("Constraints")]]
    .filter(([, t]) => t)
    .map(([h, t]) => `### ${h}\n\n${t}`)
    .join("\n\n");
  const hintsMd = sectionOf(content, "Hints");
  const rungs = hintsMd
    .split(/^###\s+/m)
    .slice(1)
    .map((chunk) => {
      const nl = chunk.indexOf("\n");
      return { title: (nl < 0 ? chunk : chunk.slice(0, nl)).trim(), text: plainMd(nl < 0 ? "" : chunk.slice(nl + 1)) };
    })
    .filter((r) => r.text);
  const editorial = part("Editorial");
  const codes = await Promise.all(SOLUTION_FILES.map(([, file]) => readDsa(`resources/problems/${id}/solutions/${file}`).catch(() => null)));
  const solutions: ProblemShard["solutions"] = {};
  SOLUTION_FILES.forEach(([lang], i) => {
    if (codes[i]?.trim()) solutions[lang] = codes[i]!;
  });
  const sub = `${(f.level || "medium").replace(/^./, (x) => x.toUpperCase())} · ${conceptTitle}`;
  const chunks: DsaChunk[] = [];
  let n = 0;
  for (const ch of sectionChunks(statement, { max: 1800 })) chunks.push({ key: `p:${id}:${n++}`, kind: "problem", owner: id, title: `${title}${ch.h3 && ch.h3 !== "Scenario" ? ` › ${ch.h3}` : ""}`, sub, href: problemHref(id), text: ch.text });
  n = 0;
  // the editorial's "::solutions" block is the four reference solutions: its chunk carries the Python one as code
  const withCode = solutions.python ? plainMd(sectionOf(content, "Editorial").replace(/^::solutions\s*$/m, `\`\`\`python\n${solutions.python.trim()}\n\`\`\``)) : editorial;
  for (const ch of sectionChunks(withCode)) chunks.push({ key: `e:${id}:${n++}`, kind: "editorial", owner: id, title: `${title} › editorial${ch.h3 ? ` › ${ch.h3.replace(/^\d+\.\s*/, "")}` : ""}`, sub: `Editorial · ${conceptTitle}`, href: problemHref(id), text: ch.text });
  return {
    id,
    title,
    level: f.level || "medium",
    concept: f.concept || "",
    conceptTitle,
    signature: f.signature ?? null,
    complexity: f.complexity?.time ? { time: f.complexity.time, space: f.complexity.space || "" } : null,
    statement,
    rungs,
    model: part("Scenario to model"),
    editorial,
    solutions,
    chunks,
  };
}, "dsa-ai-problem-v1");

export async function getProblemShard(id: string): Promise<ProblemShard | null> {
  return ID.test(id) ? problemShardCached(id) : null;
}

/* ------------------------------------------------------------------ search */

export type DsaHit = DsaChunk & { score: number };

/** Where the learner is, for a boost: /dsa/concepts/<id>[/lecture] or /dsa/problems/<id>. */
export function pageItem(path: string | null | undefined): { kind: "concept" | "problem"; id: string } | null {
  const p = (path || "").split(/[?#]/)[0];
  const c = /^\/dsa\/concepts\/([a-z0-9-]+)/.exec(p);
  if (c && ID.test(c[1])) return { kind: "concept", id: c[1] };
  const q = /^\/dsa\/problems\/([a-z0-9-]+)/.exec(p);
  if (q && ID.test(q[1])) return { kind: "problem", id: q[1] };
  return null;
}

export type SearchOpts = {
  /** the question (and, for a short follow-up, the learner's previous message) */
  query: string;
  /** problem ids whose editorial this learner may read */
  unlocked: Set<string>;
  /** the page they're asking from */
  page?: { kind: "concept" | "problem"; id: string } | null;
  /** at most this many chunks, and this many characters of chunk text in all */
  limit?: number;
  budget?: number;
};

export type SearchResult = { hits: DsaHit[]; concepts: CatalogEntry[]; problems: CatalogEntry[]; ms: number };

export async function searchDsa(o: SearchOpts): Promise<SearchResult> {
  const t0 = Date.now();
  const q = tokens(o.query);
  const { entries, ix } = await catalogIndex();
  const scores = bm25Scores(ix, q);
  const ranked = entries.map((e, i) => ({ e, s: scores[i] })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  const concepts = ranked.filter((x) => x.e.kind === "concept").slice(0, 3).map((x) => x.e);
  const problems = ranked.filter((x) => x.e.kind === "problem").slice(0, 4).map((x) => x.e);
  // a problem hit brings its concept along (the lesson explains the idea behind it)
  const conceptIds = new Set(concepts.map((c) => c.id));
  for (const p of problems.slice(0, 2)) if (p.concept && conceptIds.size < 4) conceptIds.add(p.concept);
  const problemIds = new Set(problems.map((p) => p.id));
  if (o.page?.kind === "concept") conceptIds.add(o.page.id);
  if (o.page?.kind === "problem") problemIds.add(o.page.id);
  const [cShards, pShards] = await Promise.all([Promise.all([...conceptIds].map((id) => conceptShard(id).catch(() => []))), Promise.all([...problemIds].map((id) => getProblemShard(id).catch(() => null)))]);
  const pool: DsaChunk[] = [...cShards.flat()];
  for (const s of pShards) if (s) pool.push(...s.chunks.filter((c) => c.kind !== "editorial" || o.unlocked.has(s.id)));
  if (!pool.length) return { hits: [], concepts, problems, ms: Date.now() - t0 };
  const cix = bm25Index(pool.map((c) => `${c.title} ${c.title}\n${c.text}`));
  const cs = bm25Scores(cix, q);
  // the page's own material ranks a little higher; the catalog's best concept and problem too
  const top = new Set([concepts[0]?.id, problems[0]?.id, o.page?.id].filter(Boolean) as string[]);
  const hits = pool
    .map((c, i) => ({ ...c, score: cs[i] * (top.has(c.owner) ? 1.25 : 1) * (c.owner === o.page?.id ? 1.2 : 1) }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score);
  const limit = o.limit ?? 6;
  const budget = o.budget ?? 8000;
  const out: DsaHit[] = [];
  const perOwner = new Map<string, number>();
  // two pieces of one long section are one source (one card, one ref), their text joined in reading order
  const bySection = new Map<string, DsaHit>();
  let used = 0;
  for (const h of hits) {
    if (out.length >= limit) break;
    if (used + h.text.length > budget && out.length >= 2) continue;
    const same = bySection.get(`${h.owner}|${h.title}`);
    if (same) {
      const first = Number(same.key.split(":").pop()) < Number(h.key.split(":").pop());
      same.text = first ? `${same.text}\n\n${h.text}` : `${h.text}\n\n${same.text}`;
      used += h.text.length;
      continue;
    }
    const n = perOwner.get(h.owner) ?? 0;
    if (n >= 3) continue;
    const hit = { ...h };
    out.push(hit);
    bySection.set(`${h.owner}|${h.title}`, hit);
    perOwner.set(h.owner, n + 1);
    used += h.text.length;
  }
  return { hits: out, concepts, problems, ms: Date.now() - t0 };
}

/** The built concepts as one line each, for the tutor's system prompt (changes only with the course, so it caches). */
export const courseOutline = cached(async (): Promise<string> => {
  const [concepts, problems] = await Promise.all([getConceptIndex(), getProblemIndex()]);
  const count = new Map<string, number>();
  for (const p of problems) count.set(p.concept, (count.get(p.concept) ?? 0) + 1);
  const built = concepts.filter((c) => c.status === "built");
  const planned = concepts.filter((c) => c.status !== "built").length;
  return [
    ...built.map((c) => `- ${c.title} (${c.module.replace(/^m\d+-/, "").replace(/-/g, " ")}): ${clip(c.summary, 140)} [${count.get(c.id) ?? 0} problems]`),
    `${planned} more concepts are planned (opening in weekly waves); ${problems.length} problems are live in all.`,
  ].join("\n");
}, "dsa-ai-outline-v1");
