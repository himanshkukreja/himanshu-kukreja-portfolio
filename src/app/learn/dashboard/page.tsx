import { getCourseMap } from "@/lib/learn/course";
import DashboardClient from "./DashboardClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Profile · Learn · Himanshu Kukreja",
  description: "Your level, streak, trials, badges and XP log in System Design Mastery.",
};

export default async function DashboardPage() {
  // The course map gives the profile real denominators and lesson titles; progress loads client-side.
  const map = await getCourseMap();
  if (!map) return null;
  return <DashboardClient map={map} />;
}
