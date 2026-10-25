import { getWarStories } from "@/lib/learn/war/load";
import WarStoriesHub from "@/components/learn/war/WarStoriesHub";

export const runtime = "nodejs";
// Rendered once and served from the cache, refreshed daily and on every content push (revalidate-courses).
export const revalidate = 86400;

export const metadata = {
  title: "War stories · System Design Mastery",
  description:
    "True stories from real systems at their limits, in two minutes each with sources, and war rooms: incident simulations modelled on real postmortems where you make the on-call calls.",
  alternates: { canonical: "/learn/war-stories" },
};

export default async function WarStoriesPage() {
  const { stories, rooms } = await getWarStories();
  return <WarStoriesHub stories={stories} rooms={rooms} />;
}
