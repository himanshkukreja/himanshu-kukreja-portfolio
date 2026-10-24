/**
 * Contract between the course renderer (src/lib/course/render.ts) and the Learn screens.
 * The renderer turns a lesson's markdown (unchanged in GitHub) into semantic HTML plus
 * the structure the reader UI needs: stages for progress/resume, a grouped TOC, phases
 * for capstone boss mode.
 */

export type LessonKind = "week-preview" | "day-content" | "capstone" | "foundations" | "overview" | "bonus" | "mcq" | "problem" | "lld";

/**
 * A stage is a resumable chunk of a lesson: Preface, Part I…VI, Exercises, Appendix, a capstone
 * Phase, or a side quest's Final Challenge (id "final-challenge").
 */
export type Stage = {
  /** stable id, e.g. "preface", "part-1", "phase-3", "exercises" — also the section element id */
  id: string;
  /** short label for the rail: "Preface", "Part II", "Phase 3" */
  label: string;
  /** heading text without the prefix: "The Design Challenge" */
  title: string;
  /** estimated reading minutes for this stage (prose words / 230 + ~20 s per diagram + 1 s per code line) */
  minutes: number;
  /** capstone phases only: the budget written in the heading, e.g. "(5 minutes)" → 5 */
  budgetMinutes?: number;
};

export type TocKind = "part" | "chapter" | "section" | "question" | "other";

export type TocItem = {
  /** heading element id (stable, slugified with github-slugger rules, dots kept as dashes) */
  id: string;
  text: string;
  level: 1 | 2 | 3 | 4;
  kind: TocKind;
  /** id of the stage this heading belongs to */
  stageId: string;
};

export type RenderedLesson = {
  /**
   * Semantic HTML. Each stage's content is wrapped in
   *   <section data-sd="stage" id="{stage.id}" data-stage-id="{stage.id}" data-minutes="…" [data-budget="…"]>
   * Components are marked with data-sd="<kind>" (blueprint, callout, transcript, reveal, problem,
   * compare, numbers, tree, code, checklist, table, resources, up-next…). Interactive chrome is added
   * on the client by <CourseEnhancer/> and never changes the text content, so highlight / bookmark
   * text offsets stay valid.
   */
  html: string;
  title: string;
  subtitle?: string;
  stages: Stage[];
  toc: TocItem[];
  /** total reading minutes (sum of stages) */
  readingMinutes: number;
  /** hash of the source markdown; stored with highlights/bookmarks to detect content changes */
  contentVersion: string;
  /**
   * Side quests: the `:::mission[Objective]{level="…"}` block, lifted out of the body (it is not in
   * `html`) so the quest hero can show it as the mission brief. Absent for lessons without one.
   */
  mission?: QuestMission;
};

/** A side quest's mission brief: the objective, an optional one-line brief and its key numbers. */
export type QuestMission = {
  objective: string;
  /** difficulty as written in the block, e.g. "Hard" */
  level?: string;
  brief?: string;
  /** "**10M** concurrent streams" → { value: "10M", label: "concurrent streams" } */
  numbers: { value: string; label: string }[];
};
