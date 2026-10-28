import "server-only";
/**
 * The lectures as a podcast: one show, every released lecture an episode in course order (serial), the
 * narration track as the audio, chapters (Podcasting 2.0 JSON) and a link back to the animated lecture.
 * Built once a day with the feed (ISR): one media.json read and one HEAD per episode for its size.
 */
import crypto from "node:crypto";
import { lectureMediaBase, listLectures, type LectureSummary } from "@/lib/learn/lecture/load";
import { SITE_URL } from "@/lib/site";

export const PODCAST = {
  title: "System Design Mastery",
  author: "Himanshu Kukreja",
  // the address already published on the site; Apple and Spotify use it to confirm the show is yours
  email: "kukreja.him@gmail.com",
  summary:
    "System design, explained the way it works at real companies: data at scale, failure, caching, messaging, consistency, search, analytics, multi-tenancy and production readiness, plus how UPI, WhatsApp, Aadhaar, Netflix and Google Maps work, interview problems, low-level design, real outages and full mock interviews. Every episode is the narration of an animated lecture; the visuals, quizzes and article are one link away.",
  feedPath: "/learn/podcast.xml",
  pagePath: "/learn/podcast",
  coverPath: "/learn/podcast-cover.png",
};

export type Episode = {
  n: number;
  id: string;
  title: string;
  group: string;
  description: string;
  page: string;
  article: string;
  audio: string;
  bytes: number;
  duration: number;
  published: string;
  chapters: string | null;
};

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    })
  );
  return out;
}

async function episode(base: string, l: LectureSummary): Promise<Omit<Episode, "n"> | null> {
  try {
    const res = await fetch(`${base}/${l.slug}/media.json`, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const m = (await res.json()) as { audio?: string; duration?: number; source?: string };
    if (!m.audio || !m.duration) return null;
    const audio = `${base}/${l.slug}/${m.audio}`;
    const head = await fetch(audio, { method: "HEAD", next: { revalidate: 86400 } });
    const bytes = Number(head.headers.get("content-length")) || 0;
    if (!head.ok || !bytes) return null;
    const lm = Date.parse(res.headers.get("last-modified") || "");
    return {
      id: l.slug,
      title: l.title,
      group: l.group,
      description: l.summary,
      page: `${SITE_URL}${l.href}`,
      article: `${SITE_URL}${l.questHref}`,
      audio,
      bytes,
      duration: Math.round(m.duration),
      published: new Date(Number.isFinite(lm) ? lm : Date.now()).toUTCString(),
      chapters: `${SITE_URL}/learn/podcast/chapters/${l.slug}`,
    };
  } catch {
    return null;
  }
}

/** Every released lecture with audio, in course order (episode 1 = the first lecture of the course). */
export async function podcastEpisodes(): Promise<Episode[]> {
  const base = (lectureMediaBase() || "").replace(/\/$/, "");
  if (!/^https?:\/\//.test(base)) return [];
  const lectures = await listLectures();
  const eps = await pool(lectures, 12, (l) => episode(base, l));
  return eps.filter((e): e is Omit<Episode, "n"> => !!e).map((e, i) => ({ ...e, n: i + 1 }));
}

const x = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const hms = (sec: number) => [Math.floor(sec / 3600), Math.floor((sec % 3600) / 60), sec % 60].map((n) => String(n).padStart(2, "0")).join(":");

/** RSS 2.0 with the iTunes and Podcasting 2.0 namespaces. */
export function podcastXml(eps: Episode[]): string {
  const cover = `${SITE_URL}${PODCAST.coverPath}`;
  const items = eps
    .slice()
    .reverse()
    .map((e) => {
      const notes = `${e.description}\n\nWatch the animated lecture (visuals, quizzes, chapters): ${e.page}\nRead the article: ${e.article}`;
      const html = `<p>${x(e.description)}</p><p><a href="${x(e.page)}">Watch the animated lecture</a> (visuals, quizzes, chapters) · <a href="${x(e.article)}">Read the article</a></p>`;
      return `    <item>
      <title>${x(`${e.title} (${e.group})`)}</title>
      <description><![CDATA[${html}]]></description>
      <itunes:summary>${x(notes)}</itunes:summary>
      <link>${x(e.page)}</link>
      <guid isPermaLink="false">sdm-lecture-${x(e.id)}</guid>
      <pubDate>${e.published}</pubDate>
      <enclosure url="${x(e.audio)}" length="${e.bytes}" type="audio/mpeg"/>
      <itunes:duration>${hms(e.duration)}</itunes:duration>
      <itunes:episode>${e.n}</itunes:episode>
      <itunes:episodeType>full</itunes:episodeType>
      <itunes:explicit>false</itunes:explicit>
      <itunes:image href="${x(cover)}"/>
${e.chapters ? `      <podcast:chapters url="${x(e.chapters)}" type="application/json+chapters"/>\n` : ""}    </item>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${x(PODCAST.title)}</title>
    <link>${SITE_URL}${PODCAST.pagePath}</link>
    <atom:link href="${SITE_URL}${PODCAST.feedPath}" rel="self" type="application/rss+xml"/>
    <language>en</language>
    <copyright>© ${new Date().getFullYear()} ${x(PODCAST.author)}</copyright>
    <description>${x(PODCAST.summary)}</description>
    <itunes:summary>${x(PODCAST.summary)}</itunes:summary>
    <itunes:author>${x(PODCAST.author)}</itunes:author>
    <itunes:owner><itunes:name>${x(PODCAST.author)}</itunes:name><itunes:email>${x(PODCAST.email)}</itunes:email></itunes:owner>
    <itunes:image href="${x(cover)}"/>
    <image><url>${x(cover)}</url><title>${x(PODCAST.title)}</title><link>${SITE_URL}${PODCAST.pagePath}</link></image>
    <itunes:category text="Technology"/>
    <itunes:category text="Education"><itunes:category text="Courses"/></itunes:category>
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>serial</itunes:type>
    <podcast:locked>no</podcast:locked>
    <podcast:guid>${x(podcastGuid())}</podcast:guid>
${items}
  </channel>
</rss>
`;
}

/** Podcasting 2.0 GUID: UUIDv5 of the feed URL without the scheme (namespace ead4c236-bf58-58c6-a2c6-a6b28d128cb6). */
function podcastGuid(): string {
  const ns = Buffer.from("ead4c236bf5858c6a2c6a6b28d128cb6", "hex");
  const name = `${SITE_URL}${PODCAST.feedPath}`.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const h = crypto.createHash("sha1").update(Buffer.concat([ns, Buffer.from(name)])).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const s = h.subarray(0, 16).toString("hex");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
