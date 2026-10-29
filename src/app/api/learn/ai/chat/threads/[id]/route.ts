import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { cleanTitle, sanitizeThread, THREAD_ID_RE, THREAD_MAX_BYTES, titleFrom } from "@/lib/learn/chat-history";
import { deleteThreads, getThread, putThread, rateLimited, renameThread } from "@/lib/learn/chat-history-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: noStore });
const missing = () => json({ available: false, error: "History is kept on this device for now" }, 404);

type Ctx = { params: Promise<{ id: string }> };

/** The learner, the conversation id (checked), or the refusal. */
async function gate(request: Request, ctx: Ctx, kind: "read" | "write") {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const { id } = await ctx.params;
  if (!THREAD_ID_RE.test(id)) return json({ error: "Bad conversation id" }, 400);
  if (rateLimited(me.id, kind)) return json({ error: "Too many requests" }, 429);
  return { me, id };
}

/**
 * One conversation of the signed-in learner (chat_threads):
 *   GET    → { thread: { id, title, createdAt, updatedAt, messages, state } } · 410 when it was deleted · 404 none
 *   PUT    { title?, createdAt?, messages, state } → { thread: meta } (create or replace; 410 when it was deleted)
 *   PATCH  { title } → rename
 *   DELETE → delete it (the text goes at once)
 * The body is checked and capped on the way in (lib/learn/chat-history.ts: last 60 messages, ~200 KB, site links only).
 */
export async function GET(request: Request, ctx: Ctx) {
  const g = await gate(request, ctx, "read");
  if (g instanceof NextResponse) return g;
  const r = await getThread(g.me.id, g.id);
  if (!r.available) return missing();
  if (!r.ok) return json({ error: "Didn't load" }, 500);
  if (r.value === "deleted") return json({ deleted: true }, 410);
  if (!r.value) return json({ error: "Not found" }, 404);
  return json({ thread: r.value });
}

export async function PUT(request: Request, ctx: Ctx) {
  const g = await gate(request, ctx, "write");
  if (g instanceof NextResponse) return g;
  const text = await request.text().catch(() => "");
  if (text.length > THREAD_MAX_BYTES * 2) return json({ error: "Too large" }, 413);
  let raw: { title?: unknown; createdAt?: unknown; messages?: unknown; state?: unknown } | null = null;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = null;
  }
  const body = sanitizeThread(raw);
  if (!body || !body.messages.length) return json({ error: "Bad conversation" }, 400);
  const title = cleanTitle(raw?.title) || titleFrom(body.messages as { role: string; text?: unknown; answerTo?: unknown }[]) || "Conversation";
  const r = await putThread(g.me.id, g.id, { title, createdAt: Number(raw?.createdAt), body });
  if (!r.available) return missing();
  if (!r.ok) return json({ error: "Didn't save" }, 500);
  if (r.value === "deleted") return json({ deleted: true }, 410);
  return json({ thread: r.value });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const g = await gate(request, ctx, "write");
  if (g instanceof NextResponse) return g;
  const b = (await request.json().catch(() => ({}))) as { title?: unknown };
  const title = cleanTitle(b.title);
  if (!title) return json({ error: "A title is needed" }, 400);
  const r = await renameThread(g.me.id, g.id, title);
  if (!r.available) return missing();
  return json({ ok: r.ok && r.value }, r.ok ? (r.value ? 200 : 404) : 500);
}

export async function DELETE(request: Request, ctx: Ctx) {
  const g = await gate(request, ctx, "write");
  if (g instanceof NextResponse) return g;
  const r = await deleteThreads(g.me.id, g.id);
  if (!r.available) return missing();
  return json({ ok: r.ok }, r.ok ? 200 : 500);
}
