/**
 * DSA Mastery's daily problem (pure: the server picks it, the browser counts the streak).
 *
 * One problem per Asia/Kolkata day, the same for everyone, like SD Mastery's daily challenge
 * (src/lib/learn/arena/daily.ts): rendezvous hashing over the released problem bank (Easy and Medium while the bank has
 * enough of them), in two-week blocks that never repeat a problem (pickDaily), so a content drop rarely moves a day.
 *
 * Solving it (an Accepted submit in the problem room, that IST day) awards the game key `dsa:daily:<day>`, synced to the
 * account like every other quest key. The DSA daily streak is the run of consecutive days holding that key. It is its
 * own streak; every solve also counts toward the overall learning streak (record_learning_activity), as before.
 */
import { addDays, dayDiff, hash32 } from "@/lib/learn/arena/shared";
import { DSA_XP, type DsaLevel } from "./types";

/** Day 1 of the DSA daily problem. */
export const DSA_DAILY_EPOCH = "2026-11-09";
/** XP for the day's solve (on top of the problem's own XP, which is awarded once per problem). */
export const DSA_DAILY_XP = DSA_XP.daily;
/** The draw runs in blocks of this many days: no problem repeats inside a block, and neighbouring blocks draw from
 *  the two halves of the bank, so a problem comes back after two weeks at the earliest. */
export const DSA_DAILY_BLOCK = 14;

export const dsaDailyKey = (day: string) => `dsa:daily:${day}`;
export const dsaDailyNumber = (day: string) => dayDiff(DSA_DAILY_EPOCH, day) + 1;

type Candidate = { id: string; level: DsaLevel };

/** Easy and Medium problems, while there are at least 7 of them; else the whole bank. */
export function dailyPool(bank: Candidate[]): string[] {
  const gentle = bank.filter((p) => p.level !== "hard");
  return (gentle.length >= 7 ? gentle : bank).map((p) => p.id).sort();
}

function rawPick(day: string, ids: string[]): string | null {
  let best: string | null = null;
  let bestH = Infinity;
  for (const id of ids) {
    const h = hash32(`dsa-daily|${day}|${id}`);
    if (h < bestH) {
      bestH = h;
      best = id;
    }
  }
  return best;
}

/**
 * The day's problem id, or null when the bank is empty. Blocks of DSA_DAILY_BLOCK days from the epoch: even blocks draw
 * from one half of the bank (split by a fixed hash of the id), odd blocks from the other, and inside a block each day
 * takes the lowest hash(day | id) among the half's problems not drawn earlier in that block. A problem added to the
 * bank can only change days of its own half's blocks, from the day it would win.
 */
export function pickDaily(day: string, bank: Candidate[]): string | null {
  const ids = dailyPool(bank);
  if (!ids.length) return null;
  const idx = dayDiff(DSA_DAILY_EPOCH, day);
  const block = Math.floor(idx / DSA_DAILY_BLOCK);
  const half = ids.filter((id) => (hash32(`dsa-daily-half|${id}`) & 1) === (block & 1));
  const from = half.length ? half : ids;
  const used = new Set<string>();
  let pick: string | null = null;
  for (let i = block * DSA_DAILY_BLOCK; i <= idx; i++) {
    const free = from.filter((id) => !used.has(id));
    pick = rawPick(addDays(DSA_DAILY_EPOCH, i), free.length ? free : from);
    if (pick) used.add(pick);
  }
  return pick;
}

/** Days (YYYY-MM-DD) with a daily solve, from game_done keys. */
export function dailyDaysOf(done: Record<string, number> | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const k of Object.keys(done || {})) if (k.startsWith("dsa:daily:")) out.add(k.slice(10));
  return out;
}

/** Current run (ending today, or yesterday while today is still open), best run, and whether today is solved. */
export function dailyStreakOf(days: Set<string>, today: string): { current: number; best: number; today: boolean } {
  let d = days.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (days.has(d)) {
    current++;
    d = addDays(d, -1);
  }
  let best = 0;
  let run = 0;
  let prev = "";
  [...days].sort().forEach((x) => {
    run = prev && addDays(prev, 1) === x ? run + 1 : 1;
    best = Math.max(best, run);
    prev = x;
  });
  return { current, best: Math.max(best, current), today: days.has(today) };
}

/** What /api/dsa/daily answers. */
export type DsaDailyProblem = { id: string; title: string; level: DsaLevel; concept: string; conceptTitle: string; patterns: string[]; minutes: number | null; line: string };
export type DsaDailyDay = { date: string; number: number; problem: DsaDailyProblem };
export type DsaDailyResponse = { today: string; daily: DsaDailyDay | null; recent: DsaDailyDay[] };
