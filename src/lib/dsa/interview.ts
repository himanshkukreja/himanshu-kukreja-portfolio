/**
 * DSA Interview tab (pure; the browser, the route and the unit tests run the same code): the stage choice, the
 * interviewer's JSON turns, the scorecard, the saved rounds and the revise cards a weak follow-up becomes.
 *
 * Two stages (owner, 10 Nov 2026):
 *   explain   while solving (not accepted, editorial locked): "Explain your approach", 5 questions. The interviewer must
 *             never reveal the solution; the server picks this stage itself from the learner's own rows (unlock.ts).
 *   followup  after an accepted solve or an unlocked editorial: "Follow-up round", 4 follow-ups grounded in the editorial.
 *
 * A round is stateless on the server: the page sends the answered turns with each call. Saved rounds live in the
 * synced game store as the flag `dsa:iv:<problem>` ({ v, updatedAt, topic, rounds }), newest last, 12 kept, merged
 * newer-wins across devices (src/lib/learn/saved-paths.ts mergeGameFlags).
 */
export type InterviewStage = "explain" | "followup";
export const STAGE_QUESTIONS: Record<InterviewStage, number> = { explain: 5, followup: 4 };
export const STAGE_TITLE: Record<InterviewStage, string> = { explain: "Explain your approach", followup: "Follow-up round" };

/** Which round a learner gets: follow-ups once the solution is out (accepted, or the editorial unlocked), else the drill. */
export function interviewStage(f: { accepted: boolean; unlocked: boolean }): InterviewStage {
  return f.accepted || f.unlocked ? "followup" : "explain";
}

export const DIMS = ["clarity", "reasoning", "complexity", "edges", "followups"] as const;
export type Dim = (typeof DIMS)[number];
export type Scores = Record<Dim, number>;
export const DIM_LABEL: Record<Dim, string> = {
  clarity: "Clarity of explanation",
  reasoning: "Correctness of reasoning",
  complexity: "Complexity analysis",
  edges: "Edge cases",
  followups: "Handling follow-ups",
};

export type Feedback = { strong: string; missing: string; better: string };
export type Turn = { q: string; topic: string; a: string; withCode: boolean; score: number; feedback: Feedback };
/** What the interviewer asks next. `wantsCode`: the learner is meant to change the code in the editor and answer with it. */
export type Question = { q: string; topic: string; wantsCode: boolean };

const clip = (x: unknown, n: number) => (typeof x === "string" ? x.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, " ").trim().slice(0, n) : "");
const clamp5 = (x: unknown): number | null => {
  const n = Number(x);
  return Number.isFinite(n) ? Math.max(1, Math.min(5, Math.round(n))) : null;
};

/** The first JSON object in a model reply (fences and chatter around it tolerated), or null. */
export function extractJson(text: string): Record<string, unknown> | null {
  const t = (text || "").replace(/```(?:json)?/gi, "");
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    const v = JSON.parse(t.slice(a, b + 1));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Drops fenced code from a string (the explain stage never shows code the learner didn't write). */
export const stripCode = (s: string) => s.replace(/```[\s\S]*?(```|$)/g, "").replace(/\n{3,}/g, "\n\n").trim();

export type ParsedTurn = { feedback: Feedback | null; score: number | null; next: Question | null };

/** The interviewer's reply for a start (no feedback) or an answer (feedback, score, and the next question unless it was the last). */
export function parseTurn(text: string, kind: "start" | "answer", stage: InterviewStage = "followup"): ParsedTurn | null {
  const j = extractJson(text);
  if (!j) return null;
  const scrub = (s: unknown, n: number) => (stage === "explain" ? stripCode(clip(s, n)) : clip(s, n));
  const q = scrub(j.next, 600);
  const next: Question | null = q ? { q, topic: clip(j.topic, 60) || "Question", wantsCode: stage === "followup" && j.wantsCode === true } : null;
  if (kind === "start") return next ? { feedback: null, score: null, next } : null;
  const f = (j.feedback && typeof j.feedback === "object" ? j.feedback : {}) as Record<string, unknown>;
  const feedback: Feedback = { strong: scrub(f.strong, 400), missing: scrub(f.missing, 400), better: scrub(f.better, 500) };
  const score = clamp5(j.score);
  if (score === null || !(feedback.strong || feedback.missing || feedback.better)) return null;
  return { feedback, score, next };
}

export type Verdict = "strong-hire" | "hire" | "lean-no" | "no";
export const VERDICT_LABEL: Record<Verdict, string> = { "strong-hire": "Strong hire", hire: "Hire", "lean-no": "Lean no, close", no: "No, not yet" };
export const VERDICT_LINE: Record<Verdict, string> = {
  "strong-hire": "You explained it the way an interviewer hopes to hear it.",
  hire: "A solid round. A few answers can be sharper.",
  "lean-no": "You are close. The practice list below is where the next point is.",
  no: "Not there yet, and that is what practice is for. Take the list below one item at a time.",
};
/** The verdict follows the overall score alone, so the words and the number never disagree. */
export function verdictFor(overall: number): Verdict {
  return overall >= 4.3 ? "strong-hire" : overall >= 3.5 ? "hire" : overall >= 2.5 ? "lean-no" : "no";
}

export type Scorecard = { scores: Scores; overall: number; verdict: Verdict; summary: string; practise: string[] };

export const overallOf = (s: Scores) => Math.round((DIMS.reduce((a, d) => a + s[d], 0) / DIMS.length) * 10) / 10;

/** The scorecard reply: five 1 to 5 scores (a missing one falls back to the mean of the answers' scores), a summary, what to practise. */
export function parseScorecard(text: string, turns: Pick<Turn, "score">[]): Scorecard | null {
  const j = extractJson(text);
  if (!j) return null;
  const raw = (j.scores && typeof j.scores === "object" ? j.scores : {}) as Record<string, unknown>;
  const mean = turns.length ? Math.max(1, Math.min(5, Math.round(turns.reduce((a, t) => a + t.score, 0) / turns.length))) : null;
  const scores = {} as Scores;
  for (const d of DIMS) {
    const v = clamp5(raw[d]) ?? mean;
    if (v === null) return null;
    scores[d] = v;
  }
  const practise = (Array.isArray(j.practise) ? j.practise : []).map((x) => clip(x, 200)).filter(Boolean).slice(0, 4);
  const overall = overallOf(scores);
  return { scores, overall, verdict: verdictFor(overall), summary: clip(j.summary, 500), practise };
}

/* Bits for a round: rewards.ts interviewBits (this module imports nothing, so the tests run it as it is). */

/* ------------------------------------------------------------------ saved rounds */

export type Round = { at: number; stage: InterviewStage; answered: number; scores: Scores; overall: number; verdict: Verdict; summary: string; practise: string[] };
export type InterviewRecord = { v: 1; updatedAt: number; topic: string; rounds: Round[] };
export const MAX_ROUNDS = 12;
export const READY_ROUNDS = 3;
export const READY_SCORE = 4;

export const recordKey = (problem: string) => `dsa:iv:${problem}`;
export const RECORD_PREFIX = "dsa:iv:";

export function readRecord(x: unknown): InterviewRecord | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Partial<InterviewRecord>;
  if (!Array.isArray(r.rounds)) return null;
  const rounds = r.rounds.filter((o): o is Round => !!o && typeof o.at === "number" && typeof o.overall === "number" && (o.stage === "explain" || o.stage === "followup") && !!o.scores);
  return { v: 1, updatedAt: Number(r.updatedAt) || 0, topic: typeof r.topic === "string" ? r.topic : "", rounds };
}

/** The record with one more round (newest last, 12 kept). */
export function addRound(prev: unknown, round: Round, topic: string, now = Date.now()): InterviewRecord {
  const cur = readRecord(prev);
  return { v: 1, updatedAt: now, topic: topic || cur?.topic || "", rounds: [...(cur?.rounds ?? []), round].slice(-MAX_ROUNDS) };
}

/** "3 days ago" */
export function ago(at: number, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - at) / 60_000));
  if (m < 2) return "just now";
  if (m < 60) return `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export const lastRoundLine = (rounds: Round[], now = Date.now()) => {
  const r = rounds[rounds.length - 1];
  return r ? `Last round: ${r.overall.toFixed(1)} · ${ago(r.at, now)}` : null;
};

export type TopicStat = { topic: string; rounds: number; strong: number; ready: boolean };

/** Per topic over every saved record in the game flags: rounds, rounds scoring 4+, and "Interview-ready" (3 or more of those). */
export function topicStats(flags: Record<string, unknown> | null | undefined): TopicStat[] {
  const by = new Map<string, TopicStat>();
  for (const [k, v] of Object.entries(flags || {})) {
    if (!k.startsWith(RECORD_PREFIX)) continue;
    const rec = readRecord(v);
    if (!rec || !rec.topic) continue;
    const s = by.get(rec.topic) ?? { topic: rec.topic, rounds: 0, strong: 0, ready: false };
    s.rounds += rec.rounds.length;
    s.strong += rec.rounds.filter((r) => r.overall >= READY_SCORE).length;
    by.set(rec.topic, s);
  }
  return [...by.values()].map((s) => ({ ...s, ready: s.strong >= READY_ROUNDS })).sort((a, b) => Number(b.ready) - Number(a.ready) || b.strong - a.strong || a.topic.localeCompare(b.topic));
}

/** "sliding-window" → "Sliding window" */
export const topicName = (concept: string) => {
  const t = concept.replace(/[-_]+/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "";
};

/* ------------------------------------------------------------------ revise cards */

export const WEAK_SCORE = 2;

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export const DSA_INTERVIEW_REF = (problem: string, q: string) => `dsa-interview:${problem}:${hash(q.trim().toLowerCase())}`;

export type WeakCard = { source: "interview"; sourceRef: string; courseId: string; week?: string; lessonSlug?: string; front: string; back: string; detail: { context: string } };

/**
 * Follow-ups answered weakly (a score of 2 or less) as revise cards, in the shape addReviewCard takes: the front is
 * "Follow-up: <the question>", the back the interviewer's one-line better answer. Only the follow-up round makes cards:
 * the explain drill's better answers come from the learner's own words while the solution is still locked.
 */
export function weakCards(o: { stage: InterviewStage; problem: string; title: string; concept: string; module?: string }, turns: Pick<Turn, "q" | "score" | "feedback">[], courseId = "dsa"): WeakCard[] {
  if (o.stage !== "followup") return [];
  const out: WeakCard[] = [];
  for (const t of turns) {
    const back = t.feedback.better.trim();
    if (t.score > WEAK_SCORE || !back) continue;
    const q = t.q.replace(/\s+/g, " ").trim();
    out.push({
      source: "interview",
      sourceRef: DSA_INTERVIEW_REF(o.problem, q),
      courseId,
      ...(o.module ? { week: o.module } : {}),
      lessonSlug: o.concept,
      front: `Follow-up: ${q.length > 280 ? `${q.slice(0, 277)}…` : q}`,
      back,
      detail: { context: `${o.title} · interview follow-up` },
    });
  }
  return out;
}
