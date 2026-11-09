import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import { conceptLectureHref, getConceptLecture } from "@/lib/dsa/load";
import { getStructure } from "@/lib/dsa/structures";
import { lectureCard } from "@/lib/learn/lecture/load";
import StructureReader from "@/components/dsa/structure/StructureReader";

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
  return { title: `${s.title} · DSA Mastery`, description: s.summary, alternates: { canonical: `/dsa/structures/${s.id}` }, robots: { index: false, follow: false } };
}

export default async function StructurePage({ params }: Props) {
  if (!DSA_FULL) notFound();
  const { id } = await params;
  const [s, lecture] = await Promise.all([getStructure(id), getConceptLecture(id).catch(() => null)]);
  if (!s) notFound();
  if (s.kind === "algorithm") permanentRedirect(`/dsa/algorithms/${s.id}`);
  const card = lectureCard(lecture);
  return (
    <div className="dsa-theme">
      <main className="pb-16">
        <StructureReader page={s} lecture={card ? { ...card, href: conceptLectureHref(s.id) } : null} />
      </main>
    </div>
  );
}
