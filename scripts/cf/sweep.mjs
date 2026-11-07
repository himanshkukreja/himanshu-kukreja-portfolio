// Route sweep against a deployed Worker (staging): samples up to 3 URLs per route group from its sitemap plus
// fixed extras, requests them twice (cold, then warm), prints status/time per URL and a latency summary.
// Pair it with `wrangler tail --format json` to see each request's outcome (ok / exceededMemory / exceededCpu)
// and CPU time. Usage: node scripts/cf/sweep.mjs <base url> [extra paths file]
import { readFileSync } from "node:fs";

const base = process.argv[2].replace(/\/$/, "");
const extras = process.argv[3] ? readFileSync(process.argv[3], "utf8").split("\n").map((s) => s.trim()).filter(Boolean) : [];
const xml = await (await fetch(`${base}/sitemap.xml`)).text();
const paths = [...xml.matchAll(/<loc>https?:\/\/[^/<]+(\/[^<]*)?<\/loc>/g)].map((m) => m[1] || "/");
const groups = new Map();
for (const p of paths) {
  const s = p.split("/").filter(Boolean);
  const k = "/" + [s[0] ?? "", ...s.slice(1, 3).map(() => "*")].join("/");
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(p);
}
const sample = [...groups.values()].flatMap((v) => v.filter((_, i) => i % Math.max(1, Math.floor(v.length / 3)) === 0).slice(0, 3));
const all = [...new Set([...sample, ...extras])];
console.log(`sitemap ${paths.length} urls, ${groups.size} groups, sweeping ${all.length} (twice)`);
const res = [];
for (const round of ["cold", "warm"]) {
  for (const p of all) {
    const t = Date.now();
    let status = 0, bytes = 0;
    try {
      const r = await fetch(base + p, { redirect: "manual", signal: AbortSignal.timeout(60_000) });
      status = r.status;
      bytes = (await r.arrayBuffer()).byteLength;
    } catch (e) {
      status = -1;
    }
    const ms = Date.now() - t;
    res.push({ round, p, status, bytes, ms });
    if (status >= 500 || status < 0 || ms > 5000) console.log(`${round} ${status} ${ms}ms ${p}`);
  }
}
for (const round of ["cold", "warm"]) {
  const ms = res.filter((r) => r.round === round).map((r) => r.ms).sort((a, b) => a - b);
  const q = (f) => ms[Math.min(ms.length - 1, Math.floor(ms.length * f))];
  const bad = res.filter((r) => r.round === round && (r.status >= 500 || r.status < 0)).length;
  console.log(`${round}: n=${ms.length} p50=${q(0.5)}ms p90=${q(0.9)}ms p99=${q(0.99)}ms max=${ms.at(-1)}ms errors(5xx/timeouts)=${bad}`);
}
