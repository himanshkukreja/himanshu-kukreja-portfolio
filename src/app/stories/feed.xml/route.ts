import { getAllStories } from "@/lib/stories";
import { SITE_URL } from "@/lib/site";

// Static, refreshed daily and on every publish (revalidate-courses refreshes /stories).
export const revalidate = 86400;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** RSS 2.0 feed of the case files, newest first. */
export async function GET() {
  const stories = await getAllStories().catch(() => []);
  const items = stories
    .map((s) => {
      const url = `${SITE_URL}/stories/${s.slug}`;
      const date = s.date ? new Date(s.date) : null;
      return [
        "<item>",
        `<title>${esc(s.title)}</title>`,
        `<link>${url}</link>`,
        `<guid isPermaLink="true">${url}</guid>`,
        s.excerpt ? `<description>${esc(s.excerpt)}</description>` : "",
        date && !isNaN(+date) ? `<pubDate>${date.toUTCString()}</pubDate>` : "",
        ...(s.tags || []).map((t) => `<category>${esc(t)}</category>`),
        "</item>",
      ].join("");
    })
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>Case files · Himanshu Kukreja</title>
<link>${SITE_URL}/stories</link>
<atom:link href="${SITE_URL}/stories/feed.xml" rel="self" type="application/rss+xml"/>
<description>Real outages, scaling stories and system design case files.</description>
<language>en</language>
${items}
</channel>
</rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
