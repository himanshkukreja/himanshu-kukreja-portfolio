"use client";

/**
 * "Send to notebook": each annotated passage (the blocks with marks, nearby ones merged, plus their margin notes) is
 * rendered to an image with the marks drawn on it, stored like a snip and placed on the lesson's notebook page (the page
 * last written beside this lesson, else the Clips inbox) through the notebook API in src/lib/learn/ink/client.ts.
 *
 * Why not capture's region snip: it renders a viewport rectangle (regionRoot hit-tests the screen), and annotated
 * passages are usually off screen. Here each top-level element of the passage is rendered on its own with
 * modern-screenshot (the same library), laid out at its real offset on one canvas over the page background, and the
 * marks are drawn on top with the notebook renderer (render.ts), in the theme the lesson is shown in.
 */
import { buildLayer, fillLayer, type InkTheme } from "@/lib/learn/ink/render";
import type { Box } from "@/lib/learn/ink/geometry";
import { INK_EVENTS, LIMITS, type Stroke } from "@/lib/learn/ink/types";
import { appendItem, inboxPage, lessonPage, uploadSnip } from "@/lib/learn/ink/client";
import { sectionLink } from "@/lib/learn/deepLink";
import { newItemId, snipBox } from "../capture/api";

const TRANSPARENT = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const SKIP = "[data-hk-snip-ui], [data-annot-ui], [data-annot-layer], video";

export type Passage = { box: Box; scope: string; strokes: Stroke[] };

const hasOwnText = (el: Element) => Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && /\S/.test(n.nodeValue || ""));

/** The elements to render for a band of the page (client px): whole when inside it, else their children. */
function pieces(el: Element, top: number, bottom: number, out: HTMLElement[]) {
  for (const child of Array.from(el.children)) {
    if (!(child instanceof HTMLElement) || child.matches(SKIP)) continue;
    const cs = getComputedStyle(child);
    if (cs.display === "none" || cs.position === "fixed") continue;
    if (cs.display === "contents") {
      pieces(child, top, bottom, out);
      continue;
    }
    const r = child.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom <= top || r.top >= bottom) continue;
    const inside = r.top >= top - 1 && r.bottom <= bottom + 1;
    if (inside || hasOwnText(child) || !child.children.length || child.matches("p, li, h1, h2, h3, h4, h5, h6, pre, figure, table, img, svg, canvas")) out.push(child);
    else pieces(child, top, bottom, out);
  }
}

function backdrop(el: Element, theme: InkTheme): string {
  for (let n: Element | null = el; n; n = n.parentElement) {
    const c = getComputedStyle(n).backgroundColor;
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (c && c !== "transparent" && (!m || m[1].split(/[\s,/]+/).filter(Boolean).length < 4 || parseFloat(m[1].split(/[\s,/]+/).filter(Boolean)[3]) >= 0.99)) return c;
  }
  return theme === "dark" ? "#000000" : "#ffffff";
}

function toBlob(c: HTMLCanvasElement, type: string, q?: number): Promise<Blob | null> {
  return new Promise((resolve) => c.toBlob(resolve, type, q));
}

/** WebP (PNG where the browser can't encode WebP, i.e. Safari), shrunk until it fits a snip. */
async function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  let c = canvas;
  for (let round = 0; round < 5; round++) {
    const b = await toBlob(c, "image/webp", 0.85);
    if (b && (b.type === "image/webp" || b.type === "image/png") && b.size <= LIMITS.snipBytes) return b;
    const s = document.createElement("canvas");
    s.width = Math.max(1, Math.round(c.width * 0.75));
    s.height = Math.max(1, Math.round(c.height * 0.75));
    s.getContext("2d")?.drawImage(c, 0, 0, s.width, s.height);
    c = s;
  }
  throw new Error("annotate: image too large");
}

/** One passage as an image: content (rendered per element) + marks. `origin`: client px of the overlay's (0, 0). */
export async function renderPassage(p: Passage, root: HTMLElement, origin: { x: number; y: number }, overlayWidth: number, theme: InkTheme): Promise<{ blob: Blob; pw: number; ph: number; cssW: number; cssH: number }> {
  const pad = 12;
  const band = { top: p.box.y1 + origin.y, bottom: p.box.y2 + origin.y };
  const els: HTMLElement[] = [];
  pieces(root, band.top, band.bottom, els);
  // the region: the passage, grown to whole elements, within the overlay
  let x1 = p.box.x1;
  let y1 = p.box.y1;
  let x2 = p.box.x2;
  let y2 = p.box.y2;
  const rects = els.map((el) => el.getBoundingClientRect());
  for (const r of rects) {
    x1 = Math.min(x1, r.left - origin.x);
    y1 = Math.min(y1, r.top - origin.y);
    x2 = Math.max(x2, r.right - origin.x);
    y2 = Math.max(y2, r.bottom - origin.y);
  }
  x1 = Math.max(0, x1 - pad);
  x2 = Math.min(overlayWidth, x2 + pad);
  y1 -= pad;
  y2 += pad;
  const w = Math.max(8, x2 - x1);
  const h = Math.max(8, y2 - y1);
  const k = Math.min(2, 2000 / Math.max(w, h));
  const out = document.createElement("canvas");
  out.width = Math.round(w * k);
  out.height = Math.round(h * k);
  const g = out.getContext("2d");
  if (!g) throw new Error("annotate: no canvas");
  g.fillStyle = backdrop(root, theme);
  g.fillRect(0, 0, out.width, out.height);

  const { createContext, destroyContext, domToCanvas } = await import("modern-screenshot");
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    const r = rects[i];
    try {
      const ctx = await createContext(el, {
        timeout: 1,
        scale: k,
        backgroundColor: null,
        // the clone is drawn at the element's own box: its margin would shift it inside that box (and crop it)
        style: { margin: "0", inset: "auto", translate: "none" } as Partial<CSSStyleDeclaration>,
        features: { restoreScrollPosition: true, copyScrollbar: false },
        fetch: { requestInit: { mode: "cors", cache: "force-cache" }, placeholderImage: () => TRANSPARENT },
        filter: (n) => !(n instanceof Element && n.matches(SKIP)),
      });
      ctx.timeout = 10000;
      try {
        const c = await domToCanvas(ctx);
        g.drawImage(c, (r.left - origin.x - x1) * k, (r.top - origin.y - y1) * k, r.width * k, r.height * k);
      } finally {
        destroyContext(ctx);
      }
    } catch (e) {
      console.warn("[annotate] couldn't render part of a passage", e);
    }
  }

  // the marks: highlighter blended like on the page, then ink
  g.setTransform(k, 0, 0, k, -x1 * k, -y1 * k);
  g.save();
  g.globalCompositeOperation = theme === "dark" ? "screen" : "multiply";
  fillLayer(g, buildLayer(p.strokes, "highlighter"), "highlighter", theme);
  g.restore();
  fillLayer(g, buildLayer(p.strokes, "pen"), "pen", theme);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const blob = await encode(out);
  const bmp = await createImageBitmap(blob).catch(() => null);
  const size = bmp ? { pw: bmp.width, ph: bmp.height } : { pw: out.width, ph: out.height };
  bmp?.close();
  return { blob, ...size, cssW: w, cssH: h };
}

export type SendResult = { pageId: string; pageTitle: string; sent: number };

/** Render, upload and place every passage on the lesson's notebook page. */
export async function sendPassages(opts: {
  passages: Passage[];
  root: HTMLElement;
  origin: { x: number; y: number };
  overlayWidth: number;
  theme: InkTheme;
  lessonKey: string;
  title: string;
  onProgress?: (done: number, total: number) => void;
}): Promise<SendResult> {
  const { passages, root, origin, overlayWidth, theme, lessonKey, title } = opts;
  let page = (await lessonPage(lessonKey)) ?? (await inboxPage(lessonKey));
  let pageId = page.id;
  // appendItem starts a new page when one fills up: follow it
  const onItem = (e: Event) => {
    const d = (e as CustomEvent<{ pageId: string; newPage: boolean }>).detail;
    if (d?.newPage) pageId = d.pageId;
  };
  window.addEventListener(INK_EVENTS.item, onItem);
  let sent = 0;
  try {
    for (const p of passages) {
      opts.onProgress?.(sent, passages.length);
      const img = await renderPassage(p, root, origin, overlayWidth, theme);
      const id = newItemId();
      const path = await uploadSnip(pageId, id, img.blob);
      const { w, h } = snipBox(img.cssW, img.cssH);
      const href = p.scope ? sectionLink(p.scope) : `${window.location.origin}${window.location.pathname}`;
      await appendItem(pageId, { id, kind: "snip", path, pw: img.pw, ph: img.ph, w, h, source: { href, title, lessonKey } });
      sent++;
    }
  } finally {
    window.removeEventListener(INK_EVENTS.item, onItem);
  }
  opts.onProgress?.(sent, passages.length);
  if (pageId !== page.id) page = { ...page, id: pageId };
  return { pageId, pageTitle: page.title, sent };
}
