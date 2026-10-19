import { notFound } from "next/navigation";
import { getCourseMap } from "@/lib/learn/course";
import CourseHub from "@/components/learn/hub/CourseHub";

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
    description: `${map.stats.worlds} worlds, ${map.stats.coreLessons} core lessons, ${map.stats.bosses} interview bosses and ${map.stats.sideQuests} side quests. Free, no sign-up to read.`,
  };
}

export default async function CoursePage({ params }: Props) {
  const { course } = await params;
  const map = await getCourseMap(course);
  if (!map) notFound();
  return <CourseHub map={map} />;
}
