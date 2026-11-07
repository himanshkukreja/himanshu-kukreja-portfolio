// Cloudflare Worker entry: the OpenNext worker (built by `opennextjs-cloudflare build`) plus
// 1. browser cache headers like Vercel's CDN: Vercel consumes s-maxage / stale-while-revalidate and
//    sends browsers "public, max-age=0, must-revalidate"; a Worker's response reaches the browser as is,
//    and browsers honour stale-while-revalidate in their own cache (stale HTML / RSC from disk);
// 2. the hourly publishing job (vercel.json crons on Vercel): /api/cron/publish-due.
// (Cache header approach from the Markdrop session's Workers audit, Nov 2026.)
// @ts-expect-error built by `opennextjs-cloudflare build`
import { default as handler } from "../.open-next/worker.js";

type Ctx = { waitUntil(p: Promise<unknown>): void };

/**
 * Finished HTML pages kept in the colo's cache for 2 minutes. A cached ISR page still costs the OpenNext
 * worker a cache lookup and a tag check (~0.2 s more than Vercel's CDN, Nov 2026); these pages are the same
 * for every visitor (progress, sign-in and theme load in the browser), so repeat requests are answered
 * here. Only plain page requests (no RSC/prefetch headers, no auth) whose response is an ISR page
 * (s-maxage) without cookies. A content release shows within ~2 minutes everywhere.
 */
const EDGE_TTL = 120;
const edgeCache = () => (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
const cacheablePageRequest = (r: Request) =>
  r.method === "GET" && !r.headers.has("rsc") && !r.headers.has("next-router-prefetch") && !r.headers.has("authorization") && (r.headers.get("accept") || "").includes("text/html");

// This Worker serves the course host only: its favicon and app icons come from public/course-brand (next.config.ts
// rewrites them on Vercel; OpenNext doesn't serve a static file reached through a rewrite, so they are answered here).
const COURSE_ICON = /^\/(?:favicon\.ico|icon\.svg|icon\.png|apple-icon\.png|icons\/icon-[\w-]+\.png)$/;

export default {
  async fetch(request: Request, env: { ASSETS?: { fetch(r: Request): Promise<Response> } }, ctx: Ctx) {
    const url = new URL(request.url);
    if (COURSE_ICON.test(url.pathname) && env.ASSETS) return env.ASSETS.fetch(new Request(new URL(`/course-brand${url.pathname}`, url), request));
    const cache = cacheablePageRequest(request) ? edgeCache() : undefined;
    const key = cache ? new Request(new URL(request.url).toString(), { method: "GET" }) : null;
    if (cache && key) {
      const hit = await cache.match(key);
      if (hit) {
        const out = new Response(hit.body, hit);
        out.headers.set("cache-control", "public, max-age=0, must-revalidate");
        return out;
      }
    }
    const res: Response = await handler.fetch(request, env, ctx);
    if (cache && key && res.status === 200 && /s-maxage/i.test(res.headers.get("cache-control") || "") && !res.headers.has("set-cookie")) {
      const out = finish(request, res);
      const copy = new Response(out.clone().body, out);
      copy.headers.set("cache-control", `public, s-maxage=${EDGE_TTL}`);
      ctx.waitUntil(cache.put(key, copy));
      return out;
    }
    return finish(request, res);
  },
  async scheduled(_event: unknown, env: unknown, ctx: Ctx) {
    ctx.waitUntil(handler.fetch(new Request("https://systemdesignmastery.dev/api/cron/publish-due"), env, ctx));
  },
};

/** Browser cache headers like Vercel's CDN, and noindex on workers.dev test deploys. */
function finish(request: Request, res: Response): Response {
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
}


// @ts-expect-error built by `opennextjs-cloudflare build`
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "../.open-next/worker.js";
