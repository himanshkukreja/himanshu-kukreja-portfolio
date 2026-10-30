"use client";

/**
 * A confirmed snip → the notebook: render the region (region.ts), put the image in storage, place it on the
 * inbox page with a link back to where it was taken, and say so. For "Explain this" the snip is taken first (image,
 * the page text inside the box and where it was taken: regionText.ts) and saved only if the learner asks.
 */
import { passageLink, sectionLink } from "@/lib/learn/deepLink";
import { INK_EVENTS } from "@/lib/learn/ink/types";
import { appendItem, getPage, inboxPage, newItemId, snipBox, uploadSnip } from "./api";
import { captureToast, type Box } from "./events";
import { captureRegion, type RegionImage } from "./region";
import { pageKind, regionText, snipPlace, type SnipPlace } from "./regionText";

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

/** A snip that has been rendered, with what "Explain this" needs to know about it (taken before the overlay closes). */
export type SnipShot = SnipInput & { img: RegionImage; place: SnipPlace; text: string };

/** Where a saved snip landed. */
export type SavedSnip = { pageId: string; pageTitle: string };

/** Render the box and read what's in it. Null when it failed (already toasted). */
export async function takeSnip(input: SnipInput, opts: { withText?: boolean; root?: Element | null } = {}): Promise<SnipShot | null> {
  // the text and the place first: the page can't change under the box while the image renders
  let text = "";
  let place: SnipPlace = { ...pageKind(), title: input.title, heading: "", lecture: null };
  try {
    place = snipPlace(opts.root ?? null, input.box, input.title);
    if (opts.withText !== false) text = regionText(input.box);
  } catch (e) {
    console.warn("[snip] text", e);
  }
  let img: RegionImage;
  try {
    img = await captureRegion(input.box);
  } catch (e) {
    console.error("[snip] render", e);
    captureToast({ kind: "error", message: "Couldn't snip that part of the page. Try a smaller area." });
    return null;
  }
  return { ...input, img, place, text };
}

/** Upload a rendered snip and place it on the inbox (or open) page. Throws on failure. */
export async function saveSnip(shot: SnipShot): Promise<SavedSnip> {
  const { box, href, title, lessonKey, img } = shot;
  const page = await inboxPage(lessonKey);
  const id = newItemId();
  const path = await uploadSnip(page.id, id, img.blob);
  const { w, h } = snipBox(box.w, box.h);
  // a full page sends the snip to a new one: the event says where it went
  let landed = page.id;
  const onItem = (e: Event) => {
    const d = (e as CustomEvent<{ pageId: string; item: { id: string } }>).detail;
    if (d?.item?.id === id) landed = d.pageId;
  };
  window.addEventListener(INK_EVENTS.item, onItem);
  try {
    await appendItem(page.id, { id, kind: "snip", path, pw: img.pw, ph: img.ph, w, h, source: { href, title, lessonKey } });
  } finally {
    window.removeEventListener(INK_EVENTS.item, onItem);
  }
  if (landed === page.id) return { pageId: page.id, pageTitle: page.title };
  return { pageId: landed, pageTitle: (await getPage(landed).catch(() => null))?.title || page.title };
}

/** Render, upload, place, toast. Resolves to the rendered image (tests), or null when it failed (already toasted). */
export async function snipToNotebook(input: SnipInput): Promise<RegionImage | null> {
  const shot = await takeSnip(input, { withText: false });
  if (!shot) return null;
  return (await saveShot(shot)) ? shot.img : null;
}

/** Save a taken snip and say so ("Snipped to <page> · open · explain"). False when it failed (toasted). */
export async function saveShot(shot: SnipShot, opts: { explain?: boolean } = {}): Promise<SavedSnip | null> {
  try {
    const saved = await saveSnip(shot);
    const { img } = shot;
    const note = img.missing.frames ? "the video frame couldn't be copied" : img.missing.images ? "an image couldn't be copied" : undefined;
    captureToast({ kind: "snip", pageId: saved.pageId, pageTitle: saved.pageTitle, note, explain: opts.explain });
    return saved;
  } catch (e) {
    console.error("[snip] save", e);
    captureToast({ kind: "error", message: "Couldn't save the snip to your notebook. Try again in a moment." });
    return null;
  }
}
