import { notFound } from "next/navigation";
import { COURSE_ID, getCourseMap } from "@/lib/learn/course";
import MockIndex from "@/components/learn/mock/MockIndex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mock interviews · System Design Mastery",
  description: "Timed system design interview loops between the course's worlds: a fictional company, an interviewer, curveballs, a levelled rubric and a hire / no-hire verdict.",
};

export default async function MockIndexPage() {
  const map = await getCourseMap(COURSE_ID);
  if (!map) notFound();
  return <MockIndex map={map} />;
}
