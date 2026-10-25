import "server-only";
/**
 * The budget governor. The month is the credit cycle (from ai_settings.cycle_day). Live features may
 * spend `liveShare` of the monthly budget; each day may spend what is left divided by the days left.
 * Mode: off (switch off, past ends_on, or the live budget is gone) · red (today's share used, or < 5%
 * of the live budget left: cached answers only) · amber (70% of today's share used: cheaper model,
 * features without a cheaper model pause) · green. Each user's daily allowance is today's budget
 * shared across last week's AI users, between the floor and the ceiling from settings.
 */
import { supabase } from "@/lib/supabase";
import { USD_PER_CREDIT } from "./prices";
import type { AiSettings } from "./settings";

export type Mode = "green" | "amber" | "red" | "off";
const DAY = 86_400_000;

export function cycleWindow(now: Date, cycleDay: number): { start: Date; end: Date } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  let start = new Date(Date.UTC(y, m, cycleDay));
  if (start > now) start = new Date(Date.UTC(y, m - 1, cycleDay));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, cycleDay));
  return { start, end };
}

const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

type Sums = { cycleAll: number; cycleLive: number; todayLive: number; activeUsers: number };

async function sums(start: Date, today: Date): Promise<Sums> {
  const [all, live, td, users] = await Promise.all([
    supabase.rpc("ai_spend_v2", { p_from: start.toISOString(), p_live: null, p_user: null }),
    supabase.rpc("ai_spend_v2", { p_from: start.toISOString(), p_live: true, p_user: null }),
    supabase.rpc("ai_spend_v2", { p_from: today.toISOString(), p_live: true, p_user: null }),
    supabase.rpc("ai_active_users", { p_from: new Date(Date.now() - 7 * DAY).toISOString() }),
  ]);
  const n = (r: { data: unknown }) => Number((r.data as { cost?: number }[] | null)?.[0]?.cost ?? 0);
  return { cycleAll: n(all), cycleLive: n(live), todayLive: n(td), activeUsers: Math.max(1, Number(users.data ?? 0)) };
}

export type Budget = {
  mode: Mode;
  reason: string;
  cycle: { start: string; end: string; daysLeft: number };
  monthlyBudget: number;
  liveBudget: number;
  spentCycle: number;
  spentCycleLive: number;
  spentToday: number;
  todayBudget: number;
  activeUsers: number;
  userDailyUsd: number;
  userDailyCredits: number;
};

let cache: { at: number; key: string; b: Budget } | null = null;

export async function getBudget(s: AiSettings, fresh = false): Promise<Budget> {
  const key = JSON.stringify([s.enabled, s.cycleDay, s.monthlyBudgetUsd, s.liveShare, s.userDailyMaxUsd, s.userDailyMinUsd, s.endsOn]);
  if (!fresh && cache && cache.key === key && Date.now() - cache.at < 15_000) return cache.b;
  const now = new Date();
  const { start, end } = cycleWindow(now, s.cycleDay);
  const today = startOfUtcDay(now);
  const x = await sums(start, today);
  const daysLeft = Math.max(1, Math.ceil((end.getTime() - today.getTime()) / DAY));
  const liveBudget = s.monthlyBudgetUsd * s.liveShare;
  const leftBeforeToday = Math.max(0, liveBudget - (x.cycleLive - x.todayLive));
  const todayBudget = leftBeforeToday / daysLeft;
  const userDailyUsd = Math.min(s.userDailyMaxUsd, Math.max(s.userDailyMinUsd, (todayBudget * 0.8) / x.activeUsers));

  let mode: Mode = "green";
  let reason = "spending on pace";
  if (!s.enabled) [mode, reason] = ["off", "switched off"];
  else if (s.endsOn && now.toISOString().slice(0, 10) > s.endsOn) [mode, reason] = ["off", `credits ended ${s.endsOn}`];
  else if (x.cycleAll >= s.monthlyBudgetUsd || x.cycleLive >= liveBudget) [mode, reason] = ["off", "this month's budget is used"];
  else if (x.todayLive >= todayBudget || liveBudget - x.cycleLive < liveBudget * 0.05) [mode, reason] = ["red", "today's share is used"];
  else if (x.todayLive >= todayBudget * 0.7) [mode, reason] = ["amber", "spending ahead of pace"];

  const b: Budget = {
    mode,
    reason,
    cycle: { start: start.toISOString(), end: end.toISOString(), daysLeft },
    monthlyBudget: s.monthlyBudgetUsd,
    liveBudget,
    spentCycle: x.cycleAll,
    spentCycleLive: x.cycleLive,
    spentToday: x.todayLive,
    todayBudget,
    activeUsers: x.activeUsers,
    userDailyUsd,
    userDailyCredits: Math.floor(userDailyUsd / USD_PER_CREDIT),
  };
  cache = { at: Date.now(), key, b };
  return b;
}

export const startOfToday = () => startOfUtcDay(new Date());
