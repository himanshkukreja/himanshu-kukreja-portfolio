import { getCourseMap } from "@/lib/learn/course";
import PlannerClient from "@/components/learn/plan/PlannerClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Study planner · Learn · Himanshu Kukreja",
  description: "Pick your interview date and get a day-by-day plan through System Design Mastery, with a revision stretch and a calendar file. Fall behind and it adjusts.",
};

export default async function PlanPage() {
  // The course map gives the planner the real lesson order and minutes; progress loads client-side.
  const map = await getCourseMap();
  if (!map) return null;
  return <PlannerClient map={map} />;
}
