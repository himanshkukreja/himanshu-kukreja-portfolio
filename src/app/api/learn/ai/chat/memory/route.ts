import { after, NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { chatDevLearner } from "@/lib/ai/chat/dev";
import { isAdminEmail } from "@/lib/ai/access";
import { ownKey } from "@/lib/ai/client";
import { readRequest } from "@/lib/ai/chat/core";
import { captureChat, privateRequest } from "@/lib/ai/chat/capture";
import { clearMemory, loadMemory, saveMemory, setMemoryPaused } from "@/lib/ai/chat/server";
import { editMemoryItem, MEMORY_FIELDS, removeMemoryItem, setPrefs, type MemoryField } from "@/lib/ai/chat/memory-model";
import { isRestyle, isStylePref, isTeachPref, stylePref, TEACH_PREF } from "@/lib/ai/teaching";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const noStore = { "Cache-Control": "private, no-store" };

/**
 * The course chat's memory of the signed-in learner (You → What the tutor remembers):
 *   GET     → { available, paused, memory }   (available: false until the chat_memory migration is applied)
 *   DELETE  → forget everything (the row is deleted)
 *   PATCH   { paused }  → stop remembering (and forget) or start again
 *   PATCH   { remove: { field, item } } → forget one item (the memory page's ×; either course's: one shared memory)
 *   PATCH   { edit: { field, item, text } } → rewrite one item in the learner's own words (the memory page's pencil):
 *           scrubbed and capped like anything a tutor writes, its provenance becomes "you"
 *   PATCH   { teach: boolean } → "Teach me" switched on or off (lib/ai/teaching.ts): remembered as a pref ("you")
 *   PATCH   { style: { pick, via } } → the explanation style that worked ("Explain it differently", then a thumbs-up or
 *           moving on): remembered as one pref ("feedback"), replacing the last one. A "moved-on" one is inferred, so like
 *           a background capture it never runs with GPC or the analytics opt-out; a thumbs-up is the learner's own act.
 *           Both: 409 while memory is off (nothing is kept), never more than the prefs' cap.
 *   POST    ChatRequest (+ via: "idle") → a chat ended ("New chat") or went quiet (the page, after 10 minutes): bring the
 *           memory up to date from it, after the response, unless its messages are already noted (lib/ai/chat/capture.ts)
 * Only ever the caller's own row (the user id comes from the verified session).
 */
export async function GET(request: Request) {
  const me = chatDevLearner(request) ?? (await requireLearner(request));
  if (me instanceof NextResponse) return me;
  return NextResponse.json(await loadMemory(me.id), { headers: noStore });
}

export async function DELETE(request: Request) {
  const me = chatDevLearner(request) ?? (await requireLearner(request));
  if (me instanceof NextResponse) return me;
  const ok = await clearMemory(me.id);
  return NextResponse.json({ ok }, { status: ok ? 200 : 500, headers: noStore });
}

export async function PATCH(request: Request) {
  const me = chatDevLearner(request) ?? (await requireLearner(request));
  if (me instanceof NextResponse) return me;
  const body = (await request.json().catch(() => ({}))) as { teach?: unknown; style?: unknown; paused?: unknown; remove?: { field?: unknown; item?: unknown }; edit?: { field?: unknown; item?: unknown; text?: unknown } };
  if (body.edit && typeof body.edit === "object") {
    const field = body.edit.field as MemoryField;
    const item = typeof body.edit.item === "string" ? body.edit.item.slice(0, 400) : "";
    const text = typeof body.edit.text === "string" ? body.edit.text.slice(0, 400) : "";
    if (!MEMORY_FIELDS.includes(field) || (!item && field !== "level")) return NextResponse.json({ error: "Bad item" }, { status: 400, headers: noStore });
    const m = await loadMemory(me.id);
    if (!m.available) return NextResponse.json({ error: "Memory is unavailable" }, { status: 503, headers: noStore });
    if (m.paused) return NextResponse.json({ error: "Memory is off" }, { status: 409, headers: noStore });
    const next = editMemoryItem(m.memory, field, item, text, new Date());
    if (!next) return NextResponse.json({ error: "That edit can't be kept: write a short learning note (no links or contact details), or forget the item instead." }, { status: 400, headers: noStore });
    const ok = await saveMemory(me.id, next);
    return NextResponse.json({ ok }, { status: ok ? 200 : 500, headers: noStore });
  }
  if (typeof body.teach === "boolean" || (body.style && typeof body.style === "object")) {
    const st = body.style as { pick?: unknown; via?: unknown } | undefined;
    if (st && !isRestyle(st.pick)) return NextResponse.json({ error: "Bad style" }, { status: 400, headers: noStore });
    if (st && st.via !== "thumbs-up" && privateRequest(request)) return NextResponse.json({ ok: false }, { status: 202, headers: noStore });
    const m = await loadMemory(me.id);
    if (!m.available) return NextResponse.json({ error: "Memory is unavailable" }, { status: 503, headers: noStore });
    if (m.paused) return NextResponse.json({ error: "Memory is off" }, { status: 409, headers: noStore });
    const now = new Date();
    const next = st && isRestyle(st.pick) ? setPrefs(m.memory, { drop: isStylePref, add: stylePref(st.pick), by: "feedback", now }) : setPrefs(m.memory, { drop: isTeachPref, add: body.teach ? TEACH_PREF : null, by: "you", now });
    const ok = await saveMemory(me.id, next);
    return NextResponse.json({ ok }, { status: ok ? 200 : 500, headers: noStore });
  }
  if (body.remove && typeof body.remove === "object") {
    const field = body.remove.field as MemoryField;
    const item = typeof body.remove.item === "string" ? body.remove.item.slice(0, 400) : "";
    if (!MEMORY_FIELDS.includes(field) || (!item && field !== "level")) return NextResponse.json({ error: "Bad item" }, { status: 400, headers: noStore });
    const m = await loadMemory(me.id);
    if (!m.available) return NextResponse.json({ error: "Memory is unavailable" }, { status: 503, headers: noStore });
    const ok = await saveMemory(me.id, removeMemoryItem(m.memory, field, item));
    return NextResponse.json({ ok }, { status: ok ? 200 : 500, headers: noStore });
  }
  const ok = await setMemoryPaused(me.id, body.paused === true);
  return NextResponse.json({ ok }, { status: ok ? 200 : 500, headers: noStore });
}

export async function POST(request: Request) {
  const me = chatDevLearner(request) ?? (await requireLearner(request));
  if (me instanceof NextResponse) return me;
  const body = await request.json().catch(() => null);
  const req = readRequest(body, { endsWithUser: false });
  if (typeof req === "string") return NextResponse.json({ error: req }, { status: 400, headers: noStore });
  const via = (body as { via?: unknown }).via === "idle" ? "idle" : "end";
  // a background capture (the page saw the chat go quiet) never runs with GPC or the analytics opt-out
  if (via === "idle" && privateRequest(request)) return NextResponse.json({ ok: false }, { status: 202, headers: noStore });
  const admin = await isAdminEmail(me.email);
  const userKey = ownKey(request);
  after(() => captureChat({ userId: me.id, admin, userKey, chat: req.chat, turns: req.messages, course: "sdm", via }).catch(() => false));
  return NextResponse.json({ ok: true }, { status: 202, headers: noStore });
}
