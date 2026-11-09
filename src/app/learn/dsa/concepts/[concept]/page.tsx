import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import { conceptLectureHref, getConcept, getConceptIndex, getConceptLecture, isVisualLesson, lessonHref } from "@/lib/dsa/load";
import { lectureCard } from "@/lib/learn/lecture/load";
import DsaConceptReader from "@/components/dsa/concept/DsaConceptReader";

// A DSA Mastery concept (/dsa/concepts/<concept>): the 6S lesson from the content repo, its six beats as the reader's
// stages. Rendered once and cached (ISR, refreshed on content sync); progress, widgets and the quiz run on the client.
// Staging only until launch (NEXT_PUBLIC_DSA_MODE=full); in "soon" mode the middleware sends /dsa/* to /dsa and this 404s.

export const revalidate = 604800;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ concept: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!DSA_FULL) return { title: "Not found" };
  const { concept } = await params;
  const c = await getConcept(concept).catch(() => null);
  if (!c) return { title: "Not found" };
  return { title: `${c.title} · DSA Mastery`, description: c.summary, alternates: { canonical: `/dsa/concepts/${c.id}` }, robots: { index: false, follow: false } };
}

export default async function ConceptPage({ params }: Props) {
  if (!DSA_FULL) notFound();
  const { concept } = await params;
  const [c, lecture] = await Promise.all([getConcept(concept), getConceptLecture(concept).catch(() => null)]);
  if (!c) {
    // a structure lesson (Academy Part 2) has its own page; old /dsa/concepts/<id> links land there
    const visual = (await getConceptIndex()).find((x) => x.id === concept && isVisualLesson(x));
    if (visual) permanentRedirect(lessonHref(visual));
    notFound();
  }
  // "watch it first": the concept's animated lecture, on its own page (like an SDM lesson's)
  const card = lectureCard(lecture);
  return (
    <div className="dsa-theme">
      <main className="pb-16">
        <DsaConceptReader concept={c} lecture={card ? { ...card, href: conceptLectureHref(c.id) } : null} />
      </main>
    </div>
  );
}
