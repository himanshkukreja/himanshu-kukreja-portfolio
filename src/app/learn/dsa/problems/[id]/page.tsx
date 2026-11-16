import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getConcept, getConceptIndex, getProblem, lessonHref } from "@/lib/dsa/load";
import type { ProblemPosition } from "@/components/dsa/problem/ProblemRoom";
import ProblemRoom from "@/components/dsa/problem/ProblemRoom";
import { solutionVideoFor } from "@/lib/dsa/media";

// A DSA Mastery problem (/dsa/problems/<id>): the statement and hints from the content repo, cached (ISR, refreshed on
// content sync); the editor, the browser judge, the editorial (fetched after a solve) and progress run on the client.
// Staging only until launch.

export const revalidate = 604800;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!DSA_FULL) return { title: "Not found" };
  const { id } = await params;
  const p = await getProblem(id).catch(() => null);
  if (!p) return { title: "Not found" };
  return { title: `${p.title} · DSA Mastery`, alternates: { canonical: `/dsa/problems/${p.id}` }, robots: { index: false, follow: false } };
}

export default async function ProblemPage({ params }: Props) {
  if (!DSA_FULL) notFound();
  const { id } = await params;
  // the solution video's length and poster, so the room can show it exists before the editorial (which holds it) opens;
  // read alongside the problem (one after the other added ~1 s to a cold page on staging, Nov 2026)
  const [p, video] = await Promise.all([getProblem(id), solutionVideoFor(id).catch(() => null)]);
  if (!p) notFound();
  const position = await positionOf(p.id, p.concept);
  return (
    <div className="dsa-theme">
      {/* desktop: a split screen exactly the window's height under the header. The page doesn't scroll; the statement
          scrolls in its own column and the editor stays put (a sticky editor still slid at the top and bottom) */}
      <main className="lg:flex lg:h-[calc(100dvh-var(--hk-header-h,61px))] lg:flex-col lg:overflow-hidden">
        {/* "Save offline" sits in the room's header, beside the title (it floated over the editor here) */}
        <ProblemRoom p={p} videoTeaser={video ? { duration: video.duration, poster: video.poster } : null} position={position} />
      </main>
    </div>
  );
}

/**
 * "Practice 2 of 5" and the previous / next problem inside the owning lesson's Practice list (its `practice` front matter),
 * with the lesson to go back to (its Practice section). n and m are 0 when the problem is not in a lesson's list (the room then
 * shows plain "Practice" with the problem ladder's prev / next); null when the lesson itself is missing.
 */
async function positionOf(id: string, concept: string): Promise<ProblemPosition | null> {
  const [c, index] = await Promise.all([getConcept(concept).catch(() => null), getConceptIndex().catch(() => [])]);
  if (!c) return null;
  const at = c.practice.findIndex((x) => x.id === id);
  const summary = index.find((x) => x.id === concept);
  // not in the lesson's list: no n of m, but the lesson is still its home to go back to
  if (at < 0) return { lesson: { title: c.title, href: `${summary ? lessonHref(summary) : `/dsa/concepts/${concept}`}#practice` }, n: 0, m: 0, prev: null, next: null };
  const pick = (x: { id: string; title: string } | undefined) => (x ? { id: x.id, title: x.title } : null);
  return {
    lesson: { title: c.title, href: `${summary ? lessonHref(summary) : `/dsa/concepts/${concept}`}#practice` },
    n: at + 1,
    m: c.practice.length,
    prev: pick(c.practice[at - 1]),
    next: pick(c.practice[at + 1]),
  };
}
