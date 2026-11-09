import "server-only";
/**
 * One DSA tutor message, streamed: the shared body of /api/learn/ai/dsa/ask ("dsa-chat") and /api/learn/ai/dsa/tutor
 * ("dsa-tutor"). The same wire format as the course chat (lib/ai/chat/text.ts ChatEvent), so the page reuses its thread,
 * streaming and history (useCourseChat), and the same gates and metering: admitChat (the switches, the monthly budget
 * and the governor's modes, the block list, 10 calls a minute, the off-topic pause, the feature's own daily messages),
 * one ai_calls row per message (no learner text in it) and the text in ai_transcripts (30 days, the cleanup cron).
 *
 * One model round, no tools: the route looks everything up before the model runs (the retrieval, the problem and the
 * learner's unlocks), so the answer streams from the first token.
 */
import { NextResponse } from "next/server";
import { saveTranscript } from "@/lib/ai/client";
import { answerTokens, FEATURES } from "@/lib/ai/features";
import { runLoop, type ApiMessage } from "@/lib/ai/chat/loop";
import { admitChat, afterMessage, logChatCall, type MessageFeature } from "@/lib/ai/chat/quota";
import { cleanAnswer, followupFilter, OFF_TOPIC_MARK, splitFollowups, type ChatEvent, type ChatRequest, type ChatSource } from "@/lib/ai/chat/text";
import { makeChatTitle } from "@/lib/ai/chat/title";
import { titlePassFor } from "@/lib/ai/chat/title-model";
import { pickActions, type FollowupAction } from "@/lib/ai/answerStyle";
import { capCode, codeCapStream } from "./text";

const DEADLINE_MS = 50_000;
const TITLE_GRACE_MS = 1500;
const noStore = { "Cache-Control": "private, no-store" };

export type Prepared = {
  system: { text: string; cache?: boolean }[];
  messages: ApiMessage[];
  /** refs the answer may cite (sent to the page before the model runs) */
  sources: Record<string, ChatSource>;
  /** refs from earlier in the chat that stay citable (the page still has their cards) */
  earlierRefs?: string[];
  /** think first (Haiku 5.5 adaptive, low effort) */
  think: boolean;
  /** code blocks capped at this many lines (the no-spoiler guard), or null */
  cap: number | null;
  /** what goes in the transcript as the learner's turn */
  ask: string;
  /** for the metering row (counts and ids only, never learner text) */
  meta: Record<string, string | number | boolean | null>;
  /** offer follow-up cards and the answer-style actions under the answer */
  followups: boolean;
};

type Me = { id: string; email: string | null };

export async function streamDsa(o: {
  request: Request;
  me: Me;
  admin: boolean;
  userKey: string | null;
  feature: Extract<MessageFeature, "dsa-chat" | "dsa-tutor">;
  req: ChatRequest;
  /** the status line while the route looks things up */
  lookup: { tool: string; label: string; noun?: string };
  prepare: (emit: (e: ChatEvent) => void) => Promise<Prepared>;
  /** name a new conversation from its first message (/dsa/ask) */
  titled?: boolean;
}): Promise<Response> {
  const { request, me, admin, userKey, feature, req } = o;
  const admit = await admitChat({ userId: me.id, admin, userKey, feature });
  if (!admit.ok) {
    await logChatCall({ user_id: me.id, feature, model: FEATURES[feature].model, status: admit.status, error: admit.message, meta: { chat: req.chat, course: "dsa" }, byok: !!userKey });
    return NextResponse.json({ error: admit.message, status: admit.status, quota: admit.quota }, { status: admit.status === "disabled" ? 403 : 429, headers: noStore });
  }
  if (!admit.apiKey) return NextResponse.json({ error: "AI is not configured" }, { status: 403, headers: noStore });

  const t0 = Date.now();
  const enc = new TextEncoder();
  const userTurns = req.messages.filter((m) => m.role === "user").length;
  const latest = req.messages[req.messages.length - 1];
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (e: ChatEvent) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          open = false;
        }
      };
      emit({ type: "start", model: admit.model });
      const pass = o.titled ? titlePassFor(req.title, req.messages, null) : null;
      const titled = pass
        ? makeChatTitle({ pass, messages: req.messages, userId: me.id, admin, userKey, chat: req.chat })
            .then((t) => {
              if (t) emit({ type: "title", text: t.title });
            })
            .catch(() => {})
        : null;
      try {
        emit({ type: "status", ...o.lookup });
        const tPrep = Date.now();
        const p = await o.prepare(emit);
        const prepMs = Date.now() - tPrep;
        if (Object.keys(p.sources).length) emit({ type: "sources", sources: p.sources });
        emit({ type: "status", tool: p.think ? "think" : "write", label: p.think ? "Thinking it through…" : "Writing your answer…" });
        // the follow-ups line never streams; capped code blocks stream already capped (the done text is capped the same way)
        const capped = p.cap !== null ? codeCapStream(p.cap, (d) => emit({ type: "delta", text: d })) : null;
        const deltas = followupFilter((d) => (capped ? capped.push(d) : emit({ type: "delta", text: d })));
        const h55 = /haiku-5-5/.test(admit.model);
        const thinks = p.think && h55;
        const loop = await runLoop({
          apiKey: admit.apiKey,
          model: admit.model,
          system: p.system.map((b) => ({ type: "text" as const, text: b.text, ...(b.cache ? { cache_control: { type: "ephemeral" as const } } : {}) })),
          tools: [],
          messages: p.messages,
          maxTokens: answerTokens(feature, admit.model) + (thinks ? 2000 : 0),
          thinking: thinks ? { type: "adaptive" } : /haiku/.test(admit.model) ? { type: "disabled" } : /sonnet-5/.test(admit.model) ? { type: "between_tools" } : null,
          ...(thinks ? { effort: FEATURES[feature].effort ?? ("low" as const) } : {}),
          maxToolRounds: 0,
          deadline: t0 + DEADLINE_MS,
          signal: request.signal,
          runTool: async () => "",
          onText: (d) => deltas.push(d),
        });
        deltas.flush();
        capped?.flush();
        const offTopic = OFF_TOPIC_MARK.test(loop.text);
        const split = splitFollowups(loop.text, latest.text);
        let text = cleanAnswer(split.text, (r) => !!p.sources[r] || !!p.earlierRefs?.includes(r));
        if (p.cap !== null) text = capCode(text, p.cap);
        const ok = !loop.error && !!text;
        const callId = await logChatCall({
          user_id: me.id,
          feature,
          model: admit.model,
          status: !ok ? "error" : offTopic ? "off_topic" : "ok",
          error: ok ? null : (loop.error || "empty answer").slice(0, 300),
          input_tokens: loop.usage.input_tokens,
          output_tokens: loop.usage.output_tokens,
          cache_read_tokens: loop.usage.cache_read_input_tokens,
          cache_write_tokens: loop.usage.cache_creation_input_tokens,
          cost_usd: loop.costUsd,
          // metered against the monthly budget; the DSA tutors have their own message quotas, never learner credits
          credits: 0,
          latency_ms: Date.now() - t0,
          request_id: loop.requestId,
          byok: admit.byok,
          meta: { chat: req.chat, course: "dsa", turn: userTurns, prep: prepMs, ttft: loop.ttft === null ? null : prepMs + (tPrep - t0) + loop.ttft, stop: loop.stop, ...p.meta },
        });
        if (ok) {
          await saveTranscript(callId, me.id, feature, p.ask, text);
          const cards = p.followups && !offTopic && loop.stop === "end_turn";
          const followups = cards ? split.followups : [];
          const actions: FollowupAction[] = cards && text.split(/\s+/).length >= 40 ? pickActions(followups, { asked: latest.text, quiz: false }) : [];
          if (followups.length || actions.length) emit({ type: "followups", items: followups, ...(actions.length ? { actions } : {}) });
          emit({ type: "done", text, offTopic, quota: admit.quota ? afterMessage(admit.quota) : null, tools: 0, ms: Date.now() - t0, callId, mode: "tutor", ttft: loop.ttft });
        } else {
          emit({ type: "error", message: loop.error === "timeout" ? "The answer took too long. Try asking again." : "The tutor didn't answer this time. Try again in a moment." });
        }
      } catch (e) {
        console.error(`[${feature}]`, e);
        await logChatCall({ user_id: me.id, feature, model: admit.model, status: "error", error: (e as Error).message.slice(0, 300), latency_ms: Date.now() - t0, meta: { chat: req.chat, course: "dsa" }, byok: admit.byok });
        emit({ type: "error", message: "The tutor didn't answer this time. Try again in a moment." });
      } finally {
        if (titled) await Promise.race([titled, new Promise((r) => setTimeout(r, TITLE_GRACE_MS))]);
        open = false;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}

/** The conversation as the model sees it: the last `keep` turns as they were, then the new message with its context. */
export function historyMessages(req: ChatRequest, latestContent: string, keep = 10): ApiMessage[] {
  const turns = req.messages.slice(0, -1).slice(-keep);
  const out: ApiMessage[] = turns.map((t) => ({ role: t.role, content: t.text }));
  out.push({ role: "user", content: latestContent });
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}
