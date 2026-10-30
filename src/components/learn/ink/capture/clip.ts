"use client";

/**
 * "Clip to notebook": the selected passage goes onto the inbox page (the page open in the notebook panel, else
 * the newest "Clips" page) as a clip item whose source links back to that exact passage (the same deep link
 * "Copy link" builds: ?at=… plus a text fragment).
 */
import { passageLink } from "@/lib/learn/deepLink";
import { appendItem, CLIP_W, inboxPage, trimClip } from "./api";
import { captureToast } from "./events";

export type ClipInput = {
  /** the content root the deep link is built against (the same root "Copy link" uses) */
  root: Element;
  range: Range;
  text: string;
  /** the page's title (lesson, war story, case file) */
  title: string;
  lessonKey: string | null;
};

/** a link back to the page without our own params (used when the passage can't be located) */
function pageHref(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

export async function clipPassage({ root, range, text, title, lessonKey }: ClipInput): Promise<boolean> {
  const value = trimClip(text);
  if (!value) return false;
  let href = pageHref();
  try {
    href = passageLink(root, range)?.url ?? href;
  } catch {
    /* keep the page link */
  }
  try {
    const page = await inboxPage(lessonKey);
    await appendItem(page.id, { kind: "clip", text: value, w: CLIP_W, source: { href, title, lessonKey } });
    captureToast({ kind: "clip", pageId: page.id, pageTitle: page.title });
    return true;
  } catch (e) {
    console.error("[clip]", e);
    captureToast({ kind: "error", message: "Couldn't clip that to your notebook. Try again in a moment." });
    return false;
  }
}
