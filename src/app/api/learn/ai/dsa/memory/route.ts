import { after, NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { isAdminEmail } from "@/lib/ai/access";
import { ownKey } from "@/lib/ai/client";
import { readRequest } from "@/lib/ai/chat/core";
import { DSA_FULL } from "@/lib/dsa/flags";
import { updateDsaMemory } from "@/lib/dsa/ai/memory";
import { learnerBrief } from "@/lib/learner/brief";
import { readClientSignals } from "@/lib/learner/dsa-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const noStore = { "Cache-Control": "private, no-store" };
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

/**
 * DSA Mastery's side of the learner's one memory (the notes live in chat_memory with the course chat's; seeing, removing
 * one item, clearing and switching memory off go through /api/learn/ai/chat/memory):
 *   GET   → { available, paused, notes, brief, adapt }: DSA's notes (shared level and preferences, DSA struggles, mistakes,
 *           sessions) and what the tutors read about the learner right now (lib/learner/brief.ts), for the memory page
 *   POST  ChatRequest → a DSA chat ended ("New chat"): its conversation goes to the memory update, after the response
 * Only ever the caller's own row (the user id comes from the verified session). 404 until DSA Mastery is on.
 */
export async function GET(request: Request) {
  if (!DSA_FULL) return notFound();
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const url = new URL(request.url);
  const client = readClientSignals({ lang: url.searchParams.get("lang"), full: url.searchParams.get("full") === "1", exp: url.searchParams.get("exp") });
  const b = await learnerBrief(me.id, { course: "dsa", feature: "dsa-chat", client });
  return NextResponse.json({ available: b.memory.available, paused: b.memory.paused, notes: b.notes, brief: b.lines, adapt: b.adapt }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!DSA_FULL) return notFound();
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const req = readRequest(await request.json().catch(() => null), { endsWithUser: false });
  if (typeof req === "string") return NextResponse.json({ error: req }, { status: 400, headers: noStore });
  const admin = await isAdminEmail(me.email);
  const userKey = ownKey(request);
  after(() => updateDsaMemory({ userId: me.id, admin, userKey, chat: req.chat, turns: req.messages, where: "DSA Mastery (a finished conversation)" }).catch(() => false));
  return NextResponse.json({ ok: true }, { status: 202, headers: noStore });
}
