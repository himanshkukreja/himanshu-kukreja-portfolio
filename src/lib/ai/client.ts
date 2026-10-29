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
import { answerTokens, FEATURES, type FeatureId } from "./features";
import { featureConfig, getAiSettings } from "./settings";
import { getBudget, startOfToday, type Mode } from "./governor";
import { dailyAllowanceUsd } from "./limits";
import { chatSpendToday } from "./chat/quota";

const API = "https://api.anthropic.com/v1/messages";
const RATE_PER_MIN = 10;
/** Sonnet/Opus 5.x think before answering by default, and thinking counts against max_tokens:
 *  thinking features get this much room on top of their answer cap so the answer isn't cut off */
const THINK_HEADROOM = 3000;

/** an answer that hit max_tokens: keep it up to its last complete sentence */
function trimCutOff(text: string): string {
  const t = text.trimEnd();
  const m = t.match(/^[\s\S]*[.!?)\]`](?=\s|$)/);
  return m && m[0].length > t.length * 0.4 ? m[0] : `${t}…`;
}

export type AiMessage = { role: "user" | "assistant"; content: string };
export type AiRequest = {
  feature: FeatureId;
  userId?: string | null;
  /** cached as a prompt prefix when long (lesson text, rubric). A function gets the model actually
   *  used (after admin settings and amber mode), for prompts tuned per model. */
  system: string | ((model: string) => string);
  messages: AiMessage[];
  /** override the feature's model (evals, admin tests) */
  model?: string;
  maxTokens?: number;
  meta?: Record<string, string | number | boolean | null>;
  /** evals: think (or not) the way the live feature does, so the eval measures what learners get */
  think?: boolean;
  /** an admin trying a feature while it is switched off for learners (still metered, still within budget) */
  adminPreview?: boolean;
  /** the learner's own Anthropic key (bring your own key): their cost, so no budget or daily limits; never stored */
  userKey?: string | null;
  /** give up after this long (logged as an error; the caller shows its non-AI fallback) */
  timeoutMs?: number;
  /** the call rides on a request its caller already admitted under its own limits (a course-chat title, made with an
   *  admitted message): the block list, the per-minute rate, the off-topic pause and the shared daily credits were
   *  checked there; the switches, the budget, the governor and the feature's calls-per-day still apply */
  admitted?: boolean;
};

/** A plausible Anthropic key from the x-anthropic-key header, or null. */
export function ownKey(request: Request): string | null {
  const k = (request.headers.get("x-anthropic-key") || "").trim();
  return /^sk-ant-[A-Za-z0-9_-]{20,200}$/.test(k) ? k : null;
}
export type AiResult =
  | { ok: true; text: string; model: string; costUsd: number; credits: number; mode: Mode; creditsLeft: number | null; callId: number | null }
  | { ok: false; status: "disabled" | "over_quota" | "rate_limited" | "blocked" | "error" | "too_long" | "off_topic"; message: string; mode: Mode; creditsLeft: number | null };

/** What a learner sees when a request is outside the course's scope (the model answered OFF_TOPIC). */
export const OFF_TOPIC_MESSAGE = "I can only help with system design and this course. Ask about the lesson, your code, the interview or the design.";
/** Off-topic requests a learner may make in a day before AI pauses for them until midnight UTC. */
const OFF_TOPIC_PER_DAY = 5;

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
  const [spend, chatSpend, featureCalls, lastMinute, offTopic] = await Promise.all([
    supabase.rpc("ai_spend_v2", { p_from: today, p_live: true, p_user: userId }),
    // the course chat has its own quota: what it spent doesn't come out of the shared daily credits
    chatSpendToday(userId),
    supabase.from("ai_calls").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("feature", feature).eq("status", "ok").gte("created_at", today),
    supabase.from("ai_calls").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", new Date(Date.now() - 60_000).toISOString()),
    supabase.from("ai_calls").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "off_topic").gte("created_at", today),
  ]);
  return {
    spent: Math.max(0, Number((spend.data as { cost?: number }[] | null)?.[0]?.cost ?? 0) - chatSpend),
    featureCalls: featureCalls.count ?? 0,
    lastMinute: lastMinute.count ?? 0,
    offTopic: offTopic.count ?? 0,
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
  const byok = !!req.userKey;
  const base = { user_id: req.userId ?? null, feature: req.feature, meta: req.meta ?? {}, byok };
  let creditsLeft: number | null = null;

  const refuse = async (status: Exclude<AiResult, { ok: true }>["status"], message: string, model = cfg.model): Promise<AiResult> => {
    await log({ ...base, model, status, error: message });
    return { ok: false, status, message, mode: budget.mode, creditsLeft };
  };

  const apiKey = req.userKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return refuse("disabled", "AI is not configured");
  // content jobs need the key and budget, not the learner switch; learner features need everything
  const switchedOn = (s.enabled && cfg.enabled) || !!req.adminPreview || byok;
  if (def.live && !switchedOn) return refuse("disabled", "AI is switched off");
  // "off" because the learner switch is off doesn't stop content jobs or an admin preview; a used-up budget or the end date does
  if (!byok && budget.mode === "off" && !(budget.reason === "switched off" && (!def.live || req.adminPreview))) return refuse("disabled", budget.reason);
  if (!byok && def.live && budget.mode === "red") return refuse("over_quota", "AI is resting for today: the day's share of the budget is used");

  let model = req.model || cfg.model;
  if (!byok && def.live && budget.mode === "amber") {
    if (!def.amberModel) return refuse("over_quota", "This feature pauses when the budget runs ahead of pace");
    model = def.amberModel;
  }

  const inputChars = req.messages.reduce((a, m) => a + m.content.length, 0);
  if (inputChars > cfg.maxInputChars) return refuse("too_long", `That's too long (${inputChars.toLocaleString()} characters, the limit is ${cfg.maxInputChars.toLocaleString()})`);

  if (learner) {
    const uid = req.userId!;
    if (!req.admitted && (await isBlocked(uid))) return refuse("blocked", "AI features are turned off for this account");
    const t = await userToday(uid, req.feature);
    // an admin may have set this learner's own daily allowance (ai_user_limits)
    const allowance = (await dailyAllowanceUsd(uid, budget.userDailyUsd)).usd;
    creditsLeft = Math.max(0, Math.floor((allowance - t.spent) / 0.001));
    if (!req.admitted && t.lastMinute >= RATE_PER_MIN) return refuse("rate_limited", "Slow down a little: try again in a minute");
    if (!req.admitted && t.offTopic >= OFF_TOPIC_PER_DAY) return refuse("off_topic", "AI is paused for you until midnight UTC after several requests outside the course. It's here for system design and this course.");
    if (!byok && cfg.perDay && t.featureCalls >= cfg.perDay) return refuse("over_quota", `You've used today's ${cfg.perDay} ${def.label.toLowerCase()} calls. They refill at midnight UTC, or add your own key under You → AI`);
    if (!req.admitted && !byok && t.spent >= allowance) return refuse("over_quota", "You've used today's AI credits. They refill at midnight UTC, or add your own key under You → AI");
  }

  // long system prompts (lesson text, rubrics) are cached: 90% cheaper on every follow-up
  const prompt = typeof req.system === "function" ? req.system(model) : req.system;
  const system = prompt.length > 4000 ? [{ type: "text", text: prompt, cache_control: { type: "ephemeral" } }] : prompt;
  // Haiku doesn't think (Haiku 5.5 thinks by default, so it is told not to); Sonnet 5.x can be told not to;
  // others (Opus) always may, so they get the room
  const haiku = /haiku/.test(model);
  const canSkip = /sonnet-5/.test(model);
  const thinks = !haiku && ((req.think ?? def.think) || !canSkip);
  const thinkingOff = thinks ? null : canSkip ? { type: "between_tools" } : haiku ? { type: "disabled" } : null;
  const answerCap = Math.min(req.maxTokens ?? answerTokens(req.feature, model), answerTokens(req.feature, model));
  const maxTokens = thinks ? answerCap + THINK_HEADROOM : answerCap;
  const t0 = Date.now();
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: maxTokens, ...(thinkingOff ? { thinking: thinkingOff } : {}), system, messages: req.messages }),
      ...(req.timeoutMs ? { signal: AbortSignal.timeout(req.timeoutMs) } : {}),
    });
    const latency = Date.now() - t0;
    const requestId = res.headers.get("request-id");
    const body = (await res.json().catch(() => null)) as { content?: { type: string; text?: string }[]; usage?: Usage; stop_reason?: string; error?: { message?: string } } | null;
    if (!res.ok || !body) {
      await log({ ...base, model, status: "error", error: body?.error?.message?.slice(0, 300) || `HTTP ${res.status}`, latency_ms: latency, request_id: requestId });
      const badKey = byok && (res.status === 401 || res.status === 403);
      return { ok: false, status: "error", message: badKey ? "Your Anthropic key was refused. Check it under You → AI." : "The AI didn't answer. Try again in a moment.", mode: budget.mode, creditsLeft };
    }
    const u = body.usage ?? {};
    const cost = costOf(model, u);
    const credits = creditsFor(cost);
    const raw = (body.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    // a tuned prompt's private plan line may come first (see stripPrivatePlan)
    const offTopic = /^\s*(<plan>[\s\S]*?<\/plan>\s*)?OFF_TOPIC\b/.test(raw);
    const callId = await log({
      ...base,
      model,
      status: offTopic ? "off_topic" : "ok",
      input_tokens: u.input_tokens ?? 0,
      output_tokens: u.output_tokens ?? 0,
      cache_read_tokens: u.cache_read_input_tokens ?? 0,
      cache_write_tokens: u.cache_creation_input_tokens ?? 0,
      cost_usd: cost,
      credits,
      latency_ms: latency,
      request_id: requestId,
    });
    if (offTopic) return { ok: false, status: "off_topic", message: OFF_TOPIC_MESSAGE, mode: budget.mode, creditsLeft };
    const text = body.stop_reason === "max_tokens" ? trimCutOff(raw) : raw;
    return { ok: true, text, model, costUsd: cost, credits, mode: budget.mode, creditsLeft: creditsLeft === null ? null : Math.max(0, creditsLeft - credits), callId };
  } catch (e) {
    await log({ ...base, model, status: "error", error: (e as Error).message.slice(0, 300), latency_ms: Date.now() - t0 });
    return { ok: false, status: "error", message: "The AI didn't answer. Try again in a moment.", mode: budget.mode, creditsLeft };
  }
}
