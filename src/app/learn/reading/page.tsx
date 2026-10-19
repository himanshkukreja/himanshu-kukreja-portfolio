import { getTrailIndex } from "@/lib/learn/trail/load";
import TrailIndex from "@/components/learn/trail/TrailIndex";

export const runtime = "nodejs";
// Rendered once and served from the cache, refreshed daily and on every content push (revalidate-courses / publish); per-visitor state (progress, notes, sign-in) loads on the client.
export const revalidate = 86400;

export const metadata = {
  title: "Reading trail · System Design Mastery",
  description:
    "Real engineering write-ups for every lesson of System Design Mastery: blogs from Uber, Netflix, Razorpay, Zerodha, Discord, PhonePe and more, classic papers and postmortems, each with a three-line summary of how it connects to the lesson.",
};

export default async function ReadingTrailPage() {
  const { groups, total } = await getTrailIndex();
  return <TrailIndex groups={groups} total={total} />;
}
