import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { callClaude, ownKey, saveTranscript } from "@/lib/ai/client";
import { isAdminEmail } from "@/lib/ai/access";
import { parseCards } from "@/lib/ai/notes";
import { notesCardsSystem } from "@/lib/ai/prompts";
import { aiError, lessonKeyOf, notesOf, pageIdOf } from "../_lib/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/learn/ai/notes/cards { pageId, notes, lessonKey? } → { cards: [{ q, a }], credits, creditsLeft }
 * 3-8 review cards from the page's typed notes (Haiku 5.5), only from what the notes say. The browser shows them and
 * adds the ones the learner keeps to their review queue (lib/learn/review addReviewCard); nothing is stored here.
 */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const b = (await request.json().catch(() => ({}))) as { pageId?: unknown; notes?: unknown; lessonKey?: unknown };
  const pageId = pageIdOf(b.pageId);
  if (!pageId) return NextResponse.json({ error: "Unknown page" }, { status: 400 });
  const notes = notesOf(b.notes);
  if (notes.replace(/\[\?\]/g, "").split(/\s+/).filter(Boolean).length < 6) return NextResponse.json({ error: "There isn't enough on this page to make cards from yet." }, { status: 400 });
  const input = `<notes>\n${notes}\n</notes>`;
  const r = await callClaude({
    feature: "notes-cards",
    userId: me.id,
    adminPreview: isAdminEmail(me.email),
    userKey: ownKey(request),
    system: notesCardsSystem(),
    messages: [{ role: "user", content: input }],
    meta: { page: pageId, lesson: lessonKeyOf(b.lessonKey)?.key ?? null },
    timeoutMs: 55_000,
  });
  if (!r.ok) return aiError(r);
  const cards = parseCards(r.text);
  await saveTranscript(r.callId, me.id, "notes-cards", input, r.text);
  return NextResponse.json({ cards, credits: r.credits, creditsLeft: r.creditsLeft });
}
