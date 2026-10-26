import "server-only";
/**
 * Per-learner AI allowance (table ai_user_limits): an admin can give one account its own daily
 * credits, more or fewer than the shared allowance the budget governor computes (governor.ts). The
 * monthly budget and its modes still apply to everyone; this only replaces the per-user daily cap.
 * 1 credit = USD_PER_CREDIT. Read through a 30 s cache; fails soft (no table → no custom limits).
 */
import { supabase } from "@/lib/supabase";
import { USD_PER_CREDIT } from "./prices";

export type UserLimit = { userId: string; dailyCredits: number; note: string | null; updatedAt: string; updatedBy: string | null };

let cache: { at: number; map: Map<string, UserLimit> } | null = null;

export async function userLimits(fresh = false): Promise<Map<string, UserLimit>> {
  if (!fresh && cache && Date.now() - cache.at < 30_000) return cache.map;
  const { data, error } = await supabase.from("ai_user_limits").select("user_id, daily_credits, note, updated_at, updated_by");
  const map = new Map<string, UserLimit>();
  if (!error)
    for (const r of data || [])
      map.set(r.user_id as string, { userId: r.user_id as string, dailyCredits: Number(r.daily_credits) || 0, note: (r.note as string) || null, updatedAt: r.updated_at as string, updatedBy: (r.updated_by as string) || null });
  cache = { at: Date.now(), map };
  return map;
}

export function invalidateUserLimits() {
  cache = null;
}

/** Today's allowance for one learner, in USD: their custom limit if they have one, else the shared one. */
export async function dailyAllowanceUsd(userId: string, sharedUsd: number): Promise<{ usd: number; custom: boolean }> {
  const l = (await userLimits()).get(userId);
  return l ? { usd: l.dailyCredits * USD_PER_CREDIT, custom: true } : { usd: sharedUsd, custom: false };
}
