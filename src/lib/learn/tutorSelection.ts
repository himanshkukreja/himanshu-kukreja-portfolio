/**
 * "Explain this" / "Ask the tutor" on a passage the learner selected in an article (lesson, side quest,
 * problem, case file, war story). The selection toolbar calls `openTutor`, which hands the passage to the
 * course chat panel through one window event:
 *
 *   window.dispatchEvent(new CustomEvent("tutor:open", { detail: {
 *     prompt: "Explain this: …",                     // "" for Ask the tutor (the learner types the question)
 *     context: { kind: "selection", text, href: location.pathname + "#<nearest heading id>", heading },
 *     send: true,                                     // false for Ask the tutor
 *   } }))
 *
 * The chat panel owns the listener; this side only builds the detail.
 */
import { cleanText } from "@/lib/learn/askAi";

export const TUTOR_OPEN_EVENT = "tutor:open";
/** shorter than this is a word lookup, not a passage to explain */
export const TUTOR_MIN_WORDS = 3;
/** longer than this is a whole section: ask about the page instead */
export const TUTOR_MAX_CHARS = 1200;

export type TutorSelectionContext = {
  kind: "selection";
  text: string;
  href: string;
  heading: string;
};
export type TutorOpenDetail = {
  prompt: string;
  context: TutorSelectionContext;
  send: boolean;
};

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** Is this selected text a passage the tutor can explain (3 words to 1,200 characters)? */
export function tutorEligible(text: string | null | undefined): boolean {
  const t = squash(text || "");
  return t.length > 0 && t.length <= TUTOR_MAX_CHARS && t.split(" ").length >= TUTOR_MIN_WORDS;
}

/** The last heading at or before the selection's start, inside `root` (UI chrome skipped). */
function nearestHeading(range: Range, root: Element): HTMLElement | null {
  let found: HTMLElement | null = null;
  for (const h of root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")) {
    if (h.closest("[data-sd-chrome]")) continue;
    if (h.contains(range.startContainer) || range.comparePoint(h, 0) < 0) found = h;
    else break;
  }
  return found;
}

/** The selection as the tutor's context, or null when it is outside `root` or not a passage. */
export function tutorSelection(range: Range, root: Element): TutorSelectionContext | null {
  if (!root.contains(range.commonAncestorContainer)) return null;
  const text = squash(range.toString());
  if (!tutorEligible(text)) return null;
  const h = nearestHeading(range, root);
  // the heading's own id, else the nearest anchored block around it (a lesson stage, a case-file section)
  const holder = h?.id ? h : (h ?? range.startContainer.parentElement)?.closest<HTMLElement>("[id]");
  const id = holder && root.contains(holder) && /^[\w-]{1,120}$/.test(holder.id) ? holder.id : "";
  return {
    kind: "selection",
    text,
    href: window.location.pathname + (id ? `#${id}` : ""),
    heading: h ? cleanText(h).slice(0, 200) : "",
  };
}

/** The current window selection, if it lies inside `root`. */
export function liveRange(root: Element | null): Range | null {
  const sel = typeof window !== "undefined" ? window.getSelection() : null;
  if (!root || !sel || sel.isCollapsed || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  return root.contains(r.commonAncestorContainer) ? r : null;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Open the course tutor on a passage: "explain" asks straight away, "ask" lets the learner type. */
export function openTutor(mode: "explain" | "ask", context: TutorSelectionContext) {
  const detail: TutorOpenDetail = {
    prompt: mode === "explain" ? `Explain this: "${clip(context.text, 300)}"` : "",
    context,
    send: mode === "explain",
  };
  window.dispatchEvent(new CustomEvent<TutorOpenDetail>(TUTOR_OPEN_EVENT, { detail }));
}
