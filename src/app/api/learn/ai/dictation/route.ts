import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { callClaude, ownKey } from "@/lib/ai/client";
import { isAdminEmail } from "@/lib/ai/access";
import { DICTATION_POLISH_SYSTEM, acceptPolish, dictationInput } from "@/lib/ai/dictation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * POST /api/learn/ai/dictation { text, where: "chat" | "answer" } → { text } (the corrected dictation) or { text: null }
 * when there was no usable correction. The page shows its own clean-up meanwhile and keeps it on any failure, so
 * errors answer 200 with null instead of an error the learner would see. Nothing is kept beyond the metered call row.
 */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const b = (await request.json().catch(() => ({}))) as { text?: string; where?: string };
  const text = String(b.text || "").replace(/\s+/g, " ").trim().slice(0, 1200);
  if (text.split(" ").length < 3) return NextResponse.json({ text: null });
  const where = b.where === "answer" ? "answer" : "chat";
  const r = await callClaude({
    feature: "dictation-polish",
    userId: me.id,
    adminPreview: await isAdminEmail(me.email),
    userKey: ownKey(request),
    system: DICTATION_POLISH_SYSTEM,
    messages: [{ role: "user", content: dictationInput(text, where) }],
    timeoutMs: 8000,
    meta: { where, chars: text.length },
  });
  if (!r.ok) return NextResponse.json({ text: null, reason: r.status });
  return NextResponse.json({ text: acceptPolish(text, r.text) });
}
