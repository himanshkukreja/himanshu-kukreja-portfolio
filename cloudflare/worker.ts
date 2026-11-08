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
 * Finished HTML pages kept in the colo's cache. A cached ISR page still costs the OpenNext worker a cache lookup
 * and a tag check (~0.2 s more than Vercel's CDN, Nov 2026); these pages are the same for every visitor (progress,
 * sign-in and theme load in the browser), so repeat requests are answered here. Only plain page requests (no
 * RSC/prefetch headers, no auth) whose response is an ISR page (s-maxage) without cookies.
 *
 * Stale-while-revalidate, like Vercel's CDN: a copy younger than EDGE_TTL is served as is; an older one (up to
 * EDGE_KEEP) is served at once while the page is fetched again in the background. A content release expires
 * every page in OpenNext (revalidatePath), and the next render blocks until it has rebuilt the course data
 * from R2 (17-30 s on the first visits after a release, Nov 2026); with this, visitors get the previous copy
 * and the rebuild happens behind them. A release shows on the visit after the refresh (as with ISR).
 */
const EDGE_TTL = 120;
const EDGE_KEEP = 7 * 24 * 3600;
const STORED_AT = "x-edge-stored-at";
const edgeCache = () => (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
/** pages this isolate is refreshing in the background (one refresh per page at a time) */
const refreshing = new Set<string>();
const cacheablePageRequest = (r: Request) =>
  r.method === "GET" && !r.headers.has("rsc") && !r.headers.has("next-router-prefetch") && !r.headers.has("authorization") && (r.headers.get("accept") || "").includes("text/html");

// This Worker serves the course host only: its favicon and app icons come from public/course-brand (next.config.ts
// rewrites them on Vercel; OpenNext doesn't serve a static file reached through a rewrite, so they are answered here).
const COURSE_ICON = /^\/(?:favicon\.ico|icon\.svg|icon\.png|apple-icon\.png|icons\/icon-[\w-]+\.png)$/;

export default {
  async fetch(request: Request, env: { ASSETS?: { fetch(r: Request): Promise<Response> }; CF_VERSION_METADATA?: { id: string } }, ctx: Ctx) {
    const url = new URL(request.url);
    if (COURSE_ICON.test(url.pathname) && env.ASSETS) return env.ASSETS.fetch(new Request(new URL(`/course-brand${url.pathname}`, url), request));
    const cache = cacheablePageRequest(request) ? edgeCache() : undefined;
    // per deployment: an older copy would reference /_next/static files the new deploy no longer serves
    const key = cache ? new Request(`${url.toString()}${url.search ? "&" : "?"}__edge=${env.CF_VERSION_METADATA?.id ?? ""}`, { method: "GET" }) : null;
    if (cache && key) {
      const hit = await cache.match(key);
      if (hit) {
        const age = (Date.now() - Number(hit.headers.get(STORED_AT) || 0)) / 1000;
        if (age > EDGE_TTL && !refreshing.has(key.url)) {
          refreshing.add(key.url);
          ctx.waitUntil(
            handler
              .fetch(request.clone(), env, ctx)
              .then((res: Response) => {
                // a page that is gone stops being served from here
                if (res.status === 404 || res.status === 410) ctx.waitUntil(cache.delete(key));
                return store(cache, key, request, res, ctx).body?.cancel();
              })
              .catch(() => {})
              .finally(() => refreshing.delete(key.url))
          );
        }
        const out = new Response(hit.body, hit);
        out.headers.delete(STORED_AT);
        out.headers.set("cache-control", "public, max-age=0, must-revalidate");
        out.headers.set("x-edge-cache", age > EDGE_TTL ? "STALE" : "HIT");
        return out;
      }
    }
    const res: Response = await handler.fetch(request, env, ctx);
    if (cache && key) return store(cache, key, request, res, ctx);
    return finish(request, res);
  },
  async scheduled(_event: unknown, env: unknown, ctx: Ctx) {
    ctx.waitUntil(handler.fetch(new Request("https://systemdesignmastery.dev/api/cron/publish-due"), env, ctx));
  },
};

/** The browser's response; an ISR page (s-maxage, no cookies) is also kept in the colo's cache with its time. */
function store(cache: Cache, key: Request, request: Request, res: Response, ctx: Ctx): Response {
  const out = finish(request, res);
  if (res.status !== 200 || !/s-maxage/i.test(res.headers.get("cache-control") || "") || res.headers.has("set-cookie")) return out;
  const copy = new Response(out.clone().body, out);
  copy.headers.set("cache-control", `public, s-maxage=${EDGE_KEEP}`);
  copy.headers.set(STORED_AT, String(Date.now()));
  ctx.waitUntil(cache.put(key, copy));
  return out;
}

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
