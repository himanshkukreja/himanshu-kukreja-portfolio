import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { isAdminEmail } from "@/lib/ai/access";
import { ownKey } from "@/lib/ai/client";
import { readRequest } from "@/lib/ai/chat/core";
import { chatLimits, chatToday, quotaFor } from "@/lib/ai/chat/quota";
import { DSA_FULL } from "@/lib/dsa/flags";
import { courseOutline } from "@/lib/dsa/ai/search";
import { unlocksFor } from "@/lib/dsa/ai/unlock";
import { streamDsa } from "@/lib/dsa/ai/run";
import { prepareAsk } from "@/lib/dsa/ai/turn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const noStore = { "Cache-Control": "private, no-store" };
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

/**
 * GET /api/learn/ai/dsa/ask → { quota, memory, feedback } for the header line (signed in), the course chat's shape.
 *
 * POST /api/learn/ai/dsa/ask (ChatRequest, the course chat's body) → server-sent events (lib/ai/chat/text.ts ChatEvent):
 * DSA Mastery's tutor (/dsa/ask and the Ask panel on DSA pages; feature "dsa-chat", its own daily messages). The route
 * searches DSA content for the message (lib/dsa/ai/search.ts: lessons, lectures, problem statements, and editorials only
 * for problems this learner unlocked, read from their own rows), sends the passages as refs, and streams one answer
 * that cites them. Signed-in learners only; 404 until DSA Mastery is on (NEXT_PUBLIC_DSA_MODE=full).
 */
export async function GET(request: Request) {
  if (!DSA_FULL) return notFound();
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const [{ perDay }, t] = await Promise.all([chatLimits("dsa-chat"), chatToday(me.id, "dsa-chat")]);
  return NextResponse.json({ quota: quotaFor(perDay, t.total, !!ownKey(request)), memory: { available: false, paused: false, has: false }, feedback: false }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!DSA_FULL) return notFound();
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const parsed = readRequest(await request.json().catch(() => null));
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400, headers: noStore });
  const req = parsed;
  const admin = await isAdminEmail(me.email);

  return streamDsa({
    request,
    me,
    admin,
    userKey: ownKey(request),
    feature: "dsa-chat",
    req,
    titled: true,
    lookup: { tool: "search_course", label: "Searching DSA Mastery…" },
    prepare: async () => {
      const [unlocks, outline] = await Promise.all([unlocksFor(me.id), courseOutline()]);
      return prepareAsk({ req, unlocked: unlocks.unlocked, outline });
    },
  });
}
