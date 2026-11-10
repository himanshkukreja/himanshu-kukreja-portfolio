/**
 * The little celebration for DSA wins (owner, 10 Nov 2026): a short confetti burst from an element (the verdict panel, the
 * lesson's done card), in DSA teal shades, white and one warm amber. No purple. No dependency: a small canvas, drawn
 * only while the burst lasts (about 1.2 s) and removed afterwards.
 *
 * `celebrate()` is the only thing the pages import; the canvas code is loaded on the first call (dynamic import), so
 * nothing ships on pages until a win happens. With prefers-reduced-motion there is no confetti: the element gets a
 * gentle teal highlight that fades instead.
 */
export type CelebrateKind = "first" | "again" | "belt" | "lesson" | "daily";

/** Particles and spread per kind: a first solve is the big one, a re-solve a small one, a belt-up adds a second wave. */
export const BURSTS: Record<CelebrateKind, { count: number; speed: number; waves: number }> = {
  first: { count: 90, speed: 15, waves: 1 },
  again: { count: 28, speed: 10, waves: 1 },
  belt: { count: 90, speed: 16, waves: 2 },
  lesson: { count: 60, speed: 13, waves: 1 },
  daily: { count: 60, speed: 13, waves: 1 },
};

export const CONFETTI_COLORS = ["#14b8a6", "#2dd4bf", "#5eead4", "#0d9488", "#99f6e4", "#ffffff", "#f59e0b"];

export const prefersReducedMotion = (): boolean => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Where the burst starts: the middle of the element (kept on screen), or the lower middle of the viewport. */
export function originOf(el: Element | null | undefined): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!el) return { x: vw / 2, y: vh * 0.6 };
  const r = el.getBoundingClientRect();
  return { x: Math.min(vw - 8, Math.max(8, r.left + r.width / 2)), y: Math.min(vh - 8, Math.max(8, r.top + Math.min(r.height / 2, 60))) };
}

function highlight(el: Element | null | undefined) {
  if (!el || !("animate" in el)) return;
  (el as HTMLElement).animate([{ boxShadow: "0 0 0 3px rgba(20,184,166,0.55)" }, { boxShadow: "0 0 0 3px rgba(20,184,166,0)" }], { duration: 1400, easing: "ease-out" });
}

export async function celebrate(kind: CelebrateKind, from?: Element | null): Promise<void> {
  try {
    if (typeof window === "undefined") return;
    if (prefersReducedMotion()) {
      highlight(from);
      return;
    }
    const { burst } = await import("./confetti");
    burst(originOf(from), BURSTS[kind]);
  } catch {
    /* a celebration must never break the page */
  }
}
