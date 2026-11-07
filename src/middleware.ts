import { NextResponse, type NextRequest } from "next/server";
import { shareGate } from "@/lib/share/gate";
import { certGate } from "@/lib/certificates/gate";
import { COURSE_ORIGIN, PORTFOLIO_ORIGIN, isCourseWww, isPortfolioHost, siteOfHost, type Site } from "@/lib/site/hosts";
import { LEARN_FILES, cleanPath, internalPath, legacyTarget } from "@/lib/learn/paths";
import { MOVED_COOKIE } from "@/lib/site/carry";
import { bridgeHtml } from "@/lib/site/bridge";
import { isProductionDeploy } from "@/lib/platform";

/**
 * Two sites, one app (src/lib/site/hosts.ts):
 *
 * Course host (systemdesignmastery.dev): clean course paths are REWRITTEN to their internal routes
 * (src/lib/learn/paths.ts: / → /learn/system-design-mastery, /<feature>/… → /learn/<feature>/…,
 * /<week>/<slug> → /learn/system-design-mastery/<week>/<slug>, /case-files/… → /stories/…), so each
 * page keeps one render and one ISR entry. Old-style /learn/… and /stories/… URLs 308 to the clean
 * path (stored links keep working); portfolio-only pages 308 to the portfolio. www → apex.
 *
 * Portfolio host (himanshukukreja.in, www): every course URL (/learn/**, /stories/**, /cert/**,
 * /u/**, /guide, /newsletter/**) answers 301 → the exact new URL, except a person's first browser
 * navigation (no hk_moved cookie, not a bot), which gets the bridge page that carries their
 * localStorage across first (src/lib/site/carry.ts). Portfolio pages are served as before.
 *
 * Gates (unchanged): dev-only routes are a hard 404 in production; /stories/<slug>, /u/<handle> and
 * /cert/<code> answer a real 404 for unknown slugs instead of a streamed 200 "not found".
 */

/* ------------------------------------------------------------------ case-file slug gate */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FRESH_MS = 30_000;
const MISS_REFRESH_MS = 5_000;
let known: { at: number; slugs: Set<string> } | null = null;
let inflight: Promise<Set<string> | null> | null = null;

/** Origin for the middleware's own API reads (HK_SELF_ORIGIN for local tests that fake the Host header). */
const selfOrigin = (req: NextRequest) => process.env.HK_SELF_ORIGIN || req.nextUrl.origin;

async function loadSlugs(origin: string): Promise<Set<string> | null> {
  inflight ??= (async () => {
    try {
      const res = await fetch(`${origin}/api/stories`, { headers: { "x-hk-slug-gate": "1" }, cache: "no-store" });
      if (!res.ok) return null;
      const body = (await res.json()) as { stories?: { slug?: string }[] };
      const slugs = new Set((body.stories || []).map((s) => s.slug).filter((s): s is string => !!s));
      known = { at: Date.now(), slugs };
      return slugs;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function notFound(req: NextRequest) {
  return NextResponse.rewrite(new URL("/_not-found", req.url), { status: 404, headers: { "x-robots-tag": "noindex" } });
}

/** Known case-file slugs pass (via `pass`), unknown ones get a real 404; fails open. */
async function storyGate(req: NextRequest, slug: string, pass: () => NextResponse) {
  if (!SLUG_RE.test(slug)) return notFound(req);
  const age = known ? Date.now() - known.at : Infinity;
  let slugs = known && age < FRESH_MS ? known.slugs : await loadSlugs(selfOrigin(req));
  if (slugs && !slugs.has(slug) && Date.now() - (known?.at ?? 0) > MISS_REFRESH_MS) slugs = await loadSlugs(selfOrigin(req));
  // fail open: if the list can't be read, the page decides (notFound() still renders the 404 page)
  if (!slugs || slugs.has(slug)) return pass();
  return notFound(req);
}

const PROD = process.env.NODE_ENV === "production";
const devOnly = (p: string) => p === "/lab" || p.startsWith("/lab/") || p.startsWith("/learn/arena/dev");

/* ------------------------------------------------------------------ which site */

/**
 * The real domains always decide. Any other host (localhost, previews) is the portfolio unless
 * overridden: HOST_OVERRIDE=course|portfolio (not on Vercel production; middleware env is read at
 * BUILD time, so set it for the build), or in `next dev` only, ?__site=course|portfolio (remembered in
 * the hk_site cookie) so a browser can act as either host. NEXT_PUBLIC_COURSE_ORIGIN /
 * NEXT_PUBLIC_PORTFOLIO_ORIGIN (e.g. http://localhost:3378 and http://127.0.0.1:3378) make two local
 * origins act as the two sites, with their own localStorage, for testing the bridge.
 */
function resolveSite(req: NextRequest): { site: Site; setCookie?: Site } {
  const host = req.headers.get("host");
  if (isPortfolioHost(host)) return { site: "portfolio" };
  const byHost = siteOfHost(host);
  if (byHost === "course") return { site: "course" };
  if (process.env.NODE_ENV === "development") {
    const q = req.nextUrl.searchParams.get("__site");
    if (q === "course" || q === "portfolio") return { site: q, setCookie: q };
    const c = req.cookies.get("hk_site")?.value;
    if (c === "course" || c === "portfolio") return { site: c };
  }
  const env = process.env.HOST_OVERRIDE;
  // the hk_site cookie too, so the client agrees (the reading themes colour course pages by it: isThemedPage)
  if ((env === "course" || env === "portfolio") && !isProductionDeploy()) return { site: env, ...(req.cookies.get("hk_site")?.value !== env ? { setCookie: env } : {}) };
  return { site: "portfolio" };
}

/* ------------------------------------------------------------------ course host */

/** Next's file-convention image routes (opengraph-image, twitter-image, icon…): served at their internal path. */
const META_IMAGE = /\/(?:opengraph-image|twitter-image|icon|apple-icon)(?:-[\w-]+)?(?:\.\w+)?$/;
/** Pages that only exist on the portfolio. */
const PORTFOLIO_ONLY = /^\/(?:projects|now|play|lab|resume\.pdf)(?:\/|$)/;

function redirect(to: string, status: 301 | 308, extra?: Record<string, string>) {
  const res = NextResponse.redirect(to, status);
  if (extra) for (const [k, v] of Object.entries(extra)) res.headers.set(k, v);
  return res;
}

async function courseHost(req: NextRequest): Promise<NextResponse> {
  const { pathname, search } = req.nextUrl;
  if (isCourseWww(req.headers.get("host"))) return redirect(`${COURSE_ORIGIN}${pathname}${search}`, 308);

  // old-style internal URLs (stored links, old bookmarks): one hop to the clean path
  if (pathname === "/learn" || pathname.startsWith("/learn/") || pathname === "/stories" || pathname.startsWith("/stories/")) {
    if (META_IMAGE.test(pathname)) return NextResponse.next();
    if (PROD && devOnly(pathname)) return new NextResponse("Not found", { status: 404, headers: { "x-robots-tag": "noindex" } });
    const clean = cleanPath(pathname);
    if (clean !== pathname) return redirect(new URL(clean + search, req.url).toString(), 308);
  }

  const legacy = legacyTarget(pathname);
  if (legacy) return redirect(new URL(legacy + search, req.url).toString(), 308);

  if (PORTFOLIO_ONLY.test(pathname)) return redirect(`${PORTFOLIO_ORIGIN}${pathname}${search}`, 308);

  if (pathname.startsWith("/u/")) return shareGate(req);
  if (pathname.startsWith("/cert/")) return certGate(req);

  const internal = internalPath(pathname);
  if (!internal) return NextResponse.next();
  if (PROD && devOnly(internal)) return new NextResponse("Not found", { status: 404, headers: { "x-robots-tag": "noindex" } });
  const to = new URL(internal + search, req.url);
  const rewrite = () => NextResponse.rewrite(to);
  const story = /^\/stories\/([^/]+)\/?$/.exec(internal);
  if (story && story[1] !== "feed.xml") {
    let slug = story[1];
    try {
      slug = decodeURIComponent(slug);
    } catch {
      /* keep */
    }
    return storyGate(req, slug, rewrite);
  }
  return rewrite();
}

/* ------------------------------------------------------------------ portfolio host */

const BOT_UA =
  /bot\b|bot\/|crawl|spider|slurp|archiver|facebookexternalhit|facebookcatalog|embedly|quora link preview|outbrain|pinterest|vkshare|w3c_validator|whatsapp|telegram|discord|slack|linkedin|skype|applebot|bingpreview|google|yandex|baidu|duckduck|semrush|ahrefs|mj12|petal|bytespider|gptbot|claude|anthropic|perplexity|headless|lighthouse|chrome-lighthouse|pagespeed|preview|curl\/|wget|python|go-http|java\/|okhttp|axios|node-fetch|undici|httpclient|libwww|feed|rss|monitor|uptime|validator/i;

/** Portfolio routes (or per-host files) that share a first segment with the course's clean paths. */
const PORTFOLIO_SHARED = new Set(["privacy", "offline", ...LEARN_FILES]);

/**
 * True for course URLs on the old domain, which all move: the old /learn, /stories, /cert, /u,
 * /guide and newsletter URLs, and clean course paths (a clean link rendered on this host, e.g. from
 * an admin page, goes to the course host too).
 */
function isOldCoursePath(p: string) {
  const seg = p.split("/")[1] || "";
  if (p !== "/" && !PORTFOLIO_SHARED.has(seg) && internalPath(p) !== null) return true;
  return (
    p === "/learn" ||
    p.startsWith("/learn/") ||
    p === "/stories" ||
    p.startsWith("/stories/") ||
    p.startsWith("/cert/") ||
    p.startsWith("/u/") ||
    p === "/guide" ||
    p === "/newsletter" ||
    p.startsWith("/newsletter/")
  );
}

/** The exact new URL of an old course URL. */
function newUrlFor(pathname: string, search: string) {
  // OG / Twitter cards of old shares: the course host serves them at their internal path
  if (META_IMAGE.test(pathname)) return `${COURSE_ORIGIN}${pathname}${search}`;
  return `${COURSE_ORIGIN}${cleanPath(pathname)}${search}`;
}

/** A person's top-level page load in a browser (not a bot, prefetch, RSC fetch, feed or file). */
function wantsBridge(req: NextRequest, pathname: string) {
  if (req.method !== "GET") return false;
  if (req.cookies.get(MOVED_COOKIE)) return false;
  if (req.headers.get("rsc") || req.headers.get("next-router-prefetch") || req.headers.get("purpose") === "prefetch" || req.headers.get("sec-purpose")?.includes("prefetch")) return false;
  const mode = req.headers.get("sec-fetch-mode");
  if (mode && mode !== "navigate") return false;
  const dest = req.headers.get("sec-fetch-dest");
  if (dest && dest !== "document") return false;
  if (!(req.headers.get("accept") || "").includes("text/html")) return false;
  const ua = req.headers.get("user-agent") || "";
  if (!ua || BOT_UA.test(ua)) return false;
  if (/\.[a-z0-9]+$/i.test(pathname) || META_IMAGE.test(pathname)) return false;
  if (pathname.startsWith("/newsletter")) return false;
  return true;
}

async function portfolioHost(req: NextRequest): Promise<NextResponse> {
  const { pathname, search } = req.nextUrl;
  if (isOldCoursePath(pathname)) {
    // one-click unsubscribe POSTs from mail providers in older emails: answered here, not redirected
    if (pathname.startsWith("/newsletter/") && req.method !== "GET" && req.method !== "HEAD") return NextResponse.next();
    const to = newUrlFor(pathname, search);
    if (wantsBridge(req, pathname)) {
      return new NextResponse(bridgeHtml(to), {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "x-robots-tag": "noindex", vary: "Cookie, User-Agent" },
      });
    }
    // 301 for reads (search engines move the ranking), 308 keeps the method for anything else
    return redirect(to, req.method === "GET" || req.method === "HEAD" ? 301 : 308, { "cache-control": "public, max-age=3600" });
  }
  if (PROD && devOnly(pathname)) return new NextResponse("Not found", { status: 404, headers: { "x-robots-tag": "noindex" } });
  return NextResponse.next();
}

/* ------------------------------------------------------------------ entry */

export async function middleware(req: NextRequest) {
  const { site, setCookie } = resolveSite(req);
  const res = site === "course" ? await courseHost(req) : await portfolioHost(req);
  if (setCookie) res.cookies.set("hk_site", setCookie, { path: "/", sameSite: "lax" });
  return res;
}

// Everything except Next's assets, /api, the PostHog proxy, public files with an extension and the
// service worker; the course's own dotted routes (podcast.xml, cover, feeds, sitemap, robots…) are listed.
export const config = {
  matcher: [
    "/((?!_next/|api/|hkr/|_vercel/|pyodide/|labs-runtime/|lecture-media/|listen-media/|sw\\.js|favicon\\.ico|.*\\.(?:png|jpe?g|gif|webp|avif|svg|ico|mp4|webm|mp3|m4a|vtt|woff2?|ttf|otf|css|js|mjs|map|wasm|whl|zip|tar|pdf|json)$).*)",
    "/podcast-cover.png",
    "/learn/podcast-cover.png",
    "/papers/index.json",
    "/learn/papers/index.json",
    "/cert/:code/badge.json",
    "/resume.pdf",
  ],
};
