import { getShorts, getWarStories } from "@/lib/learn/war/load";
import WarStoriesHub from "@/components/learn/war/WarStoriesHub";
import { getLecture, lectureCard } from "@/lib/learn/lecture/load";
import { lessonLectureId } from "@/lib/learn/lecture/types";

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
  const [{ stories, rooms }, shorts] = await Promise.all([getWarStories(), getShorts().catch(() => [])]);
  // which stories have a released video, and how long it is
  const cards = await Promise.all(stories.map((s) => getLecture(lessonLectureId("war-stories", s.slug)).then(lectureCard).catch(() => null)));
  const videos = Object.fromEntries(stories.flatMap((s, k) => (cards[k] ? [[s.slug, cards[k]!.minutes]] : [])));
  return <WarStoriesHub stories={stories} rooms={rooms} videos={videos} shorts={shorts.length} />;
}
