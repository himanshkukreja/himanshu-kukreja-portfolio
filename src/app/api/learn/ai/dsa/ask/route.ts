import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { isAdminEmail } from "@/lib/ai/access";
import { ownKey } from "@/lib/ai/client";
import { readRequest } from "@/lib/ai/chat/core";
import { chatLimits, chatToday, quotaFor } from "@/lib/ai/chat/quota";
import { DSA_FULL } from "@/lib/dsa/flags";
import { courseOutline, pageItem } from "@/lib/dsa/ai/search";
import { unlocksFor } from "@/lib/dsa/ai/unlock";
import { streamDsa } from "@/lib/dsa/ai/run";
import { prepareAsk } from "@/lib/dsa/ai/turn";
import { loadMemory } from "@/lib/ai/chat/server";
import { feedbackEnabled } from "@/lib/ai/chat/feedback";
import { learnerBrief } from "@/lib/learner/brief";
import { readClientSignals } from "@/lib/learner/dsa-profile";

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
 * that cites them. The learner's turn also carries the learner brief (lib/learner/brief.ts: their level and language,
 * record, struggles, habits and memory, from their own rows and the page's `learner` signals), and every few messages the
 * shared memory takes the conversation in (lib/dsa/ai/memory.ts). Signed-in learners only; 404 until DSA Mastery is on
 * (NEXT_PUBLIC_DSA_MODE=full).
 */
export async function GET(request: Request) {
  if (!DSA_FULL) return notFound();
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const [{ perDay }, t, m] = await Promise.all([chatLimits("dsa-chat"), chatToday(me.id, "dsa-chat"), loadMemory(me.id)]);
  return NextResponse.json({ quota: quotaFor(perDay, t.total, !!ownKey(request)), memory: { available: m.available, paused: m.paused, has: m.available && m.memory.updatedAt > 0 }, feedback: await feedbackEnabled() }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!DSA_FULL) return notFound();
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = readRequest(body);
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400, headers: noStore });
  const req = parsed;
  const admin = await isAdminEmail(me.email);
  const client = readClientSignals(body?.learner);
  const page = pageItem(req.page?.path);
  // the learner model (lib/learner): who they are, their record and memory, for the learner's turn; also whether memory is on
  const brief = learnerBrief(me.id, { course: "dsa", feature: "dsa-chat", ref: page?.kind === "problem" ? { problemId: page.id } : page?.kind === "concept" ? { conceptId: page.id } : undefined, client }).catch(() => null);

  return streamDsa({
    request,
    me,
    admin,
    userKey: ownKey(request),
    feature: "dsa-chat",
    req,
    titled: true,
    lookup: { tool: "search_course", label: "Searching DSA Mastery…" },
    route: { text: req.messages[req.messages.length - 1].text },
    memory: { where: `DSA Mastery chat${req.page?.title ? `, asked on the page "${req.page.title.slice(0, 120)}"` : ""}`, on: brief.then((b) => !!b?.memory.available && !b.memory.paused) },
    prepare: async () => {
      const [unlocks, outline, b] = await Promise.all([unlocksFor(me.id), courseOutline(), brief]);
      return prepareAsk({ req, unlocked: unlocks.unlocked, outline, brief: b?.text || undefined });
    },
  });
}
