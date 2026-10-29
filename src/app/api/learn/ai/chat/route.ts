import { after, NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { isAdminEmail } from "@/lib/ai/access";
import { ownKey, saveTranscript } from "@/lib/ai/client";
import { creditsFor } from "@/lib/ai/prices";
import { MODELS } from "@/lib/ai/prices";
import { devPreview, originOf } from "@/lib/search/smart/server";
import { runChatCore, runMockCore, readRequest } from "@/lib/ai/chat/core";
import { courseMapSummary } from "@/lib/ai/chat/mapSummary";
import { memoryLines } from "@/lib/ai/chat/memory-model";
import { MEMORY_EVERY, updateMemory } from "@/lib/ai/chat/memory";
import { admitChat, afterMessage, chatLimits, chatToday, logChatCall } from "@/lib/ai/chat/quota";
import { loadMemory, makeDeps } from "@/lib/ai/chat/server";
import { traceOf } from "@/lib/ai/chat/tools";
import { feedbackEnabled } from "@/lib/ai/chat/feedback";
import type { ChatEvent, ChatQuota } from "@/lib/ai/chat/text";
import { chatDevLearner } from "@/lib/ai/chat/dev";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** the whole message (every tool round and the answer) gets this long */
const DEADLINE_MS = Number(process.env.COURSE_CHAT_DEADLINE_MS) || 50_000;
const noStore = { "Cache-Control": "private, no-store" };

/**
 * GET /api/learn/ai/chat → { quota, memory, feedback } for the chat's header line (signed in).
 */
export async function GET(request: Request) {
  // `next dev` only (lib/ai/chat/dev.ts): a stand-in learner gets the real quota line; the bare preview a fixed one
  const devUser = chatDevLearner(request);
  if (!devUser && devPreview(request)) return NextResponse.json({ quota: { mainLeft: 30, mainPerDay: 30, totalLeft: 300, fast: false, ownKey: false }, memory: { available: false, paused: false, has: false }, feedback: true }, { headers: noStore });
  const me = devUser ?? (await requireLearner(request));
  if (me instanceof NextResponse) return me;
  const [{ perDay, ceiling }, t, m, fb] = await Promise.all([chatLimits(), chatToday(me.id), loadMemory(me.id), feedbackEnabled()]);
  const own = !!ownKey(request);
  const quota: ChatQuota = { mainLeft: own ? perDay : Math.max(0, perDay - t.main), mainPerDay: perDay, totalLeft: own ? ceiling : Math.max(0, ceiling - t.total), fast: !own && t.main >= perDay, ownKey: own };
  return NextResponse.json({ quota, memory: { available: m.available, paused: m.paused, has: m.available && m.memory.updatedAt > 0 }, feedback: fb }, { headers: noStore });
}

/**
 * POST /api/learn/ai/chat (ChatRequest) → a stream of server-sent events (ChatEvent): status lines while tools
 * run, sources/quiz/path/save as they are made, the answer's text as it is written, then "done" with the
 * cleaned answer (only refs the tools returned, no links) or "error". Refusals (switched off, quota, rate)
 * come back as plain JSON with a 4xx before any stream starts; the page then keeps its instant results.
 *
 * Signed-in learners; metered as one ai_calls row per message (feature "course-chat", its own quota). The
 * learner's message and the answer are kept 90 days in ai_transcripts (the chat's retention; other features keep 30);
 * no learner text goes in the metering row (only counts, the tools used and the course's own title for the topic).
 */
export async function POST(request: Request) {
  // `next dev` only (lib/ai/chat/dev.ts): the preview header answers without a session (no quota); with a
  // stand-in learner id it runs the normal path for that fake learner (quota, progress, memory)
  const devUser = chatDevLearner(request);
  const dev = !devUser && devPreview(request);
  const me = devUser ?? (dev ? { id: "", email: null } : await requireLearner(request));
  if (me instanceof NextResponse) return me;
  const admin = dev || isAdminEmail(me.email);
  const parsed = readRequest(await request.json().catch(() => null));
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400, headers: noStore });
  const req = parsed;
  const userKey = ownKey(request);

  const admit = dev
    ? ({ ok: true, model: MODELS.sonnet, fast: false, quota: null, mode: "green", byok: false, apiKey: process.env.ANTHROPIC_API_KEY || "" } as const)
    : await admitChat({ userId: me.id, admin, userKey });
  if (!admit.ok) {
    await logChatCall({ user_id: me.id || null, feature: "course-chat", model: MODELS.sonnet, status: admit.status, error: admit.message, meta: { chat: req.chat }, byok: !!userKey });
    return NextResponse.json({ error: admit.message, status: admit.status, quota: admit.quota }, { status: admit.status === "disabled" ? 403 : 429, headers: noStore });
  }
  if (!admit.apiKey) return NextResponse.json({ error: "AI is not configured" }, { status: 403, headers: noStore });

  const t0 = Date.now();
  const enc = new TextEncoder();
  const userTurns = req.messages.filter((m) => m.role === "user").length;
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
      emit({ type: "start", fast: admit.fast, model: admit.model });
      try {
        const tPrep = Date.now();
        const [{ deps, map }, mem] = await Promise.all([makeDeps({ origin: originOf(request), userId: me.id || null, page: req.page ?? null }), me.id ? loadMemory(me.id) : Promise.resolve(null)]);
        const memory = mem && mem.available && !mem.paused ? memoryLines(mem.memory) : null;
        const prepMs = Date.now() - tPrep;
        const r = await (req.mock ? runMockCore : runChatCore)({ deps, req, model: admit.model, apiKey: admit.apiKey, map: courseMapSummary(map), memory, emit, deadline: t0 + DEADLINE_MS, signal: request.signal });
        const ok = !r.loop.error && !!r.text;
        // ms from the request to the first text the learner saw
        const ttft = r.loop.ttft === null ? null : tPrep - t0 + prepMs + (r.loopAt ?? 0) + r.loop.ttft;
        const st = r.state;
        const callId = await logChatCall({
          user_id: me.id || null,
          feature: "course-chat",
          model: admit.model,
          // "noop": answered without calling the AI (e.g. a mock with nothing to score yet): not counted in the quota
          status: !ok ? "error" : r.loop.rounds === 0 ? "noop" : r.offTopic ? "off_topic" : "ok",
          error: ok ? null : (r.loop.error || "empty answer").slice(0, 300),
          input_tokens: r.loop.usage.input_tokens,
          output_tokens: r.loop.usage.output_tokens,
          cache_read_tokens: r.loop.usage.cache_read_input_tokens,
          cache_write_tokens: r.loop.usage.cache_creation_input_tokens,
          cost_usd: r.loop.costUsd,
          credits: creditsFor(r.loop.costUsd),
          latency_ms: Date.now() - t0,
          request_id: r.loop.requestId,
          byok: admit.byok,
          meta: {
            chat: req.chat,
            turn: userTurns,
            rounds: r.loop.rounds,
            tools: r.loop.toolCalls.length,
            toolNames: [...new Set(r.loop.toolCalls.map((t) => t.name))].join(","),
            topic: st.flags.topic || null,
            quiz: st.flags.quiz,
            graded: st.flags.graded,
            path: st.flags.path,
            saved: st.flags.saved,
            fast: admit.fast,
            page: req.page?.path ? req.page.path.split("/").slice(0, 3).join("/") : null,
            memory: !!memory?.length,
            mode: r.mode,
            ...(st.flags.mock ? { mock: st.flags.mock } : {}),
            ...(st.flags.design ? { design: true } : {}),
            ...(st.flags.plan ? { plan: true } : {}),
            // the tutor's own course-search phrases and whether each found a real lesson: the admin content-gap
            // radar (cleared after 90 days with the transcripts; supabase/migrations/20261029_chat_memory.sql)
            ...(st.searches.length ? { searches: st.searches } : {}),
            // where the time went (ms): setup before the model, the learner context, the first text, each round
            t: {
              start: tPrep - t0,
              prep: prepMs,
              ctx: r.ctxMs ?? 0,
              ttft,
              rounds: r.loop.timing.map((x) => ({ ttfb: x.ttfb, first: x.first, ms: x.end - x.start, stop: x.stop, cr: x.cacheRead, cw: x.cacheWrite, out: x.output, tools: x.tools.map((y) => `${y.name}:${y.ms}`).join(","), dropped: x.dropped })),
            },
            ...(r.loop.refusal ? { refusal: r.loop.refusal } : {}),
            ...(r.fellBack ? { fellBack: r.fellBack } : {}),
            ...(dev || devUser ? { dev: true } : {}),
          },
        });
        if (ok) {
          // the conversation text, kept 90 days (the chat's retention: abuse checks and improving the tutor), with a trace of the tools
          await saveTranscript(callId, me.id || null, "course-chat", r.ask, `${r.text}\n\n— tools: ${r.loop.toolCalls.map((t) => traceOf(t.name, t.input)).join("; ") || "none"}`);
          if (r.followups?.length) emit({ type: "followups", items: r.followups });
          emit({ type: "done", text: r.text, offTopic: r.offTopic, quota: admit.quota ? afterMessage(admit.quota, admit.model) : null, tools: r.loop.toolCalls.length, ms: Date.now() - t0, callId, mode: r.mode, ttft });
          // every few messages the tutor's memory of this learner is brought up to date (after the answer is out)
          if (me.id && userTurns % MEMORY_EVERY === 0 && !r.offTopic)
            after(() => updateMemory({ userId: me.id, admin, userKey, chat: req.chat, turns: [...req.messages, { role: "assistant", text: r.text }] }).catch(() => false));
        } else {
          emit({ type: "error", message: r.loop.error === "timeout" ? "The answer took too long. The search results are below; try asking again." : "The tutor didn't answer this time. The search results are below; try again in a moment." });
        }
      } catch (e) {
        console.error("[chat]", e);
        await logChatCall({ user_id: me.id || null, feature: "course-chat", model: admit.model, status: "error", error: (e as Error).message.slice(0, 300), latency_ms: Date.now() - t0, meta: { chat: req.chat }, byok: admit.byok });
        emit({ type: "error", message: "The tutor didn't answer this time. The search results are below; try again in a moment." });
      } finally {
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
