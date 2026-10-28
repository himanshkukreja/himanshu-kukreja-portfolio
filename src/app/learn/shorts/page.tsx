import { hourlyOrder, listShorts, pinnedShortIds } from "@/lib/learn/shorts/load";
import { topShortIds } from "@/lib/learn/shorts/stats";
import { getShorts } from "@/lib/learn/war/load";
import ShortsFeed from "@/components/learn/war/ShortsFeed";

export const runtime = "nodejs";
// Rendered once and served from the cache, refreshed hourly (a new first short) and on every content push.
export const revalidate = 3600;

export const metadata = {
  title: "Shorts · System Design Mastery",
  description: "System design in 2–3 minute vertical videos: one idea each, from the course, side quests, real incidents and interview problems, each linked to its full lecture and article.",
  alternates: { canonical: "/learn/shorts" },
};

export default async function ShortsPage() {
  // top: ranked from the last 30 days of engagement, once an hour with the page (never fails the page)
  const [native, war, top, pins] = await Promise.all([listShorts().catch(() => []), getShorts().catch(() => []), topShortIds().catch(() => [] as string[]), pinnedShortIds().catch(() => [] as string[])]);
  // a war story's native portrait short replaces its letterboxed one
  const nativeOf = new Set(native.map((s) => s.lecture));
  const shorts = [...native, ...war.filter((w) => !nativeOf.has(w.lecture))];
  // pinned shorts (/admin/publishing) lead in their order; the rest are this hour's shuffle
  const pinned = pins.map((id) => shorts.find((s) => s.id === id)).filter((s): s is (typeof shorts)[number] => !!s);
  const rest = shorts.filter((s) => !pins.includes(s.id));
  return <ShortsFeed shorts={[...pinned, ...hourlyOrder(rest)]} top={top} pinned={pinned.map((s) => s.id)} />;
}
