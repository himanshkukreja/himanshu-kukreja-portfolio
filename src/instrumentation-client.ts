/**
 * Client instrumentation (Next.js 15.3+). `onRouterTransitionStart` fires synchronously at the
 * start of every app-router navigation: <Link> clicks, router.push/replace and back/forward. It
 * kicks off the global route progress bar (src/components/site/RouteProgress.tsx) so a click always
 * gets instant feedback, even while a dynamic route is still rendering on the server.
 */
import { emitRouteStart } from "@/lib/analytics/bus";

const ROUTE_START_EVENT = "hk:route-start";

export function onRouterTransitionStart(url: string, navigationType: "push" | "replace" | "traverse") {
  try {
    const next = new URL(url, window.location.href);
    // hash-only jumps and same-URL clicks don't load anything
    if (next.pathname === window.location.pathname && next.search === window.location.search) return;
    // analytics gates (/admin is never tracked) must switch before the URL changes
    emitRouteStart(next.pathname);
    window.dispatchEvent(new CustomEvent(ROUTE_START_EVENT, { detail: { url: next.href, navigationType } }));
  } catch {
    /* never let instrumentation break navigation */
  }
}
