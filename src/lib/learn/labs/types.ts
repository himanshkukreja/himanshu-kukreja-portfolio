/**
 * Code labs: "implement this component" exercises (a rate limiter, an LRU cache, an outbox relay…)
 * that run in the browser with Pyodide against visible and hidden tests. Authored as markdown in
 * the content repo (resources/labs/<id>.md, format in resources/labs/README.md).
 */

export type LabDifficulty = "easy" | "medium" | "hard";

/** A lesson the lab practises, as written in the lab file: a course code + section anchor. */
export type LabLessonRef = { ref: string; anchor?: string; label?: string };

export type LabHint = { title: string; md: string };

/** One parsed lab file (markdown and Python, nothing rendered yet). Plain data: safe in Node. */
export type LabSource = {
  id: string;
  title: string;
  topic: string;
  /** course week number the lab belongs to (its world) */
  week: number;
  order: number;
  difficulty: LabDifficulty;
  minutes: number;
  xp: number;
  /** per-run time limit, seconds */
  timeoutSec: number;
  summary: string;
  lessons: LabLessonRef[];
  brief: string;
  given: string;
  starter: string;
  hints: LabHint[];
  solution: string;
  solutionNotes: string;
  visible: string;
  hidden: string;
  /** hash of the file: autosaved code from another version gets a "starter changed" note */
  version: string;
};

/** A lesson link, resolved against the course map. */
export type LabLesson = { code: string; title: string; href: string; label: string | null };

export type LabSummary = {
  id: string;
  title: string;
  topic: string;
  week: number;
  /** "01" */
  weekCode: string;
  /** the world's key ("week-01-data-at-scale") when the course has that week */
  weekKey: string | null;
  worldTitle: string;
  order: number;
  difficulty: LabDifficulty;
  minutes: number;
  xp: number;
  summary: string;
  href: string;
  lessons: LabLesson[];
  tests: { visible: number; hidden: number };
  version: string;
};

/** Everything the lab room needs (markdown rendered to HTML on the server). */
export type Lab = LabSummary & {
  briefHtml: string;
  given: string;
  /** the given code / example tests / solution as highlighted course code blocks */
  givenHtml: string;
  visibleTestsHtml: string;
  solutionHtml: string;
  starter: string;
  hints: { title: string; html: string }[];
  solution: string;
  solutionNotesHtml: string;
  visibleTests: string;
  hiddenTests: string;
  timeoutSec: number;
};

/** What a lesson's "Try it in code" card shows. */
export type LessonLabLink = Pick<LabSummary, "id" | "title" | "topic" | "summary" | "href" | "difficulty" | "minutes" | "xp" | "tests">;

export const LAB_XP: Record<LabDifficulty, number> = { easy: 60, medium: 90, hard: 120 };

/** Progress / XP key for a lab (GameProvider.awardOnce). */
export const labKey = (id: string) => `lab:${id}`;

export const labHref = (id: string) => `/learn/labs/${id}`;

export const DIFFICULTY_LABEL: Record<LabDifficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };
