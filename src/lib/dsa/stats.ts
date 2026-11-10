/**
 * "My stats" (/dsa/stats): one learner's numbers, computed in the browser from what they already have: the synced game
 * store (`dsa:*` done keys with their times), the progress rows (the solved set), and this device's submission history
 * (dsa.history.<id>, dsa.hints.<id>). No new tables, nothing read from analytics.
 *
 * Pure and import-free (type-only), so the page and scripts/tests/dsa-stats.test.mjs run the same code. The rewards
 * tables come in as arguments (`tiers`, `awards`) rather than imports for the same reason.
 *
 * What has data today
 *   solved (total, level, data structure, algorithm, course step), activity heatmap and streaks, weekly solves, Bits over
 *   time, lessons/steps/quizzes/labs/dry runs, lectures watched, first-try and no-hint solves (read back out of each
 *   solve's Bits: a level's base plus the first-try and no-hint bonuses are distinct sums), submissions and acceptance
 *   rate and languages (this device's history only: the server keeps no per-learner read for the browser).
 * Not tracked yet: solution videos watched, clips watched, Interview rounds ("coming soon" until the Interview tab stores
 *   scorecards under keys documented in rewards.ts).
 */
export type StatRow = { id: string; level: "easy" | "medium" | "hard"; module: string; structures: string[]; algorithms: string[] };
export type HistoryRow = { at: number; lang: string; verdict: string; passed?: number; total?: number };
export type Tiers = Record<"easy" | "medium" | "hard", { base: number; firstTry: number; noHints: number }>;

export type StatsInput = {
  /** the game store's done map (key → epoch ms) */
  done: Record<string, number>;
  /** problems solved right now (game keys and progress rows, after resets) */
  solved: ReadonlySet<string>;
  rows: StatRow[];
  /** problem id → submit history on this device, newest first */
  histories: Record<string, HistoryRow[]>;
  /** each solve's Bits (awardsOf: `solve:<id>`), to read first try / no hints back */
  solveBits: Record<string, number>;
  tiers: Tiers;
  /** every award with its time and Bits, for Bits over time */
  awards: { at: number; bits: number }[];
  now: number;
  /** Date#getTimezoneOffset() of the viewer, so days are the learner's own days */
  tzOffsetMin: number;
  weeks?: number;
};

export type Bar = { id: string; label: string; solved: number; total: number };

const DAY = 86_400_000;

export const dayKey = (ms: number, tzOffsetMin: number): string => new Date(ms - tzOffsetMin * 60_000).toISOString().slice(0, 10);
const dayNum = (key: string) => Math.floor(Date.parse(`${key}T00:00:00Z`) / DAY);
const keyOfNum = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
/** 0 = Monday */
const weekdayOf = (n: number) => (n + 3) % 7;

/** Streaks over a set of active day keys: the run ending today (or yesterday, still alive) and the longest run ever. */
export function streaksOf(days: Set<string>, today: string): { current: number; longest: number } {
  const nums = [...days].map(dayNum).sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  let prev = -Infinity;
  for (const n of nums) {
    run = n === prev + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = n;
  }
  const t = dayNum(today);
  let cur = 0;
  let n = days.has(today) ? t : days.has(keyOfNum(t - 1)) ? t - 1 : NaN;
  while (!Number.isNaN(n) && days.has(keyOfNum(n))) {
    cur++;
    n--;
  }
  return { current: cur, longest };
}

/** Bits a solve's Bits total decodes to: which bonuses it held. Unknown amounts (editorial first, legacy) give nulls. */
export function solveFactsFromBits(level: StatRow["level"], bits: number | undefined, tiers: Tiers): { firstTry: boolean | null; noHints: boolean | null } {
  const t = tiers[level];
  if (!t || bits == null) return { firstTry: null, noHints: null };
  for (const [ft, nh] of [[true, true], [true, false], [false, true], [false, false]] as const) {
    if (t.base + (ft ? t.firstTry : 0) + (nh ? t.noHints : 0) === bits) return { firstTry: ft, noHints: nh };
  }
  return { firstTry: null, noHints: null };
}

const count = (done: Record<string, number>, prefix: string) => Object.keys(done).filter((k) => k.startsWith(prefix)).length;

export function computeStats(i: StatsInput) {
  const weeks = i.weeks ?? 26;
  const today = dayKey(i.now, i.tzOffsetMin);
  const todayN = dayNum(today);
  const byId = new Map(i.rows.map((r) => [r.id, r]));
  const solvedRows = [...i.solved].map((id) => byId.get(id)).filter((r): r is StatRow => !!r);

  /* solved, by level, topic and step (each against what the bank holds) */
  const level = { easy: { solved: 0, total: 0 }, medium: { solved: 0, total: 0 }, hard: { solved: 0, total: 0 } };
  const tally = (pick: (r: StatRow) => string[]) => {
    const m = new Map<string, { solved: number; total: number }>();
    for (const r of i.rows) for (const k of pick(r)) m.set(k, { solved: m.get(k)?.solved || 0, total: (m.get(k)?.total || 0) + 1 });
    for (const r of solvedRows) for (const k of pick(r)) m.get(k)!.solved++;
    return m;
  };
  for (const r of i.rows) level[r.level].total++;
  for (const r of solvedRows) level[r.level].solved++;
  const bars = (m: Map<string, { solved: number; total: number }>, label: (id: string) => string, keepEmpty = false): Bar[] =>
    [...m.entries()]
      .filter(([, v]) => keepEmpty || v.solved > 0)
      .map(([id, v]) => ({ id, label: label(id), ...v }))
      .sort((a, b) => b.solved - a.solved || a.label.localeCompare(b.label));
  const structures = tally((r) => r.structures);
  const algorithms = tally((r) => r.algorithms);
  const steps = tally((r) => [r.module]);

  /* activity: any dated progress key (not Bits events or reset tombstones) and every submit on this device */
  const active = new Map<string, number>();
  const bump = (ms: number) => {
    if (!ms || ms > i.now + DAY) return;
    const k = dayKey(ms, i.tzOffsetMin);
    active.set(k, (active.get(k) || 0) + 1);
  };
  for (const [k, at] of Object.entries(i.done)) if (k.startsWith("dsa:") && !k.startsWith("dsa:b:") && !k.startsWith("dsa:rs:")) bump(Number(at));
  const allHistory = Object.entries(i.histories).flatMap(([id, h]) => h.map((r) => ({ ...r, id })));
  for (const h of allHistory) bump(h.at);
  const { current, longest } = streaksOf(new Set(active.keys()), today);

  const firstMonday = todayN - weekdayOf(todayN) - (weeks - 1) * 7;
  const heat: { date: string; count: number; future: boolean }[] = [];
  for (let n = firstMonday; n <= todayN - weekdayOf(todayN) + 6; n++) {
    const date = keyOfNum(n);
    heat.push({ date, count: active.get(date) || 0, future: n > todayN });
  }

  /* weekly: solves and Bits, the last `weeks` weeks (Monday start) */
  const weekIndex = (ms: number) => Math.floor((dayNum(dayKey(ms, i.tzOffsetMin)) - firstMonday) / 7);
  const weekly = Array.from({ length: weeks }, (_, w) => ({ start: keyOfNum(firstMonday + w * 7), solves: 0, bits: 0, bitsTotal: 0 }));
  for (const id of i.solved) {
    const at = Number(i.done[`dsa:p:${id}`]) || 0;
    const w = at ? weekIndex(at) : -1;
    if (w >= 0 && w < weeks) weekly[w].solves++;
  }
  let before = 0;
  for (const a of i.awards) {
    const w = a.at ? weekIndex(a.at) : -1;
    if (w < 0) before += a.bits;
    else if (w < weeks) weekly[w].bits += a.bits;
  }
  let running = before;
  for (const w of weekly) {
    running += w.bits;
    w.bitsTotal = running;
  }

  /* submissions (this device) */
  const langs: Record<string, number> = {};
  let accepted = 0;
  for (const h of allHistory) {
    langs[h.lang] = (langs[h.lang] || 0) + 1;
    if (h.verdict === "AC") accepted++;
  }
  let firstTry = 0;
  let noHints = 0;
  let known = 0;
  for (const r of solvedRows) {
    const f = solveFactsFromBits(r.level, i.solveBits[r.id], i.tiers);
    if (f.firstTry === null) continue;
    known++;
    if (f.firstTry) firstTry++;
    if (f.noHints) noHints++;
  }

  return {
    solved: {
      total: i.solved.size,
      bank: i.rows.length,
      byLevel: level,
      byStructure: bars(structures, (id) => id),
      byAlgorithm: bars(algorithms, (id) => id),
      byStep: bars(steps, (id) => id, true),
    },
    activity: { heat, current, longest, activeDays: active.size, today },
    weekly,
    lessons: {
      lessons: count(i.done, "dsa:c:"),
      steps: count(i.done, "dsa:s:"),
      quizzes: count(i.done, "dsa:cpq:"),
      labs: count(i.done, "dsa:lab:"),
      dryRuns: count(i.done, "dsa:tr:"),
    },
    videos: { lectures: count(i.done, "dsa:lec:") },
    submissions: { total: allHistory.length, accepted, rate: allHistory.length ? Math.round((accepted / allHistory.length) * 100) : null, languages: langs, firstTry, noHints, known },
  };
}

export type DsaStats = ReturnType<typeof computeStats>;
