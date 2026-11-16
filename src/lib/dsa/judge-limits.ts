import "server-only";
import { supabase } from "@/lib/supabase";
import { isMissing } from "@/app/api/learn/_lib/auth";
import { RateLimiter } from "@/lib/design-week/core";

/**
 * The server judge's limits per learner, shared by problem runs (/api/dsa/judge) and Playground programs
 * (/api/dsa/program), so both draw on one allowance: 8 runs a minute (per isolate) and 300 a day (the judge_usage table
 * and dsa_judge_hit() from supabase/migrations/20261109_dsa_platform.sql when applied, else a per-isolate count).
 */
export const JUDGE_PER_MINUTE = 8;
export const JUDGE_DAILY_CAP = 300;
export const JUDGE_MAX_CODE = 64 * 1024;

export const judgeMinute = new RateLimiter(JUDGE_PER_MINUTE, 60_000);
const localDaily = new Map<string, { day: string; n: number }>();

/** One judge run against today's cap: the table when the migration is applied, else this isolate's count. */
export async function underDailyCap(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("dsa_judge_hit", { p_user: userId, p_cap: JUDGE_DAILY_CAP });
    if (!error && typeof data === "number") return data >= 0;
    if (error && !isMissing(error) && !/function .* does not exist|Could not find the function/i.test(error.message || "")) console.warn("[dsa-judge] usage:", error.message);
  } catch {
    /* fall through to the local count */
  }
  const day = new Date().toISOString().slice(0, 10);
  const cur = localDaily.get(userId);
  const n = cur && cur.day === day ? cur.n + 1 : 1;
  localDaily.set(userId, { day, n });
  if (localDaily.size > 10_000) for (const [k, v] of localDaily) if (v.day !== day) localDaily.delete(k);
  return n <= JUDGE_DAILY_CAP;
}
