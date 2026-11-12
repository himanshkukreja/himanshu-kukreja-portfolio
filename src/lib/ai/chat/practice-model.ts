/**
 * The chat's view of what a learner practised beyond lessons, and of their DSA Mastery record (part of the progress
 * snapshot, progress-model.ts). Pure, with no runtime imports, so the route, the eval and the tests share it.
 *   game_done   lab:/lab-iv: (code labs cleared, interview passes), warroom:, paper:, drill:, explain:, quiz: (quick
 *               checks right first time), each with when it happened
 *   game_flags  mock:<id> (a mock's best and last verdict), paper:<key> (a written paper's best score and attempts)
 *   DSA         solved problems, recent solves, concepts and struggles (dsaDigest, over the learner model's rows and
 *               profile: lib/learner/brief.ts dsaRows, lib/learner/dsa-profile.ts buildDsaProfile)
 * What is NOT on the server is said with it (STORED_NOTE), so the chat says "I can't see that" instead of guessing.
 */
import type { CourseMap } from "@/lib/learn/types";
import type { DsaIndex, DsaLearnerRaw, DsaProfile } from "@/lib/learner/dsa-profile";

/** What the learner practised outside lessons, from the synced game state (times are ms; 0 = unknown). */
export type PracticeSnapshot = {
  /** code labs: cleared (every test passing) and/or an interview-mode pass */
  labs: { id: string; cleared: number; interview: number }[];
  warRooms: { slug: string; at: number }[];
  /** written papers: passed (game_done) and the best score kept in the paper's flag */
  papers: { key: string; passed: number; best: { score: number; max: number } | null; attempts: number }[];
  drills: { id: string; at: number }[];
  /** explain-it-back passes recorded as awards (DSA Mastery's concepts) */
  explains: { id: string; at: number }[];
  /** quick checks answered right first time, by lesson, most recent first */
  quickChecks: { total: number; lessons: { week: string; slug: string; title: string; n: number; at: number }[] };
  /** a mock's best and last verdict (the flag the mock room keeps); the transcript stays in the browser */
  mockResults: { id: string; slug: string; title: string; n: number; best: MockVerdict; last: MockVerdict | null }[];
};
export type MockVerdict = { verdict: string; level: string; pct: number; at: number };

/** A learner's DSA Mastery record, digested for the chat (dsaDigest, from the learner model's rows: lib/learner). */
export type DsaDigest = {
  solved: number;
  attempted: number;
  lessonsDone: number;
  /** most recent solves first */
  recent: { id: string; title: string; level: string; concept: string; langs: string[]; at: number }[];
  /** the concepts behind their solves, most solved first */
  concepts: { name: string; solved: number }[];
  /** concepts their record shows as hard, with the reason (lib/learner/dsa-profile.ts) */
  struggles: { concept: string; why: string }[];
  /** problems with 2+ failed submits, the editorial revealed, or a failed submit and no solve yet */
  hard: { id: string; title: string; concept: string; failed: number; verdicts: string[]; solved: boolean; revealed: boolean }[];
  /** verdict habits ("solutions too slow…") and the editorial habit */
  habits: string[];
};

/** Said with the snapshot, so "how did my lab go" is answered from what is stored and nothing more. */
export const STORED_NOTE =
  "Stored on the server: lessons, quick checks right first time, trials, review cards, code labs cleared and interview passes (not their runs, failures or hints), war rooms cleared, written paper scores, mock verdicts (best and last; not the transcript or per-phase scores) and DSA Mastery submits. Not stored: explain-it-back answers and verdicts, mock and lab transcripts, hints used in code labs, feedback text. When asked about something not stored, say plainly you can't see it, then help from what is stored (or ask them to paste it).";

const at = (v: unknown) => (Number(v) > 0 ? Number(v) : 0);
const verdictOf = (v: unknown): MockVerdict | null => {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  return typeof r.verdict === "string" ? { verdict: r.verdict, level: typeof r.level === "string" ? r.level : "", pct: Math.round(Number(r.pct) || 0), at: at(r.at) } : null;
};
const newest = <T extends { at: number }>(xs: T[]) => xs.sort((a, b) => b.at - a.at);

/** The practice record from game_done and game_flags (pure; see PracticeSnapshot). */
export function practiceOf(done: Record<string, number>, flags: Record<string, unknown>, map: Pick<CourseMap, "mocks">, titleOf: Map<string, { title: string }>): PracticeSnapshot {
  const labs = new Map<string, { id: string; cleared: number; interview: number }>();
  const lab = (id: string) => labs.get(id) ?? labs.set(id, { id, cleared: 0, interview: 0 }).get(id)!;
  const warRooms: PracticeSnapshot["warRooms"] = [];
  const passed = new Map<string, number>();
  const drills: PracticeSnapshot["drills"] = [];
  const explains: PracticeSnapshot["explains"] = [];
  const quiz = new Map<string, { week: string; slug: string; title: string; n: number; at: number }>();
  let quizTotal = 0;
  for (const [k, v] of Object.entries(done)) {
    const i = k.indexOf(":");
    if (i < 0) continue;
    const kind = k.slice(0, i);
    const rest = k.slice(i + 1);
    if (!rest) continue;
    if (kind === "lab") lab(rest).cleared = at(v) || 1;
    else if (kind === "lab-iv") lab(rest).interview = at(v) || 1;
    else if (kind === "warroom") warRooms.push({ slug: rest, at: at(v) });
    else if (kind === "paper") passed.set(rest, at(v) || 1);
    else if (kind === "drill") drills.push({ id: rest, at: at(v) });
    else if (kind === "explain") explains.push({ id: rest, at: at(v) });
    else if (kind === "quiz") {
      // quiz:<course>/<week>/<lesson>:<block>:<q> (quiz:ace is the "first blood" badge, not a question)
      const m = /^[^/]+\/([^/]+)\/([^:]+):\d+:\d+$/.exec(rest);
      if (!m) continue;
      quizTotal++;
      const lk = `${m[1]}/${m[2]}`;
      const q = quiz.get(lk) ?? { week: m[1], slug: m[2], title: titleOf.get(lk)?.title ?? m[2], n: 0, at: 0 };
      q.n++;
      q.at = Math.max(q.at, at(v));
      quiz.set(lk, q);
    }
  }
  const papers: PracticeSnapshot["papers"] = [];
  for (const key of new Set([...passed.keys(), ...Object.keys(flags).filter((k) => k.startsWith("paper:")).map((k) => k.slice(6))])) {
    const f = flags[`paper:${key}`] as { attempts?: unknown; best?: { score?: unknown; max?: unknown } | null } | undefined;
    const best = f?.best && Number(f.best.max) > 0 ? { score: Number(f.best.score) || 0, max: Number(f.best.max) } : null;
    const attempts = Number(f?.attempts) || 0;
    if (passed.has(key) || best || attempts) papers.push({ key, passed: passed.get(key) ?? 0, best, attempts });
  }
  // flags are mock:<id> ("mock-01"); the page and the search index know a mock by its slug
  const mockOf = new Map<string, { slug: string; title: string }>();
  for (const m of map.mocks ?? []) for (const id of [m.id, m.slug]) mockOf.set(id, { slug: m.slug, title: `${m.title} (${m.company})` });
  const mockResults: PracticeSnapshot["mockResults"] = [];
  for (const [k, v] of Object.entries(flags)) {
    if (!k.startsWith("mock:") || !v || typeof v !== "object") continue;
    const f = v as { best?: unknown; last?: unknown; n?: unknown };
    const best = verdictOf(f.best);
    if (!best) continue;
    const id = k.slice(5);
    mockResults.push({ id, slug: mockOf.get(id)?.slug ?? id, title: mockOf.get(id)?.title ?? id, n: Number(f.n) || 1, best, last: verdictOf(f.last) });
  }
  const labList = [...labs.values()].sort((a, b) => Math.max(b.cleared, b.interview) - Math.max(a.cleared, a.interview));
  return {
    labs: labList,
    warRooms: newest(warRooms),
    papers: papers.sort((a, b) => b.passed - a.passed),
    drills: newest(drills),
    explains: newest(explains),
    quickChecks: { total: quizTotal, lessons: newest([...quiz.values()]).slice(0, 6) },
    mockResults: mockResults.sort((a, b) => b.best.at - a.best.at),
  };
}

/**
 * The DSA record as the chat sees it: the learner model's profile (lib/learner/dsa-profile.ts buildDsaProfile: counts,
 * concept struggles, habits) plus what the course chat needs on top, from the same rows: every solve with its title,
 * level, concept and languages (newest first), the concepts behind them, and the problems that took several tries.
 */
export function dsaDigest(raw: DsaLearnerRaw, ix: DsaIndex, profile: DsaProfile): DsaDigest {
  // every solve, at its first known time (the earliest Accepted submit or the award; 0 = unknown)
  const solvedAt = new Map<string, number>();
  const solve = (id: string, t = 0) => {
    const prev = solvedAt.get(id) ?? 0;
    solvedAt.set(id, prev && t ? Math.min(prev, t) : prev || t);
  };
  for (const r of raw.rows) if (r.week === "problems" && r.status === "completed") solve(r.lesson_slug);
  for (const r of raw.prog) if (r.status === "solved") solve(r.problem_id);
  for (const [k, v] of Object.entries(raw.done)) if (k.startsWith("dsa:p:")) solve(k.slice(6), at(v));
  const langs = new Map<string, Set<string>>();
  const fails = new Map<string, { n: number; verdicts: Set<string> }>();
  for (const x of raw.subs) {
    if (x.verdict === "AC") {
      solve(x.problem_id, at(Date.parse(x.created_at)));
      (langs.get(x.problem_id) ?? langs.set(x.problem_id, new Set()).get(x.problem_id)!).add(x.language);
    } else {
      const f = fails.get(x.problem_id) ?? fails.set(x.problem_id, { n: 0, verdicts: new Set() }).get(x.problem_id)!;
      f.n++;
      f.verdicts.add(x.verdict);
    }
  }
  const revealed = new Set(raw.prog.filter((r) => r.editorial_viewed).map((r) => r.problem_id));
  const meta = (id: string) => ix.problems.get(id) ?? { title: id.replace(/-/g, " "), level: "", concept: "" };
  const conceptName = (c: string) => (c ? (ix.concepts.get(c) ?? c.replace(/-/g, " ")) : "");
  const recent = [...solvedAt.entries()].map(([id, t]) => ({ id, ...meta(id), concept: conceptName(meta(id).concept), langs: [...(langs.get(id) ?? [])], at: t })).sort((a, b) => b.at - a.at);
  const per = new Map<string, number>();
  for (const r of recent) if (r.concept) per.set(r.concept, (per.get(r.concept) ?? 0) + 1);
  const hard = [...new Set([...fails.keys(), ...revealed])]
    .map((id) => ({ id, title: meta(id).title, concept: conceptName(meta(id).concept), failed: fails.get(id)?.n ?? 0, verdicts: [...(fails.get(id)?.verdicts ?? [])], solved: solvedAt.has(id), revealed: revealed.has(id) }))
    // one failed submit before an Accepted is normal
    .filter((h) => h.failed >= 2 || h.revealed || (h.failed > 0 && !h.solved))
    .sort((a, b) => Number(a.solved) - Number(b.solved) || b.failed - a.failed)
    .slice(0, 5);
  const habits = [...profile.patterns];
  if (profile.editorialFirst.n >= 2) habits.push(`revealed the editorial before solving on ${profile.editorialFirst.n} of their last ${profile.editorialFirst.of} problems`);
  return {
    solved: Math.max(profile.solved, recent.length),
    attempted: profile.attempted,
    lessonsDone: profile.lessonsDone,
    recent: recent.slice(0, 8),
    concepts: [...per.entries()].map(([name, solved]) => ({ name, solved })).sort((a, b) => b.solved - a.solved).slice(0, 6),
    struggles: profile.struggles,
    hard,
    habits,
  };
}
