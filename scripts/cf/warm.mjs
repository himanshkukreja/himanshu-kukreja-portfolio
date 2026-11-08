// Warm-up after a deploy or a content release: requests every page in the sitemap so OpenNext re-renders it into
// the ISR cache before visitors arrive (a release expires every course page; the first render rebuilds the course
// data from R2, 17-30 s, then pages take 1-5 s). The first page goes alone so the shared data is rebuilt once, the
// rest go a few at a time. By default only what matters most after a deploy (about 100 of the ~1,400 sitemap
// pages, so about a tenth of the CPU): lessons, top-level hubs and the search index routes the course chat loads; every other
// page is rendered on its first visit and then served stale-while-revalidate. `all` warms the whole sitemap.
// Usage: node scripts/cf/warm.mjs <base url> [concurrency=4] [lean|all]
const base = process.argv[2].replace(/\/$/, "");
const concurrency = Number(process.argv[3] || 4);
const mode = process.argv[4] || "lean";
const started = Date.now();
const xml = await (await fetch(`${base}/sitemap.xml`)).text();
const sitemap = [...new Set([...xml.matchAll(/<loc>https?:\/\/[^/<]+(\/[^<]*)?<\/loc>/g)].map((m) => m[1] || "/"))];
// lessons (/week-…), the home page and one-segment hubs (/labs, /papers, /prep…)
const lean = (p) => p === "/" || /^\/week-/.test(p) || p.split("/").filter(Boolean).length === 1;
const extras = ["/api/search/index/a", "/api/search/index/b", "/api/search/index/c", "/api/search/index/d", "/api/search/index/e", "/api/search/transcripts", "/api/search",
  // slow to render cold (podcast apps time out on a 39 s feed), so never left for the first visitor
  // builds the search Worker's engine (its Durable Object starts empty after a deploy) before Ask AI needs it
  `/api/search/smart?q=warm-${Date.now()}`,
  "/podcast.xml", "/papers/index.json", "/revise/anki.txt", "/llms.txt", "/shorts", "/api/offline/catalog", "/api/learn/leaderboard", "/api/learn/daily"];
const paths = [...extras, ...(mode === "all" ? sitemap : sitemap.filter(lean))];
// lessons first: they're what the release expired and what most visitors open
// the search index routes first (the search engine is built from them), then lessons
const rank = (p) => (p.startsWith("/api/search/index") || p === "/api/search/transcripts" ? 0 : p.startsWith("/api/search/smart") ? 1 : /^\/week-/.test(p) ? 2 : 3);
paths.sort((a, b) => rank(a) - rank(b));
console.log(`warming ${paths.length} of ${sitemap.length} sitemap pages + search indexes from ${base} (${mode}, ${concurrency} at a time)`);

const res = [];
async function hit(p) {
  const t = Date.now();
  let status = 0;
  try {
    const r = await fetch(base + p, { headers: { accept: p.startsWith("/api/") ? "application/json" : "text/html" }, redirect: "manual", signal: AbortSignal.timeout(90_000) });
    status = r.status;
    await r.arrayBuffer();
  } catch {
    status = -1;
  }
  const ms = Date.now() - t;
  res.push({ p, status, ms });
  if (status >= 500 || status < 0 || ms > 10_000) console.log(`${status} ${ms}ms ${p}`);
}

await hit(paths[0]);
let next = 1;
await Promise.all(Array.from({ length: concurrency }, async () => { while (next < paths.length) await hit(paths[next++]); }));

const ms = res.map((r) => r.ms).sort((a, b) => a - b);
const q = (f) => ms[Math.min(ms.length - 1, Math.floor(ms.length * f))];
const failed = res.filter((r) => r.status >= 500 || r.status < 0).length;
console.log(`done in ${Math.round((Date.now() - started) / 1000)} s: p50 ${q(0.5)} ms, p90 ${q(0.9)} ms, max ${ms.at(-1)} ms, ${failed} failed`);
