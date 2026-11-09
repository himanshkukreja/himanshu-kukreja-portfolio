/**
 * DSA Mastery rewards: Bits (the currency) and Belts (the ranks), in one pure module (owner, 9 Nov 2026).
 *
 * Fully separate from System Design Mastery's XP, levels and leaderboards: nothing here reads or writes SDM XP, and no
 * DSA action adds to user_profiles.xp. Belts are cosmetic and show progress only: they never lock or open content.
 *
 * Where awards live: the account-synced game store (user_profiles.game_done, hk.game.v1 for guests), so there is no
 * new table. Every award has one stable key, so replays, a second device and the sign-in merge never count it twice:
 *
 *   progress keys (fixed Bits, the key itself is the award; most already existed for the map)
 *     dsa:s:<concept>/<beat>   lesson beat read           dsa:c:<concept>       lesson finished
 *     dsa:qc:<page>:<b>:<q>    quick check, first try     dsa:cpq:<node>        checkpoint quiz passed
 *     dsa:tr:<trace>           dry run, every step right  dsa:lab:<lab>         build-it lab passed
 *     dsa:lq:<lecture>:<q>     lecture question right     dsa:lec:<lecture>     lecture watched to the end
 *     dsa:daily:<day>          the daily problem solved   dsa:rv:<day>:<card>   a revision card reviewed (once a day)
 *     dsa:boss:<world>:<mod>   module review              dsa:world:<world>     the world's final
 *   events (variable Bits, written as `dsa:b:<award key>=<bits>`)
 *     solve:<problem>   welcome   explain:<concept>   streak:<days>   badge:<badge id>
 *
 * An event key carries its amount, so two devices that both award the same thing before they sync can each write one:
 * the union keeps both and awardsOf() counts the higher, once. `dsa:p:<problem>` (the map's solved key) is written
 * with every solve; a solve key without its event (solved before Bits existed) counts the Easy base.
 *
 * Amounts and belts, the reasoning
 *   Phase 1 (the launch bank, curriculum.yml: ~406 problems, 160 Easy / 213 Medium / 33 Hard, plus every Academy and
 *   District 1-4 lesson) works out like this for a typical learner (bonuses on roughly a third of solves):
 *     solves       base 7,180 (160×10 + 213×20 + 33×40), with bonuses ~9,500       (all bonuses: 12,645)
 *     learning     ~85 lessons × (6 beats × 2 + 10) + ~40 checkpoints × 15 + ~25 labs × 30 + ~70 lectures × 10
 *                  + dry runs and quick checks                                      ~4,500
 *     daily        ~120 daily problems × 5 + streak milestones                     ~800
 *     badges       ~29 modules × 50 + the Academy × 300                            ~1,750
 *     total        ~16,500 typical (≈13,600 with no bonuses at all)  → Brown (14,000)
 *   Everything planned (~1,070 problems, all worlds) is ~43,000 typical, so Black (35,000) needs about 80% of the
 *   whole course: near-everything, by design. Yellow (300) comes after the welcome bonus, a first lesson and a few
 *   Easy problems, so a beginner sees a belt change in the first session.
 *   Solves carry most of the weight (they are the verified skill), learning steps are worth roughly a quarter, and
 *   opening the editorial before solving keeps a quarter of the base (the solve still counts on the map).
 *
 * Pure and import-free (type imports only): the browser, the server (profile, leaderboard) and the unit tests
 * (scripts/tests/dsa-rewards.test.mjs) run the same code.
 */
import type { DsaLevel, WorldNode, WorldSpec } from "./types";
import type { ProgressSignals } from "./map/progress";

export const BITS = { one: "Bit", many: "Bits" } as const;
export const bitsLabel = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? BITS.one : BITS.many}`;

/* ------------------------------------------------------------------ amounts */

/** Problem solves, by level: the base, the first-try bonus (Accepted on the first submit) and the no-hint bonus. */
export const SOLVE_BITS: Record<DsaLevel, { base: number; firstTry: number; noHints: number }> = {
  easy: { base: 10, firstTry: 5, noHints: 3 },
  medium: { base: 20, firstTry: 10, noHints: 5 },
  hard: { base: 40, firstTry: 20, noHints: 10 },
};
/** Opening the editorial before solving keeps this share of the base and no bonuses. */
export const EDITORIAL_SHARE = 0.25;
/** A solve recorded before Bits existed (a `dsa:p:` key without its event): its level isn't in the key. */
export const LEGACY_SOLVE_BITS = SOLVE_BITS.easy.base;

export const BITS_TABLE = {
  welcome: 50,
  beat: 2,
  lesson: 10,
  quickCheck: 1,
  checkpointQuiz: 15,
  dryRun: 5,
  lab: 30,
  lectureQuestion: 1,
  lecture: 10,
  explainSolid: 10,
  explainPartial: 5,
  daily: 5,
  revise: 1,
  moduleReview: 40,
  worldFinal: 100,
  moduleBadge: 50,
  worldBadge: 300,
} as const;

/** Daily streak milestones (days in a row → Bits), each awarded once. */
export const STREAK_BITS: { days: number; bits: number }[] = [
  { days: 3, bits: 10 },
  { days: 7, bits: 25 },
  { days: 14, bits: 50 },
  { days: 30, bits: 100 },
  { days: 60, bits: 150 },
  { days: 100, bits: 250 },
];

/* ------------------------------------------------------------------ belts */

export type BeltId = "white" | "yellow" | "orange" | "green" | "blue" | "brown" | "black";
export type Belt = { id: BeltId; name: string; min: number; /** the belt's own colour (the chip's swatch) */ color: string; line: string };

export const BELTS: Belt[] = [
  { id: "white", name: "White", min: 0, color: "#f4f4f2", line: "Everyone starts here." },
  { id: "yellow", name: "Yellow", min: 300, color: "#f2c230", line: "Your first lessons and problems." },
  { id: "orange", name: "Orange", min: 1_500, color: "#ef8a2c", line: "The toolkit and the first structures." },
  { id: "green", name: "Green", min: 4_000, color: "#2e9d5b", line: "Core data structures in hand." },
  { id: "blue", name: "Blue", min: 8_000, color: "#2f6fd6", line: "Algorithms and patterns, solved for real." },
  { id: "brown", name: "Brown", min: 14_000, color: "#7a4a2a", line: "The launch course, done." },
  { id: "black", name: "Black", min: 35_000, color: "#111111", line: "Near everything in DSA Mastery." },
];

export type BeltProgress = { belt: Belt; index: number; next: Belt | null; toNext: number; pct: number };

export function beltFor(bits: number): BeltProgress {
  const b = Math.max(0, Math.floor(Number(bits) || 0));
  let index = 0;
  BELTS.forEach((x, i) => {
    if (b >= x.min) index = i;
  });
  const belt = BELTS[index];
  const next = BELTS[index + 1] ?? null;
  const toNext = next ? next.min - b : 0;
  const pct = next ? Math.floor(((b - belt.min) / (next.min - belt.min)) * 100) : 100;
  return { belt, index, next, toNext, pct };
}

export const START_BELT = BELTS[0];

/* ------------------------------------------------------------------ award keys */

export type AwardKind =
  | "welcome"
  | "solve"
  | "beat"
  | "lesson"
  | "check"
  | "quiz"
  | "trace"
  | "lab"
  | "lecture"
  | "explain"
  | "daily"
  | "streak"
  | "revise"
  | "review"
  | "badge";

/** One award: a stable key (`solve:two-sum`, `beat:windows/see`, `daily:2026-11-09`), its Bits, when it was earned. */
export type Award = { key: string; kind: AwardKind; bits: number; at: number };

export const KIND_LABEL: Record<AwardKind, string> = {
  welcome: "Welcome bonus",
  solve: "Problems solved",
  beat: "Lesson beats",
  lesson: "Lessons finished",
  check: "Quick checks",
  quiz: "Checkpoint quizzes",
  trace: "Dry runs",
  lab: "Build-it labs",
  lecture: "Lectures",
  explain: "Explain it back",
  daily: "Daily problems",
  streak: "Streak milestones",
  revise: "Revision cards",
  review: "Reviews and finals",
  badge: "Mastery badges",
};

export const EVENT_PREFIX = "dsa:b:";

const clean = (s: string) => s.replace(/=/g, "-");

/** The game key for an event award: `dsa:b:<award key>=<bits>`. */
export const eventKey = (awardKey: string, bits: number) => `${EVENT_PREFIX}${clean(awardKey)}=${Math.max(0, Math.round(bits))}`;

export function parseEventKey(k: string): { key: string; bits: number } | null {
  if (!k.startsWith(EVENT_PREFIX)) return null;
  const eq = k.lastIndexOf("=");
  if (eq <= EVENT_PREFIX.length) return null;
  const bits = Number(k.slice(eq + 1));
  if (!Number.isFinite(bits) || bits < 0) return null;
  return { key: k.slice(EVENT_PREFIX.length, eq), bits };
}

/** Award keys for the events (what the client writes). */
export const awardKeys = {
  solve: (problem: string) => `solve:${problem}`,
  welcome: () => "welcome",
  explain: (concept: string) => `explain:${concept}`,
  streak: (days: number) => `streak:${days}`,
  badge: (id: string) => `badge:${id}`,
};

/** Progress keys that are awards in themselves (written by the lesson, quiz, lab, lecture and daily code). */
export const dsaProgressKeys = {
  quickCheck: (page: string, block: string, q: string) => `dsa:qc:${page}:${block}:${q}`,
  lectureQuestion: (lecture: string, q: string) => `dsa:lq:${lecture}:${q}`,
  lecture: (lecture: string) => `dsa:lec:${lecture}`,
  revise: (day: string, card: string) => `dsa:rv:${day}:${card}`,
};

/** Fixed-amount progress keys: prefix → kind, Bits and the award key's name. */
const FIXED: { prefix: string; kind: AwardKind; bits: number; name: string }[] = [
  { prefix: "dsa:s:", kind: "beat", bits: BITS_TABLE.beat, name: "beat" },
  { prefix: "dsa:c:", kind: "lesson", bits: BITS_TABLE.lesson, name: "lesson" },
  { prefix: "dsa:qc:", kind: "check", bits: BITS_TABLE.quickCheck, name: "check" },
  { prefix: "dsa:cpq:", kind: "quiz", bits: BITS_TABLE.checkpointQuiz, name: "quiz" },
  { prefix: "dsa:tr:", kind: "trace", bits: BITS_TABLE.dryRun, name: "dryrun" },
  { prefix: "dsa:lab:", kind: "lab", bits: BITS_TABLE.lab, name: "lab" },
  { prefix: "dsa:lq:", kind: "check", bits: BITS_TABLE.lectureQuestion, name: "lecture-check" },
  { prefix: "dsa:lec:", kind: "lecture", bits: BITS_TABLE.lecture, name: "lecture" },
  { prefix: "dsa:daily:", kind: "daily", bits: BITS_TABLE.daily, name: "daily" },
  { prefix: "dsa:rv:", kind: "revise", bits: BITS_TABLE.revise, name: "revise" },
  { prefix: "dsa:boss:", kind: "review", bits: BITS_TABLE.moduleReview, name: "review" },
  { prefix: "dsa:world:", kind: "review", bits: BITS_TABLE.worldFinal, name: "final" },
];

const EVENT_KIND: Record<string, AwardKind> = { solve: "solve", welcome: "welcome", explain: "explain", streak: "streak", badge: "badge" };

/** The Bits a single game key is worth on its own (0 for keys that aren't DSA awards, and for `dsa:p:`). */
export function bitsOfKey(k: string): number {
  const e = parseEventKey(k);
  if (e) return e.bits;
  const f = FIXED.find((x) => k.startsWith(x.prefix));
  return f ? f.bits : 0;
}

/**
 * Every award in a game_done map, one per stable key (events: the highest amount written, at its first time).
 * Keys outside DSA are ignored, so the same map can hold SDM's quests.
 */
export function awardsOf(done: Record<string, number> | null | undefined): Award[] {
  const events = new Map<string, Award>();
  const out: Award[] = [];
  const solvedKeys: { id: string; at: number }[] = [];
  for (const [k, raw] of Object.entries(done || {})) {
    if (!k.startsWith("dsa:")) continue;
    const at = Number(raw) || 0;
    const e = parseEventKey(k);
    if (e) {
      const kind = EVENT_KIND[e.key.split(":")[0]];
      if (!kind) continue;
      const prev = events.get(e.key);
      if (!prev) events.set(e.key, { key: e.key, kind, bits: e.bits, at });
      else events.set(e.key, { ...prev, bits: Math.max(prev.bits, e.bits), at: prev.at && at ? Math.min(prev.at, at) : prev.at || at });
      continue;
    }
    if (k.startsWith("dsa:p:")) {
      solvedKeys.push({ id: k.slice(6), at });
      continue;
    }
    const f = FIXED.find((x) => k.startsWith(x.prefix));
    if (f) out.push({ key: `${f.name}:${k.slice(f.prefix.length)}`, kind: f.kind, bits: f.bits, at });
  }
  for (const s of solvedKeys) {
    const key = awardKeys.solve(s.id);
    if (!events.has(key)) out.push({ key, kind: "solve", bits: LEGACY_SOLVE_BITS, at: s.at });
  }
  return [...out, ...events.values()];
}

export type BitsSummary = { total: number; byKind: Partial<Record<AwardKind, number>>; count: number };

/** Total Bits over awards (each stable key counted once, the highest amount). */
export function computeBits(awards: Award[]): BitsSummary {
  const best = new Map<string, Award>();
  for (const a of awards) {
    const p = best.get(a.key);
    if (!p || a.bits > p.bits) best.set(a.key, a);
  }
  const byKind: Partial<Record<AwardKind, number>> = {};
  let total = 0;
  for (const a of best.values()) {
    total += a.bits;
    byKind[a.kind] = (byKind[a.kind] || 0) + a.bits;
  }
  return { total, byKind, count: best.size };
}

/** Bits earned in [from, to) (epoch ms), e.g. this week for the weekly board. */
export function bitsBetween(awards: Award[], from: number, to = Infinity): number {
  const best = new Map<string, Award>();
  for (const a of awards) {
    const p = best.get(a.key);
    if (!p || a.bits > p.bits) best.set(a.key, a);
  }
  let n = 0;
  for (const a of best.values()) if (a.at >= from && a.at < to) n += a.bits;
  return n;
}

/** The highest Bits already recorded for an event award key (0: none). */
export function eventBits(done: Record<string, number> | null | undefined, awardKey: string): number {
  const prefix = `${EVENT_PREFIX}${clean(awardKey)}=`;
  let best = -1;
  for (const k of Object.keys(done || {})) {
    if (!k.startsWith(prefix)) continue;
    const e = parseEventKey(k);
    if (e && e.key === clean(awardKey)) best = Math.max(best, e.bits);
  }
  return best;
}

/* ------------------------------------------------------------------ solves */

export type SolveFacts = { level: DsaLevel; /** Accepted on the first submit */ firstTry: boolean; /** no hint rung opened */ noHints: boolean; /** the editorial was opened before the solve */ editorialFirst: boolean };

/** A verified solve's Bits and the parts that make it up (for the "Accepted" line). */
export function solveBits(f: SolveFacts): { bits: number; parts: { label: string; bits: number }[] } {
  const t = SOLVE_BITS[f.level] ?? SOLVE_BITS.medium;
  if (f.editorialFirst) {
    const bits = Math.max(1, Math.round(t.base * EDITORIAL_SHARE));
    return { bits, parts: [{ label: "solved after the editorial", bits }] };
  }
  const parts = [{ label: `${f.level} solve`, bits: t.base }];
  if (f.firstTry) parts.push({ label: "first try", bits: t.firstTry });
  if (f.noHints) parts.push({ label: "no hints", bits: t.noHints });
  return { bits: parts.reduce((a, p) => a + p.bits, 0), parts };
}

/** The most a problem of this level can earn (the problem header's "up to"). */
export const maxSolveBits = (level: DsaLevel) => {
  const t = SOLVE_BITS[level] ?? SOLVE_BITS.medium;
  return t.base + t.firstTry + t.noHints;
};

/* ------------------------------------------------------------------ streaks */

/** Streak milestones reached by a best run of `best` days (award keys streak:<days>). */
export const streakMilestones = (best: number) => STREAK_BITS.filter((m) => best >= m.days);

/* ------------------------------------------------------------------ mastery badges */

/**
 * A mastery badge: a module (a world region) or a whole world. `need` lists the signals that must all be present:
 *   c:<concept> lesson finished   p:<problem> solved   q:<checkpoint node> quiz passed   l:<lab> lab passed
 *   b:<badge id> another badge (a world badge needs every module badge)
 * `ready` is false while any required stop isn't written yet: nobody earns a badge for an unfinished module.
 */
export type BadgeDef = { id: string; kind: "module" | "world"; world: string; name: string; detail: string; code: string | null; need: string[]; ready: boolean; bits: number };

function nodeNeeds(n: WorldNode): string[] | null {
  if (n.type === "concept") return n.ref ? [`c:${n.ref}`] : null;
  if (n.type === "practice") return n.ref ? [`p:${n.ref}`] : null;
  if (n.type === "checkpoint") return [`q:${n.id}`, ...(n.problems || []).filter((p) => p.built).map((p) => `p:${p.id}`), ...(n.lab ? [`l:${n.lab.id}`] : [])];
  return null;
}

/** The badges a world offers: one per region (module), then the world itself. */
export function badgeDefsFor(spec: WorldSpec): BadgeDef[] {
  const mods: BadgeDef[] = [];
  for (const r of spec.regions) {
    const need: string[] = [];
    let ready = true;
    let any = false;
    for (const st of r.stretches) {
      for (const n of st.nodes) {
        if (!n.required || n.type === "gate") continue;
        const k = nodeNeeds(n);
        if (!k) continue;
        any = true;
        if (!n.built) ready = false;
        need.push(...k);
      }
    }
    if (!any) continue;
    const title = r.moduleTitle || r.title;
    mods.push({ id: `module:${spec.id}:${r.id}`, kind: "module", world: spec.id, name: title, detail: `Every lesson, problem and checkpoint in ${title}.`, code: r.code ? r.code.toUpperCase() : null, need: [...new Set(need)], ready, bits: BITS_TABLE.moduleBadge });
  }
  if (!mods.length) return [];
  const world: BadgeDef = {
    id: `world:${spec.id}`,
    kind: "world",
    world: spec.id,
    name: spec.title,
    detail: `Every module badge in ${spec.title}.`,
    code: null,
    need: mods.map((m) => `b:${m.id}`),
    ready: mods.every((m) => m.ready),
    bits: BITS_TABLE.worldBadge,
  };
  return [...mods, world];
}

/** Badge ids earned from the learner's signals (modules first, so world badges can count them). */
export function earnedBadges(defs: BadgeDef[], s: ProgressSignals): Set<string> {
  const earned = new Set<string>();
  const has = (t: string) => {
    const v = t.slice(2);
    switch (t[0]) {
      case "c":
        return s.concepts.has(v);
      case "p":
        return s.solved.has(v);
      case "q":
        return s.checkpoints.has(v);
      case "l":
        return s.labs.has(v);
      case "b":
        return earned.has(v);
      default:
        return false;
    }
  };
  for (const kind of ["module", "world"] as const)
    for (const d of defs) if (d.kind === kind && d.ready && d.need.length && d.need.every(has)) earned.add(d.id);
  return earned;
}

/** How far a learner is into each badge (done of need), for the badges grid. */
export function badgeProgress(defs: BadgeDef[], s: ProgressSignals): Record<string, { done: number; total: number }> {
  const earned = earnedBadges(defs, s);
  const out: Record<string, { done: number; total: number }> = {};
  for (const d of defs) {
    const done = d.need.filter((t) => {
      const v = t.slice(2);
      if (t[0] === "c") return s.concepts.has(v);
      if (t[0] === "p") return s.solved.has(v);
      if (t[0] === "q") return s.checkpoints.has(v);
      if (t[0] === "l") return s.labs.has(v);
      if (t[0] === "b") return earned.has(v);
      return false;
    }).length;
    out[d.id] = { done, total: d.need.length };
  }
  return out;
}

/* ------------------------------------------------------------------ the leaderboard summary */

/**
 * The learner's Bits summary, kept in game_flags under `dsa_bits` (recomputed from game_done on every change, so a
 * stale copy is replaced on the next visit). The DSA leaderboard reads only this small object per learner.
 */
export const DSA_BITS_FLAG = "dsa_bits";
export type DsaBitsFlag = { v: 1; b: number; belt: BeltId; wk: string; w: number; at: number };

export function bitsFlagOf(awards: Award[], weekStart: string, weekStartMs: number, at = Date.now()): DsaBitsFlag {
  const total = computeBits(awards).total;
  return { v: 1, b: total, belt: beltFor(total).belt.id, wk: weekStart, w: bitsBetween(awards, weekStartMs), at };
}

/* ------------------------------------------------------------------ the welcome bonus */

/** The onboarding's welcome bonus (once per account) and the belt everyone starts on. */
export const DSA_WELCOME_BONUS = { amount: BITS_TABLE.welcome, unit: BITS.many } as const;
export const DSA_START_BELT = START_BELT;
/** The old onboarding flag (kept: an account that has it already has its welcome bonus). */
export const DSA_WELCOME_FLAG = "dsa:welcome-bonus";
