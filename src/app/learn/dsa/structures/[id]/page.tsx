import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import { conceptLectureHref, getConceptLecture } from "@/lib/dsa/load";
import { getStructure } from "@/lib/dsa/structures";
import { lectureCard } from "@/lib/learn/lecture/load";
import StructureReader from "@/components/dsa/structure/StructureReader";
import { gateLesson } from "@/lib/gate/server";
import { getLessonExtras } from "@/lib/dsa/lesson-extras";
import { lessonDescription } from "@/lib/dsa/seo";
import { JsonLd, dsaResource, signInGated } from "@/lib/seo/jsonld";

// A structure lesson (/dsa/structures/<id>), Academy Part 2 "Core data structures": the visual explainer with its
// memory picture, step-by-step demos and the sandbox, the build-it-yourself lab, the checkpoint quiz and the warm-up
// problems (dsa-mastery resources/structures/<module>/<id>/). Rendered once and cached (ISR, refreshed on content
// sync); the sandbox, lab and progress run on the client. Staging only until launch (NEXT_PUBLIC_DSA_MODE=full).

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
  if (!s || s.kind !== "structure") return { title: "Not found" };
  return { title: `${s.title} · DSA Mastery`, description: lessonDescription(s.title, s.summary), alternates: { canonical: `/dsa/structures/${s.id}` } };
}

export default async function StructurePage({ params }: Props) {
  if (!DSA_FULL) notFound();
  const { id } = await params;
  const [s, lecture] = await Promise.all([getStructure(id), getConceptLecture(id).catch(() => null)]);
  if (!s) notFound();
  if (s.kind === "algorithm") permanentRedirect(`/dsa/algorithms/${s.id}`);
  const card = lectureCard(lecture);
  // signed out: the first part, then the sign-in card (src/lib/gate); the whole lesson stays in the HTML
  const gate = gateLesson(s.html, "structure");
  const extras = await getLessonExtras(s.id, s.module);
  return (
    <div className="dsa-theme">
      <main className="pb-16">
        <JsonLd data={signInGated(dsaResource({ type: "Lesson", title: s.title, description: lessonDescription(s.title, s.summary), path: `/dsa/structures/${s.id}` }), gate.gated)} />
        <StructureReader page={{ ...s, html: gate.html }} lecture={card ? { ...card, href: conceptLectureHref(s.id) } : null} extras={extras} />
      </main>
    </div>
  );
}
