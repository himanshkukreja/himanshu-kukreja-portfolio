/**
 * The chat's view of what a learner practised beyond lessons, and of their DSA Mastery record (part of the progress
 * snapshot, progress-model.ts). Pure, with no runtime imports, so the route, the eval and the tests share it.
 *   game_done   lab:/lab-iv: (code labs cleared, interview passes), warroom:, paper:, drill:, explain:, quiz: (quick
 *               checks right first time), each with when it happened
 *   game_flags  mock:<id> (a mock's best and last verdict), paper:<key> (a written paper's best score and attempts)
 *   DSA         solved problems, recent solves, patterns and struggles (dsaDigest; the server reads the rows through
 *               lib/dsa/learner-data.ts and the dsa_submissions / dsa_problem_progress tables)
 * What is NOT on the server is said with it (STORED_NOTE), so the chat says "I can't see that" instead of guessing.
 */
import type { CourseMap } from "@/lib/learn/types";

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
  mockResults: { id: string; title: string; n: number; best: MockVerdict; last: MockVerdict | null }[];
};
export type MockVerdict = { verdict: string; level: string; pct: number; at: number };

/** A learner's DSA Mastery record, digested for the chat (built on the server by dsaDigest). */
export type DsaDigest = {
  solved: number;
  attempted: number;
  conceptsDone: number;
  /** most recent solves first */
  recent: { id: string; title: string; level: string; patterns: string[]; langs: string[]; at: number }[];
  /** the patterns behind their solves, most solved first */
  patterns: { name: string; solved: number }[];
  /** problems with failed submits, hints or the editorial opened, most failed first */
  struggles: { id: string; title: string; failed: number; verdicts: string[]; solved: boolean; hints: number; editorial: boolean }[];
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
export function practiceOf(done: Record<string, number>, flags: Record<string, unknown>, map: CourseMap, titleOf: Map<string, { title: string }>): PracticeSnapshot {
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
  const mockTitle = new Map<string, string>();
  for (const m of map.mocks ?? []) for (const id of [m.id, m.slug]) mockTitle.set(id, `${m.title} (${m.company})`);
  const mockResults: PracticeSnapshot["mockResults"] = [];
  for (const [k, v] of Object.entries(flags)) {
    if (!k.startsWith("mock:") || !v || typeof v !== "object") continue;
    const f = v as { best?: unknown; last?: unknown; n?: unknown };
    const best = verdictOf(f.best);
    if (!best) continue;
    const id = k.slice(5);
    mockResults.push({ id, title: mockTitle.get(id) ?? id, n: Number(f.n) || 1, best, last: verdictOf(f.last) });
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

/** The DSA record as the chat sees it (pure: the server passes what lib/dsa/learner-data.ts and the tables give). */
export function dsaDigest(i: {
  solvedAt: Map<string, number>;
  solved: Set<string>;
  langs: Map<string, Set<string>>;
  conceptsDone: number;
  problems: Map<string, { title: string; level: string; patterns: string[] }>;
  /** submits that weren't Accepted (problem, verdict) */
  failed: { problem: string; verdict: string }[];
  /** dsa_problem_progress rows */
  progress: { problem: string; status: string; hints: number; editorial: boolean }[];
}): DsaDigest {
  const meta = (id: string) => i.problems.get(id) ?? { title: id.replace(/-/g, " "), level: "", patterns: [] };
  const recent = [...i.solved]
    .map((id) => ({ id, ...meta(id), langs: [...(i.langs.get(id) ?? [])], at: i.solvedAt.get(id) ?? 0 }))
    .sort((a, b) => b.at - a.at);
  const pat = new Map<string, number>();
  for (const r of recent) for (const p of r.patterns) pat.set(p, (pat.get(p) ?? 0) + 1);
  const st = new Map<string, { failed: number; verdicts: Set<string>; hints: number; editorial: boolean }>();
  const get = (id: string) => st.get(id) ?? st.set(id, { failed: 0, verdicts: new Set(), hints: 0, editorial: false }).get(id)!;
  for (const f of i.failed) {
    const s = get(f.problem);
    s.failed++;
    s.verdicts.add(f.verdict);
  }
  for (const p of i.progress) {
    if (p.hints > 0 || p.editorial) {
      const s = get(p.problem);
      s.hints = Math.max(s.hints, p.hints);
      s.editorial ||= p.editorial;
    }
  }
  const attempted = new Set([...i.solved, ...st.keys(), ...i.progress.map((p) => p.problem)]);
  const struggles = [...st.entries()]
    // one failed submit before an Accepted is normal: a struggle is 2+ fails, a hint or the editorial, or no solve yet
    .filter(([id, s]) => s.failed >= 2 || s.hints > 0 || s.editorial || (s.failed > 0 && !i.solved.has(id)))
    .map(([id, s]) => ({ id, title: meta(id).title, failed: s.failed, verdicts: [...s.verdicts], solved: i.solved.has(id), hints: s.hints, editorial: s.editorial }))
    .sort((a, b) => Number(a.solved) - Number(b.solved) || b.failed + b.hints * 2 - (a.failed + a.hints * 2))
    .slice(0, 5);
  return {
    solved: i.solved.size,
    attempted: attempted.size,
    conceptsDone: i.conceptsDone,
    recent: recent.slice(0, 8),
    patterns: [...pat.entries()].map(([name, solved]) => ({ name, solved })).sort((a, b) => b.solved - a.solved).slice(0, 6),
    struggles,
  };
}
