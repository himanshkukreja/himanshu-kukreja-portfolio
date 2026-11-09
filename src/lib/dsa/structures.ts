import "server-only";
import matter from "gray-matter";
import { unstable_cache } from "next/cache";
import { renderLesson } from "@/lib/course/render";
import type { DsaRenderOpts } from "@/lib/course/detect/dsa";
import { DSA_CONTENT_TAG, dsaFresh, readDsa, readDsaJson } from "./content";
import { getConceptIndex, getProblemIndex, getWorld, lessonDir, sdmLinker } from "./load";
import { dsaKeys, type ConceptCheckpoint, type DsaLang, type DsaStage, type ProblemSummary } from "./types";
import type { SandboxDemo, SandboxSpec } from "./viz/registry";
import type { LabCase, LabSpec } from "./design-harness";

/**
 * Structure lessons (Academy Part 2, "Core data structures"): dsa-mastery resources/structures/<module>/<lesson>/
 * (README "Structure lessons"). One cached item per lesson: the rendered explainer (six beats as the reader's stages),
 * the sandbox spec and its demos, the build-it lab (spec, visible and hidden cases, starters), the warm-up problems
 * and the checkpoint. The lab's reference solutions never leave the server.
 */

export type StructurePage = {
  id: string;
  module: string;
  moduleTitle: string;
  regionTitle: string;
  title: string;
  summary: string;
  level: string;
  minutes: number;
  line: string;
  structure: string;
  keyPoints: string[];
  html: string;
  stages: DsaStage[];
  toc: { id: string; text: string; level: 1 | 2 | 3 | 4; kind: "part" | "chapter" | "section" | "question" | "other"; stageId: string }[];
  contentVersion: string;
  sandbox: SandboxSpec | null;
  demos: Record<string, SandboxDemo>;
  lab: { spec: LabSpec; visible: LabCase[]; hidden: LabCase[]; starters: Partial<Record<DsaLang, string>> } | null;
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
  if (!c || c.kind !== "structure" || c.status !== "built") return null;
  const dir = lessonDir(c);
  const [lessonMd, quizMd, sandboxYml, labYml, visible, hidden, castMd, courseYml, problems, academy, linker, ...starters] = await Promise.all([
    readDsa(`${dir}/lesson.md`),
    readDsa(`${dir}/quiz.md`),
    readDsa(`${dir}/sandbox.yml`),
    readDsa(`${dir}/lab/lab.yml`),
    readDsaJson<{ cases?: LabCase[] }>(`${dir}/lab/tests/visible.json`),
    readDsaJson<{ cases?: LabCase[] }>(`${dir}/lab/tests/hidden.json`),
    readDsa("resources/company/cast.md"),
    readDsa("resources/course.yml"),
    getProblemIndex(),
    getWorld("academy"),
    sdmLinker(),
    ...STARTERS.map(([, f]) => readDsa(`${dir}/lab/starter/${f}`)),
  ]);
  if (!lessonMd) return null;
  const { data, content } = matter(lessonMd, {});
  const f = data as Front;
  const cast = Object.fromEntries((((castMd ? matter(castMd, {}).data : {}) as { cast?: { id: string; name: string; role: string }[] }).cast || []).map((x) => [x.id, { name: x.name, role: x.role }]));
  const mod = ((courseYml ? yaml<{ modules?: { id: string; code: string; title: string; building?: string }[] }>(courseYml).modules : []) || []).find((m) => m.id === c.module);

  const sandbox = sandboxYml ? yaml<SandboxSpec>(sandboxYml) : null;
  const demos: Record<string, SandboxDemo> = Object.fromEntries((sandbox?.demos || []).map((d) => [d.id, d]));
  const titles = Object.fromEntries(Object.values(demos).map((d) => [d.id, d.title]));
  const dsa: DsaRenderOpts = { cast, beats: true, checkpointQuiz: quizMd ? matter(quizMd, {}).content : "", titles, sdmLink: linker.sdm, labLink: linker.lab };
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

  const spec = labYml ? yaml<LabSpec>(labYml) : null;
  const lab = spec
    ? {
        spec: { id: spec.id, title: spec.title, class: spec.class, summary: spec.summary, methods: spec.methods, limits: spec.limits || { timeMs: 2000 } },
        visible: visible?.cases || [],
        hidden: hidden?.cases || [],
        starters: Object.fromEntries(STARTERS.map(([l], i) => [l, (starters[i] as string | null) || ""]).filter(([, s]) => s)) as Partial<Record<DsaLang, string>>,
      }
    : null;

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
    structure: f.structure || "",
    keyPoints: f.keyPoints || [],
    html: rendered.html,
    stages: rendered.stages.map((s) => ({ id: s.id, label: s.label, title: s.title, minutes: s.minutes })),
    toc: rendered.toc,
    contentVersion: rendered.contentVersion,
    sandbox,
    demos,
    lab,
    reviewCards: f.reviewCards || [],
    practice,
    checkpoint,
  };
}

const cachedBuild = unstable_cache(build, ["dsa-structure-v1"], { revalidate: 604800, tags: [DSA_CONTENT_TAG] });

export async function getStructure(id: string): Promise<StructurePage | null> {
  if (!ID.test(id)) return null;
  return dsaFresh() ? build(id) : cachedBuild(id);
}
