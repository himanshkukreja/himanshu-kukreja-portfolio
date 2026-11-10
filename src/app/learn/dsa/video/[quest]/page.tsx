import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import { clipQuestParts, solutionQuestParts } from "@/lib/dsa/lecture";
import { getConceptIndex, getDsaClip, getProblem, getSolutionVideo, getStepLabels, lessonHref, problemHref } from "@/lib/dsa/load";
import { stepOf } from "@/lib/dsa/steps";
import { lectureHash, lectureMediaBase } from "@/lib/learn/lecture/load";
import LecturePlayer from "@/components/learn/lecture/LecturePlayer";

// The recording page of DSA Mastery's short videos: a lesson's in-article clip (dsa--clips--<lesson>--<clip>) or a
// problem's solution video (dsa--solution--<problem>), on the course's lecture player. ?record=1 is the MP4 exporter's
// view (scripts/lecture/export.mjs: clips at 1280x720, solutions at 1920x1080). Learners meet these videos inside the
// lesson (LessonClip) and the problem room's Editorial tab (SolutionVideo), never here: noindex and unlinked.

export const revalidate = 604800;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ quest: string }> };

async function load(quest: string) {
  if (clipQuestParts(quest)) {
    const l = await getDsaClip(quest);
    if (!l) return null;
    const c = (await getConceptIndex()).find((x) => x.id === l.clip?.lesson);
    return c ? { l, quest: { title: c.title, href: lessonHref(c), code: stepOf(await getStepLabels(), c.module).step } } : null;
  }
  const s = solutionQuestParts(quest);
  if (s) {
    const [l, p] = await Promise.all([getSolutionVideo(s.problem), getProblem(s.problem)]);
    return l && p ? { l, quest: { title: p.title, href: problemHref(p.id), code: "Solution" } } : null;
  }
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!DSA_FULL) return { title: "Not found" };
  const { quest } = await params;
  const v = await load(quest).catch(() => null);
  if (!v) return { title: "Not found" };
  return { title: `${v.l.title} · DSA Mastery`, description: v.l.summary, robots: { index: false, follow: false } };
}

export default async function DsaVideoPage({ params }: Props) {
  if (!DSA_FULL) notFound();
  const { quest } = await params;
  const v = await load(quest);
  if (!v) notFound();
  return (
    <div className="dsa-theme">
      <LecturePlayer lecture={v.l} quest={v.quest} source={lectureHash(v.l)} mediaBase={lectureMediaBase()} />
    </div>
  );
}
