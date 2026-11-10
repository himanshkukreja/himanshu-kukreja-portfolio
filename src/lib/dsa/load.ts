import "server-only";
import { createHash } from "crypto";
import matter from "gray-matter";
import { badgeDefsFor, type BadgeDef } from "./rewards";
import { unstable_cache } from "next/cache";
import { cache as requestCache } from "react";
import { renderLesson } from "@/lib/course/render";
import type { DsaLink, DsaRenderOpts } from "@/lib/course/detect/dsa";
import { DSA_CONTENT_TAG, dsaBundleVersion, dsaFresh, listDsa, readDsa, readDsaHead, readDsaJson } from "./content";
import { blurbOf, versionedMemo } from "./bundle";
import { hasLinkTokens, resolveLinkTokens, tokenLinker, type LinkKind } from "./sdm-links";
import { plainBeatHeading } from "./words";
import { buildStepLabels, lessonLabel, lessonSlot, stepOf, type StepLabels } from "./steps";
import { checkpointFor } from "./lesson-stops";
import { districtName, groupDistricts, waveLabel, type PlanDistrict, type PlanProblem } from "./districts";
import { clipQuestParts, clipRefs, dsaShortParts, lectureRefs, parseTemplates, resolveDsaClip, resolveDsaLecture, resolveDsaShort, resolveDsaSolution, type RawClips, type RawDsaLecture, type RawRace, type RawTrace } from "./lecture";
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
import { lectureHash, lectureMediaBase } from "@/lib/learn/lecture/load";

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

const indexMemo = versionedMemo();

/**
 * The index-level loaders (concepts, modules, cast, problems, worlds, step labels...): what nearly every DSA page builds
 * on, called again and again inside the per-page cached items. Next never reads a data-cache item from inside another
 * one (a nested unstable_cache call runs its function), so a cold lesson rebuilt these up to 8 times: ~2,000 R2 reads,
 * 68 s on Workers (Nov 2026).
 *   with the content bundle (src/lib/dsa/bundle.ts)  built from it once per isolate and content commit and kept in
 *       memory until the commit changes. No data cache, so a code deploy doesn't empty it either.
 *   without it  the data cache, as before, and once per request (React cache) instead of once per call.
 * Every caller gets its own copy (as from the data cache), so one that changes its result can't change anyone else's.
 */
function indexed<A extends unknown[], R>(fn: (...a: A) => Promise<R>, key: string): (...a: A) => Promise<R> {
  const c = unstable_cache(fn, [key], CACHE);
  const shared = requestCache(async (...a: A): Promise<R> => {
    if (dsaFresh()) return fn(...a);
    const v = await dsaBundleVersion().catch(() => null);
    if (!v) return c(...a);
    const [r] = await Promise.all([indexMemo.get(v, `${key}:${JSON.stringify(a)}`, () => fn(...a)), tagThisRender()]);
    return r;
  });
  return async (...a: A) => structuredClone(await shared(...a));
}

/**
 * The "dsa-content" tag on the page being rendered, as a data-cache read used to add it: a page built only from
 * memory-held indexes is still expired by POST /api/revalidate-courses?source=dsa (revalidateTag). One tiny item, read
 * once per request alongside the work (inside another cached item Next skips the read and the outer item has the tag).
 */
const tagItem = unstable_cache(async () => 1, ["dsa-content-tag-v1"], CACHE);
const tagThisRender = requestCache(() => tagItem().catch(() => 0));

const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 12);

const humanize = (s: string) => {
  const t = s.replace(/^(?:day|problem|bonus|lab)-\d+-/, "").replace(/-/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/* ------------------------------------------------------------------ cast and indexes */

type CastFile = { cast?: { id: string; name: string; role: string }[] };

const castOf = indexed(async (): Promise<Record<string, { name: string; role: string }>> => {
  const md = await readDsa("resources/company/cast.md");
  if (!md) return {};
  const data = matter(md, {}).data as CastFile;
  return Object.fromEntries((data.cast || []).map((c) => [c.id, { name: c.name, role: c.role }]));
}, "dsa-cast-v1");

type ConceptsFile = { concepts?: { id: string; module: string; order?: number; title: string; status?: string; summary?: string; kind?: string }[] };

export const getConceptIndex = indexed(async (): Promise<ConceptSummary[]> => {
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
    ...(c.kind === "structure" || c.kind === "algorithm" ? { kind: c.kind } : {}),
  }));
}, "dsa-concepts-v3");

/* Visual lessons: structure lessons (Academy Part 2) and algorithm lessons (Part 3) have their own folder and page. */
/** A concept's content folder: resources/modules/, resources/structures/ (structure lesson) or resources/algorithms/ (algorithm lesson). */
export const lessonDir = (c: Pick<ConceptSummary, "id" | "module" | "kind">) => `resources/${c.kind === "structure" ? "structures" : c.kind === "algorithm" ? "algorithms" : "modules"}/${c.module}/${c.id}`;
export const structureHref = (id: string) => `/dsa/structures/${id}`;
export const algorithmHref = (id: string) => `/dsa/algorithms/${id}`;
/** Structure and algorithm lessons: one visual lesson per module, with a lab checkpoint (quiz + lab). */
export const isVisualLesson = (c: Pick<ConceptSummary, "kind"> | null | undefined) => c?.kind === "structure" || c?.kind === "algorithm";
/** Where a lesson lives on the site, whatever its kind. */
export const lessonHref = (c: Pick<ConceptSummary, "id" | "kind">) => (c.kind === "structure" ? structureHref(c.id) : c.kind === "algorithm" ? algorithmHref(c.id) : `/dsa/concepts/${c.id}`);

type ModulesFile = { modules?: { id: string; code: string; title: string; building?: string; lines?: string[]; objective?: string }[] };

const getModules = indexed(async (): Promise<Record<string, { code: string; title: string; building: string; line: string; objective: string }>> => {
  const src = await readDsa("resources/course.yml");
  if (!src) return {};
  const data = yaml<ModulesFile>(src);
  return Object.fromEntries(
    (data.modules || []).map((m) => [m.id, { code: m.code, title: m.title, building: m.building || m.title, line: m.lines?.[0] || "", objective: m.objective || "" }]),
  );
}, "dsa-modules-v2");

type LinesFile = { lines?: { id: string; name: string }[] };

/** Product line labels by id ("stream" → "Music streaming app"), from resources/company/product-lines.yml (plain labels, no company). */
const getLineNames = indexed(async (): Promise<Record<string, string>> => {
  const src = await readDsa("resources/company/product-lines.yml");
  if (!src) return {};
  return Object.fromEntries((yaml<LinesFile>(src).lines || []).map((l) => [l.id, l.name]));
}, "dsa-lines-v1");

/** The plain label of a product line id ("" when unknown), for the small subtitle on lesson and problem pages. */
export async function getLineLabel(id: string): Promise<string> {
  return id ? (await getLineNames())[id] || "" : "";
}

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
  role?: string;
  tags?: { patterns?: string[]; classic?: string[]; minutes?: number; difficulty?: number; companyTypes?: string[]; structures?: string[]; algorithms?: string[] };
};

const levelOf = (l: unknown): DsaLevel => (l === "easy" || l === "hard" ? l : "medium");

function summaryOf(id: string, f: ProblemFront, md = ""): ProblemSummary {
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
    rating: typeof f.tags?.difficulty === "number" ? f.tags.difficulty : null,
    role: f.role === "checkpoint" || f.role === "warm-up" ? f.role : "practice",
    companyTypes: f.tags?.companyTypes || [],
    own: { structures: f.tags?.structures, algorithms: f.tags?.algorithms },
    blurb: blurbOf(md),
  };
}

/**
 * Every built problem's summary, from each problem.md's front matter and first words (the content bundle's heads, so
 * no per-file reads; without a bundle each file is read, once per revalidation); at bank scale
 * (~1,000) the repo's generated/problem-index.json takes over when it exists, so this stays one small item.
 */
export const getProblemIndex = indexed(async (): Promise<ProblemSummary[]> => {
  const pre = await readDsaJson<ProblemSummary[]>("generated/problem-index.json");
  if (Array.isArray(pre)) return pre;
  const dirs = ((await listDsa("resources/problems")) || []).filter((e) => e.endsWith("/")).map((e) => e.slice(0, -1)).filter((d) => ID.test(d));
  const out: ProblemSummary[] = [];
  for (let i = 0; i < dirs.length; i += 6) {
    const batch = await Promise.all(
      dirs.slice(i, i + 6).map(async (id) => {
        // the bundle's head of the file (front matter + statement) is all a summary reads; else the whole file
        const path = `resources/problems/${id}/problem.md`;
        const md = (await readDsaHead(path)) ?? (await readDsa(path));
        return md ? summaryOf(id, matter(md, {}).data as ProblemFront, md) : null;
      }),
    );
    out.push(...batch.filter((x): x is ProblemSummary => !!x));
  }
  return out.sort((a, b) => a.module.localeCompare(b.module) || a.concept.localeCompare(b.concept) || a.order - b.order);
}, "dsa-problems-v2");

/* ------------------------------------------------------------------ worlds */

type RawNode = Record<string, unknown> & { id: string; type: string };
type RawRegion = {
  id: string;
  code: string;
  part?: number | string;
  title: string;
  module: string;
  detail?: string;
  status?: string;
  intro?: string;
  concepts?: string[];
  lines?: string[];
  /** Interview practice districts: the building, when it opens (launch, w1 …) and the Academy modules it practises */
  landmark?: string;
  opens?: string;
  links?: string[];
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
  division?: string;
  theme?: { map?: string; road?: string; stops?: Record<string, string> };
  regions?: RawRegion[];
  parts?: { id: string; title: string; subtitle?: string; summary?: string; regions?: string[] }[];
  final?: RawNode;
};

/** What a world is called in the UI when it differs from its file: World 2 is "Interview practice" (owner, 10 Nov 2026), with the file's name as its small subtitle. */
const WORLD_LABELS: Record<string, { title: string; subtitle: string }> = { "product-districts": { title: "Interview practice", subtitle: "Product Districts" } };
const labelOf = (id: string, title: string, subtitle: string) => WORLD_LABELS[id] || { title, subtitle };

const WORLD_IDS = ["academy", "product-districts", "career-studio", "challenge-league", "release-train", "infrastructure"] as const;
/** Worlds with a playable map in this build; the others show on the atlas as opening later. */
// every world is open (owner, 9 Nov 2026: nothing locked); a world without written content shows its map as "coming soon"
const worldOpen = (): boolean => true;

export const conceptHref = (id: string) => `/dsa/concepts/${id}`;
export const problemHref = (id: string) => `/dsa/problems/${id}`;
/** A concept's animated lecture (the course lecture player on its resolved lecture.json). */
export const conceptLectureHref = (id: string) => `/dsa/concepts/${id}/lecture`;

type ModuleInfo = Awaited<ReturnType<typeof getModules>>;

function buildWorld(
  raw: RawWorld,
  concepts: Map<string, ConceptSummary>,
  problems: Map<string, ProblemSummary>,
  modules: ModuleInfo = {},
  lines: Record<string, string> = {},
  /** lab checkpoints: "<module>/<lesson>" → the lab's id and title (lab.yml) */
  labs: Map<string, { id: string; title: string }> = new Map(),
): WorldSpec {
  const node = (n: RawNode): WorldNode => {
    const required = n.required !== false && n.type !== "side" && n.type !== "service";
    if (n.type === "concept") {
      const c = concepts.get(String(n.concept));
      const built = c?.status === "built";
      const href = c ? lessonHref(c) : conceptHref(String(n.concept));
      return { id: n.id, type: "concept", title: c?.title || humanize(String(n.concept)), required, href: built ? href : null, ref: String(n.concept), built };
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
        href: quizConcept?.status === "built" ? (isVisualLesson(quizConcept) ? `${lessonHref(quizConcept)}#recap` : `${conceptHref(quizConcept.id)}#say`) : null,
        built: quizConcept?.status === "built",
        quiz,
        ...(n.lab && labs.get(String(n.lab)) && quizConcept
          ? { lab: { ...labs.get(String(n.lab))!, href: `${lessonHref(quizConcept)}#build` } }
          : {}),
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
      module: r.module || "",
      ...(r.part !== undefined ? { part: String(r.part) } : {}),
      detail: r.detail === "full" ? "full" : "outline",
      status: r.status || "planned",
      intro: r.intro || null,
      line: lines[r.lines?.[0] || modules[r.module]?.line || ""] || null,
      objective: modules[r.module]?.objective || null,
      moduleTitle: modules[r.module]?.title || null,
      stretches,
      side: (r.side || []).map((n) => node(n)),
      boss: r.boss ? node(r.boss) : null,
    };
  });
  return {
    id: raw.id,
    ...labelOf(raw.id, raw.title, raw.subtitle || ""),
    order: raw.order ?? 0,
    audience: raw.audience || "",
    atLaunch: raw.at_launch || "",
    open: worldOpen(),
    division: raw.division ? raw.division.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : "",
    theme: { map: raw.theme?.map || "", road: raw.theme?.road || "road", stops: raw.theme?.stops || {} },
    regions,
    // regions sit under their part, in the parts' order; a region in no part keeps its place at the end
    parts: (raw.parts || []).map((p, i) => ({ id: p.id, title: p.title, label: p.subtitle || `Part ${i + 1}`, summary: p.summary || "", regions: (p.regions || []).filter((id) => regions.some((r) => r.id === id)) })),
    final: raw.final
      ? {
          id: raw.final.id,
          type: "boss",
          title: String(raw.final.title || "Final"),
          required: true,
          href: null,
          built: false,
          badge: String(raw.final.certificate || ""),
          building: raw.final.building ? String(raw.final.building) : undefined,
        }
      : null,
  };
}

/** The districts' streets and problem sets, from the plan (resources/plan/curriculum.yml): small, so it is its own cache item. */
type PlanFile = {
  parts?: { world?: string; modules?: { id: string; wave?: string; links?: string[]; lessons?: { id: string; title: string }[] }[] }[];
  problems?: { id: string; home?: string; title?: string; status?: string; lesson?: string }[];
};
const getDistrictPlan = indexed(async (): Promise<{ districts: PlanDistrict[]; rows: PlanProblem[] } | null> => {
  const src = await readDsa("resources/plan/curriculum.yml");
  if (!src) return null;
  const plan = yaml<PlanFile>(src);
  const mods = (plan.parts || []).find((p) => p.world === "product-districts")?.modules || [];
  return {
    districts: mods.map((m) => ({ id: m.id, wave: m.wave, links: m.links || [], streets: (m.lessons || []).map((l) => ({ id: l.id, title: l.title })) })),
    rows: (plan.problems || []).filter((p) => /^d\d+-/.test(p.home || "")).map((p) => ({ id: p.id, home: p.home || "", title: p.title, status: p.status, lesson: p.lesson })),
  };
}, "dsa-districts-plan-v1");

/**
 * Interview practice: each district's streets (stretches of built problems, linked to their rooms), a count of the
 * planned ones, the Academy lessons it practises, its opening wave, and the district review as the boss. A district
 * with no built problem stays an outline ("being written", with its opening wave). src/lib/dsa/districts.ts.
 */
async function wireDistricts(world: WorldSpec, raw: RawWorld, concepts: Map<string, ConceptSummary>, problems: ProblemSummary[]): Promise<WorldSpec> {
  const plan = await getDistrictPlan().catch(() => null);
  if (!plan) return world;
  const labels = await getStepLabels();
  const byModule = new Map<string, ConceptSummary>();
  for (const c of [...concepts.values()].sort((a, b) => a.order - b.order)) if (c.status === "built" && !byModule.has(c.module)) byModule.set(c.module, c);
  const code = (id: string) => world.regions.find((r) => r.id === id)?.code || id;
  const shapes = groupDistricts(plan.districts, plan.rows, new Map(problems.map((p) => [p.id, { id: p.id, title: p.title, level: p.level }])), code);
  const rawOf = new Map((raw.regions || []).map((r) => [r.id, r]));
  const regions = world.regions.map((r, i): WorldRegion => {
    const shape = shapes[r.id];
    const rr = rawOf.get(r.id);
    if (!shape || !rr) return r;
    const links = (rr.links || plan.districts.find((d) => d.id === r.id)?.links || []).map((m) => {
      const c = byModule.get(m);
      return { module: m, label: stepOf(labels, m).label, href: c ? lessonHref(c) : null };
    });
    const hasBuilt = shape.built > 0;
    return {
      ...r,
      // the building is the theme name (Pay Exchange), the pattern the plain title (Arrays & Hashing)
      title: rr.landmark || r.title,
      moduleTitle: districtName(r.title),
      step: `District ${i + 1}`,
      detail: hasBuilt ? "full" : "outline",
      status: hasBuilt ? "in-progress" : "planned",
      opens: waveLabel(plan.districts.find((d) => d.id === r.id)?.wave || rr.opens),
      links,
      planned: shape.planned,
      intro: `Medium and Hard interview problems, ${shape.stretches.length} ${shape.stretches.length === 1 ? "street" : "streets"} of them: each street is a set of problems on one skill.`,
      stretches: shape.stretches.length ? shape.stretches : r.stretches,
      boss: { id: `${r.code}.review`, type: "boss", title: "District review", required: true, href: null, built: false, badge: `${districtName(r.title)} cleared` },
    };
  });
  return { ...world, regions };
}

const worldCached = indexed(async (id: string): Promise<WorldSpec | null> => {
  const src = await readDsa(`resources/worlds/${id}.yml`);
  if (!src) return null;
  const [concepts, problems, modules, lines] = await Promise.all([getConceptIndex(), getProblemIndex(), getModules(), getLineNames()]);
  const raw = yaml<RawWorld>(src);
  // a structure or algorithm checkpoint names its lesson's lab (lab: <module>/<lesson>); read the lab's id and title
  const labRefs = [...new Set((raw.regions || []).flatMap((r) => (r.stretches || []).flatMap((st) => st.nodes.filter((n) => n.type === "checkpoint" && n.lab).map((n) => String(n.lab)))))];
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const labs = new Map<string, { id: string; title: string }>();
  await Promise.all(
    labRefs.map(async (ref) => {
      const c = byId.get(ref.split("/")[1] || "");
      if (!c || c.status !== "built") return;
      const lab = await readDsa(`${lessonDir(c)}/lab/lab.yml`);
      const id = lab?.match(/^id:\s*([\w-]+)/m)?.[1];
      if (id) labs.set(ref, { id, title: lab?.match(/^title:\s*(.+)$/m)?.[1]?.trim() || "Build it yourself" });
    }),
  );
  const built = buildWorld(raw, byId, new Map(problems.map((p) => [p.id, p])), modules, lines, labs);
  const world = raw.id === "product-districts" ? await wireDistricts(built, raw, byId, problems) : built;
  // each region carries its step number ("2.3"), computed once from the world's order (src/lib/dsa/steps.ts)
  const steps = buildStepLabels(world, modules);
  return { ...world, regions: world.regions.map((r) => ({ ...r, step: r.step || steps[r.module]?.step || "" })) };
}, "dsa-world-v6");

/** Every module's learner label ("2.3 Linked lists" plus its building), from the Academy's parts and order. */
export const getStepLabels = indexed(async (): Promise<StepLabels> => {
  const [world, modules] = await Promise.all([worldCached("academy"), getModules()]);
  return buildStepLabels(world, modules);
}, "dsa-steps-v1");

export async function getWorld(id: string): Promise<WorldSpec | null> {
  if (!ID.test(id)) return null;
  return worldCached(id);
}

export const getWorlds = indexed(async (): Promise<WorldSummary[]> => {
  const out = await Promise.all(
    WORLD_IDS.map(async (id) => {
      const src = await readDsa(`resources/worlds/${id}.yml`);
      if (!src) return null;
      // the header lines only: a world file's regions can be long
      const head = src.split(/\n(?=regions:)/)[0];
      const w = yaml<RawWorld>(head);
      return { id: w.id || id, ...labelOf(w.id || id, w.title || humanize(id), w.subtitle || ""), order: w.order ?? 0, audience: w.audience || "", atLaunch: w.at_launch || "", open: worldOpen() } satisfies WorldSummary;
    }),
  );
  return out.filter((w): w is WorldSummary => !!w).sort((a, b) => a.order - b.order);
}, "dsa-worlds-v2");

/** Every mastery badge (src/lib/dsa/rewards.ts badgeDefsFor): one per module of each world, then the world itself. */
export const getBadgeDefs = indexed(async (): Promise<BadgeDef[]> => {
  const worlds = await getWorlds();
  const specs = await Promise.all(worlds.map((w) => getWorld(w.id).catch(() => null)));
  return specs.flatMap((s) => (s ? badgeDefsFor(s) : []));
}, "dsa-badges-v1");

/* ------------------------------------------------------------------ links to System Design Mastery */

/**
 * The renderer's links to System Design Mastery. Cached DSA items carry title tokens (src/lib/dsa/sdm-links.ts), never
 * the titles: those come from the SD course map and labs, which a nested cached item can't read from the data cache, so
 * the whole course map was rebuilt inside every cold DSA lesson. withSdmTitles puts the titles in when a page is served.
 */
export async function sdmLinker(): Promise<{ sdm: (path: string) => DsaLink; lab: (id: string) => DsaLink }> {
  return tokenLinker();
}

/** SD lesson and lab titles by path and id (the course map and the labs' summaries, each its own cached item). */
const sdmTitles = requestCache(async (): Promise<{ lessons: Map<string, string>; labs: Map<string, string> }> => {
  const lessons = new Map<string, string>();
  const labs = new Map<string, string>();
  await Promise.all([
    (async () => {
      const { getCourseMap } = await import("@/lib/learn/course");
      const map = await getCourseMap();
      if (map) {
        const all = [...map.weeks.flatMap((w) => [...w.lessons, ...(w.boss ? [w.boss] : [])]), ...map.sideQuests, ...(map.problems || []), ...(map.lld || []), ...(map.plan ? [map.plan] : [])];
        for (const l of all) lessons.set(`${l.week}/${l.slug}`, l.title);
      }
    })().catch(() => {
      /* titles fall back to the slug */
    }),
    (async () => {
      const { getLabSummaries } = await import("@/lib/learn/labs/load");
      for (const l of await getLabSummaries()) labs.set(l.id, l.title);
    })().catch(() => {
      /* lab titles fall back to the id */
    }),
  ]);
  return { lessons, labs };
});

/**
 * A served DSA item with its SD link titles in (titles as before: the course's own, else the humanized slug or id).
 * The titles are read while the item is (nearly every lesson and problem links to SD).
 */
export async function withSdmTitles<T>(item: Promise<T>): Promise<T> {
  const titles = sdmTitles();
  const value = await item;
  if (!value || !hasLinkTokens(value)) return value;
  const { lessons, labs } = await titles;
  return resolveLinkTokens(value, (kind: LinkKind, ref: string) =>
    kind === "lab" ? labs.get(ref) || humanize(ref) : lessons.get(ref) || humanize(ref.split("/").pop() || ref),
  );
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
  if (!c || c.status !== "built" || isVisualLesson(c)) return null;
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

  // in-article clips (clips.json): the same data the structure and algorithm lessons use (src/lib/dsa/structures.ts)
  const media = lectureMediaBase();
  const clips: NonNullable<ConceptPage["clips"]> = Object.fromEntries(
    (await getLessonClips(id).catch(() => [] as Lecture[])).map((l) => {
      const v = lectureHash(l);
      const base = media ? `${media.replace(/\/$/, "")}/${l.quest}/` : null;
      return [l.clip!.id, { id: l.clip!.id, caption: l.clip!.caption, base, v, say: l.scenes.flatMap((sc) => sc.steps.map((st) => st.say)) }];
    }),
  );
  const clipFiles = Object.fromEntries(
    Object.values(clips).map((cl) => [cl.id, { caption: cl.caption, files: cl.base ? [`${cl.base}video.mp4?v=${cl.v}`, `${cl.base}poster.jpg?v=${cl.v}`, `${cl.base}media.json`] : [] }]),
  );
  const dsa: DsaRenderOpts = { cast, beats: true, checkpointQuiz: quizBody, titles, sdmLink: linker.sdm, labLink: linker.lab, clips: clipFiles };
  const rendered = await renderLesson(content, { kind: "day-content", dsa });
  // "In one picture" (the beginner pass): the lesson's own pattern card, shown at the top of the page; never new text
  const card = content.match(/^:::pattern\[([^\]\n]*)\][^\n]*\n([\s\S]*?)\n:::[ \t]*$/m);
  let picture: ConceptPage["picture"] = null;
  if (card) {
    // the card's body without the renderer's one-stage wrapper (it is not a stage of this page)
    const html = fragment((await renderLesson(card[2], { kind: "day-content", dsa: { cast, sdmLink: linker.sdm, labLink: linker.lab } })).html)
      .trim()
      .replace(/^<section\b[^>]*>/, "")
      .replace(/<\/section>$/, "");
    // its first paragraph ("Use it when…") up front, the rest of the card one tap away
    const end = html.indexOf("</p>");
    const lead = end > 0 && /<p[\s>]/.test(html.slice(0, end)) ? html.slice(0, end + 4) : html;
    picture = { title: card[1].trim(), html: lead, more: lead === html ? "" : html.slice(lead.length) };
  }

  const byId = new Map(problems.map((p) => [p.id, p]));
  const practice = (f.practice || []).map((p) => byId.get(p)).filter((p): p is ProblemSummary => !!p);

  // the checkpoint node whose quiz is this concept's (Academy map), else its own lesson stop (lesson-stops.ts)
  const checkpoint = checkpointFor("academy", academy?.regions.find((r) => r.module === c.module), c.module, id);
  const stepLabels = await getStepLabels();
  return {
    clips,
    id,
    module: c.module,
    moduleTitle: lessonLabel(stepLabels, c.module, lessonSlot(await getConceptIndex(), id)),
    regionTitle: stepOf(stepLabels, c.module).building,
    title: f.title || c.title,
    summary: c.summary,
    level: f.level || "beginner",
    minutes: f.minutes || rendered.readingMinutes,
    line: f.line || "",
    lineLabel: await getLineLabel(f.line || ""),
    invariant: f.invariant || "",
    keyPoints: f.keyPoints || [],
    html: rendered.html,
    stages: rendered.stages.map((s) => ({ id: s.id, label: s.label, title: s.title, minutes: s.minutes })),
    // the beat headings in plain words ("The problem: the busiest three hours"); the lesson text itself is unchanged
    toc: rendered.toc.map((t) => (t.kind === "part" ? { ...t, text: plainBeatHeading(t.text) } : t)),
    picture,
    readingMinutes: rendered.readingMinutes,
    contentVersion: rendered.contentVersion,
    traces,
    races,
    templates: templatesOf(content),
    reviewCards: f.reviewCards || [],
    practice,
    checkpoint,
  };
}, "dsa-concept-v4");

/** One request's calls share one build (the page and its metadata both ask). */
export const getConcept = requestCache(async (id: string): Promise<ConceptPage | null> => {
  if (!ID.test(id)) return null;
  return withSdmTitles(conceptCached(id));
});

/* ------------------------------------------------------------------ concept lectures */

/**
 * A built concept's lecture (resources/modules/<module>/<concept>/lecture.json), resolved into one self-contained
 * Lecture (src/lib/dsa/lecture.ts: traces, races, templates and the quote cast inlined), or null when it has none.
 * Its recorded media lives with the SDM lectures' (NEXT_PUBLIC_LECTURE_MEDIA) under lectures/<quest>/, quest being
 * "dsa--<module>--<concept>".
 */
/** What a lecture or short points at (its lesson's templates, traces, races, the cast), read for resolving. */
async function lectureSources(dir: string, raw: RawDsaLecture) {
  const refs = lectureRefs(raw);
  const [lessonMd, cast, traceList, raceList] = await Promise.all([
    readDsa(`${dir}/lesson.md`),
    castOf(),
    Promise.all(refs.traces.map((t) => readDsaJson<RawTrace>(`generated/traces/${t}.json`))),
    Promise.all(refs.races.map((r) => readDsaJson<RawRace>(`generated/races/${r}.json`))),
  ]);
  const traces = Object.fromEntries(refs.traces.map((t, i) => [t, traceList[i]]));
  const races = Object.fromEntries(refs.races.map((r, i) => [r, raceList[i]]));
  return { lessonMd, traces, races, cast };
}

const lectureCached = cached(async (id: string): Promise<Lecture | null> => {
  const c = (await getConceptIndex()).find((x) => x.id === id);
  if (!c || c.status !== "built") return null;
  const dir = lessonDir(c);
  const raw = await readDsaJson<RawDsaLecture>(`${dir}/lecture.json`);
  if (!raw || !Array.isArray(raw.scenes) || !raw.scenes.length) return null;
  return resolveDsaLecture(raw, await lectureSources(dir, raw));
}, "dsa-lecture-v2");

export const getConceptLecture = requestCache(async (id: string): Promise<Lecture | null> => {
  if (!ID.test(id)) return null;
  return lectureCached(id);
});

/* ------------------------------------------------------------------ shorts */

/** A built concept's short ids (shorts--dsa--<module>--<concept>--<slug>), from its shorts/ folder, in file order. */
const conceptShortIdsCached = cached(async (id: string): Promise<string[]> => {
  const c = (await getConceptIndex()).find((x) => x.id === id);
  if (!c || c.status !== "built") return [];
  const files = (await listDsa(`${lessonDir(c)}/shorts`)) || [];
  return files
    .filter((f) => /^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(f))
    .sort()
    .map((f) => `shorts--dsa--${c.module}--${id}--${f.replace(/\.json$/, "")}`);
}, "dsa-short-ids-v2");

export async function getConceptShortIds(id: string): Promise<string[]> {
  if (!ID.test(id)) return [];
  return conceptShortIdsCached(id);
}

/** One DSA short, resolved like its lecture (src/lib/dsa/lecture.ts resolveDsaShort), or null. */
const shortCached = cached(async (id: string): Promise<Lecture | null> => {
  const parts = dsaShortParts(id);
  if (!parts) return null;
  const c = (await getConceptIndex()).find((x) => x.id === parts.concept);
  if (!c || c.status !== "built" || c.module !== parts.module) return null;
  const dir = lessonDir(c);
  const raw = await readDsaJson<RawDsaLecture>(`${dir}/shorts/${parts.slug}.json`);
  if (!raw || raw.quest !== id || !raw.short || !Array.isArray(raw.scenes) || !raw.scenes.length) return null;
  const resolved = resolveDsaShort(raw, await lectureSources(dir, raw));
  // the label on top of a short is the module's step label ("2.3 Linked lists"), never a code
  return resolved.short ? { ...resolved, short: { ...resolved.short, label: stepOf(await getStepLabels(), c.module).label } } : resolved;
}, "dsa-short-v3");

export async function getDsaShort(id: string): Promise<Lecture | null> {
  if (!dsaShortParts(id)) return null;
  return shortCached(id);
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
    lineLabel: await getLineLabel(f.line || ""),
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
}, "dsa-problem-v2");

export const getProblem = requestCache(async (id: string): Promise<ProblemPage | null> => {
  if (!ID.test(id)) return null;
  return withSdmTitles(problemCached(id));
});

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
}, "dsa-editorial-v2");

export async function getEditorial(id: string) {
  if (!ID.test(id)) return null;
  return withSdmTitles(editorialCached(id));
}

/* ------------------------------------------------------------------ in-article clips and solution videos */

/**
 * A visual lesson's in-article clips (<lesson dir>/clips.json, placed with `::clip[id]`), each resolved into a one-scene
 * Lecture (src/lib/dsa/lecture.ts resolveDsaClip), in file order. Their media sits at lectures/dsa--clips--<lesson>--<clip>/.
 */
const clipsCached = cached(async (id: string): Promise<Lecture[]> => {
  const c = (await getConceptIndex()).find((x) => x.id === id);
  if (!c || c.status !== "built") return [];
  const dir = lessonDir(c);
  const raw = await readDsaJson<RawClips>(`${dir}/clips.json`);
  if (!raw?.clips?.length) return [];
  const refs = clipRefs(raw);
  const scenes = [...refs.traces.map((t) => ({ kind: "trace", trace: t })), ...refs.races.map((r) => ({ kind: "race", race: r }))];
  const [lecture, src] = await Promise.all([getConceptLecture(id), lectureSources(dir, { scenes } as unknown as RawDsaLecture)]);
  const title = (src.lessonMd ? (matter(src.lessonMd, {}).data as { title?: string }).title : "") || c.title;
  return raw.clips.map((clip) => resolveDsaClip(clip, lecture, { module: c.module, concept: id, title }, src)).filter((l): l is Lecture => !!l);
}, "dsa-clips-v2");

export async function getLessonClips(id: string): Promise<Lecture[]> {
  if (!ID.test(id)) return [];
  return clipsCached(id);
}

/** One clip by its media id ("dsa--clips--<lesson>--<clip>"), or null. */
export async function getDsaClip(quest: string): Promise<Lecture | null> {
  const parts = clipQuestParts(quest);
  if (!parts) return null;
  return (await getLessonClips(parts.lesson)).find((l) => l.clip?.id === parts.id) || null;
}

/**
 * A problem's solution video (resources/problems/<id>/solution.json), resolved with its reference solutions as the
 * "solution" code template, or null when it has none. Media at lectures/dsa--solution--<id>/.
 */
const solutionCached = cached(async (id: string): Promise<Lecture | null> => {
  const [parts, raw] = await Promise.all([problemParts(id), readDsaJson<RawDsaLecture>(`resources/problems/${id}/solution.json`)]);
  if (!parts || !raw || !Array.isArray(raw.scenes) || !raw.scenes.length) return null;
  const refs = lectureRefs(raw);
  const [cast, codes, traceList, raceList] = await Promise.all([
    castOf(),
    Promise.all(SOLUTION_FILES.map(([, file]) => readDsa(`resources/problems/${id}/solutions/${file}`))),
    Promise.all(refs.traces.map((t) => readDsaJson<RawTrace>(`generated/traces/${t}.json`))),
    Promise.all(refs.races.map((r) => readDsaJson<RawRace>(`generated/races/${r}.json`))),
  ]);
  const solutions = Object.fromEntries(SOLUTION_FILES.map(([lang], i) => [lang, codes[i]]).filter(([, c]) => c)) as Record<string, string>;
  const f = parts.front;
  return resolveDsaSolution(raw, {
    problem: { id, module: f.module || "", concept: f.concept || "" },
    solutions,
    traces: Object.fromEntries(refs.traces.map((t, i) => [t, traceList[i]])),
    races: Object.fromEntries(refs.races.map((r, i) => [r, raceList[i]])),
    cast,
  });
}, "dsa-solution-v1");

export async function getSolutionVideo(id: string): Promise<Lecture | null> {
  if (!ID.test(id)) return null;
  return solutionCached(id);
}
