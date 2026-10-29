"use client";

/**
 * Where the learner is when they open the chat on a Learn page: the path, the heading nearest the top of the
 * screen, the text they selected and, on a lecture or short, the second the video is at. Sent with each
 * message; the server resolves it against the index (so the model gets the real titles and refs) and only
 * shows the selection inside a tool result, as data.
 */
import type { PageContext } from "@/lib/ai/chat/text";

/** Text selected before the panel opened (the selection collapses when focus moves into the panel). */
let held = "";
/** a selection sent from elsewhere (tutor:open): its page and heading, when it isn't this page */
let heldAt: { path?: string; heading?: string } = {};
export const holdSelection = (s: string) => {
  held = s.trim().slice(0, 1500);
};
export const holdContext = (c: { selection: string; path?: string; heading?: string }) => {
  held = c.selection.trim().slice(0, 1500);
  heldAt = { path: c.path && c.path.startsWith("/") ? c.path.slice(0, 300) : undefined, heading: c.heading?.slice(0, 200) };
};

export function readPageContext(): PageContext | null {
  if (typeof window === "undefined") return null;
  const path = `${window.location.pathname}${window.location.search}`;
  if (!(path.startsWith("/learn") || path.startsWith("/stories/")) || path.startsWith("/learn/search")) return null;
  const root = document.querySelector<HTMLElement>("[data-sd-content]") ?? document.querySelector<HTMLElement>("main") ?? document.body;
  // the last heading above the reading line (a quarter down the screen), else the first one on screen
  const line = window.innerHeight * 0.25;
  let heading: HTMLElement | null = null;
  for (const h of root.querySelectorAll<HTMLElement>("h2[id], h3[id], h2, h3")) {
    if (h.closest("[data-chat-panel]")) continue;
    if (h.getBoundingClientRect().top <= line) heading = h;
    else {
      if (!heading) heading = h;
      break;
    }
  }
  const sel = (window.getSelection?.()?.toString() ?? "").trim().slice(0, 1500) || held;
  const video = /^\/learn\/(lectures|shorts)\b/.test(window.location.pathname) ? document.querySelector<HTMLVideoElement>("video") : null;
  const id = heading?.id || heading?.closest<HTMLElement>("[id]")?.id || "";
  if (heldAt.path && held && !window.getSelection?.()?.toString().trim())
    return { path: heldAt.path, title: document.title.slice(0, 160), heading: heldAt.heading, selection: held };
  return {
    path,
    title: document.title.slice(0, 160),
    heading: heading?.textContent?.replace(/\s+/g, " ").trim().slice(0, 200) || undefined,
    headingId: /^[\w-]{1,120}$/.test(id) ? id : undefined,
    selection: sel || undefined,
    videoAt: video && Number.isFinite(video.currentTime) ? Math.floor(video.currentTime) : undefined,
  };
}

/** The passage attached from elsewhere (shown as a chip above the composer). */
export const heldPassage = () => held;

export const clearHeldSelection = () => {
  held = "";
  heldAt = {};
};
