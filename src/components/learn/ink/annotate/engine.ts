"use client";

/**
 * The annotation layer over a lesson: drawing the marks, and (in annotate mode) taking strokes from a pen or mouse.
 * Anchoring is in src/lib/learn/ink/annotate.ts; strokes are outlined and filled by the notebook's renderer (render.ts).
 *
 * Rendering: two transparent overlays sit over the article (absolute, so they scroll with it natively; no work per
 * scroll frame), one for the highlighter (mix-blend-mode multiply in light / screen in dark, so text under it stays
 * crisp) and one for ink. Each is cut into TILE-tall canvas tiles; only the tiles within ~1 screen of the viewport
 * exist (a pool, reused), drawn once when they come near and again only when the marks or the layout change. A tile
 * with no marks keeps a 1 × 1 canvas. pointer-events: none throughout, so with the mode off selecting text and links
 * work as if the layer weren't there.
 *
 * Layout changes (rotation, the Notebook split panel, text size, opening a collapsed section, fonts, images loading)
 * all change the content's size: a ResizeObserver re-places every mark (annotate.ts placeMark) and redraws the tiles
 * near the viewport. DOM changes inside the content (highlights re-render it) rebuild the block index first.
 *
 * Input (mode on): window-level capture listeners, per the device's input mode (lib/learn/ink/inputMode.ts).
 *   Pen only       a pen ("pen" pointers) or a mouse draws; fingers are never consumed, so they scroll, tap links
 *                  and select as usual. For the pen, touchstart / touchmove are cancelled (iPad Safari reports the
 *                  Pencil as a touch with touchType "stylus") so the page doesn't scroll or start a text selection
 *                  under it. Finger drags over the lesson are counted for the "your stylus looks like a finger" hint.
 *   Stylus/finger  for passive styluses: one touch contact writes (TouchArbiter: palms by size, a second contact
 *                  while the stroke is young makes a two-finger gesture). Over the lesson the wrapper gets
 *                  touch-action: none and touchstart / touchmove / touchend are cancelled, so the browser neither
 *                  scrolls nor selects nor opens links; two fingers scroll the lesson here (window.scrollBy, or the
 *                  nearest scrolling ancestor, with momentum). Pinch-zoom of the page waits until annotate is done.
 *   Scroll         the mode takes no input at all, as if it were off.
 * A mouse stroke that moved swallows the click that follows (no link opens under a drawn line); a click without
 * movement on a link still opens it. A touch stroke always swallows its click.
 *
 * Quick gestures (lib/learn/ink/gestures.ts): the pen or the writing contact held still HOLD_MS → over a mark, it and
 * the marks written with it (its group) are selected and the host shows a menu (onPress); on empty paper a palette.
 * A fast zig-zag over marks erases them instead of drawing. A two-finger tap undoes, three fingers redo (both modes:
 * in Pen only the fingers are only watched, never cancelled). onStroke tells the host where the last stroke ended
 * (the floating pen ↔ eraser switch follows it).
 */
import { buildLayer, fillLayer, fillStroke, outlinePathData, penPressureUsable, strokeInput, strokeOptions, withoutPressure, type InkTheme } from "@/lib/learn/ink/render";
import { ContactLog, TouchArbiter, noteFingerDrag, pressureVaries, type ArbiterEvent, type ContactPoint, type InkInputMode } from "@/lib/learn/ink/inputMode";
import { HOLD_MS, HOLD_PX, TapSession, detectScribble, inkToast, scribbleTargets, type TimedPt } from "@/lib/learn/ink/gestures";
import { Q, strokeHit, unionBox, strokeBox, type Box } from "@/lib/learn/ink/geometry";
import { getStroke } from "perfect-freehand";
import type { InkColor, InkTool, Stroke } from "@/lib/learn/ink/types";
import { setShowMarks } from "./mode";
import { BlockIndex, Layout, anchorStroke, clampGroups, placeMark, type AnnotMark, type GroupHint, type Placed } from "@/lib/learn/ink/annotate";


export const TILE = 1024;
const MIN_STEP2 = 6 * 6; // a point is kept 0.6 px from the last (×Q)
const MARGIN_MAX = 220;
/** room a margin note needs on the right (px); a narrower margin opens a gutter (measureBox) */
const GUTTER = 72;

export type AnnotTool = "pen" | "highlighter" | "eraser";

export type EngineProps = {
  marks: AnnotMark[];
  on: boolean;
  show: boolean;
  tool: AnnotTool;
  color: InkColor;
  size: number;
  theme: InkTheme;
  /** refuse new ink (the lesson's marks are at the size limit) */
  full: boolean;
  onAdd: (m: AnnotMark) => void;
  onErase: (ids: Set<string>) => void;
  onFull: () => void;
  /** placements changed: which marks are detached */
  onDetached: (ids: string[]) => void;
  onPenSeen: () => void;
  /** the device's input mode */
  input: InkInputMode;
  onUndo?: () => void;
  onRedo?: () => void;
  /** a long-press: over marks (their ids, with their groups), or on empty paper (the palette); client px */
  onPress?: (p: { kind: "sel" | "palette"; ids: string[]; x: number; y: number }) => void;
  /** a stroke was drawn, ending here (client px) */
  onStroke?: (x: number, y: number) => void;
};

type Tile = { i: number; hl: HTMLCanvasElement; ink: HTMLCanvasElement; v: number };

type Action =
  | { kind: "draw"; pid: number; type: string; tool: InkTool; color: InkColor; size: number; pts: number[]; predicted: number[]; moved: boolean; start: [number, number]; raw: number[]; real: boolean; ts: number[] }
  | { kind: "erase"; pid: number; type: string; erased: Set<string>; at: [number, number] | null; moved: boolean; start: [number, number] };

/** a long-press selects the marks written with the one under it: within WORD_MS of each other, WORD_GAP px apart */
const WORD_MS = 2500;
const WORD_GAP = 32;
/** a finger drag this long (px) over the lesson in Pen only would have been a stroke */
const DRAG_PX = 12;

const UI_SEL = "[data-annot-ui], [data-reader-ui], [data-stage-rail], header, nav, aside, dialog, [role='dialog'], [data-hk-snip-ui], [data-ink-ui], [data-sd-chrome] button";

export class AnnotEngine {
  P: EngineProps;
  private wrap: HTMLElement;
  private root: HTMLElement;
  private hlLayer: HTMLDivElement;
  private inkLayer: HTMLDivElement;
  private live: HTMLCanvasElement;
  private index: BlockIndex | null = null;
  private layout: Layout | null = null;
  private placed = new Map<string, Placed>();
  private placedList: Placed[] = [];
  private detached: string[] = [];
  private tiles = new Map<number, Tile>();
  private pool: Tile[] = [];
  private version = 1;
  private width = 0;
  private height = 0;
  private marginL = 0;
  private gutter = 0;
  private dpr = 1;
  private skip: Set<string> | null = null;
  private raf = 0;
  private relayoutTimer = 0;
  private action: Action | null = null;
  private last: GroupHint | null = null;
  /** a mouse stroke just ended: the click it produces is swallowed until then */
  private swallowUntil = 0;
  private ro: ResizeObserver;
  private mo: MutationObserver;
  private listening = false;
  /** Stylus/finger: who writes among the touch contacts */
  private arb = new TouchArbiter("annotate");
  /** Pen only: fingers over the lesson (dev log, the hint) */
  private fingers = new ContactLog("annotate");
  /** two-finger tap = undo, three = redo */
  private taps = new TapSession();
  /** a long-press being timed, and the pointer whose hold fired (the rest of it does nothing) */
  private hold: { pid: number; x: number; y: number; timer: number } | null = null;
  private heldPid: number | null = null;
  /** two-finger scroll (Stylus/finger): the contacts, the last midpoint, recent samples for momentum */
  private scroll: { ids: number[]; last: [number, number]; samples: [number, number, number][] } | null = null;
  private inertia = 0;
  /** ms spent in the last full re-place, and per tile paint (dev numbers for the report / QA) */
  stats = { relayoutMs: 0, paints: 0, paintMs: 0, strokes: 0 };

  constructor(wrap: HTMLElement, root: HTMLElement, live: HTMLCanvasElement, props: EngineProps) {
    this.P = props;
    this.wrap = wrap;
    this.root = root;
    this.live = live;
    const layer = (blend: boolean) => {
      const d = document.createElement("div");
      d.setAttribute("aria-hidden", "true");
      d.setAttribute("data-annot-layer", blend ? "hl" : "ink");
      d.style.cssText = `position:absolute;top:0;left:0;pointer-events:none;z-index:1;contain:strict;`;
      wrap.appendChild(d);
      return d;
    };
    this.hlLayer = layer(true);
    this.inkLayer = layer(false);
    this.ro = new ResizeObserver(() => this.scheduleRelayout(0));
    this.ro.observe(root);
    this.ro.observe(wrap);
    this.mo = new MutationObserver((recs) => {
      for (const r of recs) {
        const t = r.target instanceof Element ? r.target : r.target.parentElement;
        if (!t || t.closest("svg, [data-sd='anim'], [data-sd-chrome], [data-annot-layer]")) continue;
        this.index = null;
        this.scheduleRelayout(120);
        return;
      }
    });
    this.mo.observe(root, { childList: true, subtree: true, characterData: true });
    // capture: also scrolls of an inner scroller, if the lesson ever scrolls inside one (a split layout)
    window.addEventListener("scroll", this.onScroll, { passive: true, capture: true });
    window.addEventListener("resize", this.onResize);
    document.fonts?.addEventListener?.("loadingdone", this.onResize);
    this.applyProps(null);
    this.relayout();
  }

  destroy() {
    this.stopInput();
    this.ro.disconnect();
    this.mo.disconnect();
    window.removeEventListener("scroll", this.onScroll, { capture: true });
    window.removeEventListener("resize", this.onResize);
    document.fonts?.removeEventListener?.("loadingdone", this.onResize);
    if (this.raf) cancelAnimationFrame(this.raf);
    window.clearTimeout(this.relayoutTimer);
    this.hlLayer.remove();
    this.inkLayer.remove();
    if (this.gutter) this.wrap.style.paddingRight = "";
  }

  // ------------------------------------------------------------------ props

  update(next: EngineProps) {
    const prev = this.P;
    this.P = next;
    this.applyProps(prev);
  }

  private applyProps(prev: EngineProps | null) {
    const p = this.P;
    const visible = p.show;
    this.hlLayer.style.display = visible ? "" : "none";
    this.inkLayer.style.display = visible ? "" : "none";
    if (!prev || prev.theme !== p.theme) {
      this.hlLayer.style.mixBlendMode = p.theme === "dark" ? "screen" : "multiply";
      this.bump();
    }
    const take = p.on && p.input !== "scroll";
    if (prev && prev.input !== p.input && this.listening) this.resetTouch();
    if (take && !this.listening) this.startInput();
    if (!take && this.listening) this.stopInput();
    // Stylus/finger: the browser must not pan the lesson under a finger that writes (two fingers scroll, here)
    this.wrap.style.touchAction = take && p.input === "touch" ? "none" : "";
    if (prev && prev.on !== p.on) this.scheduleRelayout(0);
    if (prev && prev.marks !== p.marks) this.syncMarks();
    if (prev && !prev.show && p.show) this.bump();
  }

  /** Place marks that are new, forget removed ones; a whole re-place only when the layout changed. */
  private syncMarks() {
    const marks = this.P.marks;
    // an erase landed (or was undone): nothing is hidden any more
    this.skip = null;
    if (!this.layout) return this.relayout();
    const ids = new Set(marks.map((m) => m.id));
    let changed = false;
    for (const id of Array.from(this.placed.keys()))
      if (!ids.has(id)) {
        this.placed.delete(id);
        changed = true;
      }
    const L = this.freshLayout();
    const added: Placed[] = [];
    const det: string[] = this.detached.filter((id) => ids.has(id));
    for (const m of marks) {
      const was = this.placed.get(m.id);
      // a mark restyled (recoloured, thicker): placed again
      if (was && was.mark !== m) this.placed.delete(m.id);
      else if (was || det.includes(m.id)) continue;
      const strokes = placeMark(m, L);
      if (!strokes) {
        det.push(m.id);
        continue;
      }
      const p: Placed = { mark: m, strokes, box: boxOfStrokes(strokes) };
      this.placed.set(m.id, p);
      added.push(p);
      changed = true;
    }
    if (det.length !== this.detached.length || det.some((d, i) => d !== this.detached[i])) {
      this.detached = det;
      this.P.onDetached(det);
    }
    if (!changed) return;
    this.rebuildList();
    clampGroups(this.placedList, this.width);
    this.bump();
  }

  // ------------------------------------------------------------------ layout

  private getIndex(): BlockIndex {
    if (!this.index) this.index = new BlockIndex(this.root);
    return this.index;
  }

  private origin() {
    const r = this.hlLayer.getBoundingClientRect();
    return { x: r.left, y: r.top };
  }

  private freshLayout(): Layout {
    this.layout = new Layout(this.getIndex(), this.origin());
    return this.layout;
  }

  private onResize = () => this.scheduleRelayout(0);

  private scheduleRelayout(ms: number) {
    window.clearTimeout(this.relayoutTimer);
    this.relayoutTimer = window.setTimeout(() => {
      if (this.action) return this.scheduleRelayout(200); // never mid-stroke
      requestAnimationFrame(() => this.relayout());
    }, ms);
  }

  /**
   * The overlay's box: the content column plus the free margins beside it (up to the sidebars / screen edge). On a
   * tablet whose right margin is too narrow to write in (iPad portrait: ~45 px, less at 744 px), a writing gutter
   * opens on the right while annotating, and stays while the lesson has right-margin notes: the wrapper gets a
   * right padding, the text reflows a little narrower (marks follow, they are anchored to the words), and margin
   * notes have room. Not on phones (< 640 px), where the marks are view-only and the text keeps its width.
   */
  private measureBox() {
    const article = this.wrap.closest("article") || this.wrap.parentElement;
    let leftLimit = 0;
    let rightLimit = document.documentElement.clientWidth;
    if (article?.parentElement) {
      // never past the article's grid (plus the page's own padding): a fixed side panel (the Notebook split) sits
      // beyond it, over what the viewport would otherwise call free
      const gr = article.parentElement.getBoundingClientRect();
      leftLimit = Math.max(leftLimit, gr.left - 24);
      rightLimit = Math.min(rightLimit, gr.right + 24);
      const ar = article.getBoundingClientRect();
      for (const sib of Array.from(article.parentElement.children)) {
        if (sib === article) continue;
        const r = sib.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        if (r.bottom < ar.top || r.top > ar.bottom) continue;
        if (r.right <= ar.left + 1) leftLimit = Math.max(leftLimit, r.right);
        else if (r.left >= ar.right - 1) rightLimit = Math.min(rightLimit, r.left);
      }
    }
    const wr = this.wrap.getBoundingClientRect();
    const L = Math.max(0, Math.min(MARGIN_MAX, Math.floor(wr.left - leftLimit - 6)));
    const R = Math.max(0, Math.min(MARGIN_MAX, Math.floor(rightLimit - wr.right - 6)));
    const wantsGutter = window.innerWidth >= 640 && (this.P.on || this.P.marks.some((m) => m.a?.[0] === "r"));
    const gutter = wantsGutter && R < GUTTER ? GUTTER - R : 0;
    if (gutter !== this.gutter) {
      this.gutter = gutter;
      this.wrap.style.paddingRight = gutter ? `${gutter}px` : "";
    }
    const W = Math.ceil(wr.width + L + R);
    const H = Math.ceil(Math.max(this.root.offsetHeight, wr.height));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resized = W !== this.width || dpr !== this.dpr;
    this.width = W;
    this.height = H;
    this.marginL = L;
    this.dpr = dpr;
    for (const el of [this.hlLayer, this.inkLayer]) {
      el.style.left = `${-L}px`;
      el.style.width = `${W}px`;
      el.style.height = `${H}px`;
    }
    if (resized) {
      for (const t of [...this.tiles.values(), ...this.pool]) {
        t.hl.width = t.hl.height = 1;
        t.ink.width = t.ink.height = 1;
        t.hl.style.width = t.ink.style.width = `${W}px`;
      }
    }
  }

  /** Re-measure and re-place every mark. */
  relayout() {
    const t0 = performance.now();
    this.measureBox();
    const L = this.freshLayout();
    this.placed.clear();
    const det: string[] = [];
    for (const m of this.P.marks) {
      const strokes = placeMark(m, L);
      if (!strokes) {
        det.push(m.id);
        continue;
      }
      this.placed.set(m.id, { mark: m, strokes, box: boxOfStrokes(strokes) });
    }
    this.rebuildList();
    clampGroups(this.placedList, this.width);
    if (det.length !== this.detached.length || det.some((d, i) => d !== this.detached[i])) {
      this.detached = det;
      this.P.onDetached(det);
    }
    this.stats.relayoutMs = Math.round((performance.now() - t0) * 10) / 10;
    this.bump();
  }

  private rebuildList() {
    this.placedList = [...this.placed.values()];
    this.stats.strokes = this.placedList.reduce((n, p) => n + p.strokes.length, 0);
  }

  // ------------------------------------------------------------------ tiles

  /** Marks changed: every tile is stale; redraw the ones near the viewport. */
  private bump() {
    this.version++;
    this.scheduleTiles();
  }

  private onScroll = () => this.scheduleTiles();

  private scheduleTiles() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.ensureTiles();
    });
  }

  private ensureTiles() {
    if (!this.width) return;
    const vh = window.innerHeight;
    const top = -this.hlLayer.getBoundingClientRect().top;
    const from = Math.max(0, Math.floor((top - vh * 0.75) / TILE));
    const to = Math.min(Math.floor((this.height - 1) / TILE), Math.floor((top + vh * 1.75) / TILE));
    for (const [i, t] of this.tiles) {
      if (i < from || i > to) {
        this.tiles.delete(i);
        t.hl.style.display = t.ink.style.display = "none";
        this.pool.push(t);
      }
    }
    while (this.pool.length > 6) {
      const t = this.pool.pop()!;
      t.hl.remove();
      t.ink.remove();
    }
    for (let i = from; i <= to; i++) {
      let t = this.tiles.get(i);
      if (!t) {
        t = this.pool.pop() || this.makeTile();
        t.i = i;
        t.v = 0;
        t.hl.style.top = t.ink.style.top = `${i * TILE}px`;
        t.hl.style.display = t.ink.style.display = "";
        this.tiles.set(i, t);
      }
      if (t.v !== this.version) this.paint(t);
    }
  }

  private makeTile(): Tile {
    const c = (parent: HTMLElement) => {
      const el = document.createElement("canvas");
      el.width = el.height = 1;
      el.style.cssText = `position:absolute;left:0;width:${this.width}px;height:${TILE}px;`;
      parent.appendChild(el);
      return el;
    };
    return { i: 0, hl: c(this.hlLayer), ink: c(this.inkLayer), v: 0 };
  }

  private paint(t: Tile) {
    const t0 = performance.now();
    const y1 = t.i * TILE;
    const y2 = y1 + TILE;
    const hl: Stroke[] = [];
    const ink: Stroke[] = [];
    for (const p of this.placedList) {
      if (!p.box || p.box.y2 < y1 || p.box.y1 > y2) continue;
      if (this.skip?.has(p.mark.id)) continue;
      for (const s of p.strokes) (s.tool === "highlighter" ? hl : ink).push(s);
    }
    this.paintCanvas(t.hl, hl, "highlighter", y1);
    this.paintCanvas(t.ink, ink, "pen", y1);
    t.v = this.version;
    this.stats.paints++;
    this.stats.paintMs += performance.now() - t0;
  }

  private paintCanvas(c: HTMLCanvasElement, strokes: Stroke[], tool: InkTool, y1: number) {
    const w = strokes.length ? Math.round(this.width * this.dpr) : 1;
    const h = strokes.length ? Math.round(TILE * this.dpr) : 1;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    if (!strokes.length) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, -y1 * this.dpr);
    fillLayer(ctx, buildLayer(strokes, tool), tool, this.P.theme);
  }

  // ------------------------------------------------------------------ input

  private startInput() {
    this.listening = true;
    const o = { capture: true, passive: false } as AddEventListenerOptions;
    window.addEventListener("pointerdown", this.onDown, o);
    window.addEventListener("pointermove", this.onMove, o);
    window.addEventListener("pointerup", this.onUp, o);
    window.addEventListener("pointercancel", this.onCancel, o);
    window.addEventListener("touchstart", this.onTouch, o);
    window.addEventListener("touchmove", this.onTouch, o);
    window.addEventListener("touchend", this.onTouch, o);
    window.addEventListener("contextmenu", this.onContextMenu, o);
    window.addEventListener("click", this.onClick, o);
    window.addEventListener("selectstart", this.onSelectStart, o);
    this.sizeLive();
    window.addEventListener("resize", this.sizeLive);
  }

  private stopInput() {
    this.listening = false;
    const o = { capture: true } as EventListenerOptions;
    window.removeEventListener("pointerdown", this.onDown, o);
    window.removeEventListener("pointermove", this.onMove, o);
    window.removeEventListener("pointerup", this.onUp, o);
    window.removeEventListener("pointercancel", this.onCancel, o);
    window.removeEventListener("touchstart", this.onTouch, o);
    window.removeEventListener("touchmove", this.onTouch, o);
    window.removeEventListener("touchend", this.onTouch, o);
    window.removeEventListener("contextmenu", this.onContextMenu, o);
    window.removeEventListener("click", this.onClick, o);
    window.removeEventListener("selectstart", this.onSelectStart, o);
    window.removeEventListener("resize", this.sizeLive);
    if (this.action) this.cancelAction();
    this.resetTouch();
    this.disarm();
    this.taps.reset();
    document.documentElement.style.removeProperty("user-select");
    document.documentElement.style.removeProperty("-webkit-user-select");
  }

  private sizeLive = () => {
    const c = this.live;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const d = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(w * d);
    c.height = Math.round(h * d);
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
  };

  /** Is this pointer down for us: inside the overlay, not on chrome or our own UI? */
  private accepts(e: PointerEvent): boolean {
    return this.acceptsAt(e.target, e.clientX, e.clientY);
  }

  private acceptsAt(target: EventTarget | null, x: number, y: number): boolean {
    const t = target instanceof Element ? target : null;
    const r = this.hlLayer.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return false;
    // inside the lesson text: everything is paper (a pen writes over a quiz button rather than pressing it)
    if (t && this.root.contains(t)) return !t.closest("[data-annot-ui]");
    if (t?.closest(UI_SEL)) return false;
    // anything fixed / sticky over the article (bars, floating cards)
    for (let n = t; n && n !== this.root && n !== document.body; n = n.parentElement) {
      const pos = getComputedStyle(n).position;
      if (pos === "fixed" || pos === "sticky") return false;
    }
    return true;
  }

  private toOverlay(cx: number, cy: number, o: { x: number; y: number }): [number, number] {
    return [Math.round((cx - o.x) * Q), Math.round((cy - o.y) * Q)];
  }

  private onDown = (e: PointerEvent) => {
    this.stopInertia();
    if (this.hold && this.hold.pid !== e.pointerId) this.disarm();
    if (e.pointerType === "touch") {
      if (this.accepts(e)) this.taps.down(e.pointerId, e.clientX, e.clientY, e.timeStamp);
      if (this.P.input === "touch") this.touchDown(e);
      else if (this.accepts(e)) {
        // Pen only: fingers scroll, tap and select; one dragging over the lesson counts toward the hint
        this.fingerIds.add(e.pointerId);
        this.fingers.down(e, "pan");
        if (this.fingerIds.size >= 2) for (const id of this.fingerIds) this.fingers.setRole(id, "gesture");
      }
      return;
    }
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!this.accepts(e)) return;
    if (e.pointerType === "pen") {
      this.taps.reset();
      // the pen wins over a finger (or a palm) that started a stroke
      if (this.action && this.action.type === "touch") this.cancelAction();
      this.resetTouch();
    }
    if (this.action) return;
    if (e.pointerType === "pen") this.P.onPenSeen();
    this.begin({ pointerId: e.pointerId, pointerType: e.pointerType, button: e.button, buttons: e.buttons, pressure: e.pressure, clientX: e.clientX, clientY: e.clientY });
    // the pen / mouse writes: no text selection, no focus change, no drag of a link or image
    e.preventDefault();
    e.stopPropagation();
  };

  private begin(e: Pick<PointerEvent, "pointerId" | "pointerType" | "button" | "buttons" | "pressure" | "clientX" | "clientY">) {
    const p = this.P;
    // writing while the marks are hidden shows them again
    if (!p.show) setShowMarks(true);
    const barrel = e.pointerType === "pen" && (e.button === 5 || (e.buttons & 32) === 32);
    const tool = barrel ? "eraser" : p.tool;
    const o = this.origin();
    const start: [number, number] = [e.clientX, e.clientY];
    if (tool === "eraser") {
      this.action = { kind: "erase", pid: e.pointerId, type: e.pointerType, erased: new Set(), at: null, moved: false, start };
      this.eraseAt(e.clientX - o.x, e.clientY - o.y);
    } else {
      if (p.full) {
        p.onFull();
        return;
      }
      const [x, y] = this.toOverlay(e.clientX, e.clientY, o);
      const pr = e.pointerType === "pen" ? Math.max(1, Math.round((e.pressure || 0.5) * 100)) : 0;
      this.action = { kind: "draw", pid: e.pointerId, type: e.pointerType, tool, color: p.color, size: p.size, pts: [x, y, pr], predicted: [], moved: false, start, raw: [e.pressure || 0], real: false, ts: [performance.now()] };
    }
    document.documentElement.style.setProperty("user-select", "none");
    document.documentElement.style.setProperty("-webkit-user-select", "none");
    this.drawLive();
    this.arm(e.pointerId, e.pointerType, e.clientX, e.clientY);
  }

  // ------------------------------------------------------------------ long-press

  private disarm() {
    if (this.hold) window.clearTimeout(this.hold.timer);
    this.hold = null;
  }

  private arm(pid: number, type: string, x: number, y: number) {
    this.disarm();
    if (!this.P.onPress || (type !== "pen" && type !== "touch") || !this.action) return;
    this.hold = { pid, x, y, timer: window.setTimeout(() => this.fireHold(pid, x, y), HOLD_MS) };
  }

  private fireHold(pid: number, x: number, y: number) {
    this.hold = null;
    const a = this.action;
    if (!a || a.pid !== pid) return;
    // the dot the hold began goes; the rest of this pointer does nothing
    this.cancelAction();
    this.heldPid = pid;
    const o = this.origin();
    const px = x - o.x;
    const py = y - o.y;
    const r = 12;
    const hit = new Set<string>();
    for (const pl of this.placedList) {
      if (!pl.box || px < pl.box.x1 - r || px > pl.box.x2 + r || py < pl.box.y1 - r || py > pl.box.y2 + r) continue;
      if (pl.strokes.some((st) => strokeHit(st, px, py, r))) hit.add(pl.mark.id);
    }
    // the marks written with it: its group (margin notes), and the marks written just before or after it close by on
    // the same line (a word written over the text)
    const groups = new Set(this.placedList.filter((pl) => hit.has(pl.mark.id) && pl.mark.g).map((pl) => pl.mark.g));
    for (const pl of this.placedList) if (pl.mark.g && groups.has(pl.mark.g)) hit.add(pl.mark.id);
    if (hit.size) {
      const byTime = this.placedList.filter((pl) => pl.box).sort((a, b) => a.mark.at - b.mark.at);
      let box: Box | null = null;
      for (const pl of byTime) if (hit.has(pl.mark.id)) box = unionBox(box, pl.box!);
      const near = (b: Box) => {
        const g = box!;
        const dx = Math.max(0, b.x1 - g.x2, g.x1 - b.x2);
        return dx <= WORD_GAP && Math.min(b.y2, g.y2) - Math.max(b.y1, g.y1) > -WORD_GAP / 4;
      };
      const idx = byTime.map((pl, i) => (hit.has(pl.mark.id) ? i : -1)).filter((i) => i >= 0);
      for (let i = Math.min(...idx) - 1; i >= 0; i--) {
        const pl = byTime[i];
        if (byTime[i + 1].mark.at - pl.mark.at > WORD_MS || !near(pl.box!)) break;
        hit.add(pl.mark.id);
        box = unionBox(box, pl.box!);
      }
      for (let i = Math.max(...idx) + 1; i < byTime.length; i++) {
        const pl = byTime[i];
        if (pl.mark.at - byTime[i - 1].mark.at > WORD_MS || !near(pl.box!)) break;
        hit.add(pl.mark.id);
        box = unionBox(box, pl.box!);
      }
    }
    try {
      navigator.vibrate?.(12);
    } catch {
      // no haptics
    }
    this.P.onPress?.({ kind: hit.size ? "sel" : "palette", ids: [...hit], x, y });
  }

  /** the selection's box, relative to the wrapper (the host draws it there, so it scrolls with the lesson) */
  selectionBox(ids: string[]): Box | null {
    let b: Box | null = null;
    for (const id of ids) {
      const pl = this.placed.get(id);
      if (pl?.box) b = unionBox(b, pl.box);
    }
    if (!b) return null;
    return { x1: b.x1 - this.marginL, y1: b.y1, x2: b.x2 - this.marginL, y2: b.y2 };
  }

  // ------------------------------------------------------------------ touch (Stylus/finger)

  /** touch pointers down over the lesson */
  private fingerIds = new Set<number>();

  private touchDown(e: PointerEvent) {
    if (!this.accepts(e)) return;
    // a palm while the pen writes
    if (this.action && this.action.type === "pen") return;
    if (this.action && this.action.type === "mouse") return;
    this.fingerIds.add(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
    this.applyTouch(this.arb.down(e));
  }

  private applyTouch(evs: ArbiterEvent[]) {
    for (const ev of evs) {
      if (ev.type === "draw") {
        const c = this.arb.get(ev.id);
        if (!c || !c.hist.length || this.heldPid === c.id || (this.action && this.action.type !== "touch")) continue;
        if (this.action) this.cancelAction();
        this.scroll = null;
        const h0 = c.hist[0];
        this.begin({ pointerId: c.id, pointerType: "touch", button: 0, buttons: 1, pressure: h0.pressure, clientX: h0.clientX, clientY: h0.clientY });
        const a = this.action as Action | null;
        if (a && a.pid === c.id && c.hist.length > 1) {
          this.extend(a, c.hist.slice(1));
          a.moved = c.dist > 4;
        }
        this.drawLive();
      } else if (ev.type === "drop") {
        if (this.action?.pid === ev.id) this.cancelAction();
      } else if (ev.type === "end") {
        const a = this.action;
        if (a?.pid === ev.id) this.complete(a, false);
      } else if (ev.type === "gesture") {
        if (this.action && this.action.type === "touch") this.cancelAction();
        this.scroll = { ids: [...ev.ids], last: this.midpoint([...ev.ids]), samples: [] };
      } else if (ev.type === "gesture-end") {
        if (ev.left !== null) {
          const ids = [ev.left];
          this.scroll = { ids, last: this.midpoint(ids), samples: this.scroll?.samples ?? [] };
        } else this.endScroll();
      }
    }
  }

  private midpoint(ids: number[]): [number, number] {
    let x = 0;
    let y = 0;
    let n = 0;
    for (const id of ids) {
      const c = this.arb.get(id);
      if (!c) continue;
      x += c.x;
      y += c.y;
      n++;
    }
    return n ? [x / n, y / n] : [0, 0];
  }

  /** the element the lesson scrolls in: the nearest scrolling ancestor, or the page */
  private scroller(): Element | null {
    for (let n = this.wrap.parentElement; n && n !== document.body; n = n.parentElement) {
      const oy = getComputedStyle(n).overflowY;
      if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 1) return n;
    }
    return null;
  }

  private scrollBy(dx: number, dy: number) {
    const el = this.scroller();
    if (el) el.scrollBy({ left: dx, top: dy, behavior: "instant" as ScrollBehavior });
    else window.scrollBy({ left: dx, top: dy, behavior: "instant" as ScrollBehavior });
  }

  private moveScroll(e: PointerEvent) {
    const s = this.scroll;
    if (!s || !s.ids.includes(e.pointerId)) return;
    const m = this.midpoint(s.ids);
    const dx = m[0] - s.last[0];
    const dy = m[1] - s.last[1];
    s.last = m;
    s.samples.push([m[0], m[1], e.timeStamp]);
    if (s.samples.length > 6) s.samples.shift();
    if (dx || dy) this.scrollBy(-dx, -dy);
  }

  /** the fingers left: the lesson glides on a little (momentum, like a native scroll) */
  private endScroll() {
    const s = this.scroll;
    this.scroll = null;
    if (!s || s.samples.length < 2) return;
    const [x0, y0, t0] = s.samples[0];
    const [x1, y1, t1] = s.samples[s.samples.length - 1];
    const dt = Math.max(8, t1 - t0);
    let vx = (x1 - x0) / dt;
    let vy = (y1 - y0) / dt;
    if (performance.now() - t1 > 100 || Math.hypot(vx, vy) < 0.15) return;
    let last = performance.now();
    const step = (now: number) => {
      const d = now - last;
      last = now;
      const decay = Math.pow(0.995, d);
      vx *= decay;
      vy *= decay;
      this.scrollBy(-vx * d, -vy * d);
      this.inertia = Math.hypot(vx, vy) > 0.02 ? requestAnimationFrame(step) : 0;
    };
    this.inertia = requestAnimationFrame(step);
  }

  private stopInertia() {
    if (this.inertia) cancelAnimationFrame(this.inertia);
    this.inertia = 0;
  }

  private resetTouch() {
    if (this.action && this.action.type === "touch") this.cancelAction();
    this.arb.reset();
    this.fingerIds.clear();
    this.scroll = null;
    this.stopInertia();
  }

  /** a touch contact lifted: Stylus/finger (the arbiter), or Pen only (the hint) */
  private touchUp(e: PointerEvent, cancelled: boolean): boolean {
    if (e.pointerType !== "touch") return false;
    this.fingerIds.delete(e.pointerId);
    // a finger of a two- or three-finger tap leaves no dot; the tap undoes or redoes once every finger is up
    if (this.taps.multiSoFar(e.timeStamp) && this.action?.pid === e.pointerId && this.action.type === "touch") this.cancelAction();
    const n = this.taps.up(e.pointerId, e.timeStamp);
    if (n === 2 && this.P.onUndo) {
      this.P.onUndo();
      inkToast("Undone · two-finger tap");
    } else if (n === 3 && this.P.onRedo) {
      this.P.onRedo();
      inkToast("Redone · three-finger tap");
    }
    if (this.P.input === "touch") {
      if (!this.arb.get(e.pointerId)) return false;
      const evs = this.arb.up(e);
      if (this.scroll && this.scroll.ids.includes(e.pointerId) && !evs.some((v) => v.type === "gesture-end")) this.endScroll();
      this.applyTouch(evs);
      // a touch that wrote or scrolled never clicks what was under it
      this.swallowUntil = performance.now() + 400;
      return false;
    }
    const c = this.fingers.up(e);
    // Pen only: the browser took a finger drag for a scroll (pointercancel) or it moved a stroke's length
    if (c && c.role === "pan" && (cancelled || c.dist > DRAG_PX)) noteFingerDrag("annotate", { tilt: c.tilt, pressure: pressureVaries(c) });
    return true;
  }

  private onMove = (e: PointerEvent) => {
    if (this.hold && this.hold.pid === e.pointerId && Math.hypot(e.clientX - this.hold.x, e.clientY - this.hold.y) > HOLD_PX) this.disarm();
    if (e.pointerType === "touch") {
      this.taps.move(e.pointerId, e.clientX, e.clientY);
      if (this.P.input === "touch") {
        if (this.arb.get(e.pointerId)) {
          this.applyTouch(this.arb.move(e));
          this.moveScroll(e);
        }
      } else this.fingers.move(e);
    }
    const a = this.action;
    if (!a || a.pid !== e.pointerId) return;
    e.preventDefault();
    if (!a.moved && Math.hypot(e.clientX - a.start[0], e.clientY - a.start[1]) > 4) a.moved = true;
    const evs = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    const list = evs.length ? evs : [e];
    this.extend(a, list);
    if (a.kind === "draw") {
      const o = this.origin();
      a.predicted = [];
      const pred = typeof e.getPredictedEvents === "function" ? e.getPredictedEvents() : [];
      for (const ev of pred.slice(0, 2)) {
        const [qx, qy] = this.toOverlay(ev.clientX, ev.clientY, o);
        a.predicted.push(qx, qy, this.pressureOf(a, ev.pressure));
      }
    }
    if (!this.liveRaf) {
      this.liveRaf = requestAnimationFrame(() => {
        this.liveRaf = 0;
        this.drawLive();
      });
    }
  };
  private liveRaf = 0;

  private pressureOf(a: Extract<Action, { kind: "draw" }>, p: number) {
    return a.type === "pen" || a.real ? Math.max(1, Math.round((p || 0.5) * 100)) : 0;
  }

  /** follow the pointer: points for the stroke, or the eraser */
  private extend(a: Action, list: ContactPoint[]) {
    const o = this.origin();
    if (a.kind === "draw") {
      const pts = a.pts;
      for (const ev of list) {
        const [qx, qy] = this.toOverlay(ev.clientX, ev.clientY, o);
        const lx = pts[pts.length - 3];
        const ly = pts[pts.length - 2];
        if ((qx - lx) ** 2 + (qy - ly) ** 2 < MIN_STEP2) continue;
        pts.push(qx, qy, this.pressureOf(a, ev.pressure));
        a.raw.push(ev.pressure || 0);
        a.ts.push(ev.timeStamp ?? performance.now());
      }
      // a stylus the browser calls a finger, with real pressure: write with it
      if (!a.real && a.type === "touch") {
        const c = this.arb.get(a.pid);
        if (c && pressureVaries(c)) {
          a.real = true;
          for (let i = 0; i * 3 + 2 < pts.length; i++) pts[i * 3 + 2] = Math.max(1, Math.round((a.raw[i] || 0.5) * 100));
        }
      }
    } else {
      for (const ev of list) this.eraseAt(ev.clientX - o.x, ev.clientY - o.y);
    }
  }

  private onUp = (e: PointerEvent) => this.finish(e, false);
  /** iPad Safari cancels a pen stroke when a system gesture starts: keep what was drawn */
  private onCancel = (e: PointerEvent) => this.finish(e, this.action?.kind !== "draw", true);

  private finish(e: PointerEvent, cancelled: boolean, pointerCancel = false) {
    if (this.hold?.pid === e.pointerId) this.disarm();
    if (this.heldPid === e.pointerId) this.heldPid = null;
    if (this.touchUp(e, pointerCancel)) return;
    const a = this.action;
    if (!a || a.pid !== e.pointerId) return;
    const t = e.target instanceof Element ? e.target : null;
    this.complete(a, cancelled, t);
  }

  private complete(a: Action, cancelled: boolean, t: Element | null = null) {
    this.action = null;
    document.documentElement.style.removeProperty("user-select");
    document.documentElement.style.removeProperty("-webkit-user-select");
    if (a.type === "mouse" && a.moved) this.swallowUntil = performance.now() + 400;
    if (a.kind === "erase") {
      this.drawLive();
      const ids = a.erased;
      if (ids.size && !cancelled) this.P.onErase(ids);
      else {
        this.skip = null;
        this.bump();
      }
      return;
    }
    // a mouse click on a link / button (no movement) is a click, not a dot
    if (a.type === "mouse" && !a.moved && t?.closest("a, button, summary, input, label, [role='button']")) {
      this.drawLive();
      return;
    }
    if (!cancelled && a.tool === "pen" && this.scribbleErase(a)) {
      this.drawLive();
      return;
    }
    if (a.pts.length >= 3 && !cancelled) {
      this.commitStroke(a);
      const o = this.origin();
      const n = a.pts.length;
      this.P.onStroke?.(a.pts[n - 3] / Q + o.x, a.pts[n - 2] / Q + o.y);
    }
    this.drawLive();
  }

  /** a fast zig-zag over marks: erase them instead of drawing (true when it did) */
  private scribbleErase(a: Extract<Action, { kind: "draw" }>): boolean {
    const np = a.pts.length / 3;
    if (np < 8) return false;
    const path: TimedPt[] = [];
    for (let i = 0; i < np; i++) path.push({ x: a.pts[i * 3] / Q, y: a.pts[i * 3 + 1] / Q, t: a.ts[i] ?? 0 });
    const sb = detectScribble(path, 1);
    if (!sb) return false;
    const owner = new Map<Stroke, string>();
    for (const pl of this.placedList) {
      if (!pl.box || pl.box.x2 < sb.x1 || pl.box.x1 > sb.x2 || pl.box.y2 < sb.y1 || pl.box.y1 > sb.y2) continue;
      for (const st of pl.strokes) owner.set(st, pl.mark.id);
    }
    const gone = scribbleTargets(path, sb, owner.keys(), 3);
    if (!gone.length) return false;
    const ids = new Set(gone.map((st) => owner.get(st)!));
    this.skip = new Set(ids);
    this.bump();
    this.P.onErase(ids);
    inkToast(`Erased ${ids.size} ${ids.size === 1 ? "mark" : "marks"}`, this.P.onUndo ? { label: "Undo", run: this.P.onUndo } : undefined);
    return true;
  }

  private commitStroke(a: Extract<Action, { kind: "draw" }>) {
    const L = this.freshLayout();
    const now = Date.now();
    const pts = a.type === "pen" && !penPressureUsable(a.pts) ? withoutPressure(a.pts) : a.pts;
    const mark = anchorStroke({ tool: a.tool, color: a.color, size: a.size, pts }, L, this.last, now);
    if (!mark) return;
    // place it now so it doesn't blink between the live layer and the tiles
    const strokes = placeMark(mark, L);
    if (strokes) {
      const p: Placed = { mark, strokes, box: boxOfStrokes(strokes) };
      this.placed.set(mark.id, p);
      this.rebuildList();
      this.drawOnTiles(p);
    }
    this.last = mark.m === "g" ? { mark, box: rawBox(pts), at: now } : null;
    this.P.onAdd(mark);
  }

  /** a new mark: draw just it onto the tiles it touches (they stay current) */
  private drawOnTiles(p: Placed) {
    if (!p.box) return;
    for (const t of this.tiles.values()) {
      const y1 = t.i * TILE;
      if (p.box.y2 < y1 || p.box.y1 > y1 + TILE) continue;
      for (const s of p.strokes) {
        const c = s.tool === "highlighter" ? t.hl : t.ink;
        if (c.width < 2) {
          t.v = -1; // first stroke on this canvas: repaint the tile whole
          continue;
        }
        const ctx = c.getContext("2d");
        if (!ctx) continue;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, -y1 * this.dpr);
        fillStroke(ctx, s, this.P.theme);
      }
    }
    this.scheduleTiles();
  }

  private cancelAction() {
    const a = this.action;
    this.action = null;
    if (a?.kind === "erase") {
      this.skip = null;
      this.bump();
    }
    this.drawLive();
  }

  private eraseAt(x: number, y: number) {
    const a = this.action;
    if (!a || a.kind !== "erase") return;
    const r = 10;
    const from = a.at || [x, y];
    const steps = Math.max(1, Math.ceil(Math.hypot(x - from[0], y - from[1]) / (r / 2)));
    let hit = false;
    for (let i = 1; i <= steps; i++) {
      const px = from[0] + ((x - from[0]) * i) / steps;
      const py = from[1] + ((y - from[1]) * i) / steps;
      for (const p of this.placedList) {
        if (a.erased.has(p.mark.id) || !p.box) continue;
        if (px < p.box.x1 - r || px > p.box.x2 + r || py < p.box.y1 - r || py > p.box.y2 + r) continue;
        if (p.strokes.some((s) => strokeHit(s, px, py, r))) {
          a.erased.add(p.mark.id);
          hit = true;
        }
      }
    }
    a.at = [x, y];
    if (hit) {
      this.skip = new Set(a.erased);
      this.bump();
    }
  }

  /** after onErase the marks prop drops them; until then they stay hidden */
  clearSkip() {
    this.skip = null;
  }

  private onTouch = (e: TouchEvent) => {
    if (this.P.input === "touch") {
      // Stylus/finger: a touch over the lesson is ours (a stroke, a palm, a two-finger scroll): the browser must
      // not scroll, select, open the magnifier or click under it
      const ours =
        e.type === "touchstart"
          ? Array.from(e.changedTouches).some((t) => this.acceptsAt(e.target, t.clientX, t.clientY))
          : !!this.action || !!this.scroll || this.arb.contacts.size > 0 || (e.type === "touchend" && performance.now() < this.swallowUntil);
      if (ours && e.cancelable) e.preventDefault();
      return;
    }
    if (e.type === "touchend") return;
    // the Pencil on iPad Safari: no scroll, no selection, no magnifier under it. Fingers are left alone.
    const stylus = Array.from(e.changedTouches).some((t) => (t as Touch & { touchType?: string }).touchType === "stylus");
    if (stylus || (this.action && this.action.type === "pen")) {
      if (e.type === "touchstart" && !this.action) {
        // a stylus touch we didn't take (on chrome / our UI): leave it alone
        const t = e.target instanceof Element ? e.target : null;
        if (t?.closest(UI_SEL)) return;
        const touch = e.changedTouches[0];
        const r = this.hlLayer.getBoundingClientRect();
        if (!touch || touch.clientX < r.left || touch.clientX > r.right || touch.clientY < r.top || touch.clientY > r.bottom) return;
      }
      if (e.cancelable) e.preventDefault();
    }
  };

  /** Stylus/finger: a long press while writing opens no context menu */
  private onContextMenu = (e: Event) => {
    if (this.P.input === "touch" && (this.action || this.arb.contacts.size > 0)) e.preventDefault();
  };

  private onClick = (e: MouseEvent) => {
    if (performance.now() > this.swallowUntil) return;
    // our own controls (the toolbar, the long-press menu, the pen ↔ eraser switch) always take their click
    if (e.target instanceof Element && e.target.closest("[data-annot-ui], [data-ink-ui]")) return;
    this.swallowUntil = 0;
    e.preventDefault();
    e.stopPropagation();
  };

  private onSelectStart = (e: Event) => {
    if (this.action) e.preventDefault();
  };

  private drawLive() {
    const c = this.live;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    const a = this.action;
    if (!a) return;
    const d = Math.min(2, window.devicePixelRatio || 1);
    const o = this.origin();
    if (a.kind === "draw") {
      let all = a.predicted.length ? a.pts.concat(a.predicted) : a.pts;
      if (a.type === "pen" && !penPressureUsable(a.pts, true)) all = withoutPressure(all);
      const { points, simulate } = strokeInput(all);
      const outline = getStroke(points, strokeOptions({ tool: a.tool, size: a.size }, simulate, false));
      ctx.setTransform(d, 0, 0, d, o.x * d, o.y * d);
      fillStroke(ctx, { id: "", tool: a.tool, color: a.color, size: a.size, pts: [] }, this.P.theme, new Path2D(outlinePathData(outline)));
    } else if (a.at) {
      ctx.setTransform(d, 0, 0, d, o.x * d, o.y * d);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = this.P.theme === "dark" ? "rgba(243,242,238,0.75)" : "rgba(11,11,11,0.6)";
      ctx.beginPath();
      ctx.arc(a.at[0], a.at[1], 10, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ------------------------------------------------------------------ for "send to notebook" and QA

  /** Annotated passages (block boxes plus their marks, nearby ones merged), top to bottom, overlay px. */
  passages(max = 8): { box: Box; scope: string; strokes: Stroke[] }[] {
    const L = this.freshLayout();
    const items: { box: Box; scope: string; strokes: Stroke[] }[] = [];
    for (const p of this.placedList) {
      if (!p.box || !p.strokes.length) continue;
      const found = L.index.resolve(p.mark.b);
      const r = found && L.rect(found.info.el);
      if (!r) continue;
      items.push({ box: unionBox({ x1: r.left, y1: r.top, x2: r.right, y2: r.bottom }, p.box), scope: p.mark.b.s, strokes: p.strokes });
    }
    items.sort((a, b) => a.box.y1 - b.box.y1);
    const out: typeof items = [];
    for (const it of items) {
      const cur = out[out.length - 1];
      if (cur && it.box.y1 - cur.box.y2 < 32) {
        cur.box = unionBox(cur.box, it.box);
        cur.strokes = cur.strokes.concat(it.strokes);
      } else out.push({ ...it, strokes: it.strokes.slice() });
    }
    return out.slice(0, max);
  }

  /** client px of the overlay's origin (overlay px + this = viewport px) */
  originNow() {
    return this.origin();
  }

  get contentRoot() {
    return this.root;
  }

  get overlayWidth() {
    return this.width;
  }

  /** dev / QA: drawn strokes and their boxes */
  debug() {
    return { placed: this.placedList.length, strokes: this.stats.strokes, tiles: [...this.tiles.keys()], detached: this.detached.length, relayoutMs: this.stats.relayoutMs, paints: this.stats.paints, paintMs: Math.round(this.stats.paintMs), width: this.width, marginL: this.marginL };
  }

  placedBoxes() {
    return this.placedList.map((p) => ({ id: p.mark.id, m: p.mark.m, box: p.box, pieces: p.strokes.length }));
  }
}

function boxOfStrokes(strokes: Stroke[]): Box | null {
  let b: Box | null = null;
  for (const s of strokes) if (s.pts.length) b = unionBox(b, strokeBox(s));
  return b;
}

function rawBox(pts: number[]): Box {
  return strokeBox({ id: "", tool: "pen", color: "ink", size: 0, pts });
}
