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
import { BAND_LABEL, bandOf, type Band, type GradeModel } from "./grade";

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
  const last = r.last ?? null;
  // a best saved from a practice run that answered only some questions (before practice scores counted only the
  // answered ones) isn't a paper score: it was "5/57 · not yet" for one good answer
  const best = r.best && last && r.best.attempt === last.id && !attemptResult(last).full ? null : (r.best ?? null);
  return { v: 1, attempts: Number(r.attempts) || 0, best, last, open: r.open ?? null, updatedAt: Number(r.updatedAt) || 0 };
}

export const pct = (score: number, max: number) => (max ? Math.round((score / max) * 100) : 0);

/**
 * What a finished attempt counts as, the one rule every view and the stored record use. An exam, or a practice run with
 * every question answered and graded, is the whole paper: its score is over the paper's marks, with a verdict (pass at
 * 50%, distinction at 75%). A practice run that answered only some questions is scored over those questions only
 * ("5/7 on 1 of 8 questions"), with no verdict: one good answer isn't a failed paper. Questions marked "none" (blank or
 * not answered) and answers still waiting for a grade aren't answered.
 */
export type AttemptResult = {
  full: boolean;
  score: number;
  max: number;
  answered: number;
  questions: number;
  /** null: a partial practice run (no verdict) */
  band: Band | null;
};
export function attemptResult(a: Pick<AttemptSummary, "mode" | "marks" | "pending" | "score" | "max">): AttemptResult {
  const marks = Object.values(a.marks || {});
  const pending = a.pending || [];
  const questions = marks.length + pending.length;
  const done = marks.filter((m) => m.g !== "none");
  const full = a.mode === "exam" || (done.length === questions && !pending.length);
  if (full) return { full, score: a.score, max: a.max, answered: done.length, questions, band: bandOf(a.score, a.max) };
  const score = done.reduce((t, m) => t + m.s, 0);
  const max = done.reduce((t, m) => t + m.m, 0);
  return { full, score, max, answered: done.length, questions, band: null };
}

/** "5/7 on 1 of 8 questions" for a partial practice run; "41/57 · 72% · Pass" for the whole paper. */
export function resultLine(r: AttemptResult): string {
  if (r.full) return `${r.score}/${r.max} · ${pct(r.score, r.max)}% · ${BAND_LABEL[r.band!]}`;
  return r.answered ? `${r.score}/${r.max} on ${r.answered} of ${r.questions} question${r.questions === 1 ? "" : "s"}` : `no answers graded yet`;
}

/** Is this attempt a better best than the one stored? (only whole-paper attempts count) */
export const betterBest = (best: PaperRecord["best"], last: AttemptSummary) => attemptResult(last).full && (!best || last.score / last.max > best.score / best.max);

/**
 * A paper's one-line status for cards and badges, from its record: in progress, the best whole-paper result, else the
 * last practice run (neutral), else nothing.
 */
export function paperStatus(rec: PaperRecord): { text: string; tone: Band | "practice" | "open" } | null {
  if (rec.open) return { text: `${rec.open.mode === "exam" ? "exam" : "practice"} in progress`, tone: "open" };
  if (rec.best) {
    const band = bandOf(rec.best.score, rec.best.max);
    return { text: `best ${rec.best.score}/${rec.best.max} · ${pct(rec.best.score, rec.best.max)}% · ${BAND_LABEL[band]}`, tone: band };
  }
  if (rec.last) {
    const r = attemptResult(rec.last);
    if (!r.full && r.answered) return { text: `${r.score}/${r.max} on ${r.answered} of ${r.questions} · practice`, tone: "practice" };
  }
  return null;
}
