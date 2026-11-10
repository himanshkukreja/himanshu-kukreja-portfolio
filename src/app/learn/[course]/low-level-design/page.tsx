import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LldHome from "@/components/learn/lld/LldHome";
import { getCaseRows } from "@/lib/learn/lld/load";
import { getPatternSlugs } from "@/lib/learn/lld/pattern";
import { COURSE_ID } from "@/lib/learn/course";
import { JsonLd, breadcrumbs } from "@/lib/seo/jsonld";

export const runtime = "nodejs";
// Rendered once and served from the cache, refreshed weekly and on every content push (revalidate-courses / publish); per-visitor state (progress) loads on the client.
export const revalidate = 604800;
export const dynamicParams = true;
/** None at build: each path renders on its first visit, then is cached (on-demand ISR). */
export function generateStaticParams() {
  return [];
}

export const metadata: Metadata = {
  title: "Low-level design: patterns and case studies | System Design Mastery",
  description:
    "Machine-coding and low-level design practice: the design patterns catalogue and 22 classic case studies (parking lot, LRU cache, rate limiter, elevator, Splitwise, chess and more), each taught as an interview walkthrough from requirements to follow-ups.",
  alternates: { canonical: "/low-level-design" },
};

type Props = { params: Promise<{ course: string }> };

/** /low-level-design: patterns catalogue, the case-study cards with filters, the suggested path and the pattern map. */
export default async function LowLevelDesignPage({ params }: Props) {
  const { course } = await params;
  if (course !== COURSE_ID) notFound();
  const [cases, patterns] = await Promise.all([getCaseRows(), getPatternSlugs().catch(() => new Set<string>())]);
  return (
    <>
      <JsonLd
        data={breadcrumbs([
          { name: "Learn", path: "/" },
          { name: "Low-level design", path: "/low-level-design" },
        ])}
      />
      <LldHome cases={cases} livePatterns={[...patterns]} />
    </>
  );
}
