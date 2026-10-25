import "server-only";
/**
 * Who may use AI right now, and how much they have left today. Learners need the master switch and the
 * feature switch on; admins may preview a feature while it is off for learners (still metered).
 */
import { adminEmails } from "@/lib/admin/auth";
import { supabase } from "@/lib/supabase";
import { FEATURE_IDS, FEATURES, type FeatureId } from "./features";
import { featureConfig, getAiSettings } from "./settings";
import { getBudget, startOfToday, type Mode } from "./governor";
import { USD_PER_CREDIT } from "./prices";

export type AiStatus = {
  /** any AI feature usable by this person right now */
  available: boolean;
  /** true when only an admin preview keeps it available */
  preview: boolean;
  signedIn: boolean;
  mode: Mode;
  features: Partial<Record<FeatureId, boolean>>;
  creditsLeft: number | null;
  creditsPerDay: number;
};

export const isAdminEmail = (email: string | null | undefined) => !!email && adminEmails().includes(email.toLowerCase());

export async function aiStatus(user: { id: string; email: string | null } | null): Promise<AiStatus> {
  const s = await getAiSettings();
  const b = await getBudget(s);
  const admin = isAdminEmail(user?.email);
  const keyed = !!process.env.ANTHROPIC_API_KEY;
  const usable = keyed && !(b.mode === "off" && !(b.reason === "switched off" && admin)) && b.mode !== "red";
  const features: AiStatus["features"] = {};
  for (const id of FEATURE_IDS) {
    if (!FEATURES[id].live) continue;
    const cfg = featureConfig(s, id);
    const on = (s.enabled && cfg.enabled) || admin;
    features[id] = usable && on && !(b.mode === "amber" && !FEATURES[id].amberModel);
  }
  let creditsLeft: number | null = null;
  if (user) {
    const { data } = await supabase.rpc("ai_spend_v2", { p_from: startOfToday().toISOString(), p_live: true, p_user: user.id });
    const spent = Number((data as { cost?: number }[] | null)?.[0]?.cost ?? 0);
    creditsLeft = Math.max(0, Math.floor((b.userDailyUsd - spent) / USD_PER_CREDIT));
  }
  const available = Object.values(features).some(Boolean);
  return { available, preview: available && !s.enabled && admin, signedIn: !!user, mode: b.mode, features, creditsLeft, creditsPerDay: b.userDailyCredits };
}
