import { lessonCard } from "@/lib/og/course-card";
import { lessonOg } from "@/lib/og/lesson-lookup";

export const runtime = "nodejs";
export const alt = "A lesson from System Design Mastery, a free course by Himanshu Kukreja";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 86400;

type Params = { course: string; week: string; slug: string };

export default async function Image({ params }: { params: Params | Promise<Params> }) {
  const { course, week, slug } = await params;
  return lessonCard(await lessonOg(course, week, slug));
}
