import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import { conceptLectureHref, getConceptIndex, getConceptLecture, getStepLabels, lessonHref } from "@/lib/dsa/load";
import { stepOf } from "@/lib/dsa/steps";
import { lectureHash, lectureMediaBase } from "@/lib/learn/lecture/load";
import LecturePlayer from "@/components/learn/lecture/LecturePlayer";

// A DSA Mastery concept's animated lecture (/dsa/concepts/<concept>/lecture): the course's lecture player on the
// resolved lecture (src/lib/dsa/lecture.ts). Recorded media (narration, timings, captions, MP4) comes from the lecture
// media bucket at lectures/dsa--<module>--<concept>/; until it is published the lecture plays with the browser's voice.
// ?record=1 is the MP4 exporter's view (scripts/lecture/export.mjs). Staging only until launch, like the concept page.

export const revalidate = 604800;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ concept: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!DSA_FULL) return { title: "Not found" };
  const { concept } = await params;
  const l = await getConceptLecture(concept).catch(() => null);
  if (!l) return { title: "Not found" };
  return { title: `${l.title} · Lecture · DSA Mastery`, description: l.summary, alternates: { canonical: conceptLectureHref(concept) }, robots: { index: false, follow: false } };
}

export default async function DsaLecturePage({ params }: Props) {
  if (!DSA_FULL) notFound();
  const { concept } = await params;
  const [l, index, labels] = await Promise.all([getConceptLecture(concept), getConceptIndex(), getStepLabels()]);
  // a concept or a structure lesson (Academy Part 2): the lecture plays the same way, its "back" link differs
  const c = index.find((x) => x.id === concept && x.status === "built");
  if (!l || !c) notFound();
  // up next: the next built concept in the course that has a lecture
  const order = index.filter((x) => x.status === "built");
  const after = order.slice(order.findIndex((x) => x.id === concept) + 1);
  let next: { href: string; title: string; code: string } | null = null;
  for (const x of after.slice(0, 3)) {
    const nl = await getConceptLecture(x.id).catch(() => null);
    if (nl) {
      next = { href: conceptLectureHref(x.id), title: nl.title, code: stepOf(labels, x.module).step };
      break;
    }
  }
  const code = stepOf(labels, c.module).step;
  return (
    <div className="dsa-theme">
      <LecturePlayer lecture={l} quest={{ title: c.title, href: lessonHref(c), code }} source={lectureHash(l)} mediaBase={lectureMediaBase()} next={next} />
    </div>
  );
}
