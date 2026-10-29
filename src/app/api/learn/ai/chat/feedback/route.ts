import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { supabase } from "@/lib/supabase";
import { feedbackEnabled } from "@/lib/ai/chat/feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

/**
 * POST /api/learn/ai/chat/feedback { callId, rating: -1|0|1, wrong, note? } → { ok }: thumbs up or down and
 * "this was wrong" on one of the learner's own tutor answers (table chat_feedback; the note is cleared after
 * 90 days, the rating stays for the stats). 503 until the chat migration is applied (the page then hides it).
 */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  if (!(await feedbackEnabled())) return NextResponse.json({ error: "Feedback isn't switched on yet." }, { status: 503, headers: noStore });
  const b = (await request.json().catch(() => ({}))) as { callId?: unknown; rating?: unknown; wrong?: unknown; note?: unknown };
  const callId = Number(b.callId);
  if (!Number.isInteger(callId) || callId <= 0) return NextResponse.json({ error: "Unknown answer" }, { status: 400, headers: noStore });
  // only an answer the tutor gave this learner
  const { data: call } = await supabase.from("ai_calls").select("id, user_id, feature, meta").eq("id", callId).maybeSingle();
  if (!call || call.user_id !== me.id || call.feature !== "course-chat") return NextResponse.json({ error: "Unknown answer" }, { status: 404, headers: noStore });
  const rating = b.rating === 1 || b.rating === -1 ? b.rating : 0;
  const note = typeof b.note === "string" ? b.note.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 500) : "";
  const { error } = await supabase.from("chat_feedback").upsert(
    { call_id: callId, user_id: me.id, chat: (call.meta as { chat?: string } | null)?.chat ?? null, rating, wrong: b.wrong === true, note: note || null, updated_at: new Date().toISOString() },
    { onConflict: "call_id,user_id" },
  );
  if (error) return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 500, headers: noStore });
  return NextResponse.json({ ok: true }, { headers: noStore });
}
