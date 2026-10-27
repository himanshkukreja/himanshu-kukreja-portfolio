import { getShorts } from "@/lib/learn/war/load";
import ShortsFeed from "@/components/learn/war/ShortsFeed";

export const runtime = "nodejs";
// Rendered once and served from the cache, refreshed daily and on every content push (revalidate-courses).
export const revalidate = 86400;

export const metadata = {
  title: "War story shorts · System Design Mastery",
  description: "True stories of real systems at their limits, as 2–3 minute vertical videos: swipe through outages, migrations and scale records, each with its full story and sources.",
  alternates: { canonical: "/learn/war-stories/shorts" },
};

export default async function ShortsPage() {
  const shorts = await getShorts();
  return <ShortsFeed shorts={shorts} />;
}
