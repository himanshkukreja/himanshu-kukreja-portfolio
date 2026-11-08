import "server-only";
import { createHash } from "crypto";
import matter from "gray-matter";
import { unstable_cache } from "next/cache";
import { renderLesson } from "@/lib/course/render";
import type { DsaLink, DsaRenderOpts } from "@/lib/course/detect/dsa";
import { DSA_CONTENT_TAG, dsaFresh, listDsa, readDsa, readDsaJson } from "./content";
import { lectureRefs, parseTemplates, resolveDsaLecture, type RawDsaLecture, type RawRace, type RawTrace } from "./lecture";
import type { Lecture } from "@/lib/learn/lecture/types";
import {
  dsaKeys,
  type ConceptPage,
  type ConceptSummary,
  type DsaLang,
  type DsaLevel,
  type DsaSignature,
  type DsaTestCase,
  type ProblemPage,
  type ProblemSummary,
  type Race,
  type SdmLink,
  type Trace,
  type WorldNode,
  type WorldRegion,
  type WorldSpec,
  type WorldSummary,
} from "./types";

/**
 * DSA Mastery content loaders (server only). Each piece is its own small data-cache item (plan §14.5): the
 * concept and problem indexes, one world spec, one concept page, one problem page, one problem's tests. Nothing
 * holds the whole repo in memory. Tag "dsa-content" (POST /api/revalidate-courses refreshes it after a sync).
 * In development with DSA_LOCAL_DIR every read is fresh.
 */

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CACHE = { revalidate: 604800, tags: [DSA_CONTENT_TAG] };

/** YAML through gray-matter's engine (already a dependency); options passed so gray-matter keeps no copy. */
function yaml<T>(src: string): T {
  return matter(`---\n${src}\n---\n`, {}).data as T;
}

function cached<A extends unknown[], R>(fn: (...a: A) => Promise<R>, key: string): (...a: A) => Promise<R> {
  const c = unstable_cache(fn, [key], CACHE);
  return (...a: A) => (dsaFresh() ? fn(...a) : c(...a));
}

const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 12);

const humanize = (s: string) => {
  const t = s.replace(/^(?:day|problem|bonus|lab)-\d+-/, "").replace(/-/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/* ------------------------------------------------------------------ cast and indexes */

type CastFile = { cast?: { id: string; name: string; role: string }[] };

const castOf = cached(async (): Promise<Record<string, { name: string; role: string }>> => {
  const md = await readDsa("resources/company/cast.md");
  if (!md) return {};
  const data = matter(md, {}).data as CastFile;
  return Object.fromEntries((data.cast || []).map((c) => [c.id, { name: c.name, role: c.role }]));
}, "dsa-cast-v1");

type ConceptsFile = { concepts?: { id: string; module: string; order?: number; title: string; status?: string; summary?: string }[] };

export const getConceptIndex = cached(async (): Promise<ConceptSummary[]> => {
  const src = await readDsa("resources/concepts.yml");
  if (!src) return [];
  const data = yaml<ConceptsFile>(src);
  return (data.concepts || []).map((c) => ({
    id: c.id,
    module: c.module,
    order: c.order ?? 0,
    title: c.title,
    status: c.status === "built" ? "built" : "planned",
    summary: c.summary || "",
  }));
}, "dsa-concepts-v1");

type ModulesFile = { modules?: { id: string; code: string; title: string; building?: string }[] };

const getModules = cached(async (): Promise<Record<string, { code: string; title: string; building: string }>> => {
  const src = await readDsa("resources/course.yml");
  if (!src) return {};
  const data = yaml<ModulesFile>(src);
  return Object.fromEntries((data.modules || []).map((m) => [m.id, { code: m.code, title: m.title, building: m.building || m.title }]));
}, "dsa-modules-v1");

type ProblemFront = {
  id?: string;
  title?: string;
  module?: string;
  concept?: string;
  line?: string;
  level?: string;
  order?: number;
  version?: number;
  signature?: DsaSignature;
  mode?: string;
  checker?: string;
  limits?: { timeMs?: number; memoryMb?: number };
  complexity?: { time?: string; space?: string };
  tags?: { patterns?: string[]; classic?: string[]; minutes?: number };
};

const levelOf = (l: unknown): DsaLevel => (l === "easy" || l === "hard" ? l : "medium");

function summaryOf(id: string, f: ProblemFront): ProblemSummary {
  return {
    id,
    title: f.title || humanize(id),
    module: f.module || "",
    concept: f.concept || "",
    line: f.line || "",
    level: levelOf(f.level),
    order: f.order ?? 0,
    patterns: f.tags?.patterns || [],
    minutes: f.tags?.minutes ?? null,
    classic: f.tags?.classic || [],
  };
}

/**
 * Every built problem's summary. Reads each problem.md's front matter once per revalidation; at bank scale
 * (~1,000) the repo's generated/problem-index.json takes over when it exists, so this stays one small item.
 */
export const getProblemIndex = cached(async (): Promise<ProblemSummary[]> => {
  const pre = await readDsaJson<ProblemSummary[]>("generated/problem-index.json");
  if (Array.isArray(pre)) return pre;
  const dirs = ((await listDsa("resources/problems")) || []).filter((e) => e.endsWith("/")).map((e) => e.slice(0, -1)).filter((d) => ID.test(d));
  const out: ProblemSummary[] = [];
  for (let i = 0; i < dirs.length; i += 6) {
    const batch = await Promise.all(
      dirs.slice(i, i + 6).map(async (id) => {
        const md = await readDsa(`resources/problems/${id}/problem.md`);
        return md ? summaryOf(id, matter(md, {}).data as ProblemFront) : null;
      }),
    );
    out.push(...batch.filter((x): x is ProblemSummary => !!x));
  }
  return out.sort((a, b) => a.module.localeCompare(b.module) || a.concept.localeCompare(b.concept) || a.order - b.order);
}, "dsa-problems-v1");

/* ------------------------------------------------------------------ worlds */

type RawNode = Record<string, unknown> & { id: string; type: string };
type RawRegion = {
  id: string;
  code: string;
  title: string;
  module: string;
  detail?: string;
  status?: string;
  intro?: string;
  concepts?: string[];
  stretches?: { id: string; title: string; nodes: RawNode[] }[];
  side?: RawNode[];
  service?: RawNode;
  boss?: RawNode;
};
type RawWorld = {
  id: string;
  title: string;
  subtitle?: string;
  order?: number;
  audience?: string;
  at_launch?: string;
  theme?: { map?: string; road?: string };
  regions?: RawRegion[];
  final?: RawNode;
};

const WORLD_IDS = ["academy", "product-districts", "career-studio", "challenge-league", "release-train", "infrastructure"] as const;
/** Worlds with a playable map in this build; the others show on the atlas as opening later. */
const OPEN_WORLDS = new Set(["academy"]);

export const conceptHref = (id: string) => `/dsa/concepts/${id}`;
export const problemHref = (id: string) => `/dsa/problems/${id}`;
/** A concept's animated lecture (the course lecture player on its resolved lecture.json). */
export const conceptLectureHref = (id: string) => `/dsa/concepts/${id}/lecture`;

function buildWorld(raw: RawWorld, concepts: Map<string, ConceptSummary>, problems: Map<string, ProblemSummary>): WorldSpec {
  const node = (n: RawNode): WorldNode => {
    const required = n.required !== false && n.type !== "side" && n.type !== "service";
    if (n.type === "concept") {
      const c = concepts.get(String(n.concept));
      const built = c?.status === "built";
      return { id: n.id, type: "concept", title: c?.title || humanize(String(n.concept)), required, href: built ? conceptHref(String(n.concept)) : null, ref: String(n.concept), built };
    }
    if (n.type === "practice") {
      const p = problems.get(String(n.problem));
      return {
        id: n.id,
        type: "practice",
        title: p?.title || String(n.title || humanize(String(n.problem))),
        required,
        href: p ? problemHref(p.id) : null,
        ref: String(n.problem),
        level: p?.level || levelOf(n.level),
        built: !!p,
      };
    }
    if (n.type === "checkpoint") {
      const titles = (n.problem_titles || {}) as Record<string, string>;
      const quiz = String(n.quiz || "");
      const quizConcept = concepts.get(quiz.split("/")[1] || "");
      return {
        id: n.id,
        type: "checkpoint",
        title: "Checkpoint",
        required: true,
        href: quizConcept?.status === "built" ? `${conceptHref(quizConcept.id)}#say` : null,
        built: quizConcept?.status === "built",
        quiz,
        problems: ((n.problems as string[]) || []).map((id) => ({ id, title: problems.get(id)?.title || titles[id] || humanize(id), built: problems.has(id) })),
        pass: Number(n.pass) || 0.8,
        opensAt: Number(n.opens_at) || 0.7,
      };
    }
    if (n.type === "gate") return { id: n.id, type: "gate", title: "Gate", required: true, href: null, built: true, openedBy: String(n.opened_by || "") };
    if (n.type === "boss") return { id: n.id, type: "boss", title: String(n.title || "Boss"), required: true, href: null, built: false, badge: String(n.badge || "") };
    if (n.type === "service") return { id: n.id, type: "service", title: "Review stop", required: false, href: "/review", built: true };
    return { id: n.id, type: "side", title: String(n.title || humanize(n.id)), required: false, href: null, built: false, kind: String(n.kind || "") };
  };

  const regions: WorldRegion[] = (raw.regions || []).map((r) => {
    const stretches = r.stretches?.length
      ? r.stretches.map((s) => ({ id: s.id, title: s.title, nodes: s.nodes.map((n) => node(n)) }))
      : // outline regions: their concepts in order, one stretch (practice comes with the module spec)
        [{ id: "s1", title: "Concepts", nodes: (r.concepts || []).map((c) => node({ id: `${r.code}.${c}`, type: "concept", concept: c, required: true })) }];
    return {
      id: r.id,
      code: r.code,
      title: r.title,
      module: r.module,
      detail: r.detail === "full" ? "full" : "outline",
      status: r.status || "planned",
      intro: r.intro || null,
      stretches,
      side: (r.side || []).map((n) => node(n)),
      boss: r.boss ? node(r.boss) : null,
    };
  });
  return {
    id: raw.id,
    title: raw.title,
    subtitle: raw.subtitle || "",
    order: raw.order ?? 0,
    audience: raw.audience || "",
    atLaunch: raw.at_launch || "",
    open: OPEN_WORLDS.has(raw.id),
    theme: { map: raw.theme?.map || "", road: raw.theme?.road || "road" },
    regions,
    final: raw.final ? { id: raw.final.id, type: "boss", title: String(raw.final.title || "Final"), required: true, href: null, built: false, badge: String(raw.final.certificate || "") } : null,
  };
}

const worldCached = cached(async (id: string): Promise<WorldSpec | null> => {
  const src = await readDsa(`resources/worlds/${id}.yml`);
  if (!src) return null;
  const [concepts, problems] = await Promise.all([getConceptIndex(), getProblemIndex()]);
  return buildWorld(yaml<RawWorld>(src), new Map(concepts.map((c) => [c.id, c])), new Map(problems.map((p) => [p.id, p])));
}, "dsa-world-v1");

export async function getWorld(id: string): Promise<WorldSpec | null> {
  if (!ID.test(id)) return null;
  return worldCached(id);
}

export const getWorlds = cached(async (): Promise<WorldSummary[]> => {
  const out = await Promise.all(
    WORLD_IDS.map(async (id) => {
      const src = await readDsa(`resources/worlds/${id}.yml`);
      if (!src) return null;
      // the header lines only: a world file's regions can be long
      const head = src.split(/\n(?=regions:)/)[0];
      const w = yaml<RawWorld>(head);
      return { id: w.id || id, title: w.title || humanize(id), subtitle: w.subtitle || "", order: w.order ?? 0, audience: w.audience || "", atLaunch: w.at_launch || "", open: OPEN_WORLDS.has(id) } satisfies WorldSummary;
    }),
  );
  return out.filter((w): w is WorldSummary => !!w).sort((a, b) => a.order - b.order);
}, "dsa-worlds-v1");

/* ------------------------------------------------------------------ links to System Design Mastery */

async function sdmLinker(): Promise<{ sdm: (path: string) => DsaLink; lab: (id: string) => DsaLink }> {
  const titles = new Map<string, string>();
  const labs = new Map<string, string>();
  try {
    const { getCourseMap } = await import("@/lib/learn/course");
    const map = await getCourseMap();
    if (map) {
      const all = [...map.weeks.flatMap((w) => [...w.lessons, ...(w.boss ? [w.boss] : [])]), ...map.sideQuests, ...(map.problems || []), ...(map.lld || []), ...(map.plan ? [map.plan] : [])];
      for (const l of all) titles.set(`${l.week}/${l.slug}`, l.title);
    }
  } catch {
    /* titles fall back to the slug */
  }
  try {
    const { getLabSummaries } = await import("@/lib/learn/labs/load");
    for (const l of await getLabSummaries()) labs.set(l.id, l.title);
  } catch {
    /* lab titles fall back to the id */
  }
  return {
    sdm: (path) => {
      const clean = path.replace(/^\/+|\/+$/g, "").replace(/\.md$/, "");
      const slug = clean.split("/").pop() || clean;
      return { href: `/${clean}`, title: titles.get(clean) || humanize(slug), kind: clean.startsWith("problem-bank/") ? "problem" : "lesson" };
    },
    lab: (id) => ({ href: `/labs/${id}`, title: labs.get(id) || humanize(id), kind: "lab" }),
  };
}

/** `:::realsystems{sdm="a, b" lab="c"}` targets in a markdown file. */
function realSystemsTargets(md: string): { sdm: string[]; labs: string[] } {
  const sdm: string[] = [];
  const labs: string[] = [];
  for (const m of md.matchAll(/^:{3,}realsystems\{([^}\n]*)\}/gm)) {
    const attrs = m[1];
    const a = attrs.match(/sdm="([^"]*)"/)?.[1];
    const b = attrs.match(/lab="([^"]*)"/)?.[1];
    if (a) sdm.push(...a.split(",").map((s) => s.trim()).filter(Boolean));
    if (b) labs.push(...b.split(",").map((s) => s.trim()).filter(Boolean));
  }
  return { sdm: [...new Set(sdm)], labs: [...new Set(labs)] };
}

/* ------------------------------------------------------------------ concepts */

type LessonFront = {
  id?: string;
  module?: string;
  title?: string;
  line?: string;
  level?: string;
  minutes?: number;
  invariant?: string;
  keyPoints?: string[];
  practice?: string[];
  traces?: string[];
  race?: string;
  reviewCards?: { front: string; back: string }[];
};

/** `:::tabs[...]{id="x"}` blocks: their fences per language (the reorder widget's source). */
function templatesOf(md: string): Record<string, Partial<Record<DsaLang, string>>> {
  return Object.fromEntries(Object.entries(parseTemplates(md)).map(([id, t]) => [id, t.code as Partial<Record<DsaLang, string>>]));
}

const conceptCached = cached(async (id: string): Promise<ConceptPage | null> => {
  const concepts = await getConceptIndex();
  const c = concepts.find((x) => x.id === id);
  if (!c || c.status !== "built") return null;
  const dir = `resources/modules/${c.module}/${id}`;
  const [lessonMd, quizMd, cast, modules, problems, academy, linker] = await Promise.all([
    readDsa(`${dir}/lesson.md`),
    readDsa(`${dir}/quiz.md`),
    castOf(),
    getModules(),
    getProblemIndex(),
    getWorld("academy"),
    sdmLinker(),
  ]);
  if (!lessonMd) return null;
  const { data, content } = matter(lessonMd, {});
  const f = data as LessonFront;
  const quizBody = quizMd ? matter(quizMd, {}).content : "";

  const traceIds = f.traces || [];
  const traceList = await Promise.all(traceIds.map((t) => readDsaJson<Trace>(`generated/traces/${t}.json`)));
  const traces: Record<string, Trace> = {};
  traceList.forEach((t, i) => {
    if (t) traces[traceIds[i]] = { id: t.id, title: t.title, view: t.view, template: t.template ?? null, input: t.input, vars: t.vars, frames: t.frames, result: t.result };
  });
  const races: Record<string, Race> = {};
  if (f.race) {
    const r = await readDsaJson<Race>(`generated/races/${f.race}.json`);
    if (r) races[f.race] = { id: r.id, title: r.title, unit: r.unit, sizes: r.sizes, series: r.series, note: r.note };
  }
  const titles: Record<string, string> = {};
  for (const t of Object.values(traces)) titles[t.id] = t.title;
  for (const r of Object.values(races)) titles[r.id] = r.title;

  const dsa: DsaRenderOpts = { cast, beats: true, checkpointQuiz: quizBody, titles, sdmLink: linker.sdm, labLink: linker.lab };
  const rendered = await renderLesson(content, { kind: "day-content", dsa });

  const byId = new Map(problems.map((p) => [p.id, p]));
  const practice = (f.practice || []).map((p) => byId.get(p)).filter((p): p is ProblemSummary => !!p);

  // the checkpoint node whose quiz is this concept's (Academy map): its gate key
  let checkpoint: ConceptPage["checkpoint"] = null;
  const region = academy?.regions.find((r) => r.module === c.module);
  for (const s of region?.stretches || []) {
    const n = s.nodes.find((x) => x.type === "checkpoint" && x.quiz === `${c.module}/${id}`);
    if (n && region) {
      const num = n.id.match(/checkpoint-(\d+)$/)?.[1] || "1";
      checkpoint = { nodeId: n.id, key: dsaKeys.gate("academy", region.id, num), pass: n.pass ?? 0.8, problems: n.problems || [] };
    }
  }
  const mod = modules[c.module];
  return {
    id,
    module: c.module,
    moduleTitle: mod ? `${mod.code} ${mod.title}` : c.module,
    regionTitle: region?.title || mod?.building || "",
    title: f.title || c.title,
    summary: c.summary,
    level: f.level || "beginner",
    minutes: f.minutes || rendered.readingMinutes,
    line: f.line || "",
    invariant: f.invariant || "",
    keyPoints: f.keyPoints || [],
    html: rendered.html,
    stages: rendered.stages.map((s) => ({ id: s.id, label: s.label, title: s.title, minutes: s.minutes })),
    toc: rendered.toc,
    readingMinutes: rendered.readingMinutes,
    contentVersion: rendered.contentVersion,
    traces,
    races,
    templates: templatesOf(content),
    reviewCards: f.reviewCards || [],
    practice,
    checkpoint,
  };
}, "dsa-concept-v1");

export async function getConcept(id: string): Promise<ConceptPage | null> {
  if (!ID.test(id)) return null;
  return conceptCached(id);
}

/* ------------------------------------------------------------------ concept lectures */

/**
 * A built concept's lecture (resources/modules/<module>/<concept>/lecture.json), resolved into one self-contained
 * Lecture (src/lib/dsa/lecture.ts: traces, races, templates and the quote cast inlined), or null when it has none.
 * Its recorded media lives with the SDM lectures' (NEXT_PUBLIC_LECTURE_MEDIA) under lectures/<quest>/, quest being
 * "dsa--<module>--<concept>".
 */
const lectureCached = cached(async (id: string): Promise<Lecture | null> => {
  const c = (await getConceptIndex()).find((x) => x.id === id);
  if (!c || c.status !== "built") return null;
  const dir = `resources/modules/${c.module}/${id}`;
  const raw = await readDsaJson<RawDsaLecture>(`${dir}/lecture.json`);
  if (!raw || !Array.isArray(raw.scenes) || !raw.scenes.length) return null;
  const refs = lectureRefs(raw);
  const [lessonMd, cast, traceList, raceList] = await Promise.all([
    readDsa(`${dir}/lesson.md`),
    castOf(),
    Promise.all(refs.traces.map((t) => readDsaJson<RawTrace>(`generated/traces/${t}.json`))),
    Promise.all(refs.races.map((r) => readDsaJson<RawRace>(`generated/races/${r}.json`))),
  ]);
  const traces = Object.fromEntries(refs.traces.map((t, i) => [t, traceList[i]]));
  const races = Object.fromEntries(refs.races.map((r, i) => [r, raceList[i]]));
  return resolveDsaLecture(raw, { lessonMd, traces, races, cast });
}, "dsa-lecture-v1");

export async function getConceptLecture(id: string): Promise<Lecture | null> {
  if (!ID.test(id)) return null;
  return lectureCached(id);
}

/* ------------------------------------------------------------------ problems */

type TestsFile = { cases?: DsaTestCase[] };

/** `## Heading` sections of a problem body, in order. */
function sectionsOf(body: string): { title: string; md: string }[] {
  const out: { title: string; md: string }[] = [];
  let cur: { title: string; lines: string[] } | null = null;
  let fence = false;
  for (const line of body.split("\n")) {
    if (/^```/.test(line)) fence = !fence;
    const m = !fence && line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      if (cur) out.push({ title: cur.title, md: cur.lines.join("\n").trim() });
      cur = { title: m[1], lines: [] };
    } else if (cur) cur.lines.push(line);
  }
  if (cur) out.push({ title: cur.title, md: cur.lines.join("\n").trim() });
  return out;
}

/** `### Rung N: …` hints. */
function rungsOf(md: string): { title: string; md: string }[] {
  return md
    .split(/^###\s+/m)
    .slice(1)
    .map((chunk) => {
      const nl = chunk.indexOf("\n");
      return { title: (nl < 0 ? chunk : chunk.slice(0, nl)).trim(), md: nl < 0 ? "" : chunk.slice(nl + 1).trim() };
    });
}

/** A problem section is one fragment, not a lesson: drop the renderer's single-stage header ("Lesson · 1 min"). */
const fragment = (html: string) => html.replace(/<header class="sd-stage-head"[^>]*>[\s\S]*?<\/header>/g, "");

const SECTION_ID: Record<string, string> = { scenario: "scenario", "your task": "task", examples: "examples", constraints: "constraints", "scenario to model": "model" };

async function problemParts(id: string) {
  const md = await readDsa(`resources/problems/${id}/problem.md`);
  if (!md) return null;
  const { data, content } = matter(md, {});
  return { front: data as ProblemFront, body: content };
}

const problemCached = cached(async (id: string): Promise<ProblemPage | null> => {
  const parts = await problemParts(id);
  if (!parts) return null;
  const { front: f, body } = parts;
  if (!f.signature || (f.mode && f.mode !== "function")) return null;
  const [cast, concepts, problems, visible, hidden, linker] = await Promise.all([
    castOf(),
    getConceptIndex(),
    getProblemIndex(),
    readDsaJson<TestsFile>(`resources/problems/${id}/tests/visible.json`),
    readDsa(`resources/problems/${id}/tests/hidden.json`),
    sdmLinker(),
  ]);
  const dsa: DsaRenderOpts = { cast, sdmLink: linker.sdm, labLink: linker.lab };
  const render = async (m: string) => fragment((await renderLesson(m, { kind: "day-content", dsa })).html);

  const all = sectionsOf(body);
  const sections: ProblemPage["sections"] = [];
  for (const s of all) {
    const key = SECTION_ID[s.title.toLowerCase()];
    if (key) sections.push({ id: key, title: s.title, html: await render(s.md) });
  }
  const hintSec = all.find((s) => s.title.toLowerCase() === "hints");
  const hints = hintSec ? await Promise.all(rungsOf(hintSec.md).map(async (r) => ({ title: r.title, html: await render(r.md) }))) : [];

  const concept = concepts.find((c) => c.id === f.concept);
  // SDM links: this problem's realsystems box, then its concept's
  const targets = realSystemsTargets(body);
  if (concept) {
    const lesson = await readDsa(`resources/modules/${concept.module}/${concept.id}/lesson.md`);
    if (lesson) {
      const t = realSystemsTargets(lesson);
      targets.sdm.push(...t.sdm.filter((x) => !targets.sdm.includes(x)));
      targets.labs.push(...t.labs.filter((x) => !targets.labs.includes(x)));
    }
  }
  const sdmLinks: SdmLink[] = [...targets.sdm.map(linker.sdm), ...targets.labs.map(linker.lab)];

  const ladder = problems.filter((p) => p.concept === f.concept).sort((a, b) => a.order - b.order);
  const at = ladder.findIndex((p) => p.id === id);
  let hiddenCount = 0;
  try {
    hiddenCount = hidden ? ((JSON.parse(hidden) as TestsFile).cases || []).length : 0;
  } catch {
    hiddenCount = 0;
  }
  const vis = visible?.cases || [];
  return {
    id,
    title: f.title || humanize(id),
    level: levelOf(f.level),
    line: f.line || "",
    module: f.module || "",
    concept: f.concept || "",
    conceptTitle: concept?.title || humanize(f.concept || ""),
    order: f.order ?? 0,
    signature: f.signature,
    checker: f.checker || "exact",
    limits: { timeMs: f.limits?.timeMs || 2000, memoryMb: f.limits?.memoryMb || 256 },
    complexity: f.complexity?.time ? { time: f.complexity.time, space: f.complexity.space || "" } : null,
    patterns: f.tags?.patterns || [],
    classic: f.tags?.classic || [],
    minutes: f.tags?.minutes ?? null,
    sections,
    hints,
    visible: vis,
    hiddenCount,
    testsVersion: hash(JSON.stringify(vis) + (hidden || "") + String(f.version ?? "")),
    sdmLinks,
    prev: at > 0 ? ladder[at - 1] : null,
    next: at >= 0 && at < ladder.length - 1 ? ladder[at + 1] : null,
  };
}, "dsa-problem-v1");

export async function getProblem(id: string): Promise<ProblemPage | null> {
  if (!ID.test(id)) return null;
  return problemCached(id);
}

/** Visible + hidden tests for Submit (GET /api/dsa/tests/<id>), plus the judge's needs. */
const testsCached = cached(async (id: string): Promise<{ signature: DsaSignature; checker: string; limits: { timeMs: number; memoryMb: number }; visible: DsaTestCase[]; hidden: DsaTestCase[]; version: string } | null> => {
  const parts = await problemParts(id);
  if (!parts?.front.signature) return null;
  const [visible, hiddenRaw] = await Promise.all([readDsaJson<TestsFile>(`resources/problems/${id}/tests/visible.json`), readDsa(`resources/problems/${id}/tests/hidden.json`)]);
  let hidden: DsaTestCase[] = [];
  try {
    hidden = hiddenRaw ? (JSON.parse(hiddenRaw) as TestsFile).cases || [] : [];
  } catch {
    hidden = [];
  }
  const vis = visible?.cases || [];
  return {
    signature: parts.front.signature,
    checker: parts.front.checker || "exact",
    limits: { timeMs: parts.front.limits?.timeMs || 2000, memoryMb: parts.front.limits?.memoryMb || 256 },
    visible: vis,
    hidden: hidden.filter((c) => c && c.input && c.output !== null && c.output !== undefined),
    version: hash(JSON.stringify(vis) + (hiddenRaw || "") + String(parts.front.version ?? "")),
  };
}, "dsa-tests-v1");

export async function getProblemTests(id: string) {
  if (!ID.test(id)) return null;
  return testsCached(id);
}

const SOLUTION_FILES: [DsaLang, string][] = [
  ["python", "solution.py"],
  ["javascript", "solution.js"],
  ["java", "Solution.java"],
  ["cpp", "solution.cpp"],
];

/** The editorial with its four reference solutions (GET /api/dsa/editorial/<id>, after a solve or a reveal). */
const editorialCached = cached(async (id: string): Promise<{ html: string } | null> => {
  const parts = await problemParts(id);
  if (!parts) return null;
  const sec = sectionsOf(parts.body).find((s) => s.title.toLowerCase() === "editorial");
  if (!sec) return null;
  const [cast, linker, ...codes] = await Promise.all([castOf(), sdmLinker(), ...SOLUTION_FILES.map(([, file]) => readDsa(`resources/problems/${id}/solutions/${file}`))]);
  const solutions = SOLUTION_FILES.map(([lang], i) => ({ lang, code: codes[i] || "" })).filter((s) => s.code.trim());
  const html = fragment((await renderLesson(sec.md, { kind: "day-content", dsa: { cast, solutions, sdmLink: linker.sdm, labLink: linker.lab } })).html);
  return { html };
}, "dsa-editorial-v1");

export async function getEditorial(id: string) {
  if (!ID.test(id)) return null;
  return editorialCached(id);
}
