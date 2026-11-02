import type { MetadataRoute } from "next";
import { getCourseMap } from "@/lib/learn/course";
import { getRevisionWeeks } from "@/lib/learn/revision/load";
import { getLabSummaries } from "@/lib/learn/labs/load";
import { getSheetSummaries } from "@/lib/learn/sheets/load";
import { getAllStories } from "@/lib/stories";
import { COURSE_ORIGIN } from "@/lib/site/hosts";
import { getCompanies } from "@/lib/learn/prep/load";
import { lectureMediaBase, listLectures } from "@/lib/learn/lecture/load";
import { listShorts } from "@/lib/learn/shorts/load";
import { getWarStories } from "@/lib/learn/war/load";
import { getCatalogue } from "@/lib/concepts/load";

// The course host's sitemap (systemdesignmastery.dev/sitemap.xml, rewritten here by the middleware):
// clean URLs only. The portfolio's own sitemap is src/app/sitemap.ts.
// Built once and served from the cache; refreshed daily and on every content push (revalidate-courses).
export const revalidate = 86400;

type Entry = MetadataRoute.Sitemap[number];

const STATIC: { path: string; priority: number; freq: Entry["changeFrequency"] }[] = [
  { path: "/", priority: 1, freq: "weekly" },
  { path: "/case-files", priority: 0.8, freq: "weekly" },
  { path: "/guide", priority: 0.6, freq: "monthly" },
  { path: "/prep", priority: 0.8, freq: "weekly" },
  { path: "/prep/companies", priority: 0.8, freq: "weekly" },
  { path: "/prep/questions", priority: 0.7, freq: "weekly" },
  { path: "/prep/lectures", priority: 0.7, freq: "weekly" },
  { path: "/podcast", priority: 0.6, freq: "weekly" },
  { path: "/war-stories", priority: 0.7, freq: "weekly" },
  { path: "/revise", priority: 0.6, freq: "weekly" },
  { path: "/labs", priority: 0.6, freq: "monthly" },
  { path: "/sheets", priority: 0.6, freq: "monthly" },
  { path: "/numbers", priority: 0.5, freq: "monthly" },
  { path: "/mastery", priority: 0.5, freq: "monthly" },
  { path: "/mock", priority: 0.6, freq: "monthly" },
  { path: "/mock/peers", priority: 0.5, freq: "weekly" },
  { path: "/concepts", priority: 0.7, freq: "monthly" },
  { path: "/design-week", priority: 0.6, freq: "weekly" },
  { path: "/plan", priority: 0.4, freq: "monthly" },
  { path: "/arena", priority: 0.5, freq: "weekly" },
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
  const [map, decks, labs, stories, concepts, sheets, companies, war, lectures, shorts] = await Promise.all([
    safe(getCourseMap(), null),
    safe(getRevisionWeeks(), []),
    safe(getLabSummaries(), []),
    safe(getAllStories(), []),
    safe(getCatalogue().then((c) => c.catalogue.concepts), []),
    safe(getSheetSummaries(), []),
    safe(getCompanies(), []),
    safe(getWarStories(), { stories: [], rooms: [] }),
    safe(listLectures(), []),
    safe(listShorts(), []),
  ]);
  // video entries (Google video results): the released files on the media host, with their posters
  const media = (lectureMediaBase() || "").replace(/\/$/, "");
  const hasMedia = /^https?:\/\//.test(media);
  const url = (path: string) => `${COURSE_ORIGIN}${path}`;
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
    for (const m of map.mocks || []) out.push({ url: url(`/mock/${m.slug}`), changeFrequency: "monthly", priority: 0.5 });
  }
  for (const d of decks) {
    out.push({ url: url(`/cheatsheet/${d.id}`), changeFrequency: "monthly", priority: 0.5 });
    out.push({ url: url(`/revise/${d.id}`), changeFrequency: "monthly", priority: 0.4 });
  }
  for (const c of concepts) out.push({ url: url(`/concepts/${c.id}`), changeFrequency: "monthly", priority: 0.5 });
  for (const c of companies) out.push({ url: url(c.href), changeFrequency: "monthly", priority: 0.7 });
  for (const s of war.stories) out.push({ url: url(s.href), changeFrequency: "monthly", priority: 0.5 });
  for (const r of war.rooms) out.push({ url: url(r.href), changeFrequency: "monthly", priority: 0.5 });
  for (const l of labs) out.push({ url: url(`/labs/${l.id}`), changeFrequency: "monthly", priority: 0.5 });
  for (const s of sheets) out.push({ url: url(s.href), changeFrequency: "monthly", priority: 0.6 });
  // Next.js writes the video fields into the XML without escaping them: a title like "AT&T" makes the whole sitemap
  // unreadable to Google, so escape them here (the slice keeps a cut from splitting an entity)
  const x = (v: string, n: number) => v.slice(0, n).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  for (const l of lectures)
    out.push({
      url: url(l.href),
      changeFrequency: "monthly",
      priority: 0.6,
      ...(hasMedia
        ? { videos: [{ title: x(l.title, 100), description: x(l.summary || l.title, 2048), thumbnail_loc: `${media}/${l.slug}/poster.jpg`, content_loc: `${media}/${l.slug}/video.mp4`, duration: Math.max(1, Math.round(l.minutes * 60)), family_friendly: "yes" as const }] }
        : {}),
    });
  // every short has its own watch page (video, transcript, links)
  for (const s of shorts)
    out.push({
      url: url(`/shorts/${s.id}`),
      changeFrequency: "monthly",
      priority: 0.5,
      videos: [{ title: x(s.title, 100), description: x(`${s.label}: ${s.title}`, 2048), thumbnail_loc: s.poster, content_loc: s.src, duration: Math.max(1, s.seconds), family_friendly: "yes" as const }],
    });
  for (const s of stories) {
    out.push({ url: url(`/case-files/${s.slug}`), changeFrequency: "monthly", priority: 0.7, ...(s.date ? { lastModified: new Date(s.date) } : {}) });
  }
  // de-duplicate (a lesson href could repeat across sections)
  return [...new Map(out.map((e) => [e.url, e])).values()];
}
