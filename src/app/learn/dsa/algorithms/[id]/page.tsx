import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import { conceptLectureHref, getConceptLecture } from "@/lib/dsa/load";
import { getStructure } from "@/lib/dsa/structures";
import { lectureCard } from "@/lib/learn/lecture/load";
import StructureReader from "@/components/dsa/structure/StructureReader";

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
  return { title: `${s.title} · DSA Mastery`, description: s.summary, alternates: { canonical: `/dsa/algorithms/${s.id}` }, robots: { index: false, follow: false } };
}

export default async function AlgorithmPage({ params }: Props) {
  if (!DSA_FULL) notFound();
  const { id } = await params;
  const [s, lecture] = await Promise.all([getStructure(id), getConceptLecture(id).catch(() => null)]);
  if (!s || s.kind !== "algorithm") notFound();
  const card = lectureCard(lecture);
  return (
    <div className="dsa-theme">
      <main className="pb-16">
        <StructureReader page={s} lecture={card ? { ...card, href: conceptLectureHref(s.id) } : null} />
      </main>
    </div>
  );
}
