// Warm-up after a deploy or a content release: requests every page in the sitemap so OpenNext re-renders it into
// the ISR cache before visitors arrive (a release expires every course page; the first render rebuilds the course
// data from R2, 17-30 s, then pages take 1-5 s). The first page goes alone so the shared data is rebuilt once, the
// rest go a few at a time. Usage: node scripts/cf/warm.mjs <base url> [concurrency=4]
const base = process.argv[2].replace(/\/$/, "");
const concurrency = Number(process.argv[3] || 4);
const started = Date.now();
const xml = await (await fetch(`${base}/sitemap.xml`)).text();
const paths = [...new Set([...xml.matchAll(/<loc>https?:\/\/[^/<]+(\/[^<]*)?<\/loc>/g)].map((m) => m[1] || "/"))];
// lessons first: they're what the release expired and what most visitors open
paths.sort((a, b) => Number(!/^\/week-/.test(a)) - Number(!/^\/week-/.test(b)));
console.log(`warming ${paths.length} pages from ${base} (${concurrency} at a time)`);

const res = [];
async function hit(p) {
  const t = Date.now();
  let status = 0;
  try {
    const r = await fetch(base + p, { headers: { accept: "text/html" }, redirect: "manual", signal: AbortSignal.timeout(90_000) });
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
