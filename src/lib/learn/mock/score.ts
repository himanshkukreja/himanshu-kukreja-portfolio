/**
 * Mock interview scoring: self-scores on a levelled rubric → verdict band, red flags from how the
 * round went, calibrated level and what to study next. Pure and client-safe.
 *
 * Rules (also in the content repo's resources/mock-interviews/README.md and the course guide):
 * - each rubric signal is tagged with the lowest level at which interviewers expect it;
 * - the candidate picks a target level; signals at or below it are "expected", above it "bonus";
 * - each signal is scored missed / partly / nailed = 0 / 1 / 2;
 * - the expected score sets the band; red flags drop it one band each (two at most).
 */
import { MOCK_LEVELS, type MockInterview, type MockLevel, type MockPhase, type StudyRef } from "./types";

export type SignalScore = 0 | 1 | 2;

export const VERDICTS = ["strong-no-hire", "no-hire", "lean-no-hire", "lean-hire", "hire", "strong-hire"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const VERDICT_LABEL: Record<Verdict, string> = {
  "strong-no-hire": "Strong no hire",
  "no-hire": "No hire",
  "lean-no-hire": "Lean no hire",
  "lean-hire": "Lean hire",
  hire: "Hire",
  "strong-hire": "Strong hire",
};

export const VERDICT_BLURB: Record<Verdict, string> = {
  "strong-no-hire": "Most of what this level expects was missing. Go back to the lessons below before the next loop.",
  "no-hire": "Some solid moments, but too many expected signals were missing for this level.",
  "lean-no-hire": "Close, but a committee would likely pass. A few gaps decided it.",
  "lean-hire": "A borderline yes: the committee would want a strong signal from another round.",
  hire: "A clear yes at this level. You covered what interviewers look for.",
  "strong-hire": "Above the bar: you hit nearly everything expected and showed signals of the next level.",
};

export const SCORE_LABEL: Record<SignalScore, string> = { 0: "Missed", 1: "Partly", 2: "Nailed" };

export const levelIndex = (l: MockLevel) => MOCK_LEVELS.indexOf(l);

/** Words needed across a round before its scorecard pays XP (stops click-through farming). */
export const MIN_WORDS = 40;

/** Verdict bands, best first (the guide and the content README quote these). */
export const BAND_RULES: { verdict: Verdict; min: number; rule: string }[] = [
  { verdict: "strong-hire", min: 0.85, rule: "85%+ of expected signals, and at least half of the bonus signals" },
  { verdict: "hire", min: 0.7, rule: "70%+ of expected signals" },
  { verdict: "lean-hire", min: 0.55, rule: "55%+" },
  { verdict: "lean-no-hire", min: 0.4, rule: "40%+" },
  { verdict: "no-hire", min: 0.25, rule: "25%+" },
  { verdict: "strong-no-hire", min: 0, rule: "below 25%" },
];

/** Red flags detected from how the round went; each drops the verdict one band, two at most. */
export const RED_FLAG_RULES = [
  "Phase 1 under 15 words: jumped in without clarifying",
  "Any other phase under 10 words",
  "A curveball that arrived but got under 5 words",
  "More than 25% over the round's time",
  "Four or more hints",
];

/** What happened in the room, for red flags and the stats strip. */
export type RoundFacts = {
  /** words written per phase id (notes only) */
  words: Record<string, number>;
  /** fired curveballs: id → words in the answer */
  curveballs: Record<string, number>;
  /** seconds used per phase id */
  used: Record<string, number>;
  hints: number;
  pauses: number;
  budgetSec: number;
};

export type RedFlag = { id: string; label: string; why: string };

export function redFlags(mock: MockInterview, f: RoundFacts): RedFlag[] {
  const out: RedFlag[] = [];
  const first = mock.phases[0];
  const clarifySkipped = !!first && (f.words[first.id] || 0) < 15;
  if (clarifySkipped)
    out.push({ id: "clarify", label: "Jumped in without clarifying", why: `Phase 1 has ${f.words[first.id] || 0} words. Interviewers expect questions before a design.` });
  const blank = mock.phases.filter((p, k) => !(k === 0 && clarifySkipped) && (f.words[p.id] || 0) < 10);
  if (blank.length)
    out.push({ id: "blank", label: blank.length === 1 ? "A phase left blank" : `${blank.length} phases left blank`, why: `${blank.map((p) => `Phase ${p.n}`).join(", ")}: under 10 words written.` });
  const unanswered = Object.values(f.curveballs).filter((w) => w < 5).length;
  if (unanswered) out.push({ id: "curveball", label: unanswered === 1 ? "A curveball went unanswered" : `${unanswered} curveballs unanswered`, why: "How you handle a change of plan is a signal of its own." });
  const used = Object.values(f.used).reduce((a, b) => a + b, 0);
  if (f.budgetSec > 0 && used > f.budgetSec * 1.25)
    out.push({ id: "overtime", label: "Ran well over time", why: `${Math.round(used / 60)} min used for a ${Math.round(f.budgetSec / 60)} min round. Real rounds end on time.` });
  if (f.hints >= 4) out.push({ id: "steered", label: "Needed a lot of steering", why: `${f.hints} hints used. Interviewers note every nudge they have to give.` });
  return out;
}

type Tally = { got: number; max: number; n: number; scored: number; pct: number };
const tally = (signals: { id: string }[], scores: Record<string, SignalScore | undefined>): Tally => {
  let got = 0;
  let scored = 0;
  signals.forEach((s) => {
    const v = scores[s.id];
    if (v !== undefined) {
      scored++;
      got += v;
    }
  });
  const max = signals.length * 2;
  return { got, max, n: signals.length, scored, pct: max ? got / max : 0 };
};

function band(pct: number, abovePct: number, hasAbove: boolean): Verdict {
  const b = BAND_RULES.find((r) => pct >= r.min) || BAND_RULES[BAND_RULES.length - 1];
  if (b.verdict === "strong-hire" && hasAbove && abovePct < 0.5) return "hire";
  return b.verdict;
}

export type LoopScore = {
  expected: Tally;
  above: Tally;
  perPhase: { phase: MockPhase; expected: Tally; all: Tally }[];
  /** every expected signal has a score */
  complete: boolean;
  raw: Verdict;
  verdict: Verdict;
  flags: RedFlag[];
  /** highest level whose cumulative signals reach 70%; null below the junior bar */
  calibrated: MockLevel | null;
  offer: boolean;
  study: (StudyRef & { weight: number })[];
};

export function scoreLoop(mock: MockInterview, level: MockLevel, scores: Record<string, SignalScore | undefined>, facts: RoundFacts): LoopScore {
  const li = levelIndex(level);
  const all = mock.phases.flatMap((p) => p.rubric);
  const exp = all.filter((s) => levelIndex(s.level) <= li);
  const abv = all.filter((s) => levelIndex(s.level) > li);
  const expected = tally(exp, scores);
  const above = tally(abv, scores);
  const raw = band(expected.pct, above.pct, abv.length > 0);
  const flags = redFlags(mock, facts);
  const drop = Math.min(2, flags.length);
  const verdict = VERDICTS[Math.max(0, VERDICTS.indexOf(raw) - drop)];

  let calibrated: MockLevel | null = null;
  for (const l of MOCK_LEVELS) {
    const upTo = all.filter((s) => levelIndex(s.level) <= levelIndex(l));
    if (upTo.length && tally(upTo, scores).pct >= 0.7) calibrated = l;
    else break;
  }

  const weights = new Map<string, StudyRef & { weight: number }>();
  all.forEach((s) => {
    const v = scores[s.id];
    const isExp = levelIndex(s.level) <= li;
    if (v === 2 || (!isExp && v === undefined)) return;
    const w = (v === undefined || v === 0 ? 2 : 1) * (isExp ? 2 : 1);
    s.study.forEach((r) => {
      const cur = weights.get(r.href);
      if (cur) cur.weight += w;
      else weights.set(r.href, { ...r, weight: w });
    });
  });

  return {
    expected,
    above,
    perPhase: mock.phases.map((p) => ({ phase: p, expected: tally(p.rubric.filter((s) => levelIndex(s.level) <= li), scores), all: tally(p.rubric, scores) })),
    complete: expected.n > 0 && expected.scored === expected.n,
    raw,
    verdict,
    flags,
    calibrated,
    offer: verdict === "hire" || verdict === "strong-hire",
    study: [...weights.values()].sort((a, b) => b.weight - a.weight).slice(0, 6),
  };
}

export const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
