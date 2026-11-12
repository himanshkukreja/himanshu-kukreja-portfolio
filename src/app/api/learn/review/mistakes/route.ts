import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { syncMistakeCards } from "@/lib/learner/mistake-cards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const noStore = { "Cache-Control": "private, no-store" };

/**
 * POST /api/learn/review/mistakes → { added, skipped? }: the signed-in learner's recent mistakes (missed explain-back key
 * points, missed mock rubric lines, lab-review misses, wrong chat-quiz answers, repeated DSA failures) become review cards
 * built from the course's own content (lib/learner/mistake-cards-model.ts), at most five new ones a day. Nothing with GPC
 * or the analytics opt-out (x-hk-notrack) or while memory is off. Only the caller's own rows (verified session).
 */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const r = await syncMistakeCards(request, me.id).catch((e: Error) => {
    console.warn("[review] mistakes:", e.message);
    return { added: 0 };
  });
  return NextResponse.json(r, { headers: noStore });
}
