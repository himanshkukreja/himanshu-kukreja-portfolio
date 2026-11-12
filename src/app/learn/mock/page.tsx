import { notFound } from "next/navigation";
import { COURSE_ID, getCourseMap } from "@/lib/learn/course";
import MockIndex from "@/components/learn/mock/MockIndex";
import { getCaseRows } from "@/lib/learn/lld/load";
import { lldCourseMocks } from "@/lib/learn/mock/lld-load";

export const runtime = "nodejs";
// Rendered once and served from the cache, refreshed weekly and on every content push (revalidate-courses / publish); per-visitor state (progress, notes, sign-in) loads on the client.
export const revalidate = 604800;

export const metadata = {
  title: "Mock interviews · System Design Mastery",
  description: "Timed system design interview loops between the course's worlds, and machine-coding (LLD) mocks with an AI interviewer on every low-level design case study: a levelled rubric and a hire / no-hire verdict.",
};

export default async function MockIndexPage() {
  const [map, rows] = await Promise.all([getCourseMap(COURSE_ID), getCaseRows().catch(() => [])]);
  if (!map) notFound();
  return <MockIndex map={map} lld={lldCourseMocks(rows)} />;
}
