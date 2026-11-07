/**
 * The two sites served by this one Next.js app (edge-safe: no Node APIs, used by the middleware).
 *
 *   course     systemdesignmastery.dev  the System Design Mastery course, case files, certificates,
 *                                       learner profiles, newsletter, privacy, admin, /api
 *   portfolio  himanshukukreja.in       home, projects, now, play (+ privacy, admin, /api); every old
 *                                       course URL there answers 301 → the same page on the course host
 *
 * Origins can be overridden for local testing (NEXT_PUBLIC_COURSE_ORIGIN=http://localhost:3378 makes
 * localhost the course host and every other host, e.g. 127.0.0.1, the portfolio).
 */

export type Site = "course" | "portfolio";

export const COURSE_HOST = "systemdesignmastery.dev";
export const PORTFOLIO_HOST = "himanshukukreja.in";

const trimSlash = (s: string) => s.replace(/\/+$/, "");

/** Canonical course origin (apex; www redirects to it). */
export const COURSE_ORIGIN = trimSlash(process.env.NEXT_PUBLIC_COURSE_ORIGIN || `https://${COURSE_HOST}`);
/** Canonical portfolio origin (the apex 307s to www there, so www is canonical as before). */
export const PORTFOLIO_ORIGIN = trimSlash(process.env.NEXT_PUBLIC_PORTFOLIO_ORIGIN || `https://www.${PORTFOLIO_HOST}`);

export const COURSE_NAME = "System Design Mastery";

const hostOf = (origin: string) => {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return "";
  }
};

// NEXT_PUBLIC_EXTRA_COURSE_HOSTS (comma list, inlined at build): test deploys that act as the course host, e.g.
// the Cloudflare staging Worker on workers.dev (.github/workflows/cloudflare-deploy.yml). No cookie involved,
// so their pages stay cacheable.
const EXTRA_COURSE_HOSTS = (process.env.NEXT_PUBLIC_EXTRA_COURSE_HOSTS || "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
const COURSE_HOSTS = new Set([COURSE_HOST, `www.${COURSE_HOST}`, hostOf(COURSE_ORIGIN), ...EXTRA_COURSE_HOSTS]);
const PORTFOLIO_HOSTS = new Set([PORTFOLIO_HOST, `www.${PORTFOLIO_HOST}`, hostOf(PORTFOLIO_ORIGIN)]);

/** The course's hosts (apex, www, the configured origin's), for scripts that decide before React runs. */
export const COURSE_HOST_NAMES = [...COURSE_HOSTS].filter(Boolean);
export const PORTFOLIO_HOST_NAMES = [...PORTFOLIO_HOSTS].filter(Boolean);

const bare = (host: string | null | undefined) => (host || "").trim().toLowerCase();
const noPort = (host: string) => host.replace(/:\d+$/, "");

/** Which site a Host header belongs to. Unknown hosts (previews, localhost) are the portfolio. */
export function siteOfHost(host: string | null | undefined): Site {
  const h = bare(host);
  if (!h) return "portfolio";
  if (COURSE_HOSTS.has(h) || COURSE_HOSTS.has(noPort(h))) return "course";
  return "portfolio";
}

/** True for the real old domain (apex or www), whose course URLs redirect to the course host. */
export const isPortfolioHost = (host: string | null | undefined) => {
  const h = bare(host);
  return PORTFOLIO_HOSTS.has(h) || PORTFOLIO_HOSTS.has(noPort(h));
};

/** www.systemdesignmastery.dev → the apex. */
export const isCourseWww = (host: string | null | undefined) => noPort(bare(host)) === `www.${COURSE_HOST}`;

/** Which site this browser tab is on (client only; the server can't know without a request). */
export function currentSite(): Site {
  if (typeof window === "undefined") return "portfolio";
  if (process.env.NODE_ENV === "development") {
    const forced = /(?:^|;\s*)hk_site=(course|portfolio)/.exec(document.cookie)?.[1];
    if (forced && !isPortfolioHost(window.location.host) && siteOfHost(window.location.host) !== "course") return forced as Site;
  }
  return siteOfHost(window.location.host);
}

/** Origin of a site. */
export const originOf = (site: Site) => (site === "course" ? COURSE_ORIGIN : PORTFOLIO_ORIGIN);

/** Absolute portfolio URL (course pages link to the portfolio this way). */
export const portfolioUrl = (path = "/") => `${PORTFOLIO_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;

/** Absolute course URL for a path that is already clean (see courseUrl in src/lib/learn/paths.ts for old paths). */
export const courseUrlFor = (path = "/") => `${COURSE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
