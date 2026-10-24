import { NextResponse, type NextRequest } from "next/server";
import { shareGate } from "@/lib/share/gate";
import { certGate } from "@/lib/certificates/gate";

/**
 * Dev-only routes (design lab, quiz fixture) must be a hard 404 in production. Their pages also
 * call notFound(), but behind a streamed loading.tsx that still answers HTTP 200.
 *
 * /stories/<slug>: the story route renders case files published from the admin CMS on demand
 * (dynamicParams = true), so an unknown slug would also stream a 200 "not found" page. Gate it
 * here against the published list (repo stories + live CMS case files, from /api/stories): known
 * slugs pass straight through, unknown ones get a real 404. The list is cached per instance and
 * re-read on a miss (at most every 5 s), so a story published a moment ago opens within a few seconds.
 */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FRESH_MS = 30_000;
const MISS_REFRESH_MS = 5_000;
let known: { at: number; slugs: Set<string> } | null = null;
let inflight: Promise<Set<string> | null> | null = null;

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

async function storyGate(req: NextRequest, slug: string) {
  if (!SLUG_RE.test(slug)) return notFound(req);
  const age = known ? Date.now() - known.at : Infinity;
  let slugs = known && age < FRESH_MS ? known.slugs : await loadSlugs(req.nextUrl.origin);
  if (slugs && !slugs.has(slug) && Date.now() - (known?.at ?? 0) > MISS_REFRESH_MS) slugs = await loadSlugs(req.nextUrl.origin);
  // fail open: if the list can't be read, the page decides (notFound() still renders the 404 page)
  if (!slugs || slugs.has(slug)) return NextResponse.next({ request: req });
  return notFound(req);
}

export async function middleware(req: NextRequest) {
  // shared learner pages: unpublished / unknown handles get a real 404 (src/lib/share/gate.ts)
  if (req.nextUrl.pathname.startsWith("/u/")) return shareGate(req);
  // certificate verification pages: unknown or private codes get a real 404 (src/lib/certificates/gate.ts)
  if (req.nextUrl.pathname.startsWith("/cert/")) return certGate(req);
  // the case-file RSS feed sits beside the stories, not a story
  if (req.nextUrl.pathname === "/stories/feed.xml") return NextResponse.next({ request: req });
  const story = /^\/stories\/([^/]+)\/?$/.exec(req.nextUrl.pathname);
  if (story) return storyGate(req, decodeURIComponent(story[1]));
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404, headers: { "x-robots-tag": "noindex" } });
  }
  return NextResponse.next({ request: req });
}

export const config = { matcher: ["/lab/:path*", "/learn/arena/dev/:path*", "/stories/:slug", "/u/:path*", "/cert/:path*"] };
