import type { MetadataRoute } from "next";
import { getCourseMap, COURSE_ID } from "@/lib/learn/course";
import { getRevisionWeeks } from "@/lib/learn/revision/load";
import { getLabSummaries } from "@/lib/learn/labs/load";
import { getAllStories } from "@/lib/stories";
import { SITE_URL } from "@/lib/site";
import { TRACKS } from "@/lib/learn/tracks";
import { getCatalogue } from "@/lib/concepts/load";

// Built once and served from the cache; refreshed daily and on every content push (revalidate-courses).
export const revalidate = 86400;

type Entry = MetadataRoute.Sitemap[number];

const STATIC: { path: string; priority: number; freq: Entry["changeFrequency"] }[] = [
  { path: "/", priority: 1, freq: "weekly" },
  { path: "/learn", priority: 0.9, freq: "weekly" },
  { path: `/learn/${COURSE_ID}`, priority: 0.9, freq: "weekly" },
  { path: "/stories", priority: 0.8, freq: "weekly" },
  { path: "/projects", priority: 0.7, freq: "monthly" },
  { path: "/learn/guide", priority: 0.6, freq: "monthly" },
  { path: "/learn/practice", priority: 0.6, freq: "weekly" },
  { path: "/learn/revise", priority: 0.6, freq: "weekly" },
  { path: "/learn/labs", priority: 0.6, freq: "monthly" },
  { path: "/learn/numbers", priority: 0.5, freq: "monthly" },
  { path: "/learn/mastery", priority: 0.5, freq: "monthly" },
  { path: "/learn/mock", priority: 0.6, freq: "monthly" },
  { path: "/learn/mock/peers", priority: 0.5, freq: "weekly" },
  { path: "/learn/tracks", priority: 0.7, freq: "monthly" },
  { path: "/learn/concepts", priority: 0.7, freq: "monthly" },
  { path: "/learn/design-week", priority: 0.6, freq: "weekly" },
  { path: "/learn/plan", priority: 0.4, freq: "monthly" },
  { path: "/learn/arena", priority: 0.5, freq: "weekly" },
  { path: "/play", priority: 0.4, freq: "monthly" },
  { path: "/now", priority: 0.5, freq: "monthly" },
  { path: "/privacy", priority: 0.1, freq: "yearly" },
];

/** A loader that fails (GitHub hiccup) drops its section instead of failing the whole sitemap. */
async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (e) {
    console.warn("[sitemap] section skipped:", (e as Error)?.message);
    return fallback;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [map, decks, labs, stories, concepts] = await Promise.all([
    safe(getCourseMap(), null),
    safe(getRevisionWeeks(), []),
    safe(getLabSummaries(), []),
    safe(getAllStories(), []),
    safe(getCatalogue().then((c) => c.catalogue.concepts), []),
  ]);
  const url = (path: string) => `${SITE_URL}${path}`;
  const out: MetadataRoute.Sitemap = STATIC.map((s) => ({ url: url(s.path), changeFrequency: s.freq, priority: s.priority }));

  if (map) {
    const lessons = [
      ...(map.plan ? [map.plan] : []),
      ...map.weeks.flatMap((w) => [...w.lessons, ...(w.boss ? [w.boss] : [])]),
      ...map.sideQuests,
      ...(map.problems || []),
      ...(map.lld || []),
    ];
    for (const l of lessons) out.push({ url: url(l.href), changeFrequency: "monthly", priority: l.kind === "bonus" ? 0.7 : 0.8 });
    for (const m of map.mocks || []) out.push({ url: url(`/learn/mock/${m.slug}`), changeFrequency: "monthly", priority: 0.5 });
  }
  for (const d of decks) {
    out.push({ url: url(`/learn/cheatsheet/${d.id}`), changeFrequency: "monthly", priority: 0.5 });
    out.push({ url: url(`/learn/revise/${d.id}`), changeFrequency: "monthly", priority: 0.4 });
  }
  for (const c of concepts) out.push({ url: url(`/learn/concepts/${c.id}`), changeFrequency: "monthly", priority: 0.5 });
  for (const t of TRACKS) out.push({ url: url(`/learn/tracks/${t.slug}`), changeFrequency: "monthly", priority: 0.7 });
  for (const l of labs) out.push({ url: url(`/learn/labs/${l.id}`), changeFrequency: "monthly", priority: 0.5 });
  for (const s of stories) {
    out.push({ url: url(`/stories/${s.slug}`), changeFrequency: "monthly", priority: 0.7, ...(s.date ? { lastModified: new Date(s.date) } : {}) });
  }
  // de-duplicate (a lesson href could repeat across sections)
  return [...new Map(out.map((e) => [e.url, e])).values()];
}
