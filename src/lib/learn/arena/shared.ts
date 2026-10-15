/**
 * Arena constants and pure helpers shared by the server (daily set, leaderboard) and the client
 * (daily runner, hub). Dates are Asia/Kolkata days: the daily challenge and the weekly league roll
 * over at 00:00 IST for everyone.
 */
import { LEVELS } from "@/game/catalog";

export const ARENA_TZ = "Asia/Kolkata";
export const DAILY_N = 5;
export const DAILY_SECONDS = 20;
/** day 1 of the daily challenge */
export const DAILY_EPOCH = "2026-10-15";

/* ------------------------------------------------------------------ dates (IST) */

const IST_OFFSET_MS = 330 * 60_000;

/** YYYY-MM-DD of an instant in Asia/Kolkata. */
export function istDate(at: Date | number = Date.now()): string {
  const t = typeof at === "number" ? at : at.getTime();
  return new Date(t + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** UTC instant of 00:00 IST on a YYYY-MM-DD day. */
export function istMidnight(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`) - IST_OFFSET_MS;
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** Monday (IST) of the week holding `day`. */
export function weekStartOf(day: string): string {
  const dow = new Date(`${day}T00:00:00.000Z`).getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}

export function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00.000Z`) - Date.parse(`${a}T00:00:00.000Z`)) / 86_400_000);
}

export const dailyNumber = (day: string) => dayDiff(DAILY_EPOCH, day) + 1;

export const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

/* ------------------------------------------------------------------ seeded randomness */

/** FNV-1a 32-bit. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ------------------------------------------------------------------ daily challenge */

export type DailyQuestion = {
  id: string;
  kind: "quiz" | "trial";
  prompt: string;
  options: string[];
  answer: number;
  explain: string;
  source: { label: string; href: string };
};

export type DailySet = { date: string; number: number; seconds: number; questions: DailyQuestion[] };

/** Game score for one question: 100 for a correct answer + 5 per second left (max +100). */
export function dailyQuestionScore(correct: boolean, ms: number): number {
  if (!correct) return 0;
  const left = Math.max(0, DAILY_SECONDS - Math.ceil(ms / 1000));
  return 100 + left * 5;
}

/** Wordle-style share text (no emoji): ■ right, □ wrong. */
export function dailyShare(set: { date: string; number: number }, results: boolean[], score: number, ms: number, url: string): string {
  const right = results.filter(Boolean).length;
  const secs = Math.round(ms / 1000);
  const time = secs >= 60 ? `${Math.floor(secs / 60)}m${String(secs % 60).padStart(2, "0")}s` : `${secs}s`;
  return [`$ sdm daily #${set.number} · ${set.date}`, `${results.map((r) => (r ? "■" : "□")).join("")}  ${right}/${results.length} · ${score} pts · ${time}`, url].join("\n");
}

/* ------------------------------------------------------------------ leaderboard points */

export const POINTS = {
  lesson: 50,
  stage: 5,
  stageCapPerLesson: 12,
  quiz: 3,
  quizCapPerLesson: 10,
  dailyCorrect: 8,
  dailyPerfect: 10,
  dailySpeedMax: 10,
  trialPart: 40,
  review: 10,
  activeDay: 5,
  dayCap: 400,
} as const;

export const POINTS_TABLE: { what: string; pts: string; rule: string }[] = [
  { what: "Lesson completed", pts: `+${POINTS.lesson}`, rule: "once per lesson" },
  { what: "Stage cleared", pts: `+${POINTS.stage}`, rule: `once per stage, up to ${POINTS.stageCapPerLesson} a lesson` },
  { what: "Quick check, first try right", pts: `+${POINTS.quiz}`, rule: `once per question, up to ${POINTS.quizCapPerLesson} a lesson; answer re-checked on the server` },
  { what: "Daily challenge", pts: `+${POINTS.dailyCorrect} each`, rule: `per correct answer (re-checked), +${POINTS.dailyPerfect} for 5/5, up to +${POINTS.dailySpeedMax} for speed; first run of the day only` },
  { what: "Trial part passed", pts: `+${POINTS.trialPart}`, rule: "once per week and part" },
  { what: "Review session", pts: `+${POINTS.review}`, rule: "once a day" },
  { what: "Active day", pts: `+${POINTS.activeDay}`, rule: "a day with course activity on your streak" },
];

/* ------------------------------------------------------------------ leagues */

export type League = { tier: number; code: string; name: string };

export const LEAGUES: League[] = LEVELS.map((l, i) => ({ tier: i, code: l.code, name: l.name }));

export const LEAGUE_RULES = {
  /** share of a league's active players that promote each week (at least one) */
  promoteShare: 0.2,
  /** minimum weekly points to promote */
  promoteMin: 60,
} as const;

/* ------------------------------------------------------------------ API shapes */

export type BoardRow = {
  rank: number;
  name: string;
  points: number;
  tier: number;
  zone: "promote" | null;
  me?: boolean;
  /** daily challenge streak (days) */
  streak?: number;
};

export type Breakdown = Partial<Record<"lesson" | "stage" | "quiz" | "daily" | "trial" | "review" | "active", number>>;

export type BoardMe = {
  name: string;
  tier: number;
  points: number;
  rank: number | null;
  /** rank among everyone this week (all leagues) */
  globalRank: number | null;
  allTime: number;
  breakdown: Breakdown;
  dailyStreak: number;
  dailyToday: boolean;
};

export type BoardResponse = {
  period: "week" | "all";
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  players: number;
  leagues: { tier: number; code: string; name: string; players: number; promote: number }[];
  rows: BoardRow[];
  me: BoardMe | null;
};
