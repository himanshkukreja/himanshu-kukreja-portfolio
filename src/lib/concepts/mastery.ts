/**
 * Concept mastery, computed in the browser from what the site already stores (nothing new is
 * written, no new tables):
 *
 * - quick checks: localStorage `sd:quiz:<course>/<week>/<lesson>` (first-try flag per question) and
 *   the game's `quiz:<course>/<week>/<lesson>:<block>:<q>` keys (first-try correct, synced for
 *   signed-in learners);
 * - trials: the last attempt's answers per part (`hk.trial.v1:<course>:<week>`, or trial_attempts
 *   for signed-in learners) checked against the questions attributed to the concept;
 * - review cards whose text mentions the concept, valued by Leitner box (Again = missed);
 * - "seen": the stage (or lesson) it is taught in was completed.
 *
 * Score = weighted share right. States: not-started → seen → shaky (< 60%) → solid → mastered
 * (≥ 85% over ≥ 3 weighted checks from 2+ kinds of practice, or ≥ 5 checks).
 */
import { buildMatcher, conceptsIn, isExactForm, type Matcher } from "./match";

/** [lesson index, block, question index, correct option, weight] */
export type QuizRef = [number, number, number, number, number];
/** [week index, question number, correct label, part] */
export type TrialRef = [number, number, string, number];

export type MasteryConcept = {
  id: string;
  term: string;
  def: string;
  refresher: string[];
  related: string[];
  /** term + aliases (review-card matching) */
  forms: string[];
  /** week folder the concept is taught in ("bonus-problems" for side quests) */
  group: string;
  href: string;
  code: string;
  title?: string;
  /** [lesson index, stage id] for taught_in then also */
  refs: [number, string][];
  quiz: QuizRef[];
  trial: TrialRef[];
  practice: { quiz?: string; trial?: string };
};

export type MasteryData = {
  course: string;
  /** "<week folder>/<slug>" by index */
  lessons: string[];
  /** trial week folders by index */
  weeks: string[];
  /** `${lessonIndex}:${block}` → quiz signature (stored answers only count while the block is unchanged) */
  sigs: Record<string, string>;
  concepts: MasteryConcept[];
  groups: { key: string; code: string; title: string }[];
};

export type MasteryState = "not-started" | "seen" | "shaky" | "solid" | "mastered";

export const STATES: { id: MasteryState; label: string; glyph: string; hint: string }[] = [
  { id: "not-started", label: "Not started", glyph: "○", hint: "Not read yet and never checked." },
  { id: "seen", label: "Seen", glyph: "◔", hint: "You've read where it's taught, but nothing has tested it yet." },
  { id: "shaky", label: "Shaky", glyph: "!", hint: "Under 60% right in quick checks, trials or reviews." },
  { id: "solid", label: "Solid", glyph: "◑", hint: "Mostly right so far." },
  { id: "mastered", label: "Mastered", glyph: "●", hint: "85%+ right across at least three checks from two kinds of practice." },
];

type QStore = Record<string, { s: string; a: Record<string, { p?: number; f?: 0 | 1 }> }>;

export type ReviewLike = { front: string; back: string; box: number; lastGrade: string | null; reviews: number; source: string; week: string | null; lessonSlug: string | null; stage: string | null };

export type MasteryInputs = {
  done: Record<string, number>;
  /** "<week>/<slug>" → completed stage ids + status */
  lessons: Record<string, { status: string; completedStages: string[] }>;
  quizStores: Record<string, QStore | null>;
  /** week folder → question number → picked label (latest finished attempt) */
  trialAnswers: Record<string, Record<number, string>>;
  cards: ReviewLike[];
};

export type Assessment = {
  state: MasteryState;
  /** weighted share right, null without evidence */
  score: number | null;
  weight: number;
  seen: boolean;
  quiz: { right: number; total: number };
  trial: { right: number; total: number };
  review: { cards: number; again: number; avgBox: number | null };
};

const BOX_VALUE = [0.2, 0.4, 0.6, 0.8, 1];

/** Matcher for one concept's term + aliases (review-card attribution). Build once, reuse. */
export function conceptMatcher(c: Pick<MasteryConcept, "id" | "forms">): Matcher | null {
  return buildMatcher(c.forms.map((form) => ({ id: c.id, form, exact: isExactForm(form) })));
}

export function assess(c: MasteryConcept, data: MasteryData, inp: MasteryInputs, m: Matcher | null = conceptMatcher(c)): Assessment {
  let w = 0;
  let got = 0;
  const kinds = new Set<string>();
  const quiz = { right: 0, total: 0 };
  const trial = { right: 0, total: 0 };
  const review = { cards: 0, again: 0, avgBox: null as number | null };

  // seen: a taught / also stage (or its whole lesson) completed
  let seen = c.refs.some(([l, stage]) => {
    const lk = data.lessons[l];
    if (!lk) return false;
    const p = inp.lessons[lk];
    if (p?.status === "completed") return true;
    return !!stage && (!!inp.done[`stage:${lk}/${stage}`] || !!p?.completedStages.includes(stage));
  });

  // quick checks (first try counts)
  for (const [l, block, qi, answer, weight] of c.quiz) {
    const lk = data.lessons[l];
    if (!lk) continue;
    const store = inp.quizStores[lk];
    const st = store?.[String(block)];
    const sigOk = st && st.s === data.sigs[`${l}:${block}`];
    const a = sigOk ? st!.a[String(qi)] : undefined;
    let v: number | null = null;
    if (a?.f === 1) v = 1;
    else if (a?.f === 0) v = 0;
    else if (inp.done[`quiz:${data.course}/${lk}:${block}:${qi}`]) v = 1;
    else if (a && a.p !== undefined) v = a.p === answer ? 1 : 0;
    if (v === null) continue;
    w += weight;
    got += weight * v;
    kinds.add("quiz");
    if (weight >= 1) {
      quiz.total++;
      if (v === 1) quiz.right++;
    }
  }

  // trials
  for (const [wi, n, label] of c.trial) {
    const wk = data.weeks[wi];
    const pick = wk ? inp.trialAnswers[wk]?.[n] : undefined;
    if (!pick) continue;
    const v = pick === label ? 1 : 0;
    w += 1;
    got += v;
    kinds.add("trial");
    trial.total++;
    trial.right += v;
  }

  // review cards that mention the concept
  let boxes = 0;
  if (m) {
    for (const card of inp.cards) {
      if (!conceptsIn(m, `${card.front} ${card.back}`).has(c.id)) continue;
      let v: number;
      if (card.lastGrade === "again") v = 0;
      else if (card.reviews > 0) v = BOX_VALUE[Math.min(5, Math.max(1, card.box)) - 1];
      else if (card.source === "trial_miss" || card.source === "interview") v = 0.2;
      else continue; // a fresh highlight card says nothing yet
      w += 1;
      got += v;
      kinds.add("review");
      review.cards++;
      boxes += card.box;
      if (card.lastGrade === "again") review.again++;
    }
  }
  if (review.cards) review.avgBox = Math.round((boxes / review.cards) * 10) / 10;

  if (w > 0) seen = true;
  const score = w > 0 ? got / w : null;
  let state: MasteryState;
  if (w < 0.75 || score === null) state = seen ? "seen" : "not-started";
  else if (score < 0.6) state = "shaky";
  else if (score >= 0.85 && ((w >= 3 && kinds.size >= 2) || w >= 5)) state = "mastered";
  else state = "solid";
  return { state, score, weight: Math.round(w * 100) / 100, seen, quiz, trial, review };
}
