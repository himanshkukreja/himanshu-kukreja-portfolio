/**
 * Reader geometry helpers. Everything is measured on demand: the global header, the learn
 * sub-nav and the stage rail can all change height (wrapping, theme, viewport), and elements are
 * looked up by id on every call because the content layer may replace nodes (a detached node
 * reports top 0).
 */

/** Bottom edge (px from viewport top) of the sticky/fixed chrome above the reader (site header, learn sub-nav). */
export function headerStackBottom(): number {
  if (typeof document === "undefined") return 0;
  // the learn sub-nav publishes its own and the site header's height on <html>
  const root = window.getComputedStyle(document.documentElement);
  const headerH = parseFloat(root.getPropertyValue("--hk-header-h"));
  const learnH = parseFloat(root.getPropertyValue("--learn-nav-h"));
  let bottom = (Number.isNaN(headerH) ? 0 : headerH) + (Number.isNaN(learnH) ? 0 : learnH);
  document.querySelectorAll<HTMLElement>("header, nav, [data-sticky-header]").forEach((el) => {
    if (el.closest("[data-reader-ui]")) return;
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
  const delta = el.getBoundingClientRect().top - stickyOffset() - 12;
  // long jumps go straight there; a multi-second smooth scroll through a 2-hour lesson helps no one
  const far = Math.abs(delta) > window.innerHeight * 4;
  window.scrollTo({ top: Math.max(0, window.scrollY + delta), behavior: prefersReducedMotion() || far ? "auto" : behavior });
  return true;
}

/** Stage elements in document order, resolved fresh. */
export function stageElement(id: string): HTMLElement | null {
  const el = document.getElementById(id);
  return el && el.isConnected ? el : null;
}
