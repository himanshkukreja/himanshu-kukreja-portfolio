import { listShorts } from "@/lib/learn/shorts/load";
import { getShorts } from "@/lib/learn/war/load";
import ShortsFeed from "@/components/learn/war/ShortsFeed";

export const runtime = "nodejs";
// Rendered once and served from the cache, refreshed daily and on every content push (revalidate-courses).
export const revalidate = 86400;

export const metadata = {
  title: "Shorts · System Design Mastery",
  description: "System design in 2–3 minute vertical videos: one idea each, from the course, side quests, real incidents and interview problems, each linked to its full lecture and article.",
  alternates: { canonical: "/learn/shorts" },
};

export default async function ShortsPage() {
  const [native, war] = await Promise.all([listShorts().catch(() => []), getShorts().catch(() => [])]);
  // a war story's native portrait short replaces its letterboxed one
  const nativeOf = new Set(native.map((s) => s.lecture));
  const shorts = [...native, ...war.filter((w) => !nativeOf.has(w.lecture))];
  return <ShortsFeed shorts={shorts} />;
}
