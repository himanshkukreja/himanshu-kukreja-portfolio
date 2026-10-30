/**
 * Written papers: the shapes the pages pass to the browser, and what a learner's attempts and scores look like.
 *
 * Storage (no tables of its own):
 * - Answers are notebook pages (lib/learn/ink/client.ts) in the learner's "Written papers" notebook ("Written papers 2"
 *   … when one fills up), one page per answer sheet, lessonKey "paper/<key>/q<n>", titled "Q3 · <paper> · #<attempt>"
 *   (" · sheet 2" for more sheets). They show in the notebook like any page.
 * - Attempts and scores: one game flag per paper, `paper:<key>` → PaperRecord (this browser's hk.game.v1 for everyone,
 *   user_profiles.game_flags for signed-in learners, synced like the study plan and saved paths). It holds the attempt
 *   in progress (so it resumes on any device), the last finished attempt with every question's per-point marks, the
 *   best score and the attempt count. Compact on purpose: it rides in the profile row.
 * - The grader's words (what it read, evidence per point, what was missing, the feedback) stay in this browser
 *   (localStorage hk.paper.grades.v1:<attempt>), the last few attempts only: they are long, and the marks themselves
 *   are in the flag.
 * - XP: game_done `paper:<key>` (+PAPER_XP once, the first time a paper is passed).
 */
import type { PaperKind, SchemePoint } from "./parse";
import type { GradeModel } from "./grade";

export type PaperSourceLink = { href: string; label: string; anchor: string };

export type PaperQuestionView = {
  n: number;
  marks: number;
  kind: PaperKind;
  promptHtml: string;
  /** the question as one line of plain text (review cards) */
  promptText: string;
  answerHtml: string;
  scheme: SchemePoint[];
  sources: PaperSourceLink[];
};

export type PaperSummary = {
  key: string;
  title: string;
  minutes: number;
  marks: number;
  /** a week's paper or a side quest's */
  kind: "week" | "quest";
  /** "W04", "SQ-01" */
  code: string;
  /** "Week 04 · Caching", "SQ-01 · India's UPI" */
  label: string;
  ownerTitle: string;
  ownerHref: string;
  /** the week folder ("bonus-problems" for a quest) */
  week: string;
  order: number;
  href: string;
  kinds: Partial<Record<PaperKind, number>>;
  version: string;
  questions: number;
};

export type PaperView = Omit<PaperSummary, "questions"> & { questions: PaperQuestionView[] };

/** The paper index the course map and lesson pages read (/learn/papers/index.json). */
export type PaperIndexEntry = Pick<PaperSummary, "key" | "title" | "minutes" | "marks" | "kind" | "code" | "label" | "week" | "href" | "questions">;

export const PAPER_XP = 100;
export const paperFlagKey = (key: string) => `paper:${key}`;
export const paperDoneKey = (key: string) => `paper:${key}`;
export const paperLessonKey = (key: string, n: number) => `paper/${key}/q${n}`;
/** sheets an answer may have */
export const MAX_SHEETS = 3;

export type PaperMode = "practice" | "exam";

/** One question's marks, compact (the flag): score, max, per-point awarded, the model that graded, blank. */
export type QuestionMarks = { s: number; m: number; p: number[]; g: GradeModel | "none"; c: number };

export type OpenAttempt = {
  id: string;
  mode: PaperMode;
  startedAt: number;
  /** exam mode: when time is up (epoch ms) */
  deadline: number | null;
  /** the question on screen (0-based) */
  i: number;
  /** question number → its answer sheets (notebook page ids, in order) */
  pages: Record<number, string[]>;
  /** question number → its marks once graded */
  marks: Record<number, QuestionMarks>;
  version: string;
};

export type AttemptSummary = {
  id: string;
  mode: PaperMode;
  startedAt: number;
  finishedAt: number;
  score: number;
  max: number;
  /** answered questions not graded yet (grading failed: the learner can grade them from the results) */
  pending: number[];
  pages: Record<number, string[]>;
  marks: Record<number, QuestionMarks>;
  version: string;
  /** credits the grading used */
  credits: number;
};

export type PaperRecord = {
  v: 1;
  attempts: number;
  best: { score: number; max: number; at: number; attempt: string } | null;
  last: AttemptSummary | null;
  open: OpenAttempt | null;
  updatedAt: number;
};

export const emptyRecord = (): PaperRecord => ({ v: 1, attempts: 0, best: null, last: null, open: null, updatedAt: 0 });

/** A stored value as a PaperRecord (anything else: an empty one). */
export function readRecord(v: unknown): PaperRecord {
  if (!v || typeof v !== "object" || (v as PaperRecord).v !== 1) return emptyRecord();
  const r = v as PaperRecord;
  return { v: 1, attempts: Number(r.attempts) || 0, best: r.best ?? null, last: r.last ?? null, open: r.open ?? null, updatedAt: Number(r.updatedAt) || 0 };
}

export const pct = (score: number, max: number) => (max ? Math.round((score / max) * 100) : 0);
