/**
 * The lesson page's four steps (DSA Mastery redesign, Phase 2a): Learn, Try it, Practice, Check. Pure and import-free,
 * so node --test can run it and the server and client agree.
 *
 * A lesson's HTML is a list of stage sections ("beats": the `data-stage-id`s the renderer writes). The steps are views
 * over those beats: this file says which beat belongs to which step, per kind of lesson. The map is keyed by the
 * beat's id and, as a fallback, by its label normalised ("Use it well" -> "use-it-well"), per kind, because the same
 * label ("Try it") means a different thing in a concept lesson (its Struggle beat, still part of Learn) and in a
 * structure lesson (the sandbox, which is the Try it step). An unknown beat goes to Learn, and the short intro with it.
 */

export type StepId = "learn" | "try" | "practice" | "check";
/** "lean": a street, camp tent or set (src/lib/dsa/kinds.ts): Learn, Practice (the ladder) and Check; no Try it. */
export type LessonKind = "concept" | "structure" | "algorithm" | "lean";

export const STEP_ORDER: readonly StepId[] = ["learn", "try", "practice", "check"];
/** A lean lesson has no sandbox, visualiser or lab, so no Try it step. */
export const LEAN_STEP_ORDER: readonly StepId[] = ["learn", "practice", "check"];
export const stepOrderOf = (kind: LessonKind | undefined): readonly StepId[] => (kind === "lean" ? LEAN_STEP_ORDER : STEP_ORDER);

export const STEP_TITLE: Record<StepId, string> = { learn: "Learn", try: "Try it", practice: "Practice", check: "Check" };
export const STEP_SUB: Record<StepId, string> = {
  learn: "Watch, read or listen",
  try: "Visualiser and lab",
  practice: "Problems",
  check: "Quiz and explain back",
};

type Key = string;
const MAP: Record<LessonKind, Record<Key, StepId>> = {
  // 6S: Scenario, Struggle, See, Shape, Stretch stay in Learn (their inline widgets stay where they are); Say is the Check
  concept: {
    intro: "learn",
    scenario: "learn",
    struggle: "learn",
    see: "learn",
    shape: "learn",
    stretch: "learn",
    say: "check",
    "the-problem": "learn",
    "try-it": "learn",
    "the-idea": "learn",
    "the-pattern": "learn",
    "edge-cases": "learn",
    recap: "check",
  },
  // Academy Part 2: Meet it (intro), Operations, Try it (sandbox), Build it (lab), Use it well, Recap
  structure: {
    intro: "learn",
    "meet-it": "learn",
    operations: "learn",
    sandbox: "try",
    "try-it": "try",
    build: "try",
    "build-it": "try",
    choose: "learn",
    "use-it-well": "learn",
    recap: "check",
  },
  // Academy Part 3: Meet it, See it move, Why it works, Build it, Use it well, Recap
  algorithm: {
    intro: "learn",
    "meet-it": "learn",
    see: "learn",
    "see-it-move": "learn",
    why: "learn",
    "why-it-works": "learn",
    build: "try",
    "build-it": "try",
    choose: "learn",
    "use-it-well": "learn",
    recap: "check",
  },
  // streets and camp tents: family, move, beyond (and contest craft) are Learn; the ladder is Practice; recap is Check.
  // sets: brief, moves are Learn; the ladder and "Practise it" are Practice
  lean: {
    intro: "learn",
    family: "learn",
    move: "learn",
    beyond: "learn",
    contest: "learn",
    brief: "learn",
    moves: "learn",
    ladder: "practice",
    practice: "practice",
    recap: "check",
  },
};

/** "Use it well" -> "use-it-well" */
export const normaliseLabel = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export type StageRef = { id: string; label?: string };

/** The step a beat belongs to; unknown beats go to Learn. */
export function stepOfStage(kind: LessonKind, stage: StageRef | string): StepId {
  const id = typeof stage === "string" ? stage : stage.id;
  const label = typeof stage === "string" ? "" : stage.label || "";
  const m = MAP[kind];
  return m[id] ?? (label ? m[normaliseLabel(label)] : undefined) ?? "learn";
}

/** Beat ids per step, in lesson order. */
export function groupStages(kind: LessonKind, stages: StageRef[]): Record<StepId, string[]> {
  const out: Record<StepId, string[]> = { learn: [], try: [], practice: [], check: [] };
  for (const s of stages) out[stepOfStage(kind, s)].push(s.id);
  return out;
}

/** The beats Read pages through: Learn's, without the short intro (it shows with the first beat). */
export function learnBeats(kind: LessonKind, stages: StageRef[]): string[] {
  return groupStages(kind, stages).learn.filter((id) => id !== "intro");
}

/** The beats a step shows right now: the paged beat of Learn (with the intro on the first), or the step's whole group. */
export function visibleStages(opts: { kind: LessonKind; stages: StageRef[]; step: StepId; beat: string | null; whole: boolean }): string[] {
  const groups = groupStages(opts.kind, opts.stages);
  const group = groups[opts.step];
  if (opts.step !== "learn" || opts.whole) return group;
  const beats = learnBeats(opts.kind, opts.stages);
  const beat = opts.beat && beats.includes(opts.beat) ? opts.beat : beats[0];
  if (!beat) return group;
  return beat === beats[0] && group.includes("intro") ? ["intro", beat] : [beat];
}

export const isStepId = (s: string): s is StepId => (STEP_ORDER as readonly string[]).includes(s);

/** `#try` -> "try"; anything else (a beat id, a heading anchor) is not a step: the shell resolves it from the DOM. */
export function stepOfHash(hash: string): StepId | null {
  const h = decodeURIComponent(hash.replace(/^#/, ""));
  return isStepId(h) ? h : null;
}

export const nextStep = (s: StepId, kind?: LessonKind): StepId | null => {
  const o = stepOrderOf(kind);
  return o[o.indexOf(s) + 1] ?? null;
};
export const prevStep = (s: StepId, kind?: LessonKind): StepId | null => {
  const o = stepOrderOf(kind);
  return o[o.indexOf(s) - 1] ?? null;
};

/** The CSS (without a selector for `[data-dsa-one]`) the shell generates: hide every beat outside the shown set. */
export function hideStagesCss(visible: string[], scope = "[data-dsa-one]"): string {
  const safe = (id: string) => id.replace(/[^a-z0-9_-]/gi, "");
  const keep = visible.map((id) => `:not([data-stage-id="${safe(id)}"])`).join("");
  return `${scope} section[data-sd="stage"]${keep}{display:none!important}`;
}

/** A step is a real destination when it has something in it: Try it may be only a "lab coming" slot, never empty. */
export type StepFacts = { learnBeats: number; tryBeats: number; traces: number; races: number; hasVisualizer: boolean; practice: number; checkBeats: number };

/** The rail's sub-line per step, from what the lesson has. */
export function stepSub(step: StepId, kind: LessonKind, f: StepFacts): string {
  if (step === "learn") return STEP_SUB.learn;
  if (step === "try") {
    if (kind === "concept") return f.traces ? "Step through it" : f.races ? "See the race" : "Lab coming";
    if (kind === "algorithm") return "Visualiser and lab";
    return "Sandbox and lab";
  }
  if (step === "practice") return f.practice ? `${f.practice} problem${f.practice === 1 ? "" : "s"}` : kind === "lean" ? "The ladder" : "Problems";
  return STEP_SUB.check;
}
