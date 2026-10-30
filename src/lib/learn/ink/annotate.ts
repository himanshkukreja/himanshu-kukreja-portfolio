/**
 * Annotate the lesson: ink written straight onto the article (underlines, circles, arrows, margin notes, highlighter),
 * anchored to the lesson's text so it stays on the same words when the layout changes (rotation, the Notebook split
 * panel, text size, theme, opening a collapsed section). The overlay, input and toolbar live in
 * src/components/learn/ink/annotate/*; this file is the anchoring model and has no React in it.
 *
 * ANCHORING (why a mark stays put)
 *
 *   Every stroke is anchored to one content BLOCK: the innermost p / li / heading / pre / td / figure / img /
 *   [data-sd] component under it (margin strokes: the block nearest it vertically). A block is found again on any
 *   later visit by a BlockRef, not by DOM position:
 *     s  the id of the heading or stage it sits under (ids come from the renderer and are stable),
 *     h  a hash of its text (whitespace collapsed, [data-sd-chrome] skipped; dynamic diagrams use kind + ordinal),
 *     o  which block with that hash inside that scope (repeated text such as "Answer:"),
 *     t  its tag / data-sd kind, and p its first words (fuzzy re-finding, and the detached tray's "was on …").
 *   Resolution: same hash in the same scope (occurrence o), else the same hash anywhere, else the same tag in the same
 *   scope starting with the same words (an edited paragraph). Nothing found: the mark is DETACHED. It is kept in the
 *   saved data and listed in the toolbar's "detached" tray, never dropped.
 *
 *   Inside the block the stroke is stored in one of three modes, chosen when it is drawn:
 *     "t"  TEXT mark: an underline, strike-through, circle or highlighter swipe over words on one line. Stored as the
 *          character range it covers in the block's text (r, q) and its points relative to that range's box on screen
 *          (u = fraction of the range's width, v = fraction of its line height). When the words reflow the range is
 *          measured again; if it now wraps onto several lines the stroke is cut at the line ends and each piece is
 *          drawn under its own fragment (u is spread over the fragments by their widths), so an underline stays under
 *          the same words like a word processor's. A circle around words that later wrap becomes two arcs.
 *     "b"  BLOCK mark: a large stroke over a block (a bracket beside a paragraph, a box around it, an arrow across a
 *          diagram). Points are fractions of the block's box, so it stretches with the block.
 *     "g"  RIGID mark: margin notes and small marks (ticks, stars, letters). One anchor point (side l/r: px from the
 *          content column's left/right edge, the margin; i: fraction of the block's width; p: px from the block's left
 *          edge, for code and tables, which don't reflow) at a fraction of the block's height; the shape is px offsets
 *          from it, scaled only with the text size. Strokes written within 1.6 s of each other and close together
 *          share one anchor (a group), so handwriting moves as one piece and never comes apart.
 *   Sizes follow the text: a text mark scales with its line height, a rigid one with the block's font size.
 *
 *   Limits (documented in the report): a "b" stroke over reflowing text keeps its fractions, so an arrow drawn
 *   between two words drifts a little when the paragraph reflows; a stroke anchored to one block does not follow a
 *   neighbouring block it also crossed; marks over a horizontally scrolled code block follow the text for text marks
 *   but not for rigid ones; a block whose text is edited (more than its tail) detaches its marks.
 *
 * Coordinates: "overlay px" are CSS px relative to the annotation overlay's top-left (it scrolls with the article).
 * Drawn strokes reuse the notebook's Stroke type and renderer (render.ts): pts are overlay px × Q.
 */
import { Q, newInkId, type Box } from "./geometry";
import type { InkColor, InkTool, Stroke } from "./types";

// ------------------------------------------------------------------ model

export type BlockRef = {
  /** id of the heading / stage the block sits under ("" before the first one) */
  s: string;
  /** hash of the block's text (or of its kind + ordinal for a block without stable text) */
  h: string;
  /** occurrence of that hash inside the scope */
  o: number;
  /** tag or data-sd kind */
  t: string;
  /** the block's first words (<= 60 characters) */
  p: string;
};

export type MarkMode = "t" | "b" | "g";
/** rigid anchor side: l / r = margin (px from the column edge), i = fraction of block width (×1000), p = px from block left */
export type AnchorSide = "l" | "r" | "i" | "p";

export type AnnotMark = {
  id: string;
  tool: InkTool;
  color: InkColor;
  /** pen width in CSS px when drawn (at reference scale k) */
  size: number;
  b: BlockRef;
  m: MarkMode;
  /** t: [start, end) in the block's collapsed text, and that text (<= 200 chars) */
  r?: [number, number];
  q?: string;
  /** g: [side, x, y]: x per side (see AnchorSide), y = fraction of the block's height ×1000 */
  a?: [AnchorSide, number, number];
  /** reference scale when drawn: t = line height px, b = block width px, g = block font size px */
  k: number;
  /** group id: rigid strokes written together */
  g?: string;
  /** flat [x, y, pressure]: t = u, v ×1000 of the range box; b = u, v ×1000 of the block box; g = px ×Q from the anchor */
  pts: number[];
  /** created (ms since epoch) */
  at: number;
};

export type AnnotDoc = { v: 1; marks: AnnotMark[] };
export const emptyDoc = (): AnnotDoc => ({ v: 1, marks: [] });

export const ANNOT_LIMITS = {
  /** serialised marks, measured like the jsonb text the database checks (see annotBytes) */
  bytes: 1_500_000,
  /** the server's check is 2,000,000 on marks::text (supabase/migrations/20261101_lesson_annotations.sql) */
  serverBytes: 2_000_000,
};

/** Bytes the marks take as jsonb text: compact JSON plus the space jsonb prints after each comma and colon. */
export function annotBytes(doc: AnnotDoc): number {
  const json = JSON.stringify(doc);
  let extra = 0;
  for (let i = 0; i < json.length; i++) {
    const c = json.charCodeAt(i);
    if (c === 44 || c === 58) extra++;
    else if (c > 127) extra += 2;
  }
  return json.length + extra;
}

/** A loose shape check for marks read from storage (bad rows are skipped, never thrown on). */
export function validMark(m: unknown): m is AnnotMark {
  const x = m as AnnotMark;
  return (
    !!x &&
    typeof x.id === "string" &&
    (x.tool === "pen" || x.tool === "highlighter") &&
    typeof x.color === "string" &&
    typeof x.size === "number" &&
    !!x.b &&
    typeof x.b.h === "string" &&
    (x.m === "t" || x.m === "b" || x.m === "g") &&
    Array.isArray(x.pts) &&
    x.pts.length >= 3 &&
    typeof x.k === "number"
  );
}

export function readDoc(raw: unknown): AnnotDoc {
  const d = raw as Partial<AnnotDoc> | null;
  const marks = d && Array.isArray(d.marks) ? d.marks.filter(validMark) : Array.isArray(raw) ? (raw as unknown[]).filter(validMark) : [];
  return { v: 1, marks };
}

// ------------------------------------------------------------------ text

const BLOCK_SEL = "p, li, h1, h2, h3, h4, h5, h6, pre, figure, table, td, th, blockquote, dt, dd, summary, figcaption, img, [data-sd]:not([data-sd='stage'])";
const SCOPE_SEL = "h1[id], h2[id], h3[id], h4[id], section[data-sd='stage'][id]";
const SKIP_TEXT = "[data-sd-chrome], script, style, template, noscript, svg, math";
/** kinds whose text is rendered or changed on the client: identified by kind + ordinal, never by text */
const DYNAMIC = new Set(["mermaid", "anim", "art", "quiz", "practice", "calc", "whiteboard"]);
/** blocks whose content does not reflow (scrolls sideways instead): rigid marks there keep px from the left edge */
const FIXED = new Set(["pre", "table", "code", "td", "th"]);
/** blocks that are pictures, not text: no text marks */
const PICTURE = new Set(["figure", "img", "mermaid", "anim", "art", "whiteboard"]);

const WS = /\s/;

/** FNV-1a, 32 bit, base 36 */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * A block's text with whitespace collapsed (chrome, SVG and scripts skipped), with a map from each character back to
 * its text node and offset, so a character range becomes a DOM Range again.
 */
export type TextMap = { text: string; nodes: Text[]; node: Int32Array; off: Int32Array; first: Map<Text, number> };

function skipped(n: Node, block: Element): boolean {
  const p = n.parentElement;
  if (!p) return true;
  const hit = p.closest(SKIP_TEXT);
  return !!hit && block.contains(hit);
}

export function textMap(block: Element): TextMap {
  const nodes: Text[] = [];
  const w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) if (!skipped(n, block)) nodes.push(n as Text);
  let total = 0;
  for (const n of nodes) total += (n.nodeValue || "").length;
  const node = new Int32Array(total);
  const off = new Int32Array(total);
  const first = new Map<Text, number>();
  let text = "";
  let k = 0;
  let space = true; // drop leading whitespace
  nodes.forEach((n, ni) => {
    const v = n.nodeValue || "";
    first.set(n, k);
    for (let i = 0; i < v.length; i++) {
      if (WS.test(v[i])) {
        if (space) continue;
        space = true;
        text += " ";
      } else {
        space = false;
        text += v[i];
      }
      node[k] = ni;
      off[k] = i;
      k++;
    }
  });
  if (text.endsWith(" ")) {
    text = text.slice(0, -1);
    k--;
  }
  return { text, nodes, node: node.subarray(0, k), off: off.subarray(0, k), first };
}

/** A DOM Range over [a, b) of a block's collapsed text. */
export function rangeOf(tm: TextMap, a: number, b: number): Range | null {
  if (a < 0 || b > tm.text.length || a >= b) return null;
  const r = document.createRange();
  r.setStart(tm.nodes[tm.node[a]], tm.off[a]);
  r.setEnd(tm.nodes[tm.node[b - 1]], tm.off[b - 1] + 1);
  return r;
}

// ------------------------------------------------------------------ blocks

export type BlockInfo = { el: HTMLElement; ref: BlockRef; leaf: boolean; kind: string; text: string };

const kindOf = (el: Element) => el.getAttribute("data-sd") || el.localName;

/** Every block of the lesson in document order, with its BlockRef. Rebuilt when the content's DOM changes. */
export class BlockIndex {
  readonly root: HTMLElement;
  readonly blocks: BlockInfo[] = [];
  readonly leaves: BlockInfo[] = [];
  private byEl = new Map<Element, BlockInfo>();
  private byHash = new Map<string, BlockInfo[]>();
  private tm = new WeakMap<Element, TextMap>();

  constructor(root: HTMLElement) {
    this.root = root;
    let scope = "";
    const seen = new Map<string, number>();
    const dyn = new Map<string, number>();
    const parentOf = new Map<BlockInfo, BlockInfo>();
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(`${BLOCK_SEL}, ${SCOPE_SEL}`))) {
      if (el.closest("[data-sd-chrome], [data-annot-ui]") || el.closest("svg")) continue;
      if (el.matches(SCOPE_SEL)) {
        scope = el.id;
        dyn.clear();
      }
      if (!el.matches(BLOCK_SEL)) continue;
      const kind = kindOf(el);
      let text = "";
      let h: string;
      if (DYNAMIC.has(kind)) {
        const n = dyn.get(kind) ?? 0;
        dyn.set(kind, n + 1);
        h = hash(`${kind}#${n}`);
      } else if (kind === "img") {
        h = hash(`img:${el.getAttribute("src") || ""}:${el.getAttribute("alt") || ""}`);
      } else {
        text = collapsed(el);
        h = text ? hash(text) : hash(`${kind}:${el.querySelector("img")?.getAttribute("src") || ""}`);
      }
      const key = `${scope}\u0000${h}`;
      const o = seen.get(key) ?? 0;
      seen.set(key, o + 1);
      const info: BlockInfo = { el, kind, text, leaf: true, ref: { s: scope, h, o, t: kind, p: text.slice(0, 60) } };
      const parent = el.parentElement?.closest(BLOCK_SEL);
      if (parent && root.contains(parent)) {
        const pi = this.byEl.get(parent);
        if (pi) {
          pi.leaf = false;
          parentOf.set(info, pi);
        }
      }
      this.blocks.push(info);
      this.byEl.set(el, info);
      const list = this.byHash.get(h);
      if (list) list.push(info);
      else this.byHash.set(h, [info]);
    }
    for (const b of this.blocks) if (b.leaf) this.leaves.push(b);
  }

  /** The innermost block at or above `el` (inside the root), or null. */
  blockOf(el: Element | null): BlockInfo | null {
    for (let n = el; n && n !== this.root; n = n.parentElement) {
      const b = this.byEl.get(n);
      if (b) return b;
    }
    return null;
  }

  info(el: Element): BlockInfo | null {
    return this.byEl.get(el) ?? null;
  }

  /** Find a block again (see the header). `exact` is false when only the fuzzy match found it (its text changed). */
  resolve(ref: BlockRef): { info: BlockInfo; exact: boolean } | null {
    const list = this.byHash.get(ref.h);
    if (list && list.length) {
      const inScope = list.filter((b) => b.ref.s === ref.s);
      const hit = inScope.find((b) => b.ref.o === ref.o) || inScope[0] || list[0];
      return { info: hit, exact: true };
    }
    const pre = ref.p.slice(0, 24);
    if (pre.length >= 12) {
      const hit = this.blocks.find((b) => b.ref.s === ref.s && b.kind === ref.t && b.text.startsWith(pre));
      if (hit) return { info: hit, exact: false };
    }
    return null;
  }

  textMap(el: Element): TextMap {
    let t = this.tm.get(el);
    if (!t) {
      t = textMap(el);
      this.tm.set(el, t);
    }
    return t;
  }
}

function collapsed(el: Element): string {
  let out = "";
  let space = true;
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (skipped(n, el)) continue;
    const v = n.nodeValue || "";
    for (let i = 0; i < v.length; i++) {
      if (WS.test(v[i])) {
        if (!space) out += " ";
        space = true;
      } else {
        out += v[i];
        space = false;
      }
    }
  }
  return out.trimEnd();
}

// ------------------------------------------------------------------ layout (measured fresh)

export type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number };

const toRect = (r: DOMRect | Rect, ox: number, oy: number): Rect => ({
  left: r.left - ox,
  top: r.top - oy,
  right: r.right - ox,
  bottom: r.bottom - oy,
  width: r.width,
  height: r.height,
});

/** One layout pass: block boxes and font sizes, measured once and cached. Coordinates are overlay px. */
export class Layout {
  readonly ox: number;
  readonly oy: number;
  /** the content column's edges (overlay px) */
  readonly colLeft: number;
  readonly colRight: number;
  private rects = new Map<Element, Rect | null>();
  private fonts = new Map<Element, number>();
  private leafRects: { info: BlockInfo; r: Rect }[] | null = null;

  constructor(readonly index: BlockIndex, origin: { x: number; y: number }) {
    this.ox = origin.x;
    this.oy = origin.y;
    const c = toRect(index.root.getBoundingClientRect(), this.ox, this.oy);
    this.colLeft = c.left;
    this.colRight = c.right;
  }

  /** the block's box, or null while it is hidden (a closed reveal / details, display: none) */
  rect(el: Element): Rect | null {
    if (this.rects.has(el)) return this.rects.get(el)!;
    const list = el.getClientRects();
    let r: Rect | null = null;
    if (list.length) {
      const b = el.getBoundingClientRect();
      if (b.width > 0 || b.height > 0) r = toRect(b, this.ox, this.oy);
    }
    this.rects.set(el, r);
    return r;
  }

  fontSize(el: Element): number {
    let f = this.fonts.get(el);
    if (f === undefined) {
      f = parseFloat(getComputedStyle(el).fontSize) || 17;
      this.fonts.set(el, f);
    }
    return f;
  }

  /** visible leaf blocks sorted by top */
  leaves(): { info: BlockInfo; r: Rect }[] {
    if (!this.leafRects) {
      this.leafRects = [];
      for (const info of this.index.leaves) {
        const r = this.rect(info.el);
        if (r && r.height > 0) this.leafRects.push({ info, r });
      }
      this.leafRects.sort((a, b) => a.r.top - b.r.top);
    }
    return this.leafRects;
  }

  /** The leaf block nearest a point vertically. `below` < 1 favours the block above (an underline under its last line). */
  nearest(x: number, y: number, below = 1): BlockInfo | null {
    let best: BlockInfo | null = null;
    let bd = Infinity;
    for (const { info, r } of this.leaves()) {
      if (r.top > y + bd) break;
      const dy = y < r.top ? r.top - y : y > r.bottom ? (y - r.bottom) * below : 0;
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      const d = dy + dx * 0.05;
      if (d < bd) {
        bd = d;
        best = info;
      }
    }
    return best;
  }

  /** The line boxes of a block's text (text nodes only, so nested block boxes don't merge lines). */
  textLines(tm: TextMap): Rect[] {
    const rects: DOMRect[] = [];
    const r = document.createRange();
    for (const n of tm.nodes) {
      r.selectNodeContents(n);
      rects.push(...Array.from(r.getClientRects()));
    }
    return this.merge(rects);
  }

  /** The line boxes of a range (client rects merged per line), in reading order. */
  lines(range: Range): Rect[] {
    return this.merge(Array.from(range.getClientRects()));
  }

  private merge(list: DOMRect[]): Rect[] {
    const out: Rect[] = [];
    const hs = list.filter((c) => c.width >= 0.5 && c.height >= 1).map((c) => c.height).sort((a, b) => a - b);
    // an element box the range swallowed whole (a nested list) is not a line
    const tall = (hs[Math.floor(hs.length / 2)] ?? 0) * 2.6;
    for (const cr of list) {
      if (cr.width < 0.5 || cr.height < 1 || (hs.length > 1 && cr.height > tall)) continue;
      const r = toRect(cr, this.ox, this.oy);
      const line = out.find((l) => {
        const ov = Math.min(l.bottom, r.bottom) - Math.max(l.top, r.top);
        return ov > Math.min(l.height, r.height) * 0.5;
      });
      if (line) {
        line.left = Math.min(line.left, r.left);
        line.right = Math.max(line.right, r.right);
        line.top = Math.min(line.top, r.top);
        line.bottom = Math.max(line.bottom, r.bottom);
        line.width = line.right - line.left;
        line.height = line.bottom - line.top;
      } else out.push({ ...r });
    }
    out.sort((a, b) => (Math.abs(a.top - b.top) < Math.min(a.height, b.height) * 0.5 ? a.left - b.left : a.top - b.top));
    return out;
  }
}

// ------------------------------------------------------------------ anchoring a new stroke

/** A stroke as drawn: overlay px × Q, pressure 0–100 (0 = simulate). */
export type RawStroke = { tool: InkTool; color: InkColor; size: number; pts: number[] };

/** The last rigid stroke, so the next one written close by in time joins its group. */
export type GroupHint = { mark: AnnotMark; box: Box; at: number };

export const GROUP_MS = 1600;

function boxOf(pts: number[]): Box {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (let i = 0; i + 1 < pts.length; i += 3) {
    const x = pts[i] / Q;
    const y = pts[i + 1] / Q;
    if (x < x1) x1 = x;
    if (x > x2) x2 = x;
    if (y < y1) y1 = y;
    if (y > y2) y2 = y;
  }
  return { x1, y1, x2, y2 };
}

const near = (a: Box, b: Box, pad: number) => a.x1 <= b.x2 + pad && a.x2 >= b.x1 - pad && a.y1 <= b.y2 + pad && a.y2 >= b.y1 - pad;

/** Where a rigid mark's anchor point is in this layout (null: block hidden). */
export function anchorPoint(mark: AnnotMark, block: Element, L: Layout): { x: number; y: number; s: number } | null {
  const r = L.rect(block);
  if (!r || !mark.a) return null;
  const [side, ax, ay] = mark.a;
  const x = side === "l" ? L.colLeft + ax : side === "r" ? L.colRight + ax : side === "p" ? r.left + ax : r.left + (ax / 1000) * r.width;
  const y = r.top + (ay / 1000) * r.height;
  return { x, y, s: L.fontSize(block) / (mark.k || 17) };
}

/**
 * Turn a drawn stroke into an anchored mark (see the header for the three modes). Returns null when there is no block
 * to anchor to (an empty lesson).
 */
export function anchorStroke(raw: RawStroke, L: Layout, last: GroupHint | null, now: number): AnnotMark | null {
  const box = boxOf(raw.pts);
  const bw = box.x2 - box.x1;
  const bh = box.y2 - box.y1;
  const cx = (box.x1 + box.x2) / 2;
  const cy = (box.y1 + box.y2) / 2;
  const base = { id: newInkId(), tool: raw.tool, color: raw.color, size: raw.size, at: now };
  const margin: AnchorSide | null = cx < L.colLeft ? "l" : cx > L.colRight ? "r" : null;
  const thin = bh < 12;

  let info: BlockInfo | null = null;
  if (!margin) {
    const hit = document.elementFromPoint(cx + L.ox, cy + L.oy);
    info = hit ? L.index.blockOf(hit) : null;
  }
  if (!info) info = L.nearest(cx, cy, thin ? 0.4 : 1);
  if (!info) return null;
  const fs = L.fontSize(info.el);
  const small = bw < fs * 2.2 && bh < fs * 2.2;

  // 1. a small stroke written right after a rigid one, close by: same group, same anchor
  if (last && now - last.at < GROUP_MS && last.mark.m === "g" && small && near(box, last.box, Math.max(24, fs * 1.6))) {
    const prev = L.index.resolve(last.mark.b);
    const p = prev && anchorPoint(last.mark, prev.info.el, L);
    if (p) return rigid(base, last.mark.b, last.mark.a!, last.mark.k, raw.pts, p, last.mark.g || last.mark.id);
  }

  const r = L.rect(info.el);
  if (!r) return null;

  // 2. margin: rigid, measured from the column edge
  if (margin) {
    const ax = Math.round(box.x1 - (margin === "l" ? L.colLeft : L.colRight));
    const ay = Math.round(((box.y1 - r.top) / Math.max(1, r.height)) * 1000);
    return rigid(base, info.ref, [margin, ax, ay], fs, raw.pts, { x: box.x1, y: box.y1, s: 1 }, null);
  }

  // 3. text: an underline / circle / swipe over words on one line
  if (!PICTURE.has(info.kind) && info.text) {
    const t = textMark(raw, box, info, L, fs);
    if (t) return { ...base, ...t };
  }

  // 4. small marks and marks on code / tables: rigid at a point of the block
  if (small || FIXED.has(info.kind)) {
    const side: AnchorSide = FIXED.has(info.kind) ? "p" : "i";
    const ax = side === "p" ? Math.round(box.x1 - r.left) : Math.round(((box.x1 - r.left) / Math.max(1, r.width)) * 1000);
    const ay = Math.round(((box.y1 - r.top) / Math.max(1, r.height)) * 1000);
    return rigid(base, info.ref, [side, ax, ay], fs, raw.pts, { x: box.x1, y: box.y1, s: 1 }, null);
  }

  // 5. a large stroke over a block: fractions of its box
  const pts = raw.pts.slice();
  for (let i = 0; i + 1 < pts.length; i += 3) {
    pts[i] = Math.round(((pts[i] / Q - r.left) / Math.max(1, r.width)) * 1000);
    pts[i + 1] = Math.round(((pts[i + 1] / Q - r.top) / Math.max(1, r.height)) * 1000);
  }
  return { ...base, b: info.ref, m: "b", k: Math.round(r.width), pts };
}

function rigid(
  base: Pick<AnnotMark, "id" | "tool" | "color" | "size" | "at">,
  b: BlockRef,
  a: [AnchorSide, number, number],
  k: number,
  raw: number[],
  p: { x: number; y: number; s: number },
  group: string | null
): AnnotMark {
  const pts = raw.slice();
  for (let i = 0; i + 1 < pts.length; i += 3) {
    pts[i] = Math.round(((pts[i] / Q - p.x) / p.s) * Q);
    pts[i + 1] = Math.round(((pts[i + 1] / Q - p.y) / p.s) * Q);
  }
  return { ...base, size: Math.round((base.size / p.s) * 100) / 100, b, m: "g", a, k: Math.round(k * 100) / 100, g: group ?? base.id, pts };
}

/** The text-mark reading of a stroke, or null when it isn't one (too tall, too small, not over words). */
function textMark(raw: RawStroke, box: Box, info: BlockInfo, L: Layout, fs: number): Pick<AnnotMark, "b" | "m" | "r" | "q" | "k" | "pts"> | null {
  const bw = box.x2 - box.x1;
  const bh = box.y2 - box.y1;
  if (raw.tool !== "highlighter" && bw < fs * 1.2) return null;
  const tm = L.index.textMap(info.el);
  if (!tm.text) return null;
  const lines = L.textLines(tm);
  if (!lines.length) return null;
  const hs = lines.map((l) => l.height).sort((a, b) => a - b);
  const lineH = hs[Math.floor(hs.length / 2)];
  if (bh > lineH * 2.3) return null;

  // which line it is about
  const cy = (box.y1 + box.y2) / 2;
  const thin = bh < lineH * 0.45;
  let line: Rect | null = null;
  if (thin) {
    line = lines.find((l) => cy >= l.top && cy <= l.bottom) ?? null;
    if (!line) {
      // in a gap: the line above (an underline) when close, else the nearest
      const above = lines.filter((l) => l.bottom <= cy).pop();
      if (above && cy - above.bottom <= lineH * 0.8) line = above;
      else line = lines.reduce((a, l) => (Math.abs((l.top + l.bottom) / 2 - cy) < Math.abs((a.top + a.bottom) / 2 - cy) ? l : a), lines[0]);
    }
  } else {
    let bestOv = -Infinity;
    for (const l of lines) {
      const ov = Math.min(l.bottom, box.y2) - Math.max(l.top, box.y1) - Math.abs((l.top + l.bottom) / 2 - cy) * 0.01;
      if (ov > bestOv) {
        bestOv = ov;
        line = l;
      }
    }
    if (bestOv <= 0) return null;
  }
  if (!line) return null;

  // the characters on that line inside the stroke's horizontal extent (a circle: inset a little)
  const inset = thin ? 0 : Math.min(fs * 0.4, bw * 0.12);
  const xa = Math.max(box.x1 + inset, line.left);
  const xb = Math.min(box.x2 - inset, line.right);
  if (xb - xa < 2) return null;
  const midY = (line.top + line.bottom) / 2;
  let a = -1;
  let b = -1;
  const range = document.createRange();
  const nodeRange = document.createRange();
  for (let ni = 0; ni < tm.nodes.length; ni++) {
    const n = tm.nodes[ni];
    nodeRange.selectNodeContents(n);
    const nb = nodeRange.getBoundingClientRect();
    if (nb.bottom - L.oy < line.top || nb.top - L.oy > line.bottom || nb.right - L.ox < xa || nb.left - L.ox > xb) continue;
    const startK = tm.first.get(n) ?? 0;
    for (let k = startK; k < tm.text.length && tm.node[k] === ni; k++) {
      range.setStart(n, tm.off[k]);
      range.setEnd(n, tm.off[k] + 1);
      const rects = range.getClientRects();
      let cr: DOMRect | null = null;
      for (const x of Array.from(rects)) if (x.top - L.oy <= midY && x.bottom - L.oy >= midY) cr = x;
      if (!cr) continue;
      const mx = (cr.left + cr.right) / 2 - L.ox;
      if (mx < xa || mx > xb) continue;
      if (a < 0 || k < a) a = k;
      if (k + 1 > b) b = k + 1;
    }
  }
  if (a < 0) return null;
  while (a < b && tm.text[a] === " ") a++;
  while (b > a && tm.text[b - 1] === " ") b--;
  if (a >= b) return null;
  const rr = rangeOf(tm, a, b);
  if (!rr) return null;
  const frags = L.lines(rr);
  // the box the stroke is relative to: the range's fragment on that line
  const R = frags.find((f) => f.top <= midY && f.bottom >= midY) || frags[0];
  if (!R || R.width < 1) return null;
  const pts = raw.pts.slice();
  for (let i = 0; i + 1 < pts.length; i += 3) {
    pts[i] = Math.round(((pts[i] / Q - R.left) / R.width) * 1000);
    pts[i + 1] = Math.round(((pts[i + 1] / Q - R.top) / R.height) * 1000);
  }
  return { b: info.ref, m: "t", r: [a, b], q: tm.text.slice(a, b).slice(0, 200), k: Math.round(R.height * 100) / 100, pts };
}

// ------------------------------------------------------------------ placing a saved mark in the current layout

export type Placed = { mark: AnnotMark; strokes: Stroke[]; box: Box | null };

/**
 * Where a mark goes now: one or more Strokes in overlay px × Q (a text mark whose words wrap is cut into pieces), [] while
 * its block is hidden, null when it is detached (no block found).
 */
export function placeMark(mark: AnnotMark, L: Layout): Stroke[] | null {
  const found = L.index.resolve(mark.b);
  if (!found) return null;
  const el = found.info.el;
  const r = L.rect(el);
  if (!r) return [];
  const mk = (pts: number[], size: number, n = 0): Stroke => ({ id: n ? `${mark.id}:${n}` : mark.id, tool: mark.tool, color: mark.color, size, pts });

  if (mark.m === "g") {
    const p = anchorPoint(mark, el, L);
    if (!p) return [];
    const pts = mark.pts.slice();
    for (let i = 0; i + 1 < pts.length; i += 3) {
      pts[i] = Math.round((p.x + (pts[i] / Q) * p.s) * Q);
      pts[i + 1] = Math.round((p.y + (pts[i + 1] / Q) * p.s) * Q);
    }
    return [mk(pts, mark.size * p.s)];
  }

  if (mark.m === "b") {
    const pts = mark.pts.slice();
    for (let i = 0; i + 1 < pts.length; i += 3) {
      pts[i] = Math.round((r.left + (pts[i] / 1000) * r.width) * Q);
      pts[i + 1] = Math.round((r.top + (pts[i + 1] / 1000) * r.height) * Q);
    }
    const s = Math.max(0.6, Math.min(1.6, r.width / Math.max(1, mark.k)));
    return [mk(pts, mark.size * s)];
  }

  // text
  const tm = L.index.textMap(el);
  let a = mark.r?.[0] ?? 0;
  let b = mark.r?.[1] ?? 0;
  const q = mark.q || "";
  if (!found.exact || tm.text.slice(a, b) !== q.slice(0, b - a)) {
    // the block was found by its first words: find the marked words again, nearest the old place
    if (!q) return null;
    let best = -1;
    for (let i = tm.text.indexOf(q); i >= 0; i = tm.text.indexOf(q, i + 1)) if (best < 0 || Math.abs(i - a) < Math.abs(best - a)) best = i;
    if (best < 0) return null;
    a = best;
    b = best + q.length;
  }
  const range = rangeOf(tm, a, b);
  if (!range) return [];
  const frags = L.lines(range);
  if (!frags.length) return [];
  const W = frags.reduce((s, f) => s + f.width, 0);
  if (W < 0.5) return [];
  const hs = frags.map((f) => f.height).sort((x, y) => x - y);
  const scale = hs[Math.floor(hs.length / 2)] / Math.max(1, mark.k);
  const size = mark.size * Math.max(0.5, Math.min(2, scale));
  if (frags.length === 1) {
    const f = frags[0];
    const pts = mark.pts.slice();
    for (let i = 0; i + 1 < pts.length; i += 3) {
      pts[i] = Math.round((f.left + (pts[i] / 1000) * W) * Q);
      pts[i + 1] = Math.round((f.top + (pts[i + 1] / 1000) * f.height) * Q);
    }
    return [mk(pts, size)];
  }
  return splitAcross(mark, frags, W).map((pts, n) => mk(pts, size, n));
}

/**
 * A text mark whose words now wrap: u (0..1 over the original range) is spread over the fragments by their widths;
 * the stroke is cut where it crosses from one fragment's share to the next (the cut point interpolated), and each
 * piece is drawn relative to its own fragment.
 */
function splitAcross(mark: AnnotMark, frags: Rect[], W: number): number[][] {
  const cum: number[] = [0];
  for (const f of frags) cum.push(cum[cum.length - 1] + f.width / W);
  const n = frags.length;
  const fragOf = (u: number) => {
    let j = 0;
    while (j < n - 1 && u >= cum[j + 1]) j++;
    return j;
  };
  const put = (out: number[], j: number, u: number, v: number, p: number) => {
    const f = frags[j];
    out.push(Math.round((f.left + (u - cum[j]) * W) * Q), Math.round((f.top + v * f.height) * Q), p);
  };
  const pieces: number[][] = [];
  const P = mark.pts;
  let cur: number[] = [];
  let cj = -1;
  for (let i = 0; i + 2 < P.length; i += 3) {
    const u = P[i] / 1000;
    const v = P[i + 1] / 1000;
    const p = P[i + 2];
    const j = fragOf(u);
    if (cj >= 0 && j !== cj) {
      const pu = P[i - 3] / 1000;
      const pv = P[i - 2] / 1000;
      const pp = P[i - 1];
      const step = j > cj ? 1 : -1;
      for (let jj = cj; jj !== j; jj += step) {
        const c = step > 0 ? cum[jj + 1] : cum[jj];
        const t = u === pu ? 0 : (c - pu) / (u - pu);
        const iv = pv + (v - pv) * t;
        const ip = Math.round(pp + (p - pp) * t);
        put(cur, jj, c, iv, ip);
        if (cur.length >= 6) pieces.push(cur);
        cur = [];
        put(cur, jj + step, c, iv, ip);
      }
    }
    cj = j;
    put(cur, j, u, v, p);
  }
  if (cur.length >= 3) pieces.push(cur);
  return pieces;
}

/** Keep each rigid group inside the overlay (a margin note when the margin got narrower): shift it in, whole. */
export function clampGroups(placed: Placed[], width: number): void {
  const groups = new Map<string, Placed[]>();
  for (const p of placed) {
    if (p.mark.m !== "g" || !p.box) continue;
    const key = p.mark.g || p.mark.id;
    const list = groups.get(key);
    if (list) list.push(p);
    else groups.set(key, [p]);
  }
  groups.forEach((list) => {
    let x1 = Infinity;
    let x2 = -Infinity;
    for (const p of list) {
      x1 = Math.min(x1, p.box!.x1);
      x2 = Math.max(x2, p.box!.x2);
    }
    let dx = 0;
    if (x2 > width - 2) dx = width - 2 - x2;
    if (x1 + dx < 2) dx = 2 - x1;
    if (Math.abs(dx) < 0.5) return;
    const q = Math.round(dx * Q);
    for (const p of list) {
      p.strokes = p.strokes.map((s) => {
        const pts = s.pts.slice();
        for (let i = 0; i < pts.length; i += 3) pts[i] += q;
        return { ...s, pts };
      });
      p.box = { ...p.box!, x1: p.box!.x1 + dx, x2: p.box!.x2 + dx };
    }
  });
}

/** The marks as one flat list of drawn strokes (the eraser and the tiles use it). */
export const strokesOf = (placed: Placed[]) => placed.flatMap((p) => p.strokes);
