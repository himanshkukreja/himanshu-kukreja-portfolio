import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { getLearningResource } from "@/lib/github";
import { callClaude, saveTranscript } from "@/lib/ai/client";
import { isAdminEmail } from "@/lib/ai/access";
import { lessonQaSystem } from "@/lib/ai/prompts";
import { lessonContext } from "@/lib/ai/retrieve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MODES: Record<string, string> = {
  simple: "Explain it like I'm new to this.",
  hinglish: "Answer in Hinglish.",
  example: "Give one concrete real-world example.",
  interview: "How would I say this in an interview, in 3-4 sentences?",
};
const SLUG = /^[A-Za-z0-9-]{1,120}$/;

/**
 * POST /api/learn/ai/ask { week, slug, question, selection?, mode? } → { text, creditsLeft }
 * Signed-in learners only. The lesson's outline and its most relevant sections go as context.
 */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const body = (await request.json().catch(() => ({}))) as { week?: string; slug?: string; question?: string; selection?: string; mode?: string };
  const week = String(body.week || "");
  const slug = String(body.slug || "");
  const question = String(body.question || "").trim();
  const selection = String(body.selection || "").trim().slice(0, 1500);
  if (!SLUG.test(week) || !SLUG.test(slug)) return NextResponse.json({ error: "Unknown lesson" }, { status: 400 });
  if (!question && !selection) return NextResponse.json({ error: "Ask a question" }, { status: 400 });

  const lesson = await getLearningResource(week, slug).catch(() => null);
  if (!lesson) return NextResponse.json({ error: "Unknown lesson" }, { status: 404 });

  const ask = [selection ? `About this part of the lesson:\n"""${selection}"""` : "", question || "Explain this part.", body.mode && MODES[body.mode] ? MODES[body.mode] : ""].filter(Boolean).join("\n\n");
  const system = lessonQaSystem({ title: lesson.resource.title, text: lessonContext(lesson.content, question, selection) });
  const r = await callClaude({
    feature: "lesson-qa",
    userId: me.id,
    adminPreview: isAdminEmail(me.email),
    system,
    messages: [{ role: "user", content: ask }],
    meta: { week, slug, mode: body.mode ?? null, selection: !!selection },
  });
  if (!r.ok) return NextResponse.json({ error: r.message, status: r.status, creditsLeft: r.creditsLeft }, { status: r.status === "error" ? 502 : 429 });
  await saveTranscript(r.callId, me.id, "lesson-qa", ask, r.text);
  return NextResponse.json({ text: r.text, creditsLeft: r.creditsLeft });
}
