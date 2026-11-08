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
// Plain page requests (no RSC/prefetch headers), and API GETs (leaderboard, daily, search…: Vercel's CDN cached the ones
// that send s-maxage; nothing did here until Nov 2026, so each call recomputed, the leaderboard ~24 s). Never with a
// sign-in header; only responses that send s-maxage and no cookie are kept (store()).
const cacheablePageRequest = (r: Request) => {
  if (r.method !== "GET" || r.headers.has("authorization") || r.headers.has("rsc") || r.headers.has("next-router-prefetch")) return false;
  const path = new URL(r.url).pathname;
  return path.startsWith("/api/") || path === "/_next/image" || (r.headers.get("accept") || "").includes("text/html");
};
/** resized images (/_next/image) are kept like Vercel's CDN keeps them, whatever cache header OpenNext sends */
const isImage = (request: Request, res: Response) => new URL(request.url).pathname === "/_next/image" && (res.headers.get("content-type") || "").startsWith("image/");

// On the course host the favicon and app icons come from public/course-brand (next.config.ts rewrites them on Vercel;
// OpenNext doesn't serve a static file reached through a rewrite, so they are answered here). The portfolio host
// (himanshukukreja.in) keeps its own (src/app metadata routes and public/icons).
const COURSE_ICON = /^\/(?:favicon\.ico|icon\.svg|icon\.png|apple-icon\.png|icons\/icon-[\w-]+\.png)$/;
const courseHost = (h: string) => h === "systemdesignmastery.dev" || h.endsWith(".systemdesignmastery.dev") || h.endsWith(".workers.dev");
// the portfolio's apex redirects to www (a Vercel domain setting until 8 Nov 2026)
const PORTFOLIO_APEX = "himanshukukreja.in";

export default {
  async fetch(request: Request, env: { ASSETS?: { fetch(r: Request): Promise<Response> }; CF_VERSION_METADATA?: { id: string }; PAGES?: Kv }, ctx: Ctx) {
    const url = new URL(request.url);
    if (url.hostname === PORTFOLIO_APEX) return Response.redirect(`https://www.${PORTFOLIO_APEX}${url.pathname}${url.search}`, 308);
    // these paths run the Worker first (wrangler.jsonc run_worker_first). The portfolio's favicon / icon / apple-icon
    // are Next metadata routes (src/app), so only its /icons/* PWA files come from the static files here
    if (COURSE_ICON.test(url.pathname) && env.ASSETS) {
      if (courseHost(url.hostname)) return env.ASSETS.fetch(new Request(new URL(`/course-brand${url.pathname}`, url), request));
      if (url.pathname.startsWith("/icons/")) return env.ASSETS.fetch(request);
    }
    const cache = cacheablePageRequest(request) ? edgeCache() : undefined;
    // per deployment: an older copy would reference /_next/static files the new deploy no longer serves
    const key = cache ? new Request(`${url.toString()}${url.search ? "&" : "?"}__edge=${env.CF_VERSION_METADATA?.id ?? ""}`, { method: "GET" }) : null;
    if (cache && key) {
      const layers: Layers = { cache, key, kv: env.PAGES, kvKey: key.url };
      // 1. this colo's cache (fastest, but not consistent across a colo's machines), 2. KV (consistent, ~10-50 ms when
      // hot), 3. OpenNext (its own R2-backed cache, ~1-2 s from India when the colo has no copy, Nov 2026)
      let hit = await cache.match(key);
      let layer = "HIT";
      if (!hit && layers.kv) {
        hit = await fromKv(layers.kv, layers.kvKey);
        layer = "KV";
        if (hit) ctx.waitUntil(cache.put(key, hit.clone()));
      }
      if (hit) {
        const age = (Date.now() - Number(hit.headers.get(STORED_AT) || 0)) / 1000;
        if (age > EDGE_TTL && !refreshing.has(key.url)) {
          refreshing.add(key.url);
          ctx.waitUntil(
            handler
              .fetch(request.clone(), env, ctx)
              .then((res: Response) => {
                // a page that is gone stops being served from here
                if (res.status === 404 || res.status === 410) ctx.waitUntil(Promise.all([cache.delete(key), layers.kv?.delete(layers.kvKey)]));
                return store(layers, request, res, ctx).body?.cancel();
              })
              .catch(() => {})
              .finally(() => refreshing.delete(key.url))
          );
        }
        const out = new Response(hit.body, hit);
        out.headers.delete(STORED_AT);
        out.headers.set("cache-control", "public, max-age=0, must-revalidate");
        out.headers.set("x-edge-cache", age > EDGE_TTL ? `${layer === "KV" ? "KV-" : ""}STALE` : layer);
        return out;
      }
    }
    const res: Response = await handler.fetch(request, env, ctx);
    if (cache && key) return store({ cache, key, kv: env.PAGES, kvKey: key.url }, request, res, ctx);
    return finish(request, res);
  },
  async scheduled(_event: unknown, env: unknown, ctx: Ctx) {
    ctx.waitUntil(handler.fetch(new Request("https://systemdesignmastery.dev/api/cron/publish-due"), env, ctx));
  },
};

type Kv = {
  get(key: string, opts: { type: "arrayBuffer"; cacheTtl?: number }): Promise<ArrayBuffer | null>;
  put(key: string, value: ArrayBuffer | Uint8Array, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
};
type Layers = { cache: Cache; key: Request; kv?: Kv; kvKey: string };

// A KV copy is one value: a JSON line (status and headers) then the body bytes.
const NL = 10;
const SKIP_HEADERS = new Set(["set-cookie", "content-length", "content-encoding", "transfer-encoding", "date", "connection"]);

async function fromKv(kv: Kv, kvKey: string): Promise<Response | null> {
  try {
    const buf = await kv.get(kvKey, { type: "arrayBuffer", cacheTtl: 60 });
    if (!buf) return null;
    const bytes = new Uint8Array(buf);
    const nl = bytes.indexOf(NL);
    if (nl < 0) return null;
    const meta = JSON.parse(new TextDecoder().decode(bytes.subarray(0, nl))) as { s: number; h: [string, string][] };
    return new Response(bytes.subarray(nl + 1), { status: meta.s, headers: meta.h });
  } catch {
    return null;
  }
}

async function toKv(kv: Kv, kvKey: string, copy: Response): Promise<void> {
  const head = new TextEncoder().encode(`${JSON.stringify({ s: copy.status, h: [...copy.headers].filter(([k]) => !SKIP_HEADERS.has(k)) })}\n`);
  const body = new Uint8Array(await copy.arrayBuffer());
  // KV values stay under its 25 MB limit (the search index, ~6 MB, is the largest)
  if (body.byteLength > 20_000_000) return;
  const value = new Uint8Array(head.byteLength + body.byteLength);
  value.set(head, 0);
  value.set(body, head.byteLength);
  // one write per key per second at most: a refresh racing another colo's refresh may be refused (harmless)
  await kv.put(kvKey, value, { expirationTtl: EDGE_KEEP }).catch(() => {});
}

/** The browser's response; an ISR page (s-maxage, no cookies) is also kept in the colo's cache and KV with its time. */
function store(l: Layers, request: Request, res: Response, ctx: Ctx): Response {
  const out = finish(request, res);
  if (res.status !== 200 || res.headers.has("set-cookie") || !(isImage(request, res) || /s-maxage/i.test(res.headers.get("cache-control") || ""))) return out;
  const copy = new Response(out.clone().body, out);
  copy.headers.set("cache-control", `public, s-maxage=${EDGE_KEEP}`);
  // Cloudflare's cache obeys CDN-Cache-Control over Cache-Control: OpenNext's (often s-maxage=1 for a page due a
  // re-render) evicted the copy within a second, so these pages were never answered from here
  copy.headers.delete("cdn-cache-control");
  copy.headers.set(STORED_AT, String(Date.now()));
  const kvCopy = l.kv ? copy.clone() : null;
  ctx.waitUntil(l.cache.put(l.key, copy));
  if (l.kv && kvCopy) ctx.waitUntil(toKv(l.kv, l.kvKey, kvCopy));
  return out;
}

/** Browser cache headers like Vercel's CDN, and noindex on workers.dev test deploys. */
function finish(request: Request, res: Response): Response {
  const cc = res.headers.get("cache-control") || "";
  // test deploys on workers.dev are never indexed
  const host = new URL(request.url).hostname;
  const testHost = host.endsWith(".workers.dev") || host.startsWith("staging.");
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
