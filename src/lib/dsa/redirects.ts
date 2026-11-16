/**
 * DSA Mastery's old URLs to their new homes (redesign, 16 Nov 2026), for the redirects that read or produce a query.
 * Pure and import-free (the middleware, the tests and nothing else use it). The path-only ones (`/dsa/problems`,
 * `/dsa/revise`, `/dsa/stats`) are LEGACY rows in src/lib/learn/paths.ts instead, so cleanPath() rewrites rendered links.
 *
 *   /dsa?world=<id>              the old six worlds: academy and anything unknown go to /dsa, the others to their new place
 *   /dsa?node=<code>.<slug>      a map stop (lesson-stops.ts mapHref) to its module: /dsa#<code>
 *   /dsa/lectures                /dsa?view=lectures
 *   /dsa/daily                   /dsa/practice?list=daily
 *
 * A match answers 308 with the exact target; every other query parameter is dropped. /dsa?view=lectures and a plain
 * /dsa are not redirected, so there is no loop. Clean course paths in, a clean path (with query / hash) out.
 */

export const WORLD_TARGETS: Record<string, string> = {
  academy: "/dsa",
  "product-districts": "/dsa/practice?list=interview-patterns",
  "challenge-league": "/dsa/practice?list=cp-camps",
  "career-studio": "/dsa/progress#plan",
  "release-train": "/dsa/review#plans",
  infrastructure: "/dsa/practice?list=systems-bridge",
};

/** A region code as academy.yml writes it: m3, s1, a2. */
const CODE = /^([a-z]\d{1,2})\./;

export function dsaRedirect(pathname: string, search: URLSearchParams | string): string | null {
  const q = typeof search === "string" ? new URLSearchParams(search) : search;
  if (pathname === "/dsa" || pathname === "/dsa/") {
    if (q.has("world")) return WORLD_TARGETS[q.get("world") || ""] ?? "/dsa";
    if (q.has("node")) {
      const code = CODE.exec((q.get("node") || "").toLowerCase())?.[1];
      return code ? `/dsa#${code}` : "/dsa";
    }
    return null;
  }
  if (pathname === "/dsa/lectures" || pathname === "/dsa/lectures/") return "/dsa?view=lectures";
  if (pathname === "/dsa/daily" || pathname === "/dsa/daily/") return "/dsa/practice?list=daily";
  return null;
}
