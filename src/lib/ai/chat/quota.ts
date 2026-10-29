import "server-only";
/**
 * The course chat's own quota (the owner's rule, 29 Oct 2026): chat messages don't spend the shared daily AI
 * credits or the other features' per-day limits. Each learner gets `perDay` messages a day on the main model
 * (Sonnet 5.5, admin-editable, default 30), then "fast mode": Claude Haiku 5.5 with its tuned prompt, up to
 * `ceiling` messages a day in all (an anti-abuse limit, admin-editable, default 300). No hard stop before that.
 *
 * Still under the same budget and switches as every AI feature: the master switch and the chat's own switch
 * (the kill switch in /admin/ai and /admin/chat), the monthly budget (off), the governor's red mode (today's
 * share is used: the page keeps its instant results) and amber mode (fast mode for everyone), the block list,
 * 10 calls a minute and the off-topic pause. Every message is one ai_calls row (feature "course-chat"), so
 * spend, latency and refusals show on /admin/ai like any feature; the memory updates are "chat-memory" rows.
 * A learner's own key (BYOK): their cost, Sonnet, no quota.
 */
import { supabase } from "@/lib/supabase";
import { FEATURES } from "@/lib/ai/features";
import { MODELS } from "@/lib/ai/prices";
import { featureConfig, getAiSettings } from "@/lib/ai/settings";
import { getBudget, startOfToday, type Mode } from "@/lib/ai/governor";
import type { ChatQuota } from "./text";

export const CHAT_FEATURES = ["course-chat", "chat-memory"] as const;
const RATE_PER_MIN = 10;
const OFF_TOPIC_PER_DAY = 5;

type Row = { feature: string; model: string; status: string; cost_usd: number | null; byok: boolean | null };

/** Today's chat rows for one learner: messages on the main model, messages in all, and what chat spent. */
export async function chatToday(userId: string): Promise<{ main: number; total: number; spend: number }> {
  const { data, error } = await supabase
    .from("ai_calls")
    .select("feature, model, status, cost_usd, byok")
    .eq("user_id", userId)
    .in("feature", [...CHAT_FEATURES])
    .gte("created_at", startOfToday().toISOString())
    .limit(3000);
  if (error || !data) return { main: 0, total: 0, spend: 0 };
  let main = 0;
  let total = 0;
  let spend = 0;
  for (const r of data as Row[]) {
    const counted = r.status === "ok" || r.status === "off_topic";
    if (!counted || r.byok) continue;
    spend += Number(r.cost_usd) || 0;
    if (r.feature !== "course-chat") continue;
    total++;
    if (!/haiku/.test(r.model)) main++;
  }
  return { main, total, spend };
}

/** What chat spent today for this learner (the shared credits leave it out). Fails soft to 0. */
export async function chatSpendToday(userId: string): Promise<number> {
  return (await chatToday(userId).catch(() => ({ spend: 0 }))).spend;
}

export type Admit =
  | { ok: true; model: string; fast: boolean; quota: ChatQuota; mode: Mode; byok: boolean; apiKey: string }
  | { ok: false; status: "disabled" | "over_quota" | "rate_limited" | "blocked" | "off_topic"; message: string; quota: ChatQuota | null; mode: Mode };

export async function chatLimits() {
  const s = await getAiSettings();
  const cfg = featureConfig(s, "course-chat");
  return { s, cfg, perDay: cfg.perDay, ceiling: cfg.ceiling || FEATURES["course-chat"].ceiling || 300 };
}

/** May this learner send a chat message now, and on which model? */
export async function admitChat(a: { userId: string; admin: boolean; userKey: string | null }): Promise<Admit> {
  const { s, cfg, perDay, ceiling } = await chatLimits();
  const budget = await getBudget(s);
  const byok = !!a.userKey;
  const apiKey = a.userKey || process.env.ANTHROPIC_API_KEY || "";
  const refuse = (status: Extract<Admit, { ok: false }>["status"], message: string, quota: ChatQuota | null = null): Admit => ({ ok: false, status, message, quota, mode: budget.mode });
  if (!apiKey) return refuse("disabled", "AI is not configured");
  const switchedOn = (s.enabled && cfg.enabled) || a.admin || byok;
  if (!switchedOn) return refuse("disabled", "The course chat is switched off right now. The search results still work.");
  if (!byok && budget.mode === "off" && !(budget.reason === "switched off" && a.admin)) return refuse("disabled", "AI is resting: this month's budget is used. The search results still work.");
  if (!byok && budget.mode === "red") return refuse("over_quota", "The chat is resting for today: today's AI budget is used. The search results still work, and the chat is back after midnight UTC.");

  const today = startOfToday().toISOString();
  const [blocked, t, lastMinute, offTopic] = await Promise.all([
    supabase.from("ai_blocks").select("user_id").eq("user_id", a.userId).maybeSingle(),
    chatToday(a.userId),
    supabase.from("ai_calls").select("id", { count: "exact", head: true }).eq("user_id", a.userId).gte("created_at", new Date(Date.now() - 60_000).toISOString()),
    supabase.from("ai_calls").select("id", { count: "exact", head: true }).eq("user_id", a.userId).eq("status", "off_topic").gte("created_at", today),
  ]);
  const fastNow = !byok && (t.main >= perDay || budget.mode === "amber");
  const quota: ChatQuota = { mainLeft: byok ? perDay : Math.max(0, perDay - t.main), mainPerDay: perDay, totalLeft: byok ? ceiling : Math.max(0, ceiling - t.total), fast: fastNow, ownKey: byok };
  if (blocked.data) return refuse("blocked", "AI features are turned off for this account.", quota);
  if ((lastMinute.count ?? 0) >= RATE_PER_MIN) return refuse("rate_limited", "Slow down a little: try again in a minute.", quota);
  if ((offTopic.count ?? 0) >= OFF_TOPIC_PER_DAY) return refuse("off_topic", "AI is paused for you until midnight UTC after several requests outside the course. It's here for system design and this course.", quota);
  if (!byok && t.total >= ceiling) return refuse("over_quota", `You've sent today's ${ceiling} chat messages. The chat is back after midnight UTC; the search results still work.`, quota);
  const model = byok ? cfg.model : fastNow ? FEATURES["course-chat"].amberModel || MODELS.haiku55 : cfg.model;
  return { ok: true, model, fast: /haiku/.test(model), quota, mode: budget.mode, byok, apiKey };
}

/** The quota after one more message on `model`. */
export function afterMessage(q: ChatQuota, model: string): ChatQuota {
  if (q.ownKey) return q;
  const mainLeft = /haiku/.test(model) ? q.mainLeft : Math.max(0, q.mainLeft - 1);
  return { ...q, mainLeft, totalLeft: Math.max(0, q.totalLeft - 1), fast: mainLeft <= 0 || q.fast };
}

/** One metered row in ai_calls (the same columns callClaude writes). */
export async function logChatCall(row: Record<string, unknown>): Promise<number | null> {
  const { data, error } = await supabase.from("ai_calls").insert(row).select("id").single();
  if (error) console.error("[chat] log failed", error.message);
  return (data as { id: number } | null)?.id ?? null;
}
