import { NextResponse } from "next/server";
import { DSA_FULL } from "@/lib/dsa/flags";
import { conceptLectureHref, getConceptIndex, getConceptLecture, getStepLabels, lessonHref } from "@/lib/dsa/load";
import { stepOf } from "@/lib/dsa/steps";
import { lectureHash, lectureMediaBase } from "@/lib/learn/lecture/load";

/**
 * GET /api/dsa/lecture/<lesson> -> { lecture, quest, source, mediaBase }: the lesson's resolved lecture for the lesson
 * page's inline Watch mode (Learn > Watch). The page itself only carries a small card (length, chapters); the lecture
 * JSON is fetched when the learner opens Watch, so Read pages stay as light as before. 404 in "soon" mode.
 */
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!DSA_FULL) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;
  const [lecture, index, labels] = await Promise.all([getConceptLecture(id).catch(() => null), getConceptIndex(), getStepLabels()]);
  const c = index.find((x) => x.id === id && x.status === "built");
  if (!lecture || lecture.v !== 2 || !c) return NextResponse.json({ error: "No lecture for this lesson yet" }, { status: 404 });
  const quest = { title: c.title, href: lessonHref(c), code: stepOf(labels, c.module).step };
  return NextResponse.json(
    { lecture, quest, source: lectureHash(lecture), mediaBase: lectureMediaBase(), page: conceptLectureHref(id) },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=86400", "x-robots-tag": "noindex" } },
  );
}
