/**
 * The course outline behind the DSA home (Phase 1 of the redesign): the Academy world's parts, modules and lessons as
 * the learner reads them, built once on the server from the world spec, the concept and problem indexes and the step
 * labels. Pure and import-free apart from types, so node --test can run it (scripts/tests/dsa-outline.test.mjs).
 *
 * - Parts come in academy.yml order; a module is a region ("m3"), a lesson a concept node of its stretches (a region
 *   with `detail: outline` lists its concepts in one stretch, which count as planned until they are written).
 * - Each checkpoint becomes a row after the last lesson of its stretch; it opens the owning lesson's `#check`.
 * - Practice nodes are never rows: they live inside lessons (see continue.ts for how they are assigned).
 * - Planned lessons and modules have no href, so nothing links to a page that does not exist.
 */
import type { ConceptSummary, ProblemSummary, WorldNode, WorldRegion, WorldSpec } from "./types";
import type { StepLabels } from "./steps";

export type OutlineLesson = {
  conceptId: string;
  title: string;
  /** the lesson's page; null while it is planned */
  href: string | null;
  kind: "concept" | "structure" | "algorithm";
  /** reading minutes (the lesson's front matter), 0 when unknown */
  minutes: number;
  /** the lecture's folder in the media store (dsa--<module>--<concept>), when the lesson is written */
  lectureSlug?: string;
  problemCount: number;
  built: boolean;
  nodeId: string;
};

/**
 * A side branch of a station (owner, 18 Nov 2026): a street, camp tent or Core 150 gap set that hangs off its station. Optional
 * everywhere: never a row of the module's lessons, never counted in its done counts, "Next stop" or route (src/lib/dsa/kinds.ts).
 */
export type OutlineBranch = {
  /** the progress slug (module--lesson): done = the learner finished it (dsa:c:<key>) */
  key: string;
  kind: "street" | "camp-tent" | "set";
  module: string;
  lesson: string;
  title: string;
  href: string;
  minutes: number;
  /** problems on its ladder */
  problemCount: number;
};

export type OutlineCheckpoint = {
  nodeId: string;
  /** the lesson this row follows */
  afterLesson: string;
  /** the concept whose quiz it is (the quiz is "<module>/<concept>") */
  quizOwner: string;
  /** where the row goes: the owner's `#check`, null while the owner is planned */
  href: string | null;
  problems: { id: string; title: string; built: boolean }[];
  hasLab: boolean;
  minutes: number;
  built: boolean;
};

export type OutlineModule = {
  /** the region code ("m3"): the home's `#m3` deep link */
  regionCode: string;
  regionId: string;
  moduleId: string;
  /** "2.2" */
  step: string;
  title: string;
  objective: string;
  lessons: OutlineLesson[];
  /** the station's side branches (streets, camp tents, gap sets), in plan order; not lessons of the module */
  branches: OutlineBranch[];
  checkpoints: OutlineCheckpoint[];
  minutes: number;
  problemCount: number;
  /** no lesson of the module is written yet */
  planned: boolean;
  /** "Skip ahead" (the placement check) and "Module review" (the boss): planned rows, shown as Soon */
  placement: { built: boolean };
  boss: { title: string; built: boolean } | null;
  /** the nodes the learner needs for done counts */
  readyLessons: number;
};

export type OutlinePart = {
  id: string;
  /** "PART 2" */
  label: string;
  title: string;
  summary: string;
  modules: OutlineModule[];
  /** Part 4 ends with the Academy's final review */
  final?: { title: string; built: boolean };
};

export type Outline = {
  parts: OutlinePart[];
  totals: { lessons: number; ready: number; planned: number; problems: number };
};

/** Reading time the way the home shows it: "40 min", "3 h 40 min", "2 h". */
export function fmtDuration(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

const lessonPathOf = (c: { id: string; kind?: string }) => (c.kind === "structure" ? `/dsa/structures/${c.id}` : c.kind === "algorithm" ? `/dsa/algorithms/${c.id}` : `/dsa/concepts/${c.id}`);

export function buildOutline(
  academy: Pick<WorldSpec, "parts" | "regions" | "final">,
  concepts: Pick<ConceptSummary, "id" | "module" | "status" | "kind" | "title">[],
  problems: Pick<ProblemSummary, "id" | "concept">[],
  steps: StepLabels,
  /** reading minutes by lesson id (resources/.../lesson.md front matter) */
  minutes: Record<string, number> = {},
  /** the written side branches, each with the station (Academy module id) it hangs off */
  branches: (OutlineBranch & { station: string })[] = [],
): Outline {
  const byConcept = new Map(concepts.map((c) => [c.id, c]));
  const perConcept = new Map<string, number>();
  for (const p of problems) perConcept.set(p.concept, (perConcept.get(p.concept) || 0) + 1);
  const regionById = new Map(academy.regions.map((r) => [r.id, r]));

  const moduleOf = (r: WorldRegion): OutlineModule => {
    const lessons: OutlineLesson[] = [];
    const checkpoints: OutlineCheckpoint[] = [];
    const seen = new Set<string>();
    for (const st of r.stretches) {
      let last: string | null = null;
      const rows: WorldNode[] = [];
      for (const n of st.nodes) {
        if (n.type === "concept" && n.ref) {
          if (seen.has(n.ref)) continue;
          seen.add(n.ref);
          const c = byConcept.get(n.ref);
          const built = c?.status === "built";
          lessons.push({
            conceptId: n.ref,
            title: n.title || c?.title || n.ref,
            href: built ? n.href || lessonPathOf({ id: n.ref, kind: c?.kind }) : null,
            kind: c?.kind || "concept",
            minutes: built ? minutes[n.ref] || 0 : 0,
            ...(built && c ? { lectureSlug: `dsa--${c.module}--${c.id}` } : {}),
            problemCount: perConcept.get(n.ref) || 0,
            built,
            nodeId: n.id,
          });
          last = n.ref;
        } else if (n.type === "checkpoint") rows.push(n);
      }
      // each checkpoint goes after the last lesson of its stretch (a stretch with no lesson has none to follow)
      for (const n of rows) {
        const owner = (n.quiz || "").split("/")[1] || last || "";
        const oc = byConcept.get(owner);
        const ownerBuilt = oc?.status === "built";
        if (!last && !owner) continue;
        checkpoints.push({
          nodeId: n.id,
          afterLesson: last || owner,
          quizOwner: owner,
          href: ownerBuilt ? `${lessonPathOf({ id: owner, kind: oc?.kind })}#check` : null,
          problems: n.problems || [],
          hasLab: !!n.lab,
          minutes: 30,
          built: !!n.built,
        });
      }
    }
    const built = lessons.filter((l) => l.built);
    return {
      regionCode: r.code,
      regionId: r.id,
      moduleId: r.module,
      step: r.step || steps[r.module]?.step || "",
      title: r.moduleTitle || r.title,
      objective: r.objective || r.intro || "",
      lessons,
      branches: branches.filter((b) => b.station === r.module).map(({ station: _s, ...b }) => (void _s, b)),
      checkpoints,
      minutes: built.reduce((s, l) => s + l.minutes, 0),
      problemCount: built.reduce((s, l) => s + l.problemCount, 0),
      planned: built.length === 0,
      placement: { built: false },
      boss: r.boss ? { title: r.boss.title, built: !!r.boss.built } : null,
      readyLessons: built.length,
    };
  };

  const parts: OutlinePart[] = academy.parts.map((p, i) => ({
    id: p.id,
    label: `PART ${i + 1}`,
    title: p.title,
    summary: p.summary,
    modules: p.regions.map((id) => regionById.get(id)).filter((r): r is WorldRegion => !!r).map(moduleOf),
  }));
  // a region named in no part is not lost: it goes at the end of the last part
  const placed = new Set(academy.parts.flatMap((p) => p.regions));
  const stray = academy.regions.filter((r) => !placed.has(r.id));
  if (stray.length && parts.length) parts[parts.length - 1].modules.push(...stray.map(moduleOf));
  if (academy.final && parts.length) parts[parts.length - 1].final = { title: academy.final.title || "Final review", built: !!academy.final.built };

  const all = parts.flatMap((p) => p.modules.flatMap((m) => m.lessons));
  const ready = all.filter((l) => l.built).length;
  return {
    parts,
    totals: { lessons: all.length, ready, planned: all.length - ready, problems: problems.length },
  };
}

/** The module that holds a lesson (by concept id), with its part, or null. */
export function moduleOfLesson(outline: Outline, conceptId: string): { part: OutlinePart; mod: OutlineModule; index: number } | null {
  for (const part of outline.parts)
    for (const mod of part.modules) {
      const index = mod.lessons.findIndex((l) => l.conceptId === conceptId);
      if (index >= 0) return { part, mod, index };
    }
  return null;
}
