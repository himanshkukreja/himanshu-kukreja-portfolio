import type { CourseMock } from "./mock/types";

/**
 * Course map: the shape of the course the Learn screens render (hub, profile, notebook, review).
 * Built on the server from the real markdown (src/lib/learn/course.ts) and passed to client
 * components as plain JSON. Nothing in here is learner data.
 */

export type CourseLessonKind = "foundations" | "week-preview" | "day-content" | "capstone" | "bonus" | "overview" | "problem" | "lld";

export type CourseLesson = {
  /** folder name, e.g. "week-02-failure-first-design" */
  week: string;
  slug: string;
  /** real title (title map / H1), without "Part N:" prefixes */
  title: string;
  kind: CourseLessonKind;
  /** reading minutes (same formula the reader header uses) */
  minutes: number;
  /** short node text: "P1", "PRE", "D3", "B", "SQ-01" */
  code: string;
  /** list label: "Day 3 · Circuit Breakers", "Part 1 · System Design Fundamentals", "Preview" */
  label: string;
  /** compact context tag: "W02 · DAY 03", "W00 · PART 1", "W02 · BOSS", "SQ-01" */
  tag: string;
  href: string;
  /** difficulty: from the article's mission block, else by week (see lib/learn/level.ts) */
  level?: import("./level").Level;
};

export type TrialPart = {
  n: number;
  /** "Timeout Hell" (part heading without the "Part N:" prefix) */
  title: string;
  questions: number;
  /** "Questions 1-25" */
  range: string;
  href: string;
};

export type CourseTrial = {
  /** folder of the MCQ file (game keys use it: trial:<week>/part-<n>) */
  week: string;
  slug: string;
  title: string;
  href: string;
  parts: TrialPart[];
  totalQuestions: number;
  passPct: number;
};

export type CourseWeek = {
  /** folder name */
  key: string;
  num: number;
  /** "02" */
  code: string;
  /** "Failure-First Design" */
  title: string;
  /** preview + days, or the eight foundation parts */
  lessons: CourseLesson[];
  boss: CourseLesson | null;
  trial: CourseTrial | null;
  /** lessons + boss */
  minutes: number;
  /** badge earned when the world is cleared */
  badge: string;
};

export type CourseStats = {
  worlds: number;
  /** mock interview checkpoints between worlds */
  mocks?: number;
  coreLessons: number;
  bosses: number;
  sideQuests: number;
  /** interview problem bank and low-level design track (absent on old cached maps) */
  problems?: number;
  lld?: number;
  trialParts: number;
  /** core lessons + bosses, rounded hours */
  coreHours: number;
  /** everything incl. side quests and the plan */
  totalHours: number;
};

export type CourseMap = {
  courseId: string;
  title: string;
  description: string;
  plan: CourseLesson | null;
  weeks: CourseWeek[];
  sideQuests: CourseLesson[];
  /** mock interviews placed between worlds (resources/mock-interviews); absent on old cached maps */
  mocks?: CourseMock[];
  /** the classic interview problem bank (resources/problem-bank); absent on old cached maps */
  problems?: CourseLesson[];
  /** low-level design / machine coding track (resources/low-level-design) */
  lld?: CourseLesson[];
  stats: CourseStats;
};

/** XP the course awards (game engine keys, see dev brief) */
export const LEARN_XP = {
  lesson: 60,
  stage: 10,
  trial: 100,
  boss: 200,
  /** world cleared bonus (key `world:<week>`) */
  world: 300,
  sideQuest: 120,
  reviewCard: 5,
  /** finish a mock interview loop, debrief scored (key `mock:<id>`) */
  mock: 150,
  /** Hire or better in a mock interview (key `offer:<id>`) */
  mockOffer: 100,
} as const;

export const lessonKey = (week: string, slug: string) => `${week}/${slug}`;
