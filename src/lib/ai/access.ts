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
import { dailyAllowanceUsd } from "./limits";
import { chatLimits, chatToday } from "./chat/quota";
import type { ChatQuota } from "./chat/text";

export type AiStatus = {
  /** any AI feature usable by this person right now */
  available: boolean;
  /** true when only an admin preview keeps it available */
  preview: boolean;
  signedIn: boolean;
  mode: Mode;
  features: Partial<Record<FeatureId, boolean>>;
  /** the shared daily credits (every AI feature but the course chat) */
  creditsLeft: number | null;
  creditsPerDay: number;
  /** the course chat's own quota (messages, never credits; chat/quota.ts), for a signed-in learner */
  chat: ChatQuota | null;
  /** answering with the learner's own key */
  ownKey: boolean;
};

export const isAdminEmail = (email: string | null | undefined) => !!email && adminEmails().includes(email.toLowerCase());

export async function aiStatus(user: { id: string; email: string | null } | null, ownKey = false): Promise<AiStatus> {
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
    // with their own key a signed-in learner can use every feature, whatever the switch or budget says
    features[id] = (ownKey && !!user) || (usable && on && !(b.mode === "amber" && !FEATURES[id].amberModel));
  }
  let creditsLeft: number | null = null;
  let creditsPerDay = b.userDailyCredits;
  let chat: ChatQuota | null = null;
  if (user) {
    const [{ data }, allowance, today, limits] = await Promise.all([
      supabase.rpc("ai_spend_v2", { p_from: startOfToday().toISOString(), p_live: true, p_user: user.id }),
      dailyAllowanceUsd(user.id, b.userDailyUsd),
      // the course chat has its own quota (messages), outside the shared credits: its spend is taken back out
      chatToday(user.id).catch(() => ({ main: 0, total: 0, spend: 0 })),
      chatLimits(),
    ]);
    const spent = Math.max(0, Number((data as { cost?: number }[] | null)?.[0]?.cost ?? 0) - today.spend);
    creditsLeft = Math.max(0, Math.floor((allowance.usd - spent) / USD_PER_CREDIT));
    creditsPerDay = Math.floor(allowance.usd / USD_PER_CREDIT);
    // the same numbers as the chat's own header line (GET /api/learn/ai/chat)
    chat = {
      mainLeft: ownKey ? limits.perDay : Math.max(0, limits.perDay - today.main),
      mainPerDay: limits.perDay,
      totalLeft: ownKey ? limits.ceiling : Math.max(0, limits.ceiling - today.total),
      fast: !ownKey && today.main >= limits.perDay,
      ownKey,
    };
  }
  const available = Object.values(features).some(Boolean);
  return { available, preview: available && !s.enabled && admin && !ownKey, signedIn: !!user, mode: b.mode, features, creditsLeft, creditsPerDay, chat, ownKey: ownKey && !!user };
}
