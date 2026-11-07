// Cloudflare Worker entry: the OpenNext worker (built by `opennextjs-cloudflare build`) plus
// 1. browser cache headers like Vercel's CDN: Vercel consumes s-maxage / stale-while-revalidate and
//    sends browsers "public, max-age=0, must-revalidate"; a Worker's response reaches the browser as is,
//    and browsers honour stale-while-revalidate in their own cache (stale HTML / RSC from disk);
// 2. the hourly publishing job (vercel.json crons on Vercel): /api/cron/publish-due.
// (Cache header approach from the Markdrop session's Workers audit, Nov 2026.)
// @ts-expect-error built by `opennextjs-cloudflare build`
import { default as handler } from "../.open-next/worker.js";

type Ctx = { waitUntil(p: Promise<unknown>): void };

export default {
  async fetch(request: Request, env: unknown, ctx: Ctx) {
    const res: Response = await handler.fetch(request, env, ctx);
    const cc = res.headers.get("cache-control") || "";
    // test deploys on workers.dev are never indexed
    const testHost = new URL(request.url).hostname.endsWith(".workers.dev");
    if (!/s-maxage|stale-while-revalidate/i.test(cc) && !testHost) return res;
    const out = new Response(res.body, res);
    if (/s-maxage|stale-while-revalidate/i.test(cc)) {
      out.headers.set("cache-control", "public, max-age=0, must-revalidate");
      out.headers.set("cdn-cache-control", cc);
    }
    if (testHost) out.headers.set("x-robots-tag", "noindex, nofollow");
    return out;
  },
  async scheduled(_event: unknown, env: unknown, ctx: Ctx) {
    ctx.waitUntil(handler.fetch(new Request("https://systemdesignmastery.dev/api/cron/publish-due"), env, ctx));
  },
};

// @ts-expect-error built by `opennextjs-cloudflare build`
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "../.open-next/worker.js";
