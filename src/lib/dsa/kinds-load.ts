import "server-only";
import matter from "gray-matter";
import { cache as requestCache } from "react";
import { renderLesson } from "@/lib/course/render";
import type { DsaRenderOpts } from "@/lib/course/detect/dsa";
import type { Lecture } from "@/lib/learn/lecture/types";
import { lectureHash, lectureMediaBase } from "@/lib/learn/lecture/load";
import { listDsa, readDsa, readDsaJson } from "./content";
import { cached, castOf, getConceptIndex, getDsaShort, getProblemIndex, getStepLabels, getWorld, indexed, lectureSources, lessonHref, sdmLinker, withSdmTitles, yaml } from "./load";
import { clipRefs, dsaShortParts, resolveDsaClip, resolveDsaLecture, resolveDsaShort, type RawClips, type RawDsaLecture } from "./lecture";
import { plainBeatHeading } from "./words";
import { stepOf } from "./steps";
import { leanDir, leanHref, leanKey, leanLabel, leanLectureHref, leanRatingsOf, leanRowsOf, parseLeanPlan, type LadderItem, type LeanKind, type LeanLesson, type LeanPlanLesson, LEAN_KIND_WORD, LEAN_ROOT } from "./kinds";
import type { LessonClipData } from "./structures";
import type { ConceptCheckpoint, DsaStage, ProblemSummary } from "./types";

/**
 * Lean lessons beyond the Academy (streets, camp tents, sets): loaders keyed by <module>/<lesson>. The plan
 * (resources/plan/curriculum.yml) is the index; a lesson is written when its folder (resources/<districts|camps|sets>/
 * <module>/<lesson>/) has a lesson.md. Pure rules live in kinds.ts.
 */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The plan, parsed once per revalidation: the lean lessons, their problem rows and ratings. */
export const getPlanFacts = indexed(async (): Promise<{ lessons: LeanPlanLesson[]; rows: [string, string[]][]; ratings: [string, number][] }> => {
  const src = await readDsa("resources/plan/curriculum.yml");
  if (!src) return { lessons: [], rows: [], ratings: [] };
  const plan = yaml<unknown>(src);
  return { lessons: parseLeanPlan(plan), rows: [...leanRowsOf(plan)], ratings: [...leanRatingsOf(plan)] };
}, "dsa-lean-plan-v1");

const front = (md: string) => matter(md, {}).data as LeanFront;
type LeanFront = {
  title?: string;
  summary?: string;
  minutes?: number;
  keyPoints?: string[];
  ladder?: { id: string; adds?: string; minutes?: number }[];
  reviewCards?: { front: string; back: string }[];
  builds_on?: string[];
  companyType?: string;
  rating?: [number, number];
};

/** Every written lean lesson (a lesson.md exists), in plan order, with its summary, minutes and ladder. */
export const getLeanIndex = cached(async (): Promise<LeanLesson[]> => {
  const { lessons } = await getPlanFacts();
  const dirs = new Map<string, Set<string>>();
  const has = async (l: LeanPlanLesson) => {
    const key = `${l.kind}/${l.module}`;
    if (!dirs.has(key)) dirs.set(key, new Set(((await listDsa(`resources/${LEAN_ROOT[l.kind]}/${l.module}`).catch(() => null)) || []).filter((e) => e.endsWith("/")).map((e) => e.slice(0, -1))));
    return dirs.get(key)!.has(l.id);
  };
  const built: LeanPlanLesson[] = [];
  for (const l of lessons) if (await has(l)) built.push(l);
  const out: LeanLesson[] = [];
  for (let i = 0; i < built.length; i += 8) {
    const batch = await Promise.all(
      built.slice(i, i + 8).map(async (l): Promise<LeanLesson | null> => {
        const md = await readDsa(`${leanDir(l.kind, l.module, l.id)}/lesson.md`).catch(() => null);
        if (!md) return null;
        const f = front(md);
        return { ...l, title: f.title || l.title, summary: f.summary || "", minutes: Number(f.minutes) > 0 ? Number(f.minutes) : 0, href: leanHref(l.kind, l.module, l.id), key: leanKey(l.module, l.id), ladder: (f.ladder || []).map((x) => x.id) };
      }),
    );
    out.push(...batch.filter((x): x is LeanLesson => !!x));
  }
  return out;
}, "dsa-lean-index-v1");

/** One written lean lesson by its route parts, or null (unknown, or not written). */
export async function findLean(root: string, module: string, lesson: string): Promise<LeanLesson | null> {
  if (!SLUG.test(module) || !SLUG.test(lesson)) return null;
  return (await getLeanIndex()).find((l) => LEAN_ROOT[l.kind] === root && l.module === module && l.id === lesson) ?? null;
}
/** Resolve "<module>--<lesson>" (a lean progress slug) or a lecture quest's parts. */
export async function findLeanByParts(module: string, lesson: string): Promise<LeanLesson | null> {
  if (!SLUG.test(module) || !SLUG.test(lesson)) return null;
  return (await getLeanIndex()).find((l) => l.module === module && l.id === lesson) ?? null;
}

/* ------------------------------------------------------------------ the lesson page */

export type LeanPage = {
  kind: LeanKind;
  module: string;
  id: string;
  /** progress slug (module--lesson) */
  key: string;
  title: string;
  summary: string;
  minutes: number;
  /** "2.3 Hashing · Street": the crumb and the shell's module title */
  moduleTitle: string;
  /** the station this branches from, null for company sets */
  station: { id: string; label: string; step: string } | null;
  /** "Fintech interview set", "Basics" (camp), for the small label */
  groupLabel: string;
  html: string;
  stages: DsaStage[];
  toc: { id: string; text: string; level: 1 | 2 | 3 | 4; kind: "part" | "chapter" | "section" | "question" | "other"; stageId: string }[];
  contentVersion: string;
  keyPoints: string[];
  reviewCards: { front: string; back: string }[];
  ladder: LadderItem[];
  practice: ProblemSummary[];
  clips: Record<string, LessonClipData>;
  buildsOn: { href: string; title: string }[];
  checkpoint: ConceptCheckpoint;
  /** where "Back" goes: the station on the map, or Practice for company sets */
  back: { href: string; label: string };
  rating: [number, number] | null;
};

async function ladderOf(f: LeanFront): Promise<{ ladder: LadderItem[]; practice: ProblemSummary[] }> {
  const [problems, facts] = await Promise.all([getProblemIndex(), getPlanFacts()]);
  const by = new Map(problems.map((p) => [p.id, p]));
  const ratings = new Map(facts.ratings);
  const practice: ProblemSummary[] = [];
  const ladder: LadderItem[] = [];
  for (const r of f.ladder || []) {
    const p = by.get(r.id);
    if (!p) continue;
    practice.push(p);
    ladder.push({ id: p.id, title: p.title, level: p.level, rating: ratings.get(p.id) ?? null, adds: r.adds || "", minutes: typeof r.minutes === "number" ? r.minutes : null, href: `/dsa/problems/${p.id}` });
  }
  return { ladder, practice };
}

async function buildPage(root: string, module: string, lesson: string): Promise<LeanPage | null> {
  const l = (await getLeanIndex()).find((x) => LEAN_ROOT[x.kind] === root && x.module === module && x.id === lesson);
  if (!l) return null;
  const dir = leanDir(l.kind, module, lesson);
  const [lessonMd, quizMd, cast, linker, concepts, labels, clips] = await Promise.all([readDsa(`${dir}/lesson.md`), readDsa(`${dir}/quiz.md`), castOf(), sdmLinker(), getConceptIndex(), getStepLabels(), getLeanClips(module, lesson).catch(() => [] as Lecture[])]);
  if (!lessonMd) return null;
  const { content } = matter(lessonMd, {});
  const f = front(lessonMd);
  const { ladder, practice } = await ladderOf(f);
  const media = lectureMediaBase();
  const clipData: Record<string, LessonClipData> = Object.fromEntries(
    clips.map((c) => {
      const v = lectureHash(c);
      const base = media ? `${media.replace(/\/$/, "")}/${c.quest}/` : null;
      return [c.clip!.id, { id: c.clip!.id, caption: c.clip!.caption, base, v, say: c.scenes.flatMap((s) => s.steps.map((st) => st.say)) }];
    }),
  );
  const clipFiles = Object.fromEntries(Object.values(clipData).map((c) => [c.id, { caption: c.caption, files: c.base ? [`${c.base}video.mp4?v=${c.v}`, `${c.base}poster.jpg?v=${c.v}`, `${c.base}media.json`] : [] }]));
  const dsa: DsaRenderOpts = { cast, beats: true, checkpointQuiz: quizMd ? matter(quizMd, {}).content : "", titles: {}, sdmLink: linker.sdm, labLink: linker.lab, clips: clipFiles, ladder };
  // a leading h1 is the lesson's title to the renderer (a concept lesson opens with one); without it the first beat's own
  // heading would be taken as the title and the beat would fold into the intro
  const rendered = await renderLesson(`# ${f.title || l.title}\n\n${content}`, { kind: "day-content", dsa });

  const byConcept = new Map(concepts.map((c) => [`${c.module}/${c.id}`, c]));
  const buildsOn = (f.builds_on || [])
    .map((ref) => byConcept.get(ref))
    .filter((c): c is NonNullable<typeof c> => !!c && c.status === "built")
    .map((c) => ({ href: lessonHref(c), title: c.title }));

  const st = l.station ? stepOf(labels, l.station) : null;
  const word = LEAN_KIND_WORD[l.kind];
  const company = l.company;
  return {
    kind: l.kind,
    module,
    id: lesson,
    key: leanKey(module, lesson),
    title: f.title || l.title,
    summary: f.summary || "",
    minutes: Number(f.minutes) > 0 ? Number(f.minutes) : rendered.readingMinutes,
    moduleTitle: st ? `${st.label} · ${word}` : `${l.moduleTitle} · ${word}`,
    station: l.station && st ? { id: l.station, label: st.label, step: st.step } : null,
    groupLabel: l.moduleTitle,
    html: rendered.html,
    stages: rendered.stages.map((s) => ({ id: s.id, label: s.label, title: s.title, minutes: s.minutes })),
    toc: rendered.toc.map((t) => (t.kind === "part" ? { ...t, text: plainBeatHeading(t.text) } : t)),
    contentVersion: rendered.contentVersion,
    keyPoints: f.keyPoints || [],
    reviewCards: f.reviewCards || [],
    ladder,
    practice,
    clips: clipData,
    buildsOn,
    // the quiz is recorded under this lesson (own: false: no section checkpoint on the map), never marking a checkpoint done
    checkpoint: { nodeId: `lean:${leanKey(module, lesson)}`, key: `dsa:gate:lean:${leanKey(module, lesson)}`, pass: 0.8, problems: [], own: false },
    back: company ? { href: "/dsa/practice?list=company-types", label: "Practice" } : l.station ? { href: `/dsa#${(await stationCode(l.station)) || ""}`, label: st?.label || "the course" } : { href: "/dsa", label: "the course" },
    rating: l.rating ?? f.rating ?? null,
  };
}

/** The home's `#m3` anchor of a station: its region code, lower case. */
async function stationCode(module: string): Promise<string> {
  const academy = await getWorld("academy").catch(() => null);
  return academy?.regions.find((r) => r.module === module)?.code.toLowerCase() || "";
}

const pageCached = cached(buildPage, "dsa-lean-page-v1");

/** One request's calls share one build (the page and its metadata both ask). */
export const getLeanPage = requestCache(async (root: string, module: string, lesson: string): Promise<LeanPage | null> => {
  if (!SLUG.test(module) || !SLUG.test(lesson)) return null;
  return withSdmTitles(pageCached(root, module, lesson));
});

/* ------------------------------------------------------------------ lecture, clips, shorts */

const lectureCached = cached(async (module: string, lesson: string): Promise<Lecture | null> => {
  const l = await findLeanByParts(module, lesson);
  if (!l) return null;
  const dir = leanDir(l.kind, module, lesson);
  const raw = await readDsaJson<RawDsaLecture>(`${dir}/lecture.json`);
  if (!raw || !Array.isArray(raw.scenes) || !raw.scenes.length) return null;
  return resolveDsaLecture(raw, await lectureSources(dir, raw));
}, "dsa-lean-lecture-v1");
export const getLeanLecture = requestCache(async (module: string, lesson: string): Promise<Lecture | null> => (SLUG.test(module) && SLUG.test(lesson) ? lectureCached(module, lesson) : null));

const clipsCached = cached(async (module: string, lesson: string): Promise<Lecture[]> => {
  const l = await findLeanByParts(module, lesson);
  if (!l) return [];
  const dir = leanDir(l.kind, module, lesson);
  const raw = await readDsaJson<RawClips>(`${dir}/clips.json`);
  if (!raw?.clips?.length) return [];
  const refs = clipRefs(raw);
  const scenes = [...refs.traces.map((t) => ({ kind: "trace", trace: t })), ...refs.races.map((r) => ({ kind: "race", race: r }))];
  const [lecture, src] = await Promise.all([getLeanLecture(module, lesson), lectureSources(dir, { scenes } as unknown as RawDsaLecture)]);
  return raw.clips.map((clip) => resolveDsaClip(clip, lecture, { module, concept: lesson, title: l.title }, src)).filter((x): x is Lecture => !!x);
}, "dsa-lean-clips-v1");
export async function getLeanClips(module: string, lesson: string): Promise<Lecture[]> {
  return SLUG.test(module) && SLUG.test(lesson) ? clipsCached(module, lesson) : [];
}

/** One lean clip by its media id's parts (the lesson id is not unique, so every written lean lesson of that id is searched). */
export async function getLeanClip(lesson: string, clip: string): Promise<{ lecture: Lecture; lean: LeanLesson } | null> {
  for (const l of (await getLeanIndex()).filter((x) => x.id === lesson)) {
    const c = (await getLeanClips(l.module, l.id)).find((x) => x.clip?.id === clip);
    if (c) return { lecture: c, lean: l };
  }
  return null;
}

const shortIdsCached = cached(async (module: string, lesson: string): Promise<string[]> => {
  const l = await findLeanByParts(module, lesson);
  if (!l) return [];
  const files = (await listDsa(`${leanDir(l.kind, module, lesson)}/shorts`).catch(() => null)) || [];
  return files
    .filter((f) => /^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(f))
    .sort()
    .map((f) => `shorts--dsa--${module}--${lesson}--${f.replace(/\.json$/, "")}`);
}, "dsa-lean-short-ids-v1");
export async function getLeanShortIds(module: string, lesson: string): Promise<string[]> {
  return SLUG.test(module) && SLUG.test(lesson) ? shortIdsCached(module, lesson) : [];
}

const shortCached = cached(async (module: string, lesson: string, slug: string): Promise<Lecture | null> => {
  const l = await findLeanByParts(module, lesson);
  if (!l) return null;
  const dir = leanDir(l.kind, module, lesson);
  const raw = await readDsaJson<RawDsaLecture>(`${dir}/shorts/${slug}.json`);
  const id = `shorts--dsa--${module}--${lesson}--${slug}`;
  if (!raw || raw.quest !== id || !raw.short || !Array.isArray(raw.scenes) || !raw.scenes.length) return null;
  const resolved = resolveDsaShort(raw, await lectureSources(dir, raw));
  const labels = await getStepLabels();
  return resolved.short ? { ...resolved, short: { ...resolved.short, label: l.station ? stepOf(labels, l.station).label : l.moduleTitle } } : resolved;
}, "dsa-lean-short-v1");
export async function getLeanShort(module: string, lesson: string, slug: string): Promise<Lecture | null> {
  return SLUG.test(module) && SLUG.test(lesson) && SLUG.test(slug) ? shortCached(module, lesson, slug) : null;
}

/** One DSA short by its media id, from an Academy lesson or a lean one. */
export async function getDsaShortAny(id: string): Promise<Lecture | null> {
  const p = dsaShortParts(id);
  if (!p) return null;
  return (await getDsaShort(id).catch(() => null)) ?? getLeanShort(p.module, p.concept, p.slug);
}

/** Everything the lesson page's Watch card and the lecture page's "up next" need. */
export { leanHref, leanLabel, leanLectureHref };

/* ------------------------------------------------------------------ the map, Practice and the home */

/**
 * The side branches of the metro: written lean lessons that name a station (streets, camp tents, Core 150 gap sets), by
 * station module id. Company sets have no station and never appear here.
 */
export async function getLeanBranches(): Promise<LeanLesson[]> {
  return (await getLeanIndex()).filter((l) => !!l.station);
}
