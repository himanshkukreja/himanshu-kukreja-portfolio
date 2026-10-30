/**
 * Written papers: grading rules shared by the grading route (/api/learn/ai/paper/grade), the results screen and the
 * live test script. Pure, no I/O.
 *
 * The grader returns, per scheme point, the marks it awards, its evidence (what the learner wrote or drew that earns
 * them, or "not found") and its confidence. Everything it says is checked here before a learner sees it:
 *   - every scheme point gets exactly one result (a point the model skipped is 0, "not found", confidence 0);
 *   - awarded marks are whole numbers from 0 to the point's marks (partial credit only on a point worth 2 or more);
 *   - no evidence, no marks: a point awarded with an empty or "not found" evidence is set to 0;
 *   - the total is the sum of the points, computed here (the model's own total is never used).
 *
 * Escalation (Haiku 5.5 first, then Sonnet 5.5 re-grades and its result is kept) when any of:
 *   - a point's confidence is below ESCALATE_CONFIDENCE (0.6), or the grader couldn't read the page;
 *   - the question is a `diagram` or `design` question (drawings are where a small model misreads most);
 *   - the total sits on the question's pass line or one mark below it (passMark = half the marks, rounded up):
 *     the answers where a misread mark flips "passed" to "not yet".
 */
import type { PaperKind, PaperQuestion } from "./parse";

export const ESCALATE_CONFIDENCE = 0.6;
/** A question is "passed" at half its marks (rounded up); a paper at PAPER_PASS, with distinction at PAPER_DISTINCTION. */
export const questionPass = (max: number) => Math.ceil(max / 2);
export const PAPER_PASS = 0.5;
export const PAPER_DISTINCTION = 0.75;

export type Band = "distinction" | "pass" | "not-yet";
export const BAND_LABEL: Record<Band, string> = { distinction: "Distinction", pass: "Pass", "not-yet": "Not yet" };
export function bandOf(score: number, max: number): Band {
  const r = max ? score / max : 0;
  return r >= PAPER_DISTINCTION ? "distinction" : r >= PAPER_PASS ? "pass" : "not-yet";
}

export type GradeModel = "haiku" | "sonnet";
export type EscalationReason = "confidence" | "kind" | "boundary" | "unreadable";

export type PointGrade = { awarded: number; max: number; evidence: string; confidence: number };

/** One graded answer, as the route returns it and the browser keeps it. */
export type QuestionGrade = {
  n: number;
  score: number;
  max: number;
  points: PointGrade[];
  /** what the grader read on the sheet (its short transcription), for the learner to check */
  read: string;
  missing: string[];
  feedback: string;
  /** the model whose result was kept */
  model: GradeModel;
  /** Haiku's total, when Sonnet re-graded (null: no re-grade) */
  firstScore: number | null;
  escalated: EscalationReason[];
  /** escalation was wanted but the re-grade couldn't run (budget, limit, error): Haiku's result stands */
  recheckFailed?: boolean;
  credits: number;
  /** nothing on the sheet: graded 0 without a call */
  blank?: boolean;
  at: number;
};

/** The model's raw answer (anything may be missing or wrong). */
type Raw = { read?: unknown; points?: unknown; missing?: unknown; feedback?: unknown; unreadable?: unknown };

const HEDGE = /\b(?:not (?:given|stated|shown|mentioned|explained|included|justified|drawn|labell?ed)|missing|absent|omit(?:s|ted)|no (?:reason|reasons|working|units|label|labels|justification|mention)|without (?:a |any )?(?:reason|working|units|label)|does(?:n't| not) (?:say|state|show|mention|explain|give)|but (?:no|not)|only the)\b/i;
const NOT_FOUND = /^(?:not found|none|nothing|n\/?a|no evidence|-|—)?\.?$/i;
const clean = (v: unknown, max: number) =>
  typeof v === "string"
    ? v
        .replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";

export type CheckedGrade = Pick<QuestionGrade, "score" | "max" | "points" | "read" | "missing" | "feedback"> & { unreadable: boolean; minConfidence: number };

/**
 * Validates and repairs the grader's JSON against the scheme. Never throws; returns null only when there is no
 * usable answer at all (not JSON, no points array).
 */
export function checkGrade(raw: unknown, q: Pick<PaperQuestion, "scheme" | "marks">): CheckedGrade | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  if (!Array.isArray(r.points)) return null;
  const byN = new Map<number, Record<string, unknown>>();
  r.points.forEach((p, i) => {
    if (!p || typeof p !== "object") return;
    const o = p as Record<string, unknown>;
    const n = Number(o.n ?? i + 1);
    if (Number.isInteger(n) && n >= 1 && n <= q.scheme.length && !byN.has(n)) byN.set(n, o);
  });
  const points: PointGrade[] = q.scheme.map((s, i) => {
    const o = byN.get(i + 1);
    if (!o) return { awarded: 0, max: s.marks, evidence: "not found", confidence: 0 };
    let awarded = Math.round(Number(o.awarded));
    if (!Number.isFinite(awarded)) awarded = 0;
    awarded = Math.max(0, Math.min(s.marks, awarded));
    let evidence = clean(o.evidence, 300);
    if (!evidence || NOT_FOUND.test(evidence)) {
      evidence = "not found";
      awarded = 0; // never marks for something the grader didn't see
    }
    let confidence = Number(o.confidence);
    if (!Number.isFinite(confidence)) confidence = 0.5;
    confidence = Math.max(0, Math.min(1, confidence));
    // marks given while the evidence itself says something is missing ("reasons are not given", "but no units"):
    // the grader contradicts itself, so the point counts as unsure (and the answer is re-graded)
    if (awarded > 0 && HEDGE.test(evidence)) confidence = Math.min(confidence, 0.4);
    return { awarded, max: s.marks, evidence, confidence };
  });
  const score = points.reduce((a, p) => a + p.awarded, 0);
  const max = q.scheme.reduce((a, p) => a + p.marks, 0);
  let missing = (Array.isArray(r.missing) ? r.missing : []).map((m) => clean(m, 240)).filter(Boolean).slice(0, 8);
  // the scheme's own words for every point not fully earned, when the model listed none
  if (!missing.length) missing = q.scheme.filter((_, i) => points[i].awarded < points[i].max).map((s) => s.text);
  return {
    score,
    max,
    points,
    read: clean(r.read, 900),
    missing: score >= max ? [] : missing,
    feedback: clean(r.feedback, 260),
    unreadable: r.unreadable === true,
    minConfidence: points.reduce((a, p) => Math.min(a, p.confidence), 1),
  };
}

/** Why a first (Haiku) grade should be re-graded by Sonnet; empty: keep it. */
export function escalationReasons(g: CheckedGrade, kind: PaperKind): EscalationReason[] {
  const out: EscalationReason[] = [];
  if (g.unreadable) out.push("unreadable");
  if (g.minConfidence < ESCALATE_CONFIDENCE) out.push("confidence");
  if (kind === "diagram" || kind === "design") out.push("kind");
  const pass = questionPass(g.max);
  if (g.score === pass || g.score === pass - 1) out.push("boundary");
  return out;
}

export const ESCALATION_TEXT: Record<EscalationReason, string> = {
  confidence: "the first grader was unsure of a point",
  kind: "drawn answers are always double-checked",
  boundary: "the mark was on the pass line",
  unreadable: "the first grader couldn't read part of the sheet",
};

/** Marks per question kind for a paper's results ("diagram 8/12"). */
export function marksByKind(questions: Pick<PaperQuestion, "n" | "kind" | "marks">[], scores: Record<number, number | undefined>) {
  const out = new Map<PaperKind, { got: number; max: number; graded: number }>();
  for (const q of questions) {
    const e = out.get(q.kind) || { got: 0, max: 0, graded: 0 };
    e.max += q.marks;
    const s = scores[q.n];
    if (typeof s === "number") {
      e.got += s;
      e.graded += 1;
    }
    out.set(q.kind, e);
  }
  return [...out.entries()].map(([kind, v]) => ({ kind, ...v }));
}
