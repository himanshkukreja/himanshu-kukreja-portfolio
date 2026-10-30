import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { getLearningResource } from "@/lib/github";
import { COURSE_ID } from "@/lib/learn/course";
import { callClaude, ownKey, saveTranscript } from "@/lib/ai/client";
import { isAdminEmail } from "@/lib/ai/access";
import { parseCheck } from "@/lib/ai/notes";
import { notesCheckSystem } from "@/lib/ai/prompts";
import { notesLessonContext } from "@/lib/ai/retrieve";
import { aiError, lessonKeyOf, notesOf, pageIdOf } from "../_lib/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/learn/ai/notes/check { pageId, lessonKey, notes } → { summary, items, lesson: { title, href }, credits, creditsLeft }
 * The page's typed notes against the lesson it was written beside (Haiku 5.5). The lesson comes from the course
 * loaders (lib/github), cut to its outline and the sections the notes are about (retrieve.ts notesLessonContext: each
 * topic of the notes finds its section by heading, else by the same word scoring as "Ask this lesson"), so the input
 * stays small (about 3-4k tokens). Every item names a real section; what the lesson doesn't
 * cover comes back as "outside" (not in this lesson), never as wrong.
 */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const b = (await request.json().catch(() => ({}))) as { pageId?: unknown; lessonKey?: unknown; notes?: unknown };
  const pageId = pageIdOf(b.pageId);
  const lk = lessonKeyOf(b.lessonKey);
  if (!pageId || !lk) return NextResponse.json({ error: "This page isn't linked to a lesson" }, { status: 400 });
  const notes = notesOf(b.notes);
  if (notes.replace(/\[\?\]/g, "").split(/\s+/).filter(Boolean).length < 6) return NextResponse.json({ error: "There isn't enough on this page to check yet." }, { status: 400 });

  const lesson = await getLearningResource(lk.week, lk.slug).catch(() => null);
  if (!lesson) return NextResponse.json({ error: "Couldn't find this page's lesson" }, { status: 404 });
  // each topic of the notes finds its section (by heading, else by shared words); only the sections shown count as sources
  const context = notesLessonContext(lesson.content, notes);
  const input = `<notes>\n${notes}\n</notes>`;

  const r = await callClaude({
    feature: "notes-check",
    userId: me.id,
    adminPreview: isAdminEmail(me.email),
    userKey: ownKey(request),
    system: notesCheckSystem({ title: lesson.resource.title, text: context.text }),
    messages: [{ role: "user", content: input }],
    meta: { page: pageId, lesson: lk.key },
    timeoutMs: 55_000,
  });
  if (!r.ok) return aiError(r);
  await saveTranscript(r.callId, me.id, "notes-check", input, r.text);
  const parsed = parseCheck(r.text, context.sections, context.texts, notes, context.outline);
  const href = `/learn/${COURSE_ID}/${lk.week}/${lk.slug}`;
  // an answer that isn't the JSON asked for: show it as text rather than lose what was paid for
  if (!parsed) return NextResponse.json({ summary: "", items: [], raw: r.text.slice(0, 4000), lesson: { title: lesson.resource.title, href }, credits: r.credits, creditsLeft: r.creditsLeft });
  return NextResponse.json({ ...parsed, lesson: { title: lesson.resource.title, href }, credits: r.credits, creditsLeft: r.creditsLeft });
}
