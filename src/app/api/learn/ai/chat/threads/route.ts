import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { deleteThreads, listThreads, rateLimited } from "@/lib/learn/chat-history-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

/**
 * The course chat's history for the signed-in learner (table chat_threads; the user id comes from the verified
 * session, never the request):
 *   GET    → { available, threads: [{ id, title, createdAt, updatedAt }] }   titles and dates only, newest first
 *   DELETE → delete every conversation ("Delete all")
 * `available: false` until the chat_threads migration is applied: the browser keeps history on the device only.
 * One conversation: ./[id] (GET, PUT, PATCH, DELETE).
 */
export async function GET(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  if (rateLimited(me.id, "read")) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: noStore });
  const r = await listThreads(me.id);
  if (!r.available) return NextResponse.json({ available: false, threads: [] }, { headers: noStore });
  if (!r.ok) return NextResponse.json({ available: true, error: "History didn't load" }, { status: 500, headers: noStore });
  return NextResponse.json({ available: true, threads: r.value }, { headers: noStore });
}

export async function DELETE(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  if (rateLimited(me.id, "write")) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: noStore });
  const r = await deleteThreads(me.id, null);
  if (!r.available) return NextResponse.json({ available: false }, { status: 404, headers: noStore });
  return NextResponse.json({ ok: r.ok }, { status: r.ok ? 200 : 500, headers: noStore });
}
