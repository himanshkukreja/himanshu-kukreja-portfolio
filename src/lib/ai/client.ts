import "server-only";
/**
 * The one way the site calls Claude. Every call, allowed or refused, is written to ai_calls with its
 * tokens, cost, credits, latency and status, so the admin dashboard is the full picture.
 *
 * Learner calls (live features, with a userId) pass, in order: the switch and the feature switch, the
 * governor's mode (off: refuse; red: refuse, the caller shows its cached/static answer; amber: the
 * feature's cheaper model, or refuse if it has none), the block list, a per-user rate limit (10 calls a
 * minute), the feature's calls-per-day, the user's daily allowance, and the input size cap. Content
 * jobs (eval, batch) skip the per-user checks but still count against the monthly budget.
 */
import { supabase } from "@/lib/supabase";
import { costOf, creditsFor, type Usage } from "./prices";
import { FEATURES, type FeatureId } from "./features";
import { featureConfig, getAiSettings } from "./settings";
import { getBudget, startOfToday, type Mode } from "./governor";

const API = "https://api.anthropic.com/v1/messages";
const RATE_PER_MIN = 10;

export type AiMessage = { role: "user" | "assistant"; content: string };
export type AiRequest = {
  feature: FeatureId;
  userId?: string | null;
  /** cached as a prompt prefix when long (lesson text, rubric) */
  system: string;
  messages: AiMessage[];
  /** override the feature's model (evals, admin tests) */
  model?: string;
  maxTokens?: number;
  meta?: Record<string, string | number | boolean | null>;
  /** an admin trying a feature while it is switched off for learners (still metered, still within budget) */
  adminPreview?: boolean;
};
export type AiResult =
  | { ok: true; text: string; model: string; costUsd: number; credits: number; mode: Mode; creditsLeft: number | null; callId: number | null }
  | { ok: false; status: "disabled" | "over_quota" | "rate_limited" | "blocked" | "error" | "too_long"; message: string; mode: Mode; creditsLeft: number | null };

async function log(row: Record<string, unknown>): Promise<number | null> {
  const { data, error } = await supabase.from("ai_calls").insert(row).select("id").single();
  if (error) console.error("[ai] log failed", error.message);
  return (data as { id: number } | null)?.id ?? null;
}

/** Conversation text, kept 30 days for abuse checks (deleted by the ai-transcripts-cleanup cron). */
export async function saveTranscript(callId: number | null, userId: string | null, feature: string, input: string, output: string) {
  if (!callId) return;
  const { error } = await supabase.from("ai_transcripts").insert({ call_id: callId, user_id: userId, feature, input: input.slice(0, 20000), output: output.slice(0, 20000) });
  if (error) console.error("[ai] transcript failed", error.message);
}

/** The user's spend today and the feature's calls today (one query each, both indexed). */
async function userToday(userId: string, feature: FeatureId) {
  const today = startOfToday().toISOString();
  const [spend, featureCalls, lastMinute] = await Promise.all([
    supabase.rpc("ai_spend_v2", { p_from: today, p_live: true, p_user: userId }),
    supabase.from("ai_calls").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("feature", feature).eq("status", "ok").gte("created_at", today),
    supabase.from("ai_calls").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", new Date(Date.now() - 60_000).toISOString()),
  ]);
  return {
    spent: Number((spend.data as { cost?: number }[] | null)?.[0]?.cost ?? 0),
    featureCalls: featureCalls.count ?? 0,
    lastMinute: lastMinute.count ?? 0,
  };
}

export async function isBlocked(userId: string): Promise<boolean> {
  const { data } = await supabase.from("ai_blocks").select("user_id").eq("user_id", userId).maybeSingle();
  return !!data;
}

export async function callClaude(req: AiRequest): Promise<AiResult> {
  const s = await getAiSettings();
  const def = FEATURES[req.feature];
  const cfg = featureConfig(s, req.feature);
  const budget = await getBudget(s);
  const learner = def.live && !!req.userId;
  const base = { user_id: req.userId ?? null, feature: req.feature, meta: req.meta ?? {} };
  let creditsLeft: number | null = null;

  const refuse = async (status: Exclude<AiResult, { ok: true }>["status"], message: string, model = cfg.model): Promise<AiResult> => {
    await log({ ...base, model, status, error: message });
    return { ok: false, status, message, mode: budget.mode, creditsLeft };
  };

  if (!process.env.ANTHROPIC_API_KEY) return refuse("disabled", "AI is not configured");
  // content jobs need the key and budget, not the learner switch; learner features need everything
  const switchedOn = (s.enabled && cfg.enabled) || !!req.adminPreview;
  if (def.live && !switchedOn) return refuse("disabled", "AI is switched off");
  // "off" because the learner switch is off doesn't stop content jobs or an admin preview; a used-up budget or the end date does
  if (budget.mode === "off" && !(budget.reason === "switched off" && (!def.live || req.adminPreview))) return refuse("disabled", budget.reason);
  if (def.live && budget.mode === "red") return refuse("over_quota", "AI is resting for today: the day's share of the budget is used");

  let model = req.model || cfg.model;
  if (def.live && budget.mode === "amber") {
    if (!def.amberModel) return refuse("over_quota", "This feature pauses when the budget runs ahead of pace");
    model = def.amberModel;
  }

  const inputChars = req.messages.reduce((a, m) => a + m.content.length, 0);
  if (inputChars > cfg.maxInputChars) return refuse("too_long", `That's too long (${inputChars.toLocaleString()} characters, the limit is ${cfg.maxInputChars.toLocaleString()})`);

  if (learner) {
    const uid = req.userId!;
    if (await isBlocked(uid)) return refuse("blocked", "AI features are turned off for this account");
    const t = await userToday(uid, req.feature);
    creditsLeft = Math.max(0, Math.floor((budget.userDailyUsd - t.spent) / 0.001));
    if (t.lastMinute >= RATE_PER_MIN) return refuse("rate_limited", "Slow down a little: try again in a minute");
    if (cfg.perDay && t.featureCalls >= cfg.perDay) return refuse("over_quota", `You've used today's ${cfg.perDay} ${def.label.toLowerCase()} calls. They refill at midnight UTC`);
    if (t.spent >= budget.userDailyUsd) return refuse("over_quota", "You've used today's AI credits. They refill at midnight UTC");
  }

  // long system prompts (lesson text, rubrics) are cached: 90% cheaper on every follow-up
  const system = req.system.length > 4000 ? [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }] : req.system;
  const t0 = Date.now();
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: Math.min(req.maxTokens ?? cfg.maxTokens, def.maxTokens), system, messages: req.messages }),
    });
    const latency = Date.now() - t0;
    const requestId = res.headers.get("request-id");
    const body = (await res.json().catch(() => null)) as { content?: { type: string; text?: string }[]; usage?: Usage; error?: { message?: string } } | null;
    if (!res.ok || !body) {
      await log({ ...base, model, status: "error", error: body?.error?.message?.slice(0, 300) || `HTTP ${res.status}`, latency_ms: latency, request_id: requestId });
      return { ok: false, status: "error", message: "The AI didn't answer. Try again in a moment.", mode: budget.mode, creditsLeft };
    }
    const u = body.usage ?? {};
    const cost = costOf(model, u);
    const credits = creditsFor(cost);
    const callId = await log({
      ...base,
      model,
      status: "ok",
      input_tokens: u.input_tokens ?? 0,
      output_tokens: u.output_tokens ?? 0,
      cache_read_tokens: u.cache_read_input_tokens ?? 0,
      cache_write_tokens: u.cache_creation_input_tokens ?? 0,
      cost_usd: cost,
      credits,
      latency_ms: latency,
      request_id: requestId,
    });
    const text = (body.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    return { ok: true, text, model, costUsd: cost, credits, mode: budget.mode, creditsLeft: creditsLeft === null ? null : Math.max(0, creditsLeft - credits), callId };
  } catch (e) {
    await log({ ...base, model, status: "error", error: (e as Error).message.slice(0, 300), latency_ms: Date.now() - t0 });
    return { ok: false, status: "error", message: "The AI didn't answer. Try again in a moment.", mode: budget.mode, creditsLeft };
  }
}
