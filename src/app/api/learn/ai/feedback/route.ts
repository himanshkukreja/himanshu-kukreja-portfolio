import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { chatDevLearner } from "@/lib/ai/chat/dev";
import { supabase } from "@/lib/supabase";
import { feedbackEnabled } from "@/lib/ai/chat/feedback";
import { isFeedbackFeature, readFeedback, REASON_NOTE } from "@/lib/ai/feedback-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };
const isMissingColumn = (e: { code?: string; message?: string } | null) => !!e && (["42703", "PGRST204"].includes(e.code || "") || /column .* does not exist|could not find the .* column/i.test(e.message || ""));

/**
 * POST /api/learn/ai/feedback { callId, rating: -1|0|1, reason? } → { ok }: thumbs up or down on one of the learner's own
 * AI answers (any feature in lib/ai/feedback-model.ts FEEDBACK_FEATURES: the course chat, the DSA chat and tutor, Ask this
 * lesson, snip explain, lab hints and reviews, explain-back, the mock and LLD mock scorecards), with an optional reason on
 * a down (wrong, not grounded, too long, gave away the answer, didn't know me). Stored in chat_feedback: the verdict, the
 * reason, the feature, the model, the prompt version (from the answer's ai_calls row) and the answer id. Never the
 * learner's text: there is no note (an old client's note is ignored).
 * Until the 12 Nov 2026 migration adds the reason/feature/model/prompt_hash columns, the row is written without them and
 * the reason code rides in the old note column ("reason:<id>", never learner text). 503 while chat_feedback is missing.
 */
export async function POST(request: Request) {
  const me = chatDevLearner(request) ?? (await requireLearner(request));
  if (me instanceof NextResponse) return me;
  if (!(await feedbackEnabled())) return NextResponse.json({ error: "Feedback isn't switched on yet." }, { status: 503, headers: noStore });
  const fb = readFeedback(await request.json().catch(() => null));
  if (typeof fb === "string") return NextResponse.json({ error: fb }, { status: 400, headers: noStore });
  // only an answer the AI gave this learner, in a feature that takes feedback
  const { data: call } = await supabase.from("ai_calls").select("id, user_id, feature, model, meta").eq("id", fb.callId).maybeSingle();
  if (!call || call.user_id !== me.id || !isFeedbackFeature(call.feature)) return NextResponse.json({ error: "Unknown answer" }, { status: 404, headers: noStore });
  const meta = (call.meta as { chat?: string; pv?: string } | null) ?? {};
  const base = { call_id: fb.callId, user_id: me.id, chat: meta.chat ?? null, rating: fb.rating, wrong: fb.reason === "wrong", updated_at: new Date().toISOString() };
  let { error } = await supabase
    .from("chat_feedback")
    .upsert({ ...base, note: null, reason: fb.reason, feature: call.feature, model: call.model, prompt_hash: typeof meta.pv === "string" ? meta.pv : null }, { onConflict: "call_id,user_id" });
  if (isMissingColumn(error)) ({ error } = await supabase.from("chat_feedback").upsert({ ...base, note: fb.reason ? REASON_NOTE(fb.reason) : null }, { onConflict: "call_id,user_id" }));
  if (error) return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 500, headers: noStore });
  return NextResponse.json({ ok: true }, { headers: noStore });
}
