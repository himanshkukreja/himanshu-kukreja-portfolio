import "server-only";
import matter from "gray-matter";
import { unstable_cache } from "next/cache";
import { renderLesson } from "@/lib/course/render";
import type { DsaRenderOpts } from "@/lib/course/detect/dsa";
import { DSA_CONTENT_TAG, dsaFresh, readDsa, readDsaJson } from "./content";
import { getConceptIndex, getLessonClips, getLineLabel, getProblemIndex, getStepLabels, getWorld, lessonDir, sdmLinker } from "./load";
import { stepOf } from "./steps";
import { lectureHash, lectureMediaBase } from "@/lib/learn/lecture/load";
import { dsaKeys, type ConceptCheckpoint, type DsaLang, type DsaStage, type ProblemSummary } from "./types";
import type { GridDemo, DpDemo, DpVisualizerSpec, StringsDemo, StringsVisualizerSpec, BitsDemo, BitsVisualizerSpec, GridVisualizerSpec, IntervalsDemo, IntervalsVisualizerSpec, PathDemo, SandboxDemo, SandboxSpec, VisualizerSpec } from "./viz/registry";
import type { LabCase, LabSpec } from "./design-harness";
import type { DsaSignature } from "./types";

/**
 * Visual lessons, one per module: structure lessons (Academy Part 2, dsa-mastery resources/structures/<module>/<lesson>/)
 * and algorithm lessons (Part 3, resources/algorithms/<module>/<lesson>/). One cached item per lesson: the rendered
 * explainer (six beats as the reader's stages), the sandbox (structures) or the visualizer (algorithms) and the demos
 * the lesson plays, the build-it lab (a class in design mode, or functions in function mode: spec, visible and hidden
 * cases, starters), the warm-up problems and the checkpoint. The lab's reference solutions never leave the server.
 */

/** A function-mode lab (algorithm lessons): one or more functions, each tested like a small problem. */
export type FunctionLabSpec = {
  id: string;
  title: string;
  mode: "function";
  summary: string;
  legend?: string;
  functions: (DsaSignature & { title: string; does: string; cost?: string })[];
  limits: { timeMs: number };
};
export type FunctionLabCase = { name: string; fn: string; input: Record<string, unknown>; output: unknown; note?: string };
export type LabBundle =
  | { mode: "design"; spec: LabSpec; visible: LabCase[]; hidden: LabCase[]; starters: Partial<Record<DsaLang, string>> }
  | { mode: "function"; spec: FunctionLabSpec; visible: FunctionLabCase[]; hidden: FunctionLabCase[]; starters: Partial<Record<DsaLang, string>> };

/**
 * An in-article clip as the lesson page plays it (src/components/dsa/clip/LessonClip.tsx): its recorded folder on the
 * media host (null: no media host), the script hash its media must carry (media.json `source`), the caption, and each
 * step's narration (the captions while it plays narrated, timed by media.json `starts`).
 */
export type LessonClipData = { id: string; caption: string; base: string | null; v: string; say: string[] };

export type StructurePage = {
  id: string;
  /** structure (Part 2) or algorithm (Part 3) */
  kind: "structure" | "algorithm";
  module: string;
  moduleTitle: string;
  regionTitle: string;
  title: string;
  summary: string;
  level: string;
  minutes: number;
  line: string;
  lineLabel: string;
  structure: string;
  keyPoints: string[];
  html: string;
  stages: DsaStage[];
  toc: { id: string; text: string; level: 1 | 2 | 3 | 4; kind: "part" | "chapter" | "section" | "question" | "other"; stageId: string }[];
  contentVersion: string;
  sandbox: SandboxSpec | null;
  visualizer: VisualizerSpec | null;
  demos: Record<string, SandboxDemo | GridDemo | PathDemo | IntervalsDemo | DpDemo | StringsDemo | BitsDemo>;
  /** in-article clips by id (clips.json, placed with ::clip[id]) */
  clips: Record<string, LessonClipData>;
  lab: LabBundle | null;
  reviewCards: { front: string; back: string }[];
  practice: ProblemSummary[];
  checkpoint: ConceptCheckpoint | null;
};

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const yaml = <T,>(src: string): T => matter(`---\n${src}\n---\n`, {}).data as T;

type Front = {
  title?: string;
  structure?: string;
  line?: string;
  level?: string;
  minutes?: number;
  keyPoints?: string[];
  practice?: string[];
  sandbox?: string;
  visualizer?: string;
  lab?: string;
  reviewCards?: { front: string; back: string }[];
};

const STARTERS: [DsaLang, string][] = [
  ["python", "starter.py"],
  ["javascript", "starter.js"],
  ["java", "Starter.java"],
  ["cpp", "starter.cpp"],
];

async function build(id: string): Promise<StructurePage | null> {
  const concepts = await getConceptIndex();
  const c = concepts.find((x) => x.id === id);
  if (!c || (c.kind !== "structure" && c.kind !== "algorithm") || c.status !== "built") return null;
  const algorithm = c.kind === "algorithm";
  const dir = lessonDir(c);
  const [lessonMd, quizMd, sandboxYml, labYml, visible, hidden, castMd, courseYml, problems, academy, linker, ...starters] = await Promise.all([
    readDsa(`${dir}/lesson.md`),
    readDsa(`${dir}/quiz.md`),
    readDsa(`${dir}/${algorithm ? "visualizer" : "sandbox"}.yml`),
    readDsa(`${dir}/lab/lab.yml`),
    readDsaJson<{ cases?: (LabCase & FunctionLabCase)[] }>(`${dir}/lab/tests/visible.json`),
    readDsaJson<{ cases?: (LabCase & FunctionLabCase)[] }>(`${dir}/lab/tests/hidden.json`),
    readDsa("resources/company/cast.md"),
    readDsa("resources/course.yml"),
    getProblemIndex(),
    getWorld("academy"),
    sdmLinker(),
    ...STARTERS.map(([, f]) => readDsa(`${dir}/lab/starter/${f}`)),
  ]);
  const media = lectureMediaBase();
  const clips: Record<string, LessonClipData> = Object.fromEntries(
    (await getLessonClips(id)).map((l) => {
      const v = lectureHash(l);
      const base = media ? `${media.replace(/\/$/, "")}/${l.quest}/` : null;
      return [l.clip!.id, { id: l.clip!.id, caption: l.clip!.caption, base, v, say: l.scenes.flatMap((s) => s.steps.map((st) => st.say)) }];
    }),
  );
  if (!lessonMd) return null;
  const { data, content } = matter(lessonMd, {});
  const f = data as Front;
  const cast = Object.fromEntries((((castMd ? matter(castMd, {}).data : {}) as { cast?: { id: string; name: string; role: string }[] }).cast || []).map((x) => [x.id, { name: x.name, role: x.role }]));
  const mod = ((courseYml ? yaml<{ modules?: { id: string; code: string; title: string; building?: string }[] }>(courseYml).modules : []) || []).find((m) => m.id === c.module);

  const sandbox = sandboxYml && !algorithm ? yaml<SandboxSpec>(sandboxYml) : null;
  const visualizer = sandboxYml && algorithm ? yaml<VisualizerSpec>(sandboxYml) : null;
  // a grid demo that names a preset carries the preset's grid, so the client needs nothing else
  // (a weighted-map demo likewise carries its preset's vertices, edges, source and target)
  const demos: Record<string, SandboxDemo | GridDemo | PathDemo | IntervalsDemo | DpDemo | StringsDemo | BitsDemo> = Object.fromEntries([
    // (an intervals demo carries its preset's talks the same way)
    ...(sandbox?.demos || []).map((d) => [d.id, d] as const),
    ...(visualizer?.view === "graph"
      ? visualizer.demos.map((d) => {
          const p = visualizer.presets.find((x) => x.id === d.preset);
          return [d.id, { ...d, n: d.n ?? p?.n, edges: d.edges ?? p?.edges, source: d.source ?? p?.source, target: d.target ?? p?.target }] as const;
        })
      : visualizer?.view === "bits"
        ? (visualizer as BitsVisualizerSpec).demos.map((d) => [d.id, { ...d, problem: d.problem ?? (visualizer as BitsVisualizerSpec).presets.find((x) => x.id === d.preset)?.problem }] as const)
      : visualizer?.view === "strings"
        ? (visualizer as StringsVisualizerSpec).demos.map((d) => [d.id, { ...d, problem: d.problem ?? (visualizer as StringsVisualizerSpec).presets.find((x) => x.id === d.preset)?.problem }] as const)
      : visualizer?.view === "dp"
        ? (visualizer as DpVisualizerSpec).demos.map((d) => [d.id, { ...d, problem: d.problem ?? (visualizer as DpVisualizerSpec).presets.find((x) => x.id === d.preset)?.problem }] as const)
      : visualizer?.view === "intervals"
        ? (visualizer as IntervalsVisualizerSpec).demos.map((d) => [d.id, { ...d, talks: d.talks ?? (visualizer as IntervalsVisualizerSpec).presets.find((x) => x.id === d.preset)?.talks }] as const)
        : (visualizer?.demos || []).map((d) => [d.id, { ...d, grid: d.grid || (visualizer as GridVisualizerSpec).presets.find((p) => p.id === d.preset)?.grid }] as const)),
  ]);
  const titles = Object.fromEntries(Object.values(demos).map((d) => [d.id, d.title]));
  // a saved copy keeps each clip's files (the video carries the narration; media.json times the captions)
  const clipFiles = Object.fromEntries(
    Object.values(clips).map((c) => [c.id, { caption: c.caption, files: c.base ? [`${c.base}video.mp4?v=${c.v}`, `${c.base}poster.jpg?v=${c.v}`, `${c.base}media.json`] : [] }]),
  );
  const dsa: DsaRenderOpts = { cast, beats: true, checkpointQuiz: quizMd ? matter(quizMd, {}).content : "", titles, sdmLink: linker.sdm, labLink: linker.lab, clips: clipFiles };
  const rendered = await renderLesson(content, { kind: "day-content", dsa });

  const byId = new Map(problems.map((p) => [p.id, p]));
  const practice = (f.practice || []).map((p) => byId.get(p)).filter((p): p is ProblemSummary => !!p);

  let checkpoint: ConceptCheckpoint | null = null;
  const region = academy?.regions.find((r) => r.module === c.module);
  for (const s of region?.stretches || []) {
    const n = s.nodes.find((x) => x.type === "checkpoint" && x.quiz === `${c.module}/${id}`);
    if (n && region) {
      const num = n.id.match(/checkpoint-(\d+)$/)?.[1] || "1";
      checkpoint = { nodeId: n.id, key: dsaKeys.gate("academy", region.id, num), pass: n.pass ?? 0.8, problems: n.problems || [] };
    }
  }

  const raw = labYml ? yaml<(LabSpec & { mode?: string }) | FunctionLabSpec>(labYml) : null;
  const starterMap = Object.fromEntries(STARTERS.map(([l], i) => [l, (starters[i] as string | null) || ""]).filter(([, s]) => s)) as Partial<Record<DsaLang, string>>;
  let lab: LabBundle | null = null;
  if (raw && raw.mode === "function") {
    const f = raw as FunctionLabSpec;
    lab = {
      mode: "function",
      spec: { id: f.id, title: f.title, mode: "function", summary: f.summary, legend: f.legend, functions: f.functions, limits: f.limits || { timeMs: 2000 } },
      visible: visible?.cases || [],
      hidden: hidden?.cases || [],
      starters: starterMap,
    };
  } else if (raw) {
    const d = raw as LabSpec;
    lab = {
      mode: "design",
      spec: { id: d.id, title: d.title, class: d.class, summary: d.summary, methods: d.methods, limits: d.limits || { timeMs: 2000 }, thing: d.thing, edges: d.edges, after: d.after },
      visible: visible?.cases || [],
      hidden: hidden?.cases || [],
      starters: starterMap,
    };
  }

  return {
    id,
    kind: algorithm ? "algorithm" : "structure",
    module: c.module,
    moduleTitle: stepOf(await getStepLabels(), c.module).label,
    regionTitle: stepOf(await getStepLabels(), c.module).building,
    title: f.title || c.title,
    summary: c.summary,
    level: f.level || "beginner",
    minutes: f.minutes || rendered.readingMinutes,
    line: f.line || "",
    lineLabel: await getLineLabel(f.line || ""),
    structure: f.structure || "",
    keyPoints: f.keyPoints || [],
    html: rendered.html,
    stages: rendered.stages.map((s) => ({ id: s.id, label: s.label, title: s.title, minutes: s.minutes })),
    toc: rendered.toc,
    contentVersion: rendered.contentVersion,
    sandbox,
    visualizer,
    demos,
    clips,
    lab,
    reviewCards: f.reviewCards || [],
    practice,
    checkpoint,
  };
}

const cachedBuild = unstable_cache(build, ["dsa-structure-v3"], { revalidate: 604800, tags: [DSA_CONTENT_TAG] });

export async function getStructure(id: string): Promise<StructurePage | null> {
  if (!ID.test(id)) return null;
  return dsaFresh() ? build(id) : cachedBuild(id);
}
