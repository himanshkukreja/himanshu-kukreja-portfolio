"use client";

/**
 * A confirmed snip → the notebook: render the region (region.ts), put the image in storage, place it on the
 * inbox page with a link back to where it was taken, and say so.
 */
import { passageLink, sectionLink } from "@/lib/learn/deepLink";
import { appendItem, inboxPage, newItemId, snipBox, uploadSnip } from "./api";
import { captureToast, type Box } from "./events";
import { captureRegion, type RegionImage } from "./region";

const CHROME = "[data-sd-chrome], [data-hk-snip-ui]";

function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const d = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y);
    return p ? { node: p.offsetNode, offset: p.offset } : null;
  }
  const r = d.caretRangeFromPoint?.(x, y);
  return r ? { node: r.startContainer, offset: r.startOffset } : null;
}

/**
 * The link back to the snipped place: the first line of text inside the box (the same passage link "Copy link"
 * makes), else the heading / stage the box sits under, else the page. Call while the overlay lets pointer
 * hit-testing through (caret lookups hit the topmost element).
 */
export function snipHref(root: Element | null, box: Box): string {
  const page = `${window.location.origin}${window.location.pathname}`;
  if (!root) return page;
  const stepY = 14;
  for (let y = box.y + 6; y < Math.min(box.y + box.h, box.y + 160); y += stepY) {
    for (const x of [box.x + 6, box.x + box.w * 0.25, box.x + box.w * 0.5]) {
      const c = caretAt(x, y);
      if (!c || c.node.nodeType !== Node.TEXT_NODE || !root.contains(c.node)) continue;
      if (c.node.parentElement?.closest(CHROME)) continue;
      const text = c.node.nodeValue || "";
      if (!text.trim()) continue;
      let s = c.offset;
      while (s > 0 && /\S/.test(text[s - 1])) s--;
      let e = Math.min(text.length, s + 80);
      const cut = text.slice(s, e).search(/\s\S*$/);
      if (e < text.length && cut > 20) e = s + cut;
      const range = document.createRange();
      range.setStart(c.node, s);
      range.setEnd(c.node, e);
      try {
        const link = passageLink(root, range);
        if (link) return link.url;
      } catch {
        /* try the next point */
      }
    }
  }
  const scopes = Array.from(root.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id], h4[id], section[data-sd="stage"][id]'));
  let id = "";
  for (const el of scopes) {
    if (el.getBoundingClientRect().top <= box.y + box.h / 2) id = el.id;
  }
  return id ? sectionLink(id) : page;
}

export type SnipInput = { box: Box; href: string; title: string; lessonKey: string | null };

/** Render, upload, place, toast. Resolves to the rendered image (tests), or null when it failed (already toasted). */
export async function snipToNotebook({ box, href, title, lessonKey }: SnipInput): Promise<RegionImage | null> {
  let img: RegionImage;
  try {
    img = await captureRegion(box);
  } catch (e) {
    console.error("[snip] render", e);
    captureToast({ kind: "error", message: "Couldn't snip that part of the page. Try a smaller area." });
    return null;
  }
  try {
    const page = await inboxPage(lessonKey);
    const id = newItemId();
    const path = await uploadSnip(page.id, id, img.blob);
    const { w, h } = snipBox(box.w, box.h);
    await appendItem(page.id, { id, kind: "snip", path, pw: img.pw, ph: img.ph, w, h, source: { href, title, lessonKey } });
    const note = img.missing.frames ? "the video frame couldn't be copied" : img.missing.images ? "an image couldn't be copied" : undefined;
    captureToast({ kind: "snip", pageId: page.id, pageTitle: page.title, note });
    return img;
  } catch (e) {
    console.error("[snip] save", e);
    captureToast({ kind: "error", message: "Couldn't save the snip to your notebook. Try again in a moment." });
    return null;
  }
}
