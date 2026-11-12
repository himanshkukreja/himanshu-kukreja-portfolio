import "server-only";
/**
 * The course chat's own quota (the owner's rule, 29 Oct 2026): chat messages don't spend the shared daily AI
 * credits or the other features' per-day limits. Each learner gets `perDay` messages a day (admin-editable, default
 * 500). Since 7 Nov 2026 (owner's decision) every message is answered by Claude Haiku 5.5 with its tuned prompt: the
 * earlier split (30 Sonnet 5.5 messages, then "fast mode" up to a 300-message ceiling) is gone, so the chat has this
 * one limit, raised from the old ceiling.
 *
 * Still under the same budget and switches as every AI feature: the master switch and the chat's own switch
 * (the kill switch in /admin/ai and /admin/chat), the monthly budget (off), the governor's red mode (today's
 * share is used: the page keeps its instant results) and amber mode (the amber model, Haiku 5.5 too), the block list,
 * 10 calls a minute and the off-topic pause. Every message is one ai_calls row (feature "course-chat"), so
 * spend, latency and refusals show on /admin/ai like any feature; the memory updates are "chat-memory" rows and
 * the conversation titles "chat-title" rows (chat spend, never counted as messages or in the per-minute limit).
 * A learner's own key (BYOK): their cost, the same model, no quota.
 */
import { supabase } from "@/lib/supabase";
import { FEATURES, ROUTING } from "@/lib/ai/features";
import { MODELS } from "@/lib/ai/prices";
import { featureConfig, getAiSettings } from "@/lib/ai/settings";
import { getBudget, startOfToday, type Mode } from "@/lib/ai/governor";
import type { ChatQuota } from "./text";
import type { RouteDecision, RouteReason } from "./route-model";

export const CHAT_FEATURES = ["course-chat", "chat-memory", "chat-title", "dsa-chat", "dsa-tutor"] as const;
/** The chat features whose rows are messages with a daily quota of their own (DSA Mastery's two since 9 Nov 2026). */
export type MessageFeature = "course-chat" | "dsa-chat" | "dsa-tutor";
/** What a refusal calls the chat, and what still works without it. */
const WORDS: Record<MessageFeature, { name: string; noun: string; still: string }> = {
  "course-chat": { name: "The course chat", noun: "chat", still: " The search results still work." },
  "dsa-chat": { name: "The DSA tutor", noun: "DSA tutor", still: "" },
  "dsa-tutor": { name: "The problem tutor", noun: "problem tutor", still: " Run, Submit and the hint ladder still work." },
};
const RATE_PER_MIN = 10;
const OFF_TOPIC_PER_DAY = 5;

type Row = { feature: string; model: string; status: string; cost_usd: number | null; byok: boolean | null };

/** Today's chat rows for one learner: the messages of `feature` counted against its quota, what every chat feature
 *  spent, and the turns routed to Sonnet across the three message features (the routing's daily cap, features.ts ROUTING). */
export async function chatToday(userId: string, feature: MessageFeature = "course-chat"): Promise<{ total: number; spend: number; sonnet: number }> {
  const { data, error } = await supabase
    .from("ai_calls")
    .select("feature, model, status, cost_usd, byok")
    .eq("user_id", userId)
    .in("feature", [...CHAT_FEATURES])
    .gte("created_at", startOfToday().toISOString())
    .limit(3000);
  if (error || !data) return { total: 0, spend: 0, sonnet: 0 };
  let total = 0;
  let spend = 0;
  let sonnet = 0;
  for (const r of data as Row[]) {
    const counted = r.status === "ok" || r.status === "off_topic";
    if (!counted || r.byok) continue;
    spend += Number(r.cost_usd) || 0;
    if (r.model === ROUTING.model && (ROUTING.features as string[]).includes(r.feature)) sonnet++;
    if (r.feature !== feature) continue;
    total++;
  }
  return { total, spend, sonnet };
}

/** What chat spent today for this learner (the shared credits leave it out). Fails soft to 0. */
export async function chatSpendToday(userId: string): Promise<number> {
  return (await chatToday(userId).catch(() => ({ spend: 0 }))).spend;
}

export type Admit =
  | { ok: true; model: string; quota: ChatQuota; mode: Mode; byok: boolean; apiKey: string; route?: RouteNote }
  | { ok: false; status: "disabled" | "over_quota" | "rate_limited" | "blocked" | "off_topic"; message: string; quota: ChatQuota | null; mode: Mode };

export async function chatLimits(feature: MessageFeature = "course-chat") {
  const s = await getAiSettings();
  const cfg = featureConfig(s, feature);
  return { s, cfg, perDay: cfg.perDay || FEATURES[feature].perDay };
}

/** The quota line for a learner who has sent `sent` counted messages today (their own key: no quota). */
export const quotaFor = (perDay: number, sent: number, ownKey: boolean): ChatQuota => ({ left: ownKey ? perDay : Math.max(0, perDay - sent), perDay, ownKey });

/** What the routing did with a turn, for the metering row (ai_calls.meta.route): the classifier's reason, and whether
 *  the turn went to Sonnet or why it stayed (capped: the learner's daily Sonnet turns; mode: not green; override: an admin
 *  model). Never learner text. */
export type RouteNote = { reason: RouteReason; to: "sonnet" | "capped" | "mode" | "override" };

/**
 * May this learner send a chat message now, and on which model? A hard turn (`route`, from lib/ai/chat/route-model.ts)
 * goes to Sonnet 5.5 when the governor is green, the feature is on its default model and the learner has Sonnet turns
 * left today (features.ts ROUTING); otherwise it is answered on the usual model and the note says why.
 */
export async function admitChat(a: { userId: string; admin: boolean; userKey: string | null; feature?: MessageFeature; route?: RouteDecision | null }): Promise<Admit> {
  const feature = a.feature ?? "course-chat";
  const w = WORDS[feature];
  // the course chat keeps its own words exactly
  const sdm = feature === "course-chat";
  const { s, cfg, perDay } = await chatLimits(feature);
  const budget = await getBudget(s);
  const byok = !!a.userKey;
  const apiKey = a.userKey || process.env.ANTHROPIC_API_KEY || "";
  const refuse = (status: Extract<Admit, { ok: false }>["status"], message: string, quota: ChatQuota | null = null): Admit => ({ ok: false, status, message, quota, mode: budget.mode });
  if (!apiKey) return refuse("disabled", "AI is not configured");
  const switchedOn = (s.enabled && cfg.enabled) || a.admin || byok;
  if (!switchedOn) return refuse("disabled", sdm ? "The course chat is switched off right now. The search results still work." : `${w.name} is switched off right now.${w.still}`);
  if (!byok && budget.mode === "off" && !(budget.reason === "switched off" && a.admin)) return refuse("disabled", sdm ? "AI is resting: this month's budget is used. The search results still work." : `AI is resting: this month's budget is used.${w.still}`);
  if (!byok && budget.mode === "red") return refuse("over_quota", sdm ? "The chat is resting for today: today's AI budget is used. The search results still work, and the chat is back after midnight UTC." : `${w.name} is resting for today: today's AI budget is used.${w.still} It is back after midnight UTC.`);

  const today = startOfToday().toISOString();
  const [blocked, t, lastMinute, offTopic] = await Promise.all([
    supabase.from("ai_blocks").select("user_id").eq("user_id", a.userId).maybeSingle(),
    chatToday(a.userId, feature),
    // a conversation's title call rides along with its first message, dictation polish with the learner's typing:
    // not requests of their own
    supabase.from("ai_calls").select("id", { count: "exact", head: true }).eq("user_id", a.userId).not("feature", "in", "(chat-title,dictation-polish)").gte("created_at", new Date(Date.now() - 60_000).toISOString()),
    supabase.from("ai_calls").select("id", { count: "exact", head: true }).eq("user_id", a.userId).eq("status", "off_topic").gte("created_at", today),
  ]);
  const quota = quotaFor(perDay, t.total, byok);
  if (blocked.data) return refuse("blocked", "AI features are turned off for this account.", quota);
  if ((lastMinute.count ?? 0) >= RATE_PER_MIN) return refuse("rate_limited", "Slow down a little: try again in a minute.", quota);
  if ((offTopic.count ?? 0) >= OFF_TOPIC_PER_DAY) return refuse("off_topic", "AI is paused for you until midnight UTC after several requests outside the course. It's here for system design and this course.", quota);
  if (!byok && t.total >= perDay) return refuse("over_quota", sdm ? `You've sent today's ${perDay} chat messages. The chat is back after midnight UTC; the search results still work.` : `You've sent today's ${perDay} ${w.noun} messages. They refill after midnight UTC.${w.still}`, quota);
  // amber mode: the amber model (Haiku 5.5, the chat's model too); an admin's model override applies otherwise
  let model = !byok && budget.mode === "amber" ? FEATURES[feature].amberModel || MODELS.haiku55 : cfg.model;
  let route: RouteNote | undefined;
  if (a.route?.hard && a.route.reason && ROUTING.features.includes(feature)) {
    const reason = a.route.reason;
    if (cfg.model !== FEATURES[feature].model) route = { reason, to: "override" };
    else if (!byok && budget.mode !== "green") route = { reason, to: "mode" };
    else if (!byok && t.sonnet >= ROUTING.perUserDay) route = { reason, to: "capped" };
    else {
      model = ROUTING.model;
      route = { reason, to: "sonnet" };
    }
  }
  return { ok: true, model, quota, mode: budget.mode, byok, apiKey, ...(route ? { route } : {}) };
}

/** The quota after one more message. */
export function afterMessage(q: ChatQuota): ChatQuota {
  return q.ownKey ? q : { ...q, left: Math.max(0, q.left - 1) };
}

/** One metered row in ai_calls (the same columns callClaude writes). */
export async function logChatCall(row: Record<string, unknown>): Promise<number | null> {
  const { data, error } = await supabase.from("ai_calls").insert(row).select("id").single();
  if (error) console.error("[chat] log failed", error.message);
  return (data as { id: number } | null)?.id ?? null;
}
