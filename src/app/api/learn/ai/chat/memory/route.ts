import { after, NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { isAdminEmail } from "@/lib/ai/access";
import { ownKey } from "@/lib/ai/client";
import { readRequest } from "@/lib/ai/chat/core";
import { updateMemory } from "@/lib/ai/chat/memory";
import { clearMemory, loadMemory, setMemoryPaused } from "@/lib/ai/chat/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const noStore = { "Cache-Control": "private, no-store" };

/**
 * The course chat's memory of the signed-in learner (You → What the tutor remembers):
 *   GET     → { available, paused, memory }   (available: false until the chat_memory migration is applied)
 *   DELETE  → forget everything (the row is deleted)
 *   PATCH   { paused }  → stop remembering (and forget) or start again
 *   POST    ChatRequest → a chat ended ("New chat"): bring the memory up to date from it, after the response
 * Only ever the caller's own row (the user id comes from the verified session).
 */
export async function GET(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  return NextResponse.json(await loadMemory(me.id), { headers: noStore });
}

export async function DELETE(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const ok = await clearMemory(me.id);
  return NextResponse.json({ ok }, { status: ok ? 200 : 500, headers: noStore });
}

export async function PATCH(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const body = (await request.json().catch(() => ({}))) as { paused?: unknown };
  const ok = await setMemoryPaused(me.id, body.paused === true);
  return NextResponse.json({ ok }, { status: ok ? 200 : 500, headers: noStore });
}

export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const req = readRequest(await request.json().catch(() => null), { endsWithUser: false });
  if (typeof req === "string") return NextResponse.json({ error: req }, { status: 400, headers: noStore });
  const admin = isAdminEmail(me.email);
  const userKey = ownKey(request);
  after(() => updateMemory({ userId: me.id, admin, userKey, chat: req.chat, turns: req.messages }).catch(() => false));
  return NextResponse.json({ ok: true }, { status: 202, headers: noStore });
}
