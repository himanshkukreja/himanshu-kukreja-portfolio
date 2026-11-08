// A content release on the Cloudflare-served site: revalidate the course, wait out the tag cache's colo TTL (60 s, see
// open-next.config.ts: colos may answer "never revalidated" for that long and pages re-rendered there would keep the
// old content), revalidate again, then warm the pages. Usage:
//   ANALYTICS_ADMIN_TOKEN=… node scripts/cf/release.mjs [base url = https://systemdesignmastery.dev] [--no-warm]
import { spawnSync } from "node:child_process";

const base = (process.argv.find((a, i) => i > 1 && a.startsWith("http")) || "https://systemdesignmastery.dev").replace(/\/$/, "");
const token = process.env.ANALYTICS_ADMIN_TOKEN;
if (!token) throw new Error("ANALYTICS_ADMIN_TOKEN is not set");

async function revalidate(pass) {
  const t = Date.now();
  const r = await fetch(`${base}/api/revalidate-courses`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
  console.log(`revalidate pass ${pass}: ${r.status} in ${Date.now() - t} ms`);
  if (!r.ok) throw new Error(`revalidate failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
}

await revalidate(1);
console.log("waiting 75 s for every colo's tag cache to expire…");
await new Promise((r) => setTimeout(r, 75_000));
await revalidate(2);
if (!process.argv.includes("--no-warm")) {
  const warm = spawnSync(process.execPath, [new URL("./warm.mjs", import.meta.url).pathname, base, "4"], { stdio: "inherit" });
  process.exitCode = warm.status ?? 1;
}
