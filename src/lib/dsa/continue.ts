/**
 * "Continue" on the DSA home (Phase 1 of the redesign): the one next step, worked out from the learner's progress with
 * no AI call. Pure and import-free apart from types and computeWorld, so node --test can run it
 * (scripts/tests/dsa-continue.test.mjs).
 *
 * 1. Frontier: computeWorld's first required, built, open node that isn't done (from the onboarding's start region).
 * 2. Lesson: a concept node is that lesson; a practice node belongs to the nearest preceding concept of its stretch (or
 *    the region's first); a checkpoint node belongs to its quiz's concept.
 * 3. Step, in order Learn, Try, Practice, Check. Try is the lesson's lab; with no lab it is optional (never the current
 *    step, ticked once `dsa:try:<c>` is set). Check is the checkpoint quiz with its problems; a lesson without a
 *    checkpoint of its own is checked once Learn is.
 * 4. The button: in Practice "Continue: <next unsolved problem>", otherwise "Continue: <step> · <lesson>" at `#<step>`.
 * 5. Time left: the unread Learn time, 20 min for an unpassed lab, each unsolved problem, 10 min for Check.
 *
 * TODO(phase 2a): the Learn beats come from lesson-steps.ts once it lands (`opts.learnBeats`); until then "Learn is done"
 * means the lesson is complete or four or more of its beats are read.
 */
// the .ts extension lets node --test load this file (the app's bundler resolves it too); tsc only allows it with a flag
// @ts-expect-error TS5097
import { computeWorld } from "./map/progress.ts";
import type { ProgressSignals } from "./map/progress";
import type { WorldNode, WorldRegion, WorldSpec } from "./types";

export type ContinueSignals = ProgressSignals & {
  /** lesson ids whose Try-it was used (dsa:try:<c>) */
  tries: ReadonlySet<string>;
  /** beats read, by lesson id (dsa:s:<c>/<beat>) */
  beats: ReadonlyMap<string, ReadonlySet<string>>;
};

export type ConceptInfo = { id: string; title: string; summary?: string; minutes?: number };
export type ProblemInfo = { id: string; title: string; level: string; minutes: number | null; concept: string };

export type StepId = "learn" | "try" | "practice" | "check";
export const STEP_ORDER: StepId[] = ["learn", "try", "practice", "check"];
export const STEP_LABEL: Record<StepId, string> = { learn: "Learn", try: "Try it", practice: "Practice", check: "Check" };

export type StepState = {
  id: StepId;
  label: string;
  done: boolean;
  now: boolean;
  /** Try with no lab: never the current step */
  optional: boolean;
};

export type NextStep =
  | { state: "empty" }
  | { state: "caught-up"; planned: number }
  | {
      state: "start" | "continue";
      lessonId: string;
      lessonTitle: string;
      summary: string;
      lessonHref: string;
      regionCode: string;
      partTitle: string;
      moduleTitle: string;
      /** place of the lesson in its module: "lesson 3 of 6" */
      n: number;
      of: number;
      steps: StepState[];
      step: StepId;
      practice: { solved: number; total: number };
      /** where the primary button goes, and its label */
      href: string;
      label: string;
      minutesLeft: number;
      /** the step's own label: "Practice · 1 of 5" */
      stepLabel: string;
    };

const LEVEL_MIN: Record<string, number> = { easy: 15, medium: 25, hard: 40 };
/** Beats a learner must read before Learn counts as done, until lesson-steps.ts names them (phase 2a). */
const LEARN_MIN_BEATS = 4;
const BEATS_PER_LESSON = 6;

type Bucket = { practice: WorldNode[]; checkpoint: WorldNode | null };

/** Practice and checkpoint nodes by the lesson they belong to, in map order. */
export function bucketsOf(region: WorldRegion): Map<string, Bucket> {
  const out = new Map<string, Bucket>();
  const get = (id: string): Bucket => {
    let b = out.get(id);
    if (!b) out.set(id, (b = { practice: [], checkpoint: null }));
    return b;
  };
  const first = region.stretches.flatMap((s) => s.nodes).find((n) => n.type === "concept" && n.ref)?.ref || "";
  for (const st of region.stretches) {
    let cur = "";
    for (const n of st.nodes) {
      if (n.type === "concept" && n.ref) {
        cur = n.ref;
        get(cur);
      } else if (n.type === "practice") {
        const owner = cur || first;
        if (owner) get(owner).practice.push(n);
      } else if (n.type === "checkpoint") {
        const owner = (n.quiz || "").split("/")[1] || cur || first;
        if (owner) get(owner).checkpoint = n;
      }
    }
  }
  return out;
}

export function nextStep(
  academy: WorldSpec,
  concepts: ConceptInfo[],
  problems: ProblemInfo[],
  signals: ContinueSignals,
  opts: { startRegion?: string | null; learnBeats?: (conceptId: string) => string[] | null } = {},
): NextStep {
  const world = computeWorld(academy, signals, { startRegion: opts.startRegion });
  const conceptById = new Map(concepts.map((c) => [c.id, c]));
  const problemById = new Map(problems.map((p) => [p.id, p]));

  const planned = academy.regions.reduce((n, r) => n + r.stretches.reduce((m, st) => m + st.nodes.filter((x) => x.type === "concept" && !x.built).length, 0), 0);
  const anyBuilt = academy.regions.some((r) => r.stretches.some((st) => st.nodes.some((x) => x.type === "concept" && x.built)));
  if (!anyBuilt) return { state: "empty" };
  if (!world.frontier) return { state: "caught-up", planned };

  const region = academy.regions.find((r) => r.id === world.frontier!.regionId);
  const node = region?.stretches.flatMap((s) => s.nodes).find((n) => n.id === world.frontier!.nodeId);
  if (!region || !node) return { state: "empty" };

  const buckets = bucketsOf(region);
  const regionFirst = region.stretches.flatMap((s) => s.nodes).find((n) => n.type === "concept" && n.ref && n.built)?.ref || "";
  // the lesson the frontier node belongs to
  let lessonId = "";
  if (node.type === "concept") lessonId = node.ref || "";
  else if (node.type === "checkpoint") lessonId = (node.quiz || "").split("/")[1] || "";
  else if (node.type === "practice") {
    for (const [id, b] of buckets) if (b.practice.some((p) => p.id === node.id)) lessonId = id;
  }
  if (!lessonId) lessonId = regionFirst;
  const lessonNode = region.stretches.flatMap((s) => s.nodes).find((n) => n.type === "concept" && n.ref === lessonId);
  if (!lessonNode?.href) return { state: "empty" };

  const b = buckets.get(lessonId) || { practice: [], checkpoint: null };
  const info = conceptById.get(lessonId);
  const beats = signals.beats.get(lessonId);
  const read = beats?.size || 0;

  // Learn
  const wanted = opts.learnBeats?.(lessonId);
  const learnDone = signals.concepts.has(lessonId) || (wanted && wanted.length ? wanted.every((x) => beats?.has(x)) : read >= LEARN_MIN_BEATS);
  // Try: the lab of the lesson's checkpoint
  const lab = b.checkpoint?.lab?.id;
  const tryDone = lab ? signals.labs.has(lab) : signals.tries.has(lessonId);
  // Practice: the built practice nodes of the lesson
  const builtPractice = b.practice.filter((p) => p.built && p.ref);
  const unsolved = builtPractice.filter((p) => !signals.solved.has(p.ref!));
  const solvedN = builtPractice.length - unsolved.length;
  const practiceDone = unsolved.length === 0;
  // Check: the checkpoint's quiz and its built problems; with none of its own, done once Learn is
  const cp = b.checkpoint;
  const cpProblems = (cp?.problems || []).filter((p) => p.built);
  const checkDone = cp && cp.built ? signals.checkpoints.has(cp.id) && cpProblems.every((p) => signals.solved.has(p.id)) : learnDone;

  const done: Record<StepId, boolean> = { learn: !!learnDone, try: tryDone, practice: practiceDone, check: !!checkDone };
  const optional: Record<StepId, boolean> = { learn: false, try: !lab, practice: false, check: false };
  let step: StepId = STEP_ORDER.find((s) => !done[s] && !optional[s]) || "check";
  // the practice node itself decides when the frontier is on one and the earlier steps are done
  if (node.type === "practice" && done.learn && (done.try || optional.try)) step = "practice";

  const steps: StepState[] = STEP_ORDER.map((id) => ({ id, label: STEP_LABEL[id], done: done[id], now: id === step, optional: optional[id] }));

  const nextProblem = unsolved[0];
  const minutesLeft = Math.max(
    5,
    Math.round(
      ((learnDone ? 0 : (info?.minutes || 30) * Math.max(0, 1 - read / BEATS_PER_LESSON)) +
        (lab && !tryDone ? 20 : 0) +
        unsolved.reduce((s, p) => {
          const pr = problemById.get(p.ref!);
          return s + (pr?.minutes || LEVEL_MIN[pr?.level || p.level || "medium"] || 25);
        }, 0) +
        (checkDone ? 0 : 10)) /
        5,
    ) * 5,
  );

  const lessons = region.stretches.flatMap((s) => s.nodes).filter((n) => n.type === "concept" && n.ref);
  const n = lessons.findIndex((x) => x.ref === lessonId) + 1;
  const part = academy.parts.find((p) => p.regions.includes(region.id));
  const started = world.done > 0 || signals.solved.size > 0 || signals.concepts.size > 0 || signals.beats.size > 0 || signals.tries.size > 0 || signals.labs.size > 0;
  const title = lessonNode.title || info?.title || lessonId;
  const stepLabel = step === "practice" && builtPractice.length ? `Practice · ${Math.min(solvedN + 1, builtPractice.length)} of ${builtPractice.length}` : STEP_LABEL[step];

  let href: string;
  let label: string;
  if (!started) {
    href = lessonNode.href;
    label = `Start lesson ${n}: ${title}`;
  } else if (step === "practice" && nextProblem?.href) {
    href = nextProblem.href;
    label = `Continue: ${nextProblem.title}`;
  } else {
    href = `${lessonNode.href}#${step}`;
    label = `Continue: ${STEP_LABEL[step]} · ${title}`;
  }

  return {
    state: started ? "continue" : "start",
    lessonId,
    lessonTitle: title,
    summary: info?.summary || "",
    lessonHref: lessonNode.href,
    regionCode: region.code,
    partTitle: part?.title || "",
    moduleTitle: region.moduleTitle || region.title,
    n,
    of: lessons.length,
    steps,
    step,
    practice: { solved: solvedN, total: builtPractice.length },
    href,
    label,
    minutesLeft,
    stepLabel,
  };
}
