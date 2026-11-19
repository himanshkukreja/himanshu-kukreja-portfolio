import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import { conceptLectureHref, getConceptLecture } from "@/lib/dsa/load";
import { getStructure } from "@/lib/dsa/structures";
import { lectureCard } from "@/lib/learn/lecture/load";
import StructureReader from "@/components/dsa/structure/StructureReader";
import { gateLesson } from "@/lib/gate/server";
import { getLessonExtras } from "@/lib/dsa/lesson-extras";
import { lessonDescription } from "@/lib/dsa/seo";
import { JsonLd, dsaResource, signInGated } from "@/lib/seo/jsonld";

// An algorithm lesson (/dsa/algorithms/<id>), Academy Part 3 "Algorithms": the explainer with step-through demos and
// the visualizer (the learner's own grid, stepped forward and back with predict questions), why it works with code in
// four languages, the build-it lab (function mode), the checkpoint quiz and the warm-up problems (dsa-mastery
// resources/algorithms/<module>/<id>/). Same reader and caching as the structure lessons; staging only until launch.

export const revalidate = 604800;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!DSA_FULL) return { title: "Not found" };
  const { id } = await params;
  const s = await getStructure(id).catch(() => null);
  if (!s || s.kind !== "algorithm") return { title: "Not found" };
  return { title: `${s.title} · DSA Mastery`, description: lessonDescription(s.title, s.summary), alternates: { canonical: `/dsa/algorithms/${s.id}` } };
}

export default async function AlgorithmPage({ params }: Props) {
  if (!DSA_FULL) notFound();
  const { id } = await params;
  const [s, lecture] = await Promise.all([getStructure(id), getConceptLecture(id).catch(() => null)]);
  if (!s || s.kind !== "algorithm") notFound();
  const card = lectureCard(lecture);
  // signed out: the first part, then the sign-in card (src/lib/gate); the whole lesson stays in the HTML
  const gate = gateLesson(s.html, "algorithm");
  const extras = await getLessonExtras(s.id, s.module);
  return (
    <div className="dsa-theme">
      <main className="pb-16">
        <JsonLd data={signInGated(dsaResource({ type: "Lesson", title: s.title, description: lessonDescription(s.title, s.summary), path: `/dsa/algorithms/${s.id}` }), gate.gated)} />
        <StructureReader page={{ ...s, html: gate.html }} lecture={card ? { ...card, href: conceptLectureHref(s.id) } : null} extras={extras} />
      </main>
    </div>
  );
}
