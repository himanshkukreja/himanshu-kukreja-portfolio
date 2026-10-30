/**
 * Notebook pages: geometry on page units (see types.ts). Stroke bounds, hit tests, the size a page takes when
 * saved, where a placed item lands, and a grid index so the eraser and lasso stay fast with thousands of strokes.
 * Pure functions; no DOM.
 */
import { LIMITS, PAGE_H, PAGE_W, type PageItem, type Paper, type Stroke } from "./types";

/** pts are page units × Q */
export const Q = 10;

export type Box = { x1: number; y1: number; x2: number; y2: number };

export const newInkId = (): string => {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => (b % 36).toString(36)).join("") + Date.now().toString(36).slice(-4);
};

// ------------------------------------------------------------------ strokes

const boxCache = new WeakMap<Stroke, Box>();
/** Bounds of a stroke in page units, padded by half its width. Cached per stroke object (strokes are immutable). */
export function strokeBox(s: Stroke): Box {
  let b = boxCache.get(s);
  if (b) return b;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  const p = s.pts;
  for (let i = 0; i + 1 < p.length; i += 3) {
    const x = p[i];
    const y = p[i + 1];
    if (x < x1) x1 = x;
    if (x > x2) x2 = x;
    if (y < y1) y1 = y;
    if (y > y2) y2 = y;
  }
  const pad = s.size / 2 + 1;
  b = p.length ? { x1: x1 / Q - pad, y1: y1 / Q - pad, x2: x2 / Q + pad, y2: y2 / Q + pad } : { x1: 0, y1: 0, x2: 0, y2: 0 };
  boxCache.set(s, b);
  return b;
}

export const boxesTouch = (a: Box, b: Box) => a.x1 <= b.x2 && a.x2 >= b.x1 && a.y1 <= b.y2 && a.y2 >= b.y1;
export const unionBox = (a: Box | null, b: Box): Box => (a ? { x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2) } : { ...b });

function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + t * dx - px;
  const y = ay + t * dy - py;
  return x * x + y * y;
}

/** Does a circle of radius r (page units) at (x, y) touch the stroke? */
export function strokeHit(s: Stroke, x: number, y: number, r: number): boolean {
  const b = strokeBox(s);
  if (x < b.x1 - r || x > b.x2 + r || y < b.y1 - r || y > b.y2 + r) return false;
  const reach = r + s.size / 2;
  const r2 = reach * reach;
  const p = s.pts;
  const qx = x * Q;
  const qy = y * Q;
  const q2 = r2 * Q * Q;
  if (p.length <= 3) return (p[0] - qx) ** 2 + (p[1] - qy) ** 2 <= q2;
  for (let i = 3; i + 1 < p.length; i += 3) if (segDist2(qx, qy, p[i - 3], p[i - 2], p[i], p[i + 1]) <= q2) return true;
  return false;
}

/** Point-in-polygon (even-odd), polygon as flat [x, y, x, y, …] in page units. */
export function inPolygon(poly: number[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i];
    const yi = poly[i + 1];
    const xj = poly[j];
    const yj = poly[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A stroke is lassoed when at least half of its points are inside the loop. */
export function strokeInLasso(s: Stroke, poly: number[], polyBox: Box): boolean {
  if (!boxesTouch(strokeBox(s), polyBox)) return false;
  const p = s.pts;
  const n = p.length / 3;
  const step = Math.max(1, Math.floor(n / 24));
  let hit = 0;
  let all = 0;
  for (let i = 0; i < n; i += step) {
    all++;
    if (inPolygon(poly, p[i * 3] / Q, p[i * 3 + 1] / Q)) hit++;
  }
  return hit * 2 >= all;
}

export function polyBox(poly: number[]): Box {
  let b: Box | null = null;
  for (let i = 0; i + 1 < poly.length; i += 2) b = unionBox(b, { x1: poly[i], y1: poly[i + 1], x2: poly[i], y2: poly[i + 1] });
  return b || { x1: 0, y1: 0, x2: 0, y2: 0 };
}

/** Move and scale a stroke about (ox, oy): page units. Returns a new stroke with the same id. */
export function transformStroke(s: Stroke, dx: number, dy: number, k = 1, ox = 0, oy = 0): Stroke {
  const p = s.pts.slice();
  for (let i = 0; i + 1 < p.length; i += 3) {
    p[i] = Math.round(((p[i] / Q - ox) * k + ox + dx) * Q);
    p[i + 1] = Math.round(((p[i + 1] / Q - oy) * k + oy + dy) * Q);
  }
  return { ...s, size: Math.max(0.5, Math.round(s.size * k * 10) / 10), pts: p };
}

// ------------------------------------------------------------------ items

/** Type metrics shared by the DOM item layer and the canvas renderer, so both lay an item out the same. */
export const CLIP = { pad: 14, head: 30, font: 19, line: 28 } as const;
export const TEXT = { pad: 6, font: 22, line: 32 } as const;
const CHAR_W = 0.56; // a generous average glyph width, so an estimate is never shorter than the real box

/** Lines a text needs at a width (an estimate when no canvas is at hand; canvas callers wrap for real). */
export function estimateLines(text: string, width: number, font: number): number {
  const perLine = Math.max(8, Math.floor(width / (font * CHAR_W)));
  return text.split("\n").reduce((n, para) => n + Math.max(1, Math.ceil(para.length / perLine)), 0);
}

export function itemBox(it: PageItem): Box {
  if (it.kind === "snip") return { x1: it.x, y1: it.y, x2: it.x + it.w, y2: it.y + it.h };
  if (it.kind === "clip") {
    const h = CLIP.pad * 2 + CLIP.head + estimateLines(it.text, it.w - CLIP.pad * 2, CLIP.font) * CLIP.line;
    return { x1: it.x, y1: it.y, x2: it.x + it.w, y2: it.y + h };
  }
  const h = TEXT.pad * 2 + estimateLines(it.text || " ", it.w - TEXT.pad * 2, TEXT.font) * TEXT.line;
  return { x1: it.x, y1: it.y, x2: it.x + it.w, y2: it.y + h };
}

export function transformItem(it: PageItem, dx: number, dy: number, k = 1, ox = 0, oy = 0): PageItem {
  const x = Math.round(((it.x - ox) * k + ox + dx) * 10) / 10;
  const y = Math.round(((it.y - oy) * k + oy + dy) * 10) / 10;
  const w = Math.max(80, Math.round(it.w * k));
  if (it.kind === "snip") return { ...it, x, y, w, h: Math.round(it.h * (w / it.w)) };
  return { ...it, x, y, w };
}

/** Where content starts on each paper (left edge and top), and how wide it can be. */
export function paperArea(paper: Paper): { x: number; y: number; w: number } {
  if (paper === "cornell") return { x: 300, y: 130, w: PAGE_W - 300 - 40 };
  if (paper === "ruled") return { x: 110, y: 112, w: PAGE_W - 110 - 50 };
  // inside the Requirements box, under its label (a clip wider than a box would straddle two)
  if (paper === "interview") return { x: 52, y: 84, w: 430 };
  return { x: 60, y: 60, w: PAGE_W - 120 };
}

/** The lowest point anything (ink or item) reaches on the page, or null for an empty page. */
export function lowestY(strokes: Stroke[], items: PageItem[]): number | null {
  let y: number | null = null;
  for (const s of strokes) y = Math.max(y ?? -Infinity, strokeBox(s).y2);
  for (const it of items) y = Math.max(y ?? -Infinity, itemBox(it).y2);
  return y;
}

export const PAGE_BOTTOM = PAGE_H - 40;

// ------------------------------------------------------------------ size

const sizeCache = new WeakMap<object, number>();
const enc = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
/**
 * Bytes a stroke or item adds to the saved page. The JSON length, plus one per number (the database stores
 * jsonb, whose text form puts a space after each comma), plus UTF-8 for non-ASCII text. Slightly more than the
 * compact JSON, so a page the browser accepts always fits the database's check.
 */
export function partBytes(x: Stroke | PageItem): number {
  let n = sizeCache.get(x);
  if (n !== undefined) return n;
  const json = JSON.stringify(x);
  n = json.length + 8;
  if ("pts" in x) n += x.pts.length;
  else if (enc && /[^\x00-\x7f]/.test(json)) n = enc.encode(json).length + 8;
  sizeCache.set(x, n);
  return n;
}

export function pageBytes(strokes: Stroke[], items: PageItem[]): number {
  let n = 4;
  for (const s of strokes) n += partBytes(s);
  for (const it of items) n += partBytes(it);
  return n;
}

export const pageFull = (bytes: number) => bytes >= LIMITS.pageBytes;
/** "Nearly full" warning from 90% */
export const pageNearlyFull = (bytes: number) => bytes >= LIMITS.pageBytes * 0.9;

// ------------------------------------------------------------------ grid index

/** Buckets strokes by 100-unit cells so a hit test only looks at strokes near the pointer. */
export class StrokeIndex {
  private cells = new Map<number, Stroke[]>();
  private static C = 100;
  constructor(strokes: Stroke[]) {
    for (const s of strokes) this.add(s);
  }
  private key(cx: number, cy: number) {
    return cy * 64 + cx;
  }
  add(s: Stroke) {
    const b = strokeBox(s);
    const C = StrokeIndex.C;
    for (let cy = Math.max(0, Math.floor(b.y1 / C)); cy <= Math.min(40, Math.floor(b.y2 / C)); cy++)
      for (let cx = Math.max(0, Math.floor(b.x1 / C)); cx <= Math.min(40, Math.floor(b.x2 / C)); cx++) {
        const k = this.key(cx, cy);
        const arr = this.cells.get(k);
        if (arr) arr.push(s);
        else this.cells.set(k, [s]);
      }
  }
  near(b: Box): Set<Stroke> {
    const out = new Set<Stroke>();
    const C = StrokeIndex.C;
    for (let cy = Math.max(0, Math.floor(b.y1 / C)); cy <= Math.min(40, Math.floor(b.y2 / C)); cy++)
      for (let cx = Math.max(0, Math.floor(b.x1 / C)); cx <= Math.min(40, Math.floor(b.x2 / C)); cx++) this.cells.get(this.key(cx, cy))?.forEach((s) => out.add(s));
    return out;
  }
}
