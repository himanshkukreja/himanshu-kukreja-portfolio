import { podcastEpisodes, podcastXml } from "@/lib/learn/podcast";

export const runtime = "nodejs";
// rebuilt once a day (and on the next request after a deploy); podcast apps poll it
export const revalidate = 86400;
export const maxDuration = 60;

/** The lectures as a podcast feed (RSS + iTunes + Podcasting 2.0). */
export async function GET() {
  const eps = await podcastEpisodes();
  // never cache an empty feed: podcast apps would drop every episode
  if (!eps.length) return new Response("Feed temporarily unavailable", { status: 503, headers: { "retry-after": "600" } });
  return new Response(podcastXml(eps), { headers: { "content-type": "application/rss+xml; charset=utf-8" } });
}
