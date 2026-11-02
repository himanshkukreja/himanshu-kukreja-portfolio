/**
 * Course URLs: clean paths on the course host (systemdesignmastery.dev) ↔ the app's internal routes.
 *
 * The pages still live under src/app/learn (and src/app/stories for the case files); the middleware
 * rewrites each clean path to its internal route, so every page keeps one render and one ISR entry.
 *
 *   clean (what links, canonicals and the address bar say)     internal route (src/app)
 *   /                                                           /learn/system-design-mastery
 *   /<area>/<slug>          e.g. /week-04-caching/day-01-…      /learn/system-design-mastery/<area>/<slug>
 *   /<feature>/…            e.g. /lectures/…, /shorts, /prep    /learn/<feature>/…
 *   /case-files, /case-files/<slug>, /case-files/feed.xml       /stories, /stories/<slug>, /stories/feed.xml
 *   /cert/<code>, /u/<handle>, /admin, /api, /auth, /newsletter  unchanged
 *
 * A feature name and a content area never share a first segment (scripts/tests/course-paths.test.mjs).
 * Edge-safe and pure: the middleware, server components and the browser all use it.
 */

// the course host (src/lib/site/hosts.ts COURSE_ORIGIN; inlined so this module has no imports and runs under
// node --test: scripts/tests/course-paths.test.mjs)
const COURSE_ORIGIN = (process.env.NEXT_PUBLIC_COURSE_ORIGIN || "https://systemdesignmastery.dev").replace(/\/+$/, "");

export const COURSE_ID = "system-design-mastery";
export const COURSE_ROOT = `/learn/${COURSE_ID}`;

/** Every directory under src/app/learn that is a feature (not the [course] content route). */
export const LEARN_FEATURES = [
  "answer",
  "arena",
  "bookmarks",
  "canvas",
  "certificate",
  "chat",
  "cheatsheet",
  "concepts",
  "dashboard",
  "design-week",
  "guide",
  "labs",
  "lectures",
  "mastery",
  "memory",
  "mock",
  "notebook",
  "notes",
  "numbers",
  "offline",
  "papers",
  "plan",
  "podcast",
  "prep",
  "privacy",
  "reading",
  "review",
  "revise",
  "saved",
  "sheets",
  "shorts",
  "war-stories",
] as const;

/** Files served by routes under src/app/learn (clean path = the same name at the root). */
export const LEARN_FILES = ["podcast.xml", "podcast-cover.png", "sitemap.xml", "robots.txt", "llms.txt", "manifest.webmanifest"] as const;

const FEATURES = new Set<string>(LEARN_FEATURES);
const FILES = new Set<string>(LEARN_FILES);

/** Old feature names that moved (were next.config redirects): clean path → its new clean path. */
const LEGACY: [RegExp, string][] = [
  [/^\/practice\/?$/, "/prep"],
  [/^\/tracks\/?$/, "/prep/companies"],
  [/^\/tracks\/([^/]+)\/?$/, "/prep/companies/$1"],
  [/^\/search\/?$/, "/chat"],
];

/** Content folders of the course repo: weeks, the plan ("overview"), side quests, problem bank, LLD. */
export const CONTENT_AREA = /^(?:week-\d+(?:-[a-z0-9]+)*|overview|bonus-problems|problem-bank|low-level-design)$/;

export const isFeature = (seg: string) => FEATURES.has(seg);
export const isContentArea = (seg: string) => CONTENT_AREA.test(seg);

/** Splits "/a/b?x=1#y" into path and the rest ("?x=1#y"). */
function split(href: string): [string, string] {
  const i = href.search(/[?#]/);
  return i < 0 ? [href, ""] : [href.slice(0, i), href.slice(i)];
}

/** Legacy feature names → their current clean path (null when not legacy). */
export function legacyTarget(clean: string): string | null {
  for (const [re, to] of LEGACY) if (re.test(clean)) return clean.replace(re, to);
  return null;
}

/**
 * Any course path (old /learn/…, /stories/… or already clean) → its clean path. Idempotent, and a
 * no-op for everything else, so it is safe on any pathname (`usePathname()` answers the internal
 * route during a server render and the clean one in the browser; both normalise to the same value).
 */
export function cleanPath(href: string): string {
  if (!href || href[0] !== "/" || href.startsWith("//")) return href;
  const [path, rest] = split(href);
  let out: string | null = null;
  if (path === "/learn" || path === "/learn/") out = "/";
  else if (path === COURSE_ROOT || path === `${COURSE_ROOT}/`) out = "/";
  else if (path.startsWith(`${COURSE_ROOT}/`)) out = path.slice(COURSE_ROOT.length);
  else if (path.startsWith("/learn/")) out = path.slice("/learn".length);
  else if (path === "/stories" || path === "/stories/") out = "/case-files";
  else if (path.startsWith("/stories/")) out = `/case-files${path.slice("/stories".length)}`;
  if (out === null) return href;
  return (legacyTarget(out) ?? out) + rest;
}

/** cleanPath for hrefs that may be absolute: old-domain URLs become course-host URLs. */
export function cleanHref(href: string): string {
  const m = /^https?:\/\/(?:www\.)?himanshukukreja\.in(\/[^\s]*)?$/i.exec(href);
  if (m) {
    const path = m[1] || "/";
    const clean = cleanPath(path);
    return clean !== path ? `${COURSE_ORIGIN}${clean}` : href;
  }
  return cleanPath(href);
}

/**
 * A clean course path → the internal route that renders it, or null when the path is not a course
 * page (api, admin, auth, cert, u, newsletter, static files, unknown first segments).
 */
export function internalPath(clean: string): string | null {
  const [path, rest] = split(clean);
  if (path === "/" || path === "") return COURSE_ROOT + rest;
  const seg = path.split("/")[1] || "";
  if (FILES.has(seg) && path === `/${seg}`) return `/learn/${seg}${rest}`;
  if (FEATURES.has(seg)) return `/learn${path}${rest}`;
  if (CONTENT_AREA.test(seg)) return `${COURSE_ROOT}${path}${rest}`;
  if (seg === "case-files") {
    const tail = path.slice("/case-files".length);
    // static case-file images live in public/case-files (always with an extension); the feed is a route
    if (tail && /\.[a-z0-9]+$/i.test(tail) && tail !== "/feed.xml") return null;
    return `/stories${tail}${rest}`;
  }
  return null;
}

/** Absolute course URL for any course path (old or clean). */
export const courseUrl = (path = "/") => `${COURSE_ORIGIN}${cleanPath(path.startsWith("/") ? path : `/${path}`)}`;

/** The clean path of a lesson. */
export const lessonPath = (week: string, slug: string) => `/${week}/${slug}`;

/** A lesson's week and slug from its path (clean or old /learn/<course>/<week>/<slug>), else null. */
export function parseLessonPath(href: string | null | undefined): { week: string; slug: string } | null {
  if (!href) return null;
  const [path] = split(cleanPath(href.replace(/^https?:\/\/[^/]+/i, "")));
  const m = /^\/([^/]+)\/([^/]+)\/?$/.exec(path);
  if (!m || !CONTENT_AREA.test(m[1])) return null;
  return { week: decodeURIComponent(m[1]), slug: decodeURIComponent(m[2]) };
}

export const isLessonPath = (href: string | null | undefined) => parseLessonPath(href) !== null;

/** True for course pages (clean or old form); "/" counts only when `hubIsCourse` (the course host). */
export function isCoursePath(href: string, hubIsCourse = true): boolean {
  const [path] = split(cleanPath(href));
  if (path === "/") return hubIsCourse;
  return internalPath(path) !== null;
}

/** The old (pre-move) URL of a clean course path on himanshukukreja.in: the reverse of the redirects. */
export function oldPath(clean: string): string {
  return internalPath(clean)?.replace(new RegExp(`^${COURSE_ROOT}$`), "/learn") ?? clean;
}


/**
 * Analytics: was this page path a course page? Old /learn/… and /stories/… paths (events from before
 * the move) and clean course paths. The bare "/" is the portfolio home or the course hub depending
 * on the host, so it counts only when the event says it was on the course host.
 */
export function isCourseVisit(path: string | null | undefined, host?: string | null): boolean {
  if (!path) return false;
  if (host && /(^|\.)systemdesignmastery\.dev$/i.test(host.replace(/:\d+$/, ""))) return true;
  const [p] = split(path);
  if (p === "/learn" || p.startsWith("/learn/") || p === "/stories" || p.startsWith("/stories/")) return true;
  return p !== "/" && isCoursePath(p, false);
}

const OLD_LINK = /\bhref="(?:https?:\/\/(?:www\.)?himanshukukreja\.in)?(\/(?:learn|stories)(?:[/?#][^"]*)?)"/g;

/** Rendered content (course markdown still says /learn/… and /stories/…): links → clean course paths. */
export const cleanHtmlLinks = (html: string) => html.replace(OLD_LINK, (_m, p: string) => `href="${cleanPath(p)}"`);
