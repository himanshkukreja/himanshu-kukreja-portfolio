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
 * POST /api/learn/ai/war-room { slug, beat, text } → { match: number | null, who, reply, verdict?, cost?, hint?, creditsLeft }
 * `beat` is the index of the decision in the script; `match` is the option index (0-based) the move
 * corresponds to, or null. A move that matches none is judged in character: `verdict` helps | hurts | off-track,
 * `cost` the minutes a harmful move adds (0 otherwise; never more than the decision's costliest wrong option, or 3),
 * and `hint` one nudge toward what matters, never the answer.
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
    adminPreview: await isAdminEmail(me.email),
    userKey: ownKey(request),
    system: warRoomSystem(input),
    messages: [{ role: "user", content: text }],
    meta: { room: room.slug, beat: k },
  });
  if (!r.ok) return NextResponse.json({ error: r.message, creditsLeft: r.creditsLeft }, { status: r.status === "error" ? 502 : 429 });
  await saveTranscript(r.callId, me.id, "war-room", text, r.text);
  const t = r.text.replace(/\*\*/g, "");
  const field = (name: string) => t.match(new RegExp(`^\\s*${name}:\\s*([\\s\\S]*?)\\s*(?=^\\s*(?:MATCH|VERDICT|COST|REPLY|HINT):|$(?![\\s\\S]))`, "im"))?.[1]?.trim() || "";
  const m = field("MATCH").match(/^(\d+|none)/i)?.[1];
  const n = m && /\d/.test(m) ? Number(m) - 1 : null;
  const match = n !== null && n >= 0 && n < d.options.length ? n : null;
  const reply = field("REPLY") || t.trim();
  const rm = reply.match(/^([^:\n]{1,40}):\s+([\s\S]+)$/);
  // judged moves (no match): the verdict, a capped cost and a hint
  const v = field("VERDICT").toLowerCase().match(/helps|hurts|off-?track/)?.[0]?.replace("offtrack", "off-track") as "helps" | "hurts" | "off-track" | undefined;
  const cap = Math.max(3, ...d.options.filter((o) => !o.best).map((o) => o.minutes));
  const cost = match === null && v === "hurts" ? Math.min(cap, Math.max(0, Math.round(Number(field("COST").match(/\d+/)?.[0] ?? 0)))) : 0;
  const hint = match === null ? field("HINT").split("\n")[0].slice(0, 300) : "";
  return NextResponse.json({
    match,
    who: rm ? rm[1].trim() : "",
    reply: rm ? rm[2].trim() : reply,
    ...(match === null ? { verdict: v ?? null, cost, hint } : {}),
    creditsLeft: r.creditsLeft,
  });
}
