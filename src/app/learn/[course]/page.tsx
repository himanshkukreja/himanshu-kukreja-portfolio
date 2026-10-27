import { notFound } from "next/navigation";
import { getCourseMap } from "@/lib/learn/course";
import CourseHub from "@/components/learn/hub/CourseHub";
import { listShorts } from "@/lib/learn/shorts/load";
import { JsonLd, breadcrumbs, course as courseLd } from "@/lib/seo/jsonld";

export const runtime = "nodejs";
// Rendered once and served from the cache, refreshed daily and on every content push (revalidate-courses / publish); per-visitor state (progress, notes, sign-in) loads on the client.
export const revalidate = 86400;
export const dynamicParams = true;
/** None at build: each path renders on its first visit, then is cached (on-demand ISR). */
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ course: string }> };

export async function generateMetadata({ params }: Props) {
  const { course } = await params;
  const map = await getCourseMap(course).catch(() => null);
  if (!map) return { title: "Not Found" };
  return {
    title: `${map.title} · Learn · Himanshu Kukreja`,
    alternates: { canonical: `/learn/${course}` },
    description: `${map.stats.worlds} worlds, ${map.stats.coreLessons} core lessons, ${map.stats.bosses} interview bosses and ${map.stats.sideQuests} side quests. Free, no sign-up to read.`,
  };
}

export default async function CoursePage({ params }: Props) {
  const { course } = await params;
  const [map, shorts] = await Promise.all([getCourseMap(course), listShorts().catch(() => [])]);
  if (!map) notFound();
  // the shorts row: an even spread across every category for the client to pick from (fresh each visit)
  const stride = Math.max(1, Math.floor(shorts.length / 24));
  const sample = shorts
    .filter((_, k) => k % stride === 0)
    .slice(0, 24)
    .map((s) => ({ id: s.id, title: s.title, label: s.label, poster: s.poster }));
  const path = `/learn/${course}`;
  return (
    <>
      <JsonLd
        data={[
          courseLd({ path, description: map.description, lessons: map.stats.coreLessons, hours: map.stats.totalHours }),
          breadcrumbs([
            { name: "Learn", path: "/learn" },
            { name: map.title, path },
          ]),
        ]}
      />
      <CourseHub map={map} shorts={{ items: sample, total: shorts.length }} />
    </>
  );
}
