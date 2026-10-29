import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { getLearningResource } from "@/lib/github";
import { getStorySource } from "@/lib/stories";
import { callClaude, ownKey, saveTranscript } from "@/lib/ai/client";
import { isAdminEmail } from "@/lib/ai/access";
import { lessonQaSystem, promptOptsFor } from "@/lib/ai/prompts";
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
 * or { story, question, selection?, mode? } for a case file (/stories/<story>).
 * Signed-in learners only. The lesson's (or case file's) outline and its most relevant sections go as context.
 */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const body = (await request.json().catch(() => ({}))) as { week?: string; slug?: string; story?: string; question?: string; selection?: string; mode?: string };
  const story = body.story ? String(body.story) : "";
  const week = String(body.week || "");
  const slug = String(body.slug || "");
  const question = String(body.question || "").trim();
  const selection = String(body.selection || "").trim().slice(0, 1500);
  if (story ? !SLUG.test(story) : !SLUG.test(week) || !SLUG.test(slug)) return NextResponse.json({ error: "Unknown lesson" }, { status: 400 });
  if (!question && !selection) return NextResponse.json({ error: "Ask a question" }, { status: 400 });

  // a course lesson, or a case file from the CMS
  let doc: { title: string; content: string } | null = null;
  if (story) {
    const src = await getStorySource(story).catch(() => null);
    if (src) doc = { title: src.title, content: src.body };
  } else {
    const lesson = await getLearningResource(week, slug).catch(() => null);
    if (lesson) doc = { title: lesson.resource.title, content: lesson.content };
  }
  if (!doc) return NextResponse.json({ error: story ? "Unknown case file" : "Unknown lesson" }, { status: 404 });
  const kind = story ? "case file" : "lesson";

  const ask = [selection ? `About this part of the ${kind}:\n"""${selection}"""` : "", question || "Explain this part.", body.mode && MODES[body.mode] ? MODES[body.mode] : ""].filter(Boolean).join("\n\n");
  const context = { title: doc.title, text: lessonContext(doc.content, question, selection), kind } as const;
  // the prompt is picked by the model the call actually uses (Haiku 5.5 has its own variant)
  const system = (model: string) => lessonQaSystem(context, promptOptsFor(model, "lesson-qa"));
  const r = await callClaude({
    feature: "lesson-qa",
    userId: me.id,
    adminPreview: isAdminEmail(me.email),
    userKey: ownKey(request),
    system,
    messages: [{ role: "user", content: ask }],
    meta: story ? { story, mode: body.mode ?? null, selection: !!selection } : { week, slug, mode: body.mode ?? null, selection: !!selection },
  });
  if (!r.ok) return NextResponse.json({ error: r.message, status: r.status, creditsLeft: r.creditsLeft }, { status: r.status === "error" ? 502 : 429 });
  await saveTranscript(r.callId, me.id, "lesson-qa", ask, r.text);
  return NextResponse.json({ text: r.text, creditsLeft: r.creditsLeft });
}
