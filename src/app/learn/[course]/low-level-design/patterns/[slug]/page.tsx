import { notFound } from "next/navigation";
import PatternPage from "@/components/learn/lld/PatternPage";
import { PATTERNS, patternBySlug } from "@/lib/learn/lld/meta";
import { casesUsing } from "@/lib/learn/lld/load";
import { getPatternPage, getPatternSlugs } from "@/lib/learn/lld/pattern";
import { COURSE_ID } from "@/lib/learn/course";
import { JsonLd, breadcrumbs } from "@/lib/seo/jsonld";

export const runtime = "nodejs";
// Rendered once and served from the cache, refreshed weekly and on every content push (revalidate-courses / publish); per-visitor state loads on the client.
export const revalidate = 604800;
export const dynamicParams = true;
/** None at build: each path renders on its first visit, then is cached (on-demand ISR). */
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ course: string; slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const p = patternBySlug(slug);
  if (!p) return { title: "Not Found" };
  return {
    title: `${p.name} design pattern | System Design Mastery`,
    description: `${p.problem} Low-level design: the problem, before and after UML, code in four languages, when not to use it, and the case studies that use it.`,
    alternates: { canonical: `/low-level-design/patterns/${slug}` },
  };
}

export default async function PatternRoute({ params }: Props) {
  const { course, slug } = await params;
  const pattern = patternBySlug(slug);
  if (!pattern || course !== COURSE_ID) notFound();
  const [data, cases, written] = await Promise.all([getPatternPage(slug), casesUsing(slug), getPatternSlugs().catch(() => new Set<string>())]);
  const at = PATTERNS.findIndex((p) => p.slug === slug);
  const pick = (i: number) => (PATTERNS[i] ? { slug: PATTERNS[i].slug, name: PATTERNS[i].name } : null);
  const path = `/low-level-design/patterns/${slug}`;
  return (
    <>
      <JsonLd
        data={breadcrumbs([
          { name: "Learn", path: "/" },
          { name: "Low-level design", path: "/low-level-design" },
          { name: pattern.name, path },
        ])}
      />
      <PatternPage pattern={pattern} data={data} written={written.has(slug)} cases={cases} prev={pick(at - 1)} next={pick(at + 1)} />
    </>
  );
}
