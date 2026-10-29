import "server-only";
/** The ai_settings row (the switch, budget, cycle, per-feature overrides), cached 20 s per instance. */
import { supabase } from "@/lib/supabase";
import { FEATURES, type FeatureId } from "./features";

export type FeatureOverride = { enabled?: boolean; model?: string; perDay?: number; ceiling?: number };
export type AiSettings = {
  enabled: boolean;
  cycleDay: number;
  monthlyBudgetUsd: number;
  liveShare: number;
  userDailyMaxUsd: number;
  userDailyMinUsd: number;
  endsOn: string | null;
  features: Partial<Record<FeatureId, FeatureOverride>>;
  note: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

const DEFAULTS: AiSettings = {
  enabled: false,
  cycleDay: 13,
  monthlyBudgetUsd: 450,
  liveShare: 0.7,
  userDailyMaxUsd: 0.5,
  userDailyMinUsd: 0.01,
  endsOn: null,
  features: {},
  note: null,
  updatedAt: null,
  updatedBy: null,
};

let cache: { at: number; s: AiSettings } | null = null;

export async function getAiSettings(fresh = false): Promise<AiSettings> {
  if (!fresh && cache && Date.now() - cache.at < 20_000) return cache.s;
  const { data, error } = await supabase.from("ai_settings").select("*").eq("id", 1).maybeSingle();
  if (error || !data) return DEFAULTS; // fail closed: enabled=false
  const s: AiSettings = {
    enabled: !!data.enabled,
    cycleDay: Number(data.cycle_day) || 13,
    monthlyBudgetUsd: Number(data.monthly_budget_usd) || 0,
    liveShare: Number(data.live_share) || 0,
    userDailyMaxUsd: Number(data.user_daily_max_usd) || 0,
    userDailyMinUsd: Number(data.user_daily_min_usd) || 0,
    endsOn: data.ends_on ?? null,
    features: (data.features as AiSettings["features"]) || {},
    note: data.note ?? null,
    updatedAt: data.updated_at ?? null,
    updatedBy: data.updated_by ?? null,
  };
  cache = { at: Date.now(), s };
  return s;
}

export async function saveAiSettings(patch: Partial<AiSettings>, by: string): Promise<AiSettings> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: by };
  if (patch.enabled !== undefined) row.enabled = !!patch.enabled;
  if (patch.cycleDay !== undefined) row.cycle_day = Math.min(28, Math.max(1, Math.round(patch.cycleDay)));
  if (patch.monthlyBudgetUsd !== undefined) row.monthly_budget_usd = Math.max(0, patch.monthlyBudgetUsd);
  if (patch.liveShare !== undefined) row.live_share = Math.min(1, Math.max(0, patch.liveShare));
  if (patch.userDailyMaxUsd !== undefined) row.user_daily_max_usd = Math.max(0, patch.userDailyMaxUsd);
  if (patch.userDailyMinUsd !== undefined) row.user_daily_min_usd = Math.max(0, patch.userDailyMinUsd);
  if (patch.endsOn !== undefined) row.ends_on = patch.endsOn || null;
  if (patch.note !== undefined) row.note = patch.note;
  if (patch.features !== undefined) {
    const clean: AiSettings["features"] = {};
    for (const [k, v] of Object.entries(patch.features)) {
      if (!(k in FEATURES) || !v) continue;
      clean[k as FeatureId] = {
        ...(v.enabled !== undefined ? { enabled: !!v.enabled } : {}),
        ...(typeof v.model === "string" && v.model ? { model: v.model } : {}),
        ...(Number.isFinite(v.perDay) ? { perDay: Math.max(0, Math.round(v.perDay!)) } : {}),
        ...(Number.isFinite(v.ceiling) ? { ceiling: Math.max(0, Math.round(v.ceiling!)) } : {}),
      };
    }
    row.features = clean;
  }
  const { error } = await supabase.from("ai_settings").update(row).eq("id", 1);
  if (error) throw new Error(error.message);
  cache = null;
  return getAiSettings(true);
}

/** The model and limits a feature runs with right now (settings override the defaults). */
export function featureConfig(s: AiSettings, id: FeatureId) {
  const d = FEATURES[id];
  const o = s.features[id] || {};
  return { ...d, enabled: o.enabled ?? true, model: o.model || d.model, perDay: o.perDay ?? d.perDay, ceiling: o.ceiling ?? d.ceiling ?? 0 };
}
