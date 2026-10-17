/**
 * Reader geometry helpers. Everything is measured on demand: the global header and the
 * stage rail can all change height (wrapping, theme, viewport), and elements are
 * looked up by id on every call because the content layer may replace nodes (a detached node
 * reports top 0).
 */

/**
 * The system area at the very top that stays covered while the header is slid away: the installed
 * desktop app's title-bar overlay or the iPhone home-screen app's status bar (0 in a browser tab).
 * Measured from .hk-top-fill (always laid out at that height, see globals.css).
 */
export function topInset(): number {
  if (typeof document === "undefined") return 0;
  const el = document.querySelector<HTMLElement>("[data-top-inset]");
  return el ? el.offsetHeight : 0;
}

/** Bottom edge (px from viewport top) of the sticky/fixed chrome above the reader (site header). */
export function headerStackBottom(): number {
  if (typeof document === "undefined") return 0;
  // the site header publishes its height on <html>; it slides away (data-hidden) while reading
  const header = document.querySelector<HTMLElement>("header[data-focus-hide]");
  const headerH = parseFloat(window.getComputedStyle(document.documentElement).getPropertyValue("--hk-header-h"));
  let bottom = header?.hasAttribute("data-hidden") || Number.isNaN(headerH) ? topInset() : Math.max(headerH, topInset());
  document.querySelectorAll<HTMLElement>("header, nav, [data-sticky-header]").forEach((el) => {
    if (el.closest("[data-reader-ui]") || el.closest("[data-hidden]")) return;
    const cs = window.getComputedStyle(el);
    if (cs.position !== "sticky" && cs.position !== "fixed") return;
    const top = parseFloat(cs.top);
    if (Number.isNaN(top) || top > 240) return; // bottom docks have top:auto
    const h = el.offsetHeight;
    if (!h) return;
    bottom = Math.max(bottom, top + h);
  });
  return bottom;
}

/** Height of the sticky stage rail, 0 when it is not rendered. */
export function stageRailHeight(): number {
  if (typeof document === "undefined") return 0;
  // the compact stage bar that pins once the full rail has scrolled away
  const rail = document.querySelector<HTMLElement>("[data-stage-rail]");
  return rail ? rail.offsetHeight : 0;
}

/** Where content lands under all sticky chrome once scrolled to. */
export function stickyOffset(): number {
  return headerStackBottom() + stageRailHeight();
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Scroll so the element with `id` sits just under the sticky chrome. Returns false if missing. */
export function scrollToId(id: string, behavior: ScrollBehavior = "smooth"): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  // The lesson header slides away while scrolling down and returns on the way up, so the space
  // above the target depends on the direction: going down only the stage bar stays; going up the
  // header comes back on top of it.
  const header = document.querySelector<HTMLElement>("header[data-focus-hide]");
  const headerH = header ? header.offsetHeight : 0;
  const top = el.getBoundingClientRect().top;
  const down = top > headerStackBottom() + stageRailHeight();
  const offset = down && window.scrollY + top > 200 ? topInset() + stageRailHeight() : headerH + stageRailHeight();
  const delta = top - offset - 12;
  // long jumps go straight there; a multi-second smooth scroll through a 2-hour lesson helps no one
  const far = Math.abs(delta) > window.innerHeight * 4;
  window.scrollTo({ top: Math.max(0, window.scrollY + delta), behavior: prefersReducedMotion() || far ? "instant" : behavior });
  return true;
}

/** Stage elements in document order, resolved fresh. */
export function stageElement(id: string): HTMLElement | null {
  const el = document.getElementById(id);
  return el && el.isConnected ? el : null;
}
