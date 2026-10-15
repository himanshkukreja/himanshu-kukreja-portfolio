import { getCourseMap } from "@/lib/learn/course";
import DashboardClient from "./DashboardClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Progress · Learn · Himanshu Kukreja",
  description: "Track, understand and reset your progress in System Design Mastery: course map, streaks, weekly goal, trial scores and your data.",
};

export default async function DashboardPage() {
  // The course map gives the progress page real denominators and lesson titles; progress loads client-side.
  const map = await getCourseMap();
  if (!map) return null;
  return <DashboardClient map={map} />;
}
