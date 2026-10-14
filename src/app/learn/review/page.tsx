import { getCourseMap } from "@/lib/learn/course";
import ReviewSession from "@/components/learn/review/ReviewSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Daily standup · Learn · Himanshu Kukreja",
  description: "Five minutes of spaced repetition on what you missed, flagged or highlighted in System Design Mastery.",
};

export default async function ReviewPage() {
  const map = await getCourseMap();
  if (!map) return null;
  return <ReviewSession map={map} />;
}
