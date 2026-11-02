"use client";

/**
 * Which site this page belongs to (src/lib/site/hosts.ts), the same on the server render and in the
 * browser (no hydration mismatch):
 *   - from the route: pages under src/app/learn, /stories (case files), /cert and /u only ever
 *     serve on the course host; /, /projects, /now, /play, /lab only on the portfolio;
 *   - shared pages (admin, auth, newsletter, 404s) follow the tab's host after hydration.
 *
 * useCoursePathname(): the clean course path of the current page. usePathname() answers the
 * internal route (/learn/…) during a server render behind the middleware rewrite and the clean URL
 * in the browser; cleanPath() maps both to the same value.
 */
import { createContext, useContext, useSyncExternalStore } from "react";
import { usePathname, useSelectedLayoutSegments } from "next/navigation";
import { currentSite, type Site } from "@/lib/site/hosts";
import { cleanPath } from "@/lib/learn/paths";

const COURSE_SEGMENTS = new Set(["learn", "stories", "cert", "u"]);
const PORTFOLIO_SEGMENTS = new Set(["projects", "now", "play", "lab"]);

const SiteCtx = createContext<Site>("portfolio");

const noop = () => () => {};

export function SiteModeProvider({ children }: { children: React.ReactNode }) {
  const segs = useSelectedLayoutSegments();
  const first = segs[0];
  const byRoute: Site | null = first === undefined || first === "__PAGE__" ? "portfolio" : COURSE_SEGMENTS.has(first) ? "course" : PORTFOLIO_SEGMENTS.has(first) ? "portfolio" : null;
  const host = useSyncExternalStore<Site | null>(noop, currentSite, () => null);
  const site: Site = byRoute ?? host ?? "portfolio";
  return <SiteCtx.Provider value={site}>{children}</SiteCtx.Provider>;
}

/** "course" on systemdesignmastery.dev pages, "portfolio" on himanshukukreja.in pages. */
export const useSite = () => useContext(SiteCtx);

/** The current page's clean course path (see the note above); other paths unchanged. */
export function useCoursePathname(): string {
  return cleanPath(usePathname() || "/");
}
