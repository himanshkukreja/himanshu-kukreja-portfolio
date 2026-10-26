import { getCourseMap } from "@/lib/learn/course";
import DashboardClient from "./DashboardClient";
import { listLectures } from "@/lib/learn/lecture/load";

export const runtime = "nodejs";
// Rendered once and served from the cache, refreshed daily and on every content push (revalidate-courses / publish); per-visitor state (progress, notes, sign-in) loads on the client.
export const revalidate = 86400;

export const metadata = {
  title: "Progress · Learn · Himanshu Kukreja",
  description: "Track, understand and reset your progress in System Design Mastery: course map, streaks, weekly goal, trial scores and your data.",
};

export default async function DashboardPage() {
  // The course map gives the progress page real denominators and lesson titles; progress loads client-side.
  const [map, lectures] = await Promise.all([getCourseMap(), listLectures().catch(() => [])]);
  if (!map) return null;
  return <DashboardClient map={map} lectures={lectures.map((l) => ({ slug: l.slug, title: l.title, href: l.href, minutes: l.minutes, code: l.code, group: l.group }))} />;
}
