"use client";

/**
 * Region snip: render one rectangle of the page to an image, from the DOM (there is no screen-capture API we can
 * use; getDisplayMedia is denied). modern-screenshot clones the smallest element that covers the rectangle into
 * an SVG foreignObject (computed styles inlined, web fonts and images embedded, shadow roots included, so the
 * explainer animations render as their current frame), and we crop that SVG to the rectangle before it is
 * rasterised, so the canvas is only ever the snip's own size.
 *
 * Speed: everything in the root that doesn't touch the rectangle is replaced by an empty box of the same size
 * (its subtree is never cloned), so a snip inside a 3,500-element lesson clones a few dozen nodes.
 *
 * Videos can't be rendered through the DOM: each one's current frame is read with drawImage() and shown in its
 * place as an image, from the element itself when it is CORS-clean, else from a crossorigin="anonymous" copy
 * seeked to the same time (needs CORS on the media host for this origin), else the poster.
 */
import { LIMITS } from "@/lib/learn/ink/types";
import type { Box } from "./events";

const UI = "[data-hk-snip-ui]";
const SKIP = "data-hk-snip-skip";
const DROP = "data-hk-snip-drop";
const CTR = "data-hk-snip-ctr";
const VPARENT = "data-hk-snip-vparent";
const VPREV = "data-hk-snip-vprev";
const CTR_CLASS = "hk-snip-ctr";
/** 2× device pixels, max 2,000 px on the long side */
const SCALE = 2;
const MAX_SIDE = 2000;
const QUALITIES = [0.85, 0.72, 0.6];
const TRANSPARENT = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export type RegionImage = {
  blob: Blob;
  /** pixel size of the image */
  pw: number;
  ph: number;
  /** what couldn't be rendered (shown to the learner, logged in tests) */
  missing: { images: number; frames: number };
  /** the element that was rendered (for tests / debugging) */
  root: string;
  ms: number;
};

/* ------------------------------------------------------------------ geometry */

const contains = (r: DOMRect, b: Box) => r.left <= b.x + 1 && r.top <= b.y + 1 && r.right >= b.x + b.w - 1 && r.bottom >= b.y + b.h - 1;
const intersects = (r: DOMRect, b: Box, pad = 24) => r.right > b.x - pad && r.left < b.x + b.w + pad && r.bottom > b.y - pad && r.top < b.y + b.h + pad;

function commonAncestor(a: Element, b: Element): Element {
  const up = new Set<Element>();
  for (let n: Element | null = a; n; n = n.parentElement) up.add(n);
  for (let n: Element | null = b; n; n = n.parentElement) if (up.has(n)) return n;
  return document.body;
}

/** the nearest position: fixed element at or above `el` (site header, reading dock, floating cards, a modal) */
function fixedOf(el: Element): Element | null {
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
    if (getComputedStyle(n).position === "fixed") return n;
  }
  return null;
}

/**
 * The smallest element under the box whose box covers all of it. Our own overlay is ignored, and so is fixed
 * chrome floating over the content (a corner of the box over the reading dock must not make the whole page the
 * root), unless the whole box is over the same fixed layer (a dialog, a short's player).
 */
export function regionRoot(box: Box): Element {
  const { x, y, w, h } = box;
  const i = Math.min(4, w / 4, h / 4);
  const pts: [number, number][] = [
    [x + w / 2, y + h / 2],
    [x + i, y + i],
    [x + w - i, y + i],
    [x + i, y + h - i],
    [x + w - i, y + h - i],
  ];
  const stacks = pts.map(([px, py]) => document.elementsFromPoint(px, py).filter((el) => !el.closest(UI)));
  const tops = stacks.map((st) => st[0]).filter(Boolean);
  const layers = tops.map(fixedOf);
  const oneLayer = layers.length > 0 && layers[0] !== null && layers.every((l) => l === layers[0]);
  const hits = oneLayer ? tops : stacks.map((st) => st.find((el) => !fixedOf(el))).filter((el): el is Element => !!el);
  let anc: Element | null = null;
  for (const hit of hits) anc = anc ? commonAncestor(anc, hit) : hit;
  let el: Element = anc ?? document.body;
  while (el.parentElement && el !== document.body) {
    const cs = getComputedStyle(el);
    const inline = cs.display === "inline" || cs.display === "contents" || el instanceof SVGElement;
    if (!inline && contains(el.getBoundingClientRect(), box)) break;
    el = el.parentElement;
  }
  return el === document.documentElement ? document.body : el;
}

/* ------------------------------------------------------------------ CSS counters (code line numbers, step numbers) */

/**
 * The library can't evaluate counter() in ::before (the clone has no counter state, so the numbers vanish and an
 * empty inline-block changes the line height). For counters reset on the parent, which is how the course's code
 * lines and numbered steps work, the value is the element's position among its like siblings: write it down
 * and render it as a real span in the clone.
 */
function counterLabel(el: HTMLElement): string | null {
  const pc = getComputedStyle(el, "::before");
  const m = pc.content.match(/counters?\(\s*([\w-]+)(?:\s*,\s*([\w-]+))?/);
  if (!m) return null;
  let n = 1;
  for (let p = el.previousElementSibling; p; p = p.previousElementSibling) if (p.className === el.className) n++;
  let text = String(n);
  if (m[2] === "decimal-leading-zero") text = n < 10 ? `0${n}` : text;
  else if (m[2] === "lower-alpha" || m[2] === "lower-latin") text = String.fromCharCode(96 + ((n - 1) % 26) + 1);
  else if (m[2] === "upper-alpha" || m[2] === "upper-latin") text = String.fromCharCode(64 + ((n - 1) % 26) + 1);
  const css = [
    `display:${pc.display === "inline" ? "inline-block" : pc.display}`,
    `width:${pc.width}`,
    `margin:${pc.margin}`,
    `padding:${pc.padding}`,
    `text-align:${pc.textAlign}`,
    `color:${pc.color}`,
    `font:${pc.fontStyle} ${pc.fontWeight} ${pc.fontSize}/${pc.lineHeight} ${pc.fontFamily}`,
    `letter-spacing:${pc.letterSpacing}`,
    `vertical-align:${pc.verticalAlign}`,
  ].join(";");
  return `${text}¦${css}`;
}

/* ------------------------------------------------------------------ pruning: off-rectangle subtrees become sized empty boxes */

const COLLAPSIBLE = new Set(["block", "flex", "grid", "list-item", "flow-root", "table", "inline-block", "inline-flex", "inline-grid"]);

function prune(el: Element, box: Box, marked: Element[], videos: HTMLVideoElement[]) {
  for (const child of Array.from(el.children)) {
    if (child.matches(UI)) {
      child.setAttribute(DROP, "");
      marked.push(child);
      continue;
    }
    if (child instanceof HTMLVideoElement) {
      // left out of the clone (modern-screenshot would fetch it again and stretch the frame): an <img> of its
      // current frame takes its place (videoStandIns)
      if (intersects(child.getBoundingClientRect(), box, 0)) videos.push(child);
      child.setAttribute(DROP, "");
      marked.push(child);
      continue;
    }
    if (!(child instanceof HTMLElement)) continue; // SVG and MathML stay whole
    const cs = getComputedStyle(child);
    if (cs.display === "none") continue;
    if (cs.position === "fixed") {
      // floating chrome (headers, docks, toasts) isn't part of what's under the snip
      child.setAttribute(DROP, "");
      marked.push(child);
      continue;
    }
    const r = child.getBoundingClientRect();
    if (cs.display === "contents" || (r.width === 0 && r.height === 0)) {
      prune(child, box, marked, videos);
      continue;
    }
    if (intersects(r, box)) {
      const label = counterLabel(child);
      if (label) {
        child.setAttribute(CTR, label);
        marked.push(child);
      }
      if (!child.shadowRoot) prune(child, box, marked, videos);
      continue;
    }
    if (COLLAPSIBLE.has(cs.display) && cs.position !== "absolute") {
      child.setAttribute(SKIP, `${child.offsetWidth},${child.offsetHeight}`);
      marked.push(child);
    }
  }
}

/* ------------------------------------------------------------------ colours */

function opaque(c: string): boolean {
  if (!c || c === "transparent") return false;
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return true;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  return parts.length < 4 || parseFloat(parts[3]) >= 0.99;
}

/** the colour behind the root: the first opaque background at or above it */
function backdrop(el: Element): string {
  for (let n: Element | null = el; n; n = n.parentElement) {
    const c = getComputedStyle(n).backgroundColor;
    if (opaque(c)) return c;
  }
  return document.documentElement.classList.contains("dark") ? "#000" : "#fff";
}

/**
 * A root with no background of its own shows what's behind it: give its clone the page's background (the body's
 * dot grid), lined up with where it sits on the page.
 */
function backdropStyle(root: Element, rr: DOMRect): Partial<CSSStyleDeclaration> {
  const own = getComputedStyle(root);
  if (own.backgroundImage !== "none" || opaque(own.backgroundColor)) return {};
  for (let n = root.parentElement; n; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (cs.backgroundImage === "none" && !opaque(cs.backgroundColor)) continue;
    const nr = n.getBoundingClientRect();
    const fixed = cs.backgroundAttachment === "fixed";
    const x = (fixed ? 0 : nr.left) - rr.left;
    const y = (fixed ? 0 : nr.top) - rr.top;
    const layers = cs.backgroundImage === "none" ? 1 : cs.backgroundImage.split(/,(?![^(]*\))/).length;
    return {
      backgroundColor: opaque(cs.backgroundColor) ? cs.backgroundColor : "",
      backgroundImage: cs.backgroundImage,
      backgroundSize: cs.backgroundSize,
      backgroundRepeat: cs.backgroundRepeat,
      backgroundPosition: Array(layers).fill(`${x}px ${y}px`).join(", "),
    };
  }
  return {};
}

/* ------------------------------------------------------------------ video frames */

function cleanFrom(src: CanvasImageSource): boolean {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const g = c.getContext("2d");
    if (!g) return false;
    g.drawImage(src, 0, 0, 1, 1);
    g.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}

function once(target: EventTarget, ok: string, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const t = window.setTimeout(() => done(false), ms);
    const onOk = () => done(true);
    const onErr = () => done(false);
    function done(v: boolean) {
      window.clearTimeout(t);
      target.removeEventListener(ok, onOk);
      target.removeEventListener("error", onErr);
      resolve(v);
    }
    target.addEventListener(ok, onOk, { once: true });
    target.addEventListener("error", onErr, { once: true });
  });
}

/** The video's current frame as something drawImage can read without tainting the canvas (null: not possible). */
async function videoFrame(v: HTMLVideoElement): Promise<{ src: CanvasImageSource; w: number; h: number; dispose?: () => void } | null> {
  const url = v.currentSrc || v.src;
  const sameOrigin = (() => {
    try {
      return new URL(url, window.location.href).origin === window.location.origin;
    } catch {
      return false;
    }
  })();
  // a cross-origin video without crossorigin="anonymous" can't be read back: don't try (it only logs an error)
  if (v.readyState >= 2 && v.videoWidth && (sameOrigin || v.crossOrigin !== null) && cleanFrom(v)) return { src: v, w: v.videoWidth, h: v.videoHeight };
  if (url) {
    const c = document.createElement("video");
    c.crossOrigin = "anonymous";
    c.muted = true;
    c.playsInline = true;
    c.preload = "auto";
    c.src = url;
    const dispose = () => {
      c.removeAttribute("src");
      c.load();
    };
    if (await once(c, "loadedmetadata", 6000)) {
      c.currentTime = v.currentTime || 0.01;
      if ((await once(c, "seeked", 6000)) && c.videoWidth && cleanFrom(c)) return { src: c, w: c.videoWidth, h: c.videoHeight, dispose };
    }
    dispose();
  }
  if (v.poster) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = v.poster;
    if ((await once(img, "load", 6000)) && cleanFrom(img)) return { src: img, w: img.naturalWidth, h: img.naturalHeight };
  }
  return null;
}

type StandIn = { prev: string | null; url: string; css: string };

/**
 * Each video's current frame as an <img> the clone shows in the video's place (same box, object-fit and stacking
 * order, so the player's own controls still sit on top of it). The <video> itself stays out of the clone.
 */
async function videoStandIns(videos: HTMLVideoElement[], marked: Element[]): Promise<{ byParent: StandIn[][]; missing: number }> {
  const byParent: StandIn[][] = [];
  let missing = 0;
  for (const v of videos) {
    const parent = v.parentElement;
    if (!parent) continue;
    const frame = await videoFrame(v);
    if (!frame) {
      missing++;
      continue;
    }
    const k = Math.min(1, 1600 / Math.max(frame.w, frame.h));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(frame.w * k));
    c.height = Math.max(1, Math.round(frame.h * k));
    c.getContext("2d")?.drawImage(frame.src, 0, 0, c.width, c.height);
    frame.dispose?.();
    const cs = getComputedStyle(v);
    const css = [
      ["display", cs.display === "inline" ? "inline-block" : cs.display],
      ["position", cs.position],
      ["top", cs.top],
      ["right", cs.right],
      ["bottom", cs.bottom],
      ["left", cs.left],
      ["width", cs.width],
      ["height", cs.height],
      ["max-width", "none"],
      ["max-height", "none"],
      ["margin", cs.margin],
      ["box-sizing", cs.boxSizing],
      ["object-fit", cs.objectFit],
      ["object-position", cs.objectPosition],
      ["z-index", cs.zIndex],
      ["transform", cs.transform],
      ["border-radius", cs.borderRadius],
      ["background-color", cs.backgroundColor],
      ["opacity", cs.opacity],
      ["vertical-align", cs.verticalAlign],
    ]
      .map(([p, val]) => `${p}:${val}`)
      .join(";");
    // the stand-in goes right after the nearest earlier sibling that the clone keeps
    let prevEl = v.previousElementSibling;
    while (prevEl && prevEl.hasAttribute(DROP)) prevEl = prevEl.previousElementSibling;
    let key = parent.getAttribute(VPARENT);
    if (key === null) {
      key = String(byParent.length);
      byParent.push([]);
      parent.setAttribute(VPARENT, key);
      marked.push(parent);
    }
    let prev: string | null = null;
    if (prevEl) {
      prev = `${key}-${byParent[Number(key)].length}`;
      prevEl.setAttribute(VPREV, prev);
      marked.push(prevEl);
    }
    byParent[Number(key)].push({ prev, url: c.toDataURL("image/jpeg", 0.92), css });
  }
  return { byParent, missing };
}

function placeStandIns(rootClone: Node, byParent: StandIn[][]) {
  if (!(rootClone instanceof Element) || !byParent.length) return;
  const parents = [rootClone, ...Array.from(rootClone.querySelectorAll(`[${VPARENT}]`))].filter((el) => el.hasAttribute(VPARENT));
  for (const parent of parents) {
    const list = byParent[Number(parent.getAttribute(VPARENT))] || [];
    for (const it of list) {
      const img = document.createElement("img");
      img.setAttribute("style", it.css);
      img.setAttribute("src", it.url);
      img.setAttribute("alt", "");
      const prev = it.prev ? Array.from(parent.children).find((ch) => ch.getAttribute(VPREV) === it.prev) : null;
      if (prev) prev.after(img);
      else parent.prepend(img);
    }
  }
  for (const el of [rootClone, ...Array.from(rootClone.querySelectorAll(`[${VPARENT}], [${VPREV}]`))]) {
    el.removeAttribute(VPARENT);
    el.removeAttribute(VPREV);
  }
}

/* ------------------------------------------------------------------ encoding */

function toBlob(c: HTMLCanvasElement, type: string, q: number): Promise<Blob | null> {
  return new Promise((resolve) => c.toBlob(resolve, type, q));
}

/**
 * WebP ~0.85 under LIMITS.snipBytes (lower quality, then smaller, until it fits). Safari can't encode WebP (it
 * hands back PNG): those snips are PNG, the other type the notebook-snips bucket takes, shrunk until they fit.
 */
async function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  let c = canvas;
  for (let round = 0; round < 5; round++) {
    for (const q of QUALITIES) {
      const b = await toBlob(c, "image/webp", q);
      if (!b) break;
      if (b.type !== "image/webp") {
        // no WebP encoder: one PNG per size (quality doesn't apply)
        if (b.type === "image/png" && b.size <= LIMITS.snipBytes) return b;
        break;
      }
      if (b.size <= LIMITS.snipBytes) return b;
    }
    const s = document.createElement("canvas");
    s.width = Math.max(1, Math.round(c.width * 0.75));
    s.height = Math.max(1, Math.round(c.height * 0.75));
    s.getContext("2d")?.drawImage(c, 0, 0, s.width, s.height);
    c = s;
  }
  throw new Error("snip: image too large");
}

/* ------------------------------------------------------------------ capture */

/** development only: localStorage hk.snip.debug = "1" logs each step's timing */
function debugOn(): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  try {
    return window.localStorage.getItem("hk.snip.debug") === "1";
  } catch {
    return false;
  }
}

function describe(el: Element): string {
  const id = el.id ? `#${el.id}` : "";
  const sd = el.getAttribute("data-sd");
  const cls = typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}` : "";
  return `${el.tagName.toLowerCase()}${id}${sd ? `[data-sd=${sd}]` : ""}${cls}`;
}

/** Render the viewport rectangle `box` (CSS px) as an image. */
export async function captureRegion(box: Box): Promise<RegionImage> {
  const t0 = performance.now();
  const b: Box = {
    x: Math.max(0, box.x),
    y: Math.max(0, box.y),
    w: Math.min(box.w, window.innerWidth - Math.max(0, box.x)),
    h: Math.min(box.h, window.innerHeight - Math.max(0, box.y)),
  };
  if (b.w < 4 || b.h < 4) throw new Error("snip: area too small");
  const root = regionRoot(b);
  const k = Math.min(SCALE, MAX_SIDE / Math.max(b.w, b.h));
  const marked: Element[] = [];
  const videos: HTMLVideoElement[] = [];
  const missing = { images: 0, frames: 0 };
  prune(root, b, marked, videos);
  // images in the box finish loading first (the library's own wait covers the whole root, lazy images below the
  // fold included, so it is turned off below)
  const pending = Array.from(root.querySelectorAll("img")).filter((im) => !im.complete && intersects(im.getBoundingClientRect(), b, 0));
  await Promise.all(pending.map((im) => once(im, "load", 5000)));
  try {
    const stand = await videoStandIns(videos, marked);
    missing.frames = stand.missing;
    const { createContext, destroyContext, domToCanvas } = await import("modern-screenshot");
    const rr = root.getBoundingClientRect();
    const ctx = await createContext(root, {
      // the library waits for every <img> / <video> in the root to load before it starts, lazy ones and
      // preload="none" videos included (they never do): skip that wait (images in the box were awaited above),
      // then give fetches and decoding their real timeout
      timeout: 1,
      scale: k,
      backgroundColor: null,
      // crop by layout, not by SVG: a negative margin puts the box's corner at the SVG's origin. (A viewBox offset
      // or foreignObject x / y would do it too, but WebKit then draws position: relative / absolute content in
      // the wrong place, ignoring the offset.)
      style: { margin: `${-(b.y - rr.top)}px 0 0 ${-(b.x - rr.left)}px`, inset: "auto", translate: "none", ...backdropStyle(root, rr) } as Partial<CSSStyleDeclaration>,
      debug: debugOn(),
      features: { restoreScrollPosition: true, copyScrollbar: false },
      fetch: {
        requestInit: { mode: "cors", cache: "force-cache" },
        placeholderImage: () => {
          missing.images++;
          return TRANSPARENT;
        },
      },
      filter: (n) => {
        const p = n.parentElement;
        if (p && p.hasAttribute(SKIP)) return false;
        return !(n instanceof Element && n.hasAttribute(DROP));
      },
      onCloneNode: (clone) => placeStandIns(clone, stand.byParent),
      onCloneEachNode: (n) => {
        if (!(n instanceof Element)) return;
        const ctr = n.getAttribute(CTR);
        if (ctr !== null) {
          n.removeAttribute(CTR);
          const [text, css] = ctr.split("¦");
          const span = document.createElement("span");
          span.setAttribute("style", css);
          span.textContent = text;
          n.prepend(span);
          n.classList.add(CTR_CLASS);
        }
        const s = n.getAttribute(SKIP);
        if (s === null) return;
        n.removeAttribute(SKIP);
        const [w, h] = s.split(",");
        const st = (n as HTMLElement).style;
        for (const [p, v] of [
          ["box-sizing", "border-box"],
          ["width", `${w}px`],
          ["min-width", `${w}px`],
          ["max-width", `${w}px`],
          ["height", `${h}px`],
          ["min-height", `${h}px`],
          ["max-height", `${h}px`],
          ["overflow", "hidden"],
          ["visibility", "hidden"],
          ["background", "none"],
        ])
          st?.setProperty(p, v, "important");
      },
      onCreateForeignObjectSvg: (svg) => {
        // the counters written as spans: hide the (empty) pseudo-elements they replace
        const st = document.createElementNS("http://www.w3.org/2000/svg", "style");
        st.textContent = `.${CTR_CLASS}::before{display:none!important;content:none!important}`;
        svg.insertBefore(st, svg.firstChild);
        // the SVG (and the canvas) are the box's size, not the root's: the rest is clipped away
        svg.setAttribute("width", String(b.w));
        svg.setAttribute("height", String(b.h));
        svg.setAttribute("viewBox", `0 0 ${b.w} ${b.h}`);
        ctx.width = b.w;
        ctx.height = b.h;
      },
    });
    ctx.timeout = 15000;
    let rendered: HTMLCanvasElement;
    try {
      rendered = await domToCanvas(ctx);
    } finally {
      destroyContext(ctx);
    }
    const out = document.createElement("canvas");
    out.width = rendered.width;
    out.height = rendered.height;
    const g = out.getContext("2d");
    if (!g) throw new Error("snip: no canvas");
    g.fillStyle = backdrop(root);
    g.fillRect(0, 0, out.width, out.height);
    g.drawImage(rendered, 0, 0);
    const blob = await encode(out);
    if (debugOn()) console.info("[snip]", describe(root), `${Math.round(performance.now() - t0)} ms`, blob.type, blob.size, missing);
    // the encoder may have shrunk it to fit: read the real size back
    const bmp = await createImageBitmap(blob).catch(() => null);
    const size = bmp ? { pw: bmp.width, ph: bmp.height } : { pw: out.width, ph: out.height };
    bmp?.close();
    return { blob, ...size, missing, root: describe(root), ms: Math.round(performance.now() - t0) };
  } finally {
    for (const el of marked) {
      el.removeAttribute(SKIP);
      el.removeAttribute(DROP);
      el.removeAttribute(CTR);
      el.removeAttribute(VPARENT);
      el.removeAttribute(VPREV);
    }
  }
}

