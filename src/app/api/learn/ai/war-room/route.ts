import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { getWarRoom } from "@/lib/learn/war/load";
import { callClaude, ownKey, saveTranscript } from "@/lib/ai/client";
import { isAdminEmail } from "@/lib/ai/access";
import { warRoomPromptInput, warRoomSystem } from "@/lib/ai/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/learn/ai/war-room { slug, beat, text } → { match: number | null, who, reply, creditsLeft }
 * `beat` is the index of the decision in the script; `match` is the option index (0-based) the move
 * corresponds to, or null.
 */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const b = (await request.json().catch(() => ({}))) as { slug?: string; beat?: number; text?: string };
  const room = await getWarRoom(String(b.slug || ""));
  const k = Number(b.beat);
  const d = room?.beats[k];
  if (!room || !d || d.kind !== "decision") return NextResponse.json({ error: "Unknown decision" }, { status: 404 });
  const text = String(b.text || "").trim().slice(0, 600);
  if (text.split(/\s+/).length < 2) return NextResponse.json({ error: "Say what you'd do." }, { status: 400 });

  const input = warRoomPromptInput(room, k)!;
  const r = await callClaude({
    feature: "war-room",
    userId: me.id,
    adminPreview: isAdminEmail(me.email),
    userKey: ownKey(request),
    system: warRoomSystem(input),
    messages: [{ role: "user", content: text }],
    meta: { room: room.slug, beat: k },
  });
  if (!r.ok) return NextResponse.json({ error: r.message, creditsLeft: r.creditsLeft }, { status: r.status === "error" ? 502 : 429 });
  await saveTranscript(r.callId, me.id, "war-room", text, r.text);
  const m = r.text.match(/MATCH:\s*(\d+|none)/i)?.[1];
  const idx = m && /\d/.test(m) ? Number(m) - 1 : null;
  const reply = r.text.match(/REPLY:\s*([\s\S]+)/i)?.[1]?.trim() || r.text.trim();
  const rm = reply.match(/^([^:]{1,40}):\s+([\s\S]+)$/);
  return NextResponse.json({ match: idx !== null && idx >= 0 && idx < d.options.length ? idx : null, who: rm ? rm[1].trim() : "", reply: rm ? rm[2].trim() : reply, creditsLeft: r.creditsLeft });
}
