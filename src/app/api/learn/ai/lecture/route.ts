import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { getLearningResource } from "@/lib/github";
import { getLecture } from "@/lib/learn/lecture/load";
import { isLecturePreset, readTags } from "@/lib/learn/lecture/moment";
import { callClaude, ownKey, saveTranscript } from "@/lib/ai/client";
import { isAdminEmail } from "@/lib/ai/access";
import { buildLectureQa } from "@/lib/ai/lectureQa";
import { getStorySource } from "@/lib/stories";
import { fetchMarkdownContent } from "@/lib/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SLUG = /^[A-Za-z0-9-]{1,120}$/;

/**
 * POST /api/learn/ai/lecture { slug, scene, step, question?, preset?, picked?, previous? }
 *   → { text, show, jump, creditsLeft }
 * "Ask about this moment" in a side-quest lecture. Signed-in learners only; same feature, quotas and
 * guardrail as lesson Q&A. The server rebuilds the moment from the lecture itself, and keeps only the
 * answer's [[show]] / [[jump]] tags that point at real nodes and scenes.
 */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const body = (await request.json().catch(() => ({}))) as { slug?: string; scene?: string; step?: number; question?: string; preset?: string; picked?: number | null; previous?: { q?: string; a?: string } | null };
  const slug = String(body.slug || "");
  const sceneId = String(body.scene || "");
  const question = String(body.question || "").trim().slice(0, 600);
  const preset = isLecturePreset(body.preset) ? body.preset : null;
  if (!SLUG.test(slug) || !SLUG.test(sceneId)) return NextResponse.json({ error: "Unknown lecture" }, { status: 400 });
  if (!question && !preset) return NextResponse.json({ error: "Ask a question" }, { status: 400 });

  const lecture = await getLecture(slug);
  if (!lecture) return NextResponse.json({ error: "Unknown lecture" }, { status: 404 });
  // what the lecture teaches: a course lesson, a side quest, or a case file (a story)
  const story = lecture.lesson?.kind === "case" ? await getStorySource(lecture.lesson.slug).catch(() => null) : null;
  const mockMd = lecture.lesson?.kind === "interview" ? await fetchMarkdownContent(`resources/mock-interviews/${lecture.lesson.slug}.md`).catch(() => null) : null;
  const warMd = lecture.lesson?.kind === "story" ? await fetchMarkdownContent(`resources/war-stories/stories/${lecture.lesson.slug}.md`).catch(() => null) : null;
  const quest = story
    ? { resource: { title: story.title }, content: story.body }
    : mockMd
    ? { resource: { title: lecture.title }, content: mockMd }
    : warMd
    ? { resource: { title: lecture.title }, content: warMd }
    : await (lecture.lesson ? getLearningResource(lecture.lesson.week, lecture.lesson.slug) : getLearningResource("bonus-problems", slug)).catch(() => null);
  const prev = body.previous && typeof body.previous.q === "string" && typeof body.previous.a === "string" ? { q: body.previous.q, a: body.previous.a } : null;
  const built = buildLectureQa({
    lecture,
    questTitle: quest?.resource.title ?? lecture.title,
    questMarkdown: quest?.content ?? "",
    sceneId,
    step: Number(body.step) || 0,
    picked: typeof body.picked === "number" ? body.picked : null,
    question,
    preset,
    previous: prev,
  });
  if (!built) return NextResponse.json({ error: "Unknown chapter" }, { status: 400 });

  const r = await callClaude({
    feature: "lesson-qa",
    userId: me.id,
    adminPreview: isAdminEmail(me.email),
    userKey: ownKey(request),
    system: built.system,
    messages: [{ role: "user", content: built.ask }],
    meta: { lecture: slug, scene: built.scene.id, step: built.step, preset },
  });
  if (!r.ok) return NextResponse.json({ error: r.message, status: r.status, creditsLeft: r.creditsLeft }, { status: r.status === "error" ? 502 : 429 });
  await saveTranscript(r.callId, me.id, "lesson-qa", `[lecture ${slug} · ${built.scene.id} · step ${built.step + 1}]\n${built.ask}`, r.text);
  const { text, show, jump } = readTags(r.text, lecture, built.scene);
  return NextResponse.json({ text, show, jump, creditsLeft: r.creditsLeft });
}
