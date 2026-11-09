import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getCheatsheet } from "@/lib/dsa/cheatsheet";
import { conceptLectureHref, getConceptLecture } from "@/lib/dsa/load";
import CheatsheetSheet from "@/components/dsa/cheatsheet/CheatsheetSheet";

// /dsa/cheatsheets/<concept>: one concept's printable pattern sheet, cut from its lesson (src/lib/dsa/cheatsheet.ts).
// ISR like the concept page (refreshed on content sync). Staging only until launch.

export const revalidate = 604800;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ concept: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!DSA_FULL) return { title: "Not found" };
  const s = await getCheatsheet((await params).concept).catch(() => null);
  if (!s) return { title: "Not found" };
  return { title: `${s.title} · Cheat sheet · DSA Mastery`, description: `${s.title}: when to use it, the invariant, the template in Python, Java, C++ and JavaScript, complexity and pitfalls.`, alternates: { canonical: `/dsa/cheatsheets/${s.id}` }, robots: { index: false, follow: false } };
}

export default async function DsaCheatsheetPage({ params }: Props) {
  if (!DSA_FULL) notFound();
  const { concept } = await params;
  const [s, lecture] = await Promise.all([getCheatsheet(concept), getConceptLecture(concept).catch(() => null)]);
  if (!s) notFound();
  return (
    <div className="dsa-theme">
      <CheatsheetSheet s={s} lectureHref={lecture ? conceptLectureHref(s.id) : null} />
    </div>
  );
}
