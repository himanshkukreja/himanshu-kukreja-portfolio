"use client";

/**
 * The ink engine for notebook pages. A fixed A4-ratio sheet (types.ts PAGE_W × PAGE_H, page units) shown through
 * a pan-and-zoom view; strokes are captured with Pointer Events (coalesced, with predicted points for less lag)
 * and outlined with perfect-freehand.
 *
 * Layers, bottom to top:
 *   paper (SVG) + items (DOM: clips, snips, text boxes), moved with one CSS transform;
 *   highlighter canvas (under the ink) and ink canvas, in the same page layer;
 *   live canvas (only the stroke being drawn, the lasso, the selection being moved), selection overlay (DOM).
 * The highlighter and ink canvases are page-sized (drawn at device resolution for the current zoom, capped) and sit
 * inside the page layer, so panning and pinching move them with the paper in one CSS transform: no redraw at all.
 * They are drawn from one combined Path2D per colour (render.ts), appended to as strokes are added; a new stroke is
 * drawn onto them alone; they are redrawn whole only when strokes are removed or moved, or when a zoom settles far
 * from their resolution. While a stroke is drawn only the live canvas (viewport-sized) is touched.
 *
 * Input (the device's setting, lib/learn/ink/inputMode.ts, shared with the pad, written papers and annotate):
 *   Pen only       only the pen (pointerType "pen") draws; one finger pans, two fingers pan and pinch-zoom, and any
 *                  touch that lands while the pen is down is ignored (a resting palm). The first pen on a device
 *                  that never chose switches it here (onAutoPen).
 *   Stylus/finger  one contact draws: a finger, or a passive "universal" stylus the browser reports as a finger.
 *                  Two fingers pan and pinch; palms are rejected by contact size (TouchArbiter); a stylus that
 *                  reports real pressure writes with it. A pen or a mouse draws too.
 *   Scroll         nothing draws: every pointer pans, two fingers pinch.
 * touch-action: none on the surface (plus preventDefault on touchstart/move, for iPad Safari) keeps the browser
 * from scrolling or zooming the page under the pen; the view handles finger scrolling itself (with momentum).
 * A pen's barrel / eraser button (button 5, buttons & 32) erases where the browser reports it.
 *
 * Quick gestures (lib/learn/ink/gestures.ts, with `quick` wired by the surface): hold the pen or the writing contact
 * still for HOLD_MS → over ink, its word-group is selected and a menu offers Erase / recolour / Thicker / Thinner /
 * Lasso more / Turn into text; on empty paper, a quick palette (the dot the hold began is dropped only then). A fast
 * zig-zag over strokes erases them instead of drawing ("Erased · Undo"). A two-finger tap undoes, three fingers redo.
 * A floating pen ↔ eraser switch follows the last stroke (hidden from the input menu).
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { getStroke } from "perfect-freehand";
import {
  Q,
  StrokeIndex,
  TEXT,
  boxesTouch,
  inPolygon,
  itemBox,
  newInkId,
  polyBox,
  strokeBox,
  strokeHit,
  strokeInLasso,
  transformItem,
  transformStroke,
  unionBox,
  type Box,
} from "@/lib/learn/ink/geometry";
import { MARKER_SIZE, addToLayer, buildLayer, fillLayer, fillStroke, outlinePathData, penPressureUsable, strokeInput, strokeOptions, strokePath, withoutPressure, type InkTheme, type Layer } from "@/lib/learn/ink/render";
import { PAGE_H, PAGE_W, type InkColor, type PageItem, type Paper, type Stroke } from "@/lib/learn/ink/types";
import { ContactLog, TouchArbiter, noteFingerDrag, notePen, pressureVaries, type ArbiterEvent, type ContactPoint, type InkInputMode, type InkSurface } from "@/lib/learn/ink/inputMode";
import PaperView from "./Paper";
import PageItems from "./PageItems";
import InkDebugOverlay from "./InkDebugOverlay";
import { InkToastHost, PressMenu, QuickPalette, ToolSwitch, type QuickTool } from "./QuickInk";
import { HOLD_MS, HOLD_PX, TapSession, detectScribble, inkToast, scribbleTargets, useToolSwitch, wordGroup, type TimedPt } from "@/lib/learn/ink/gestures";

export type InkToolId = "pen" | "highlighter" | "eraser" | "lasso" | "text";
/** what the quick gestures need from the surface (its tool state and its undo history) */
export type InkQuick = {
  onTool: (t: InkToolId) => void;
  onColor: (c: InkColor) => void;
  color: InkColor;
  colors: InkColor[];
  /** nib widths (the palette's sizes); omit where the surface has one nib */
  sizes?: readonly number[];
  sizeIndex?: number;
  onSize?: (i: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  /** "Turn into text" in the long-press menu, where the surface has it */
  onText?: () => void;
  /** the surface has the lasso tool ("Lasso more") */
  lasso?: boolean;
};
export type InkContent = { strokes: Stroke[]; items: PageItem[] };
export type InkCanvasHandle = {
  zoomBy: (k: number) => void;
  fit: () => void;
  deleteSelection: () => void;
  clearSelection: () => void;
};

type Props = {
  paper: Paper;
  strokes: Stroke[];
  items: PageItem[];
  tool: InkToolId;
  color: InkColor;
  penSize: number;
  theme: InkTheme;
  /** the device's input mode (lib/learn/ink/inputMode.ts) */
  inputMode: InkInputMode;
  /** which surface this is (the "your stylus looks like a finger" hint shows on its mode control) */
  surface?: InkSurface;
  /** the page is at its size limit: new ink is refused (onFull) */
  full: boolean;
  /** space around the sheet at "fit width" (px) */
  pad?: number;
  /** a change made on the page; mergeKey folds consecutive changes into one undo step (typing) */
  onCommit: (next: InkContent, mergeKey?: string) => void;
  /** the first pen on this device switched it to Pen only (say so) */
  onAutoPen?: () => void;
  /** quick gestures: long-press menu and palette, finger-tap undo / redo, the floating pen ↔ eraser switch */
  quick?: InkQuick;
  onFull?: () => void;
  /** the zoom: 1 = 100% = the page at 1000 px wide */
  onZoom?: (z: number) => void;
  label: string;
  className?: string;
};

type View = { s: number; tx: number; ty: number };
type Sel = { strokes: Set<string>; items: Set<string>; box: Box };
type Action =
  | {
      kind: "draw";
      pid: number;
      tool: "pen" | "highlighter";
      color: InkColor;
      size: number;
      pts: number[];
      predicted: number[];
      /** the pointer type; a "touch" stroke uses its pressure only once it proves real (a stylus reported as touch) */
      src: string;
      raw: number[];
      real: boolean;
      /** when each kept point came (scribble-to-erase) */
      ts: number[];
    }
  | { kind: "erase"; pid: number; last: [number, number] | null; erased: Set<string>; at: [number, number] }
  | { kind: "lasso"; pid: number; poly: number[] }
  | { kind: "move"; pid: number; from: [number, number]; dx: number; dy: number }
  | { kind: "scale"; pid: number; from: [number, number]; k: number }
  | { kind: "tap"; pid: number; at: [number, number]; client: [number, number] }
  | { kind: "pan"; pid: number; last: [number, number]; samples: [number, number, number][] };

const MAX_RES = 2.5;
const MIN_STEP2 = 8 * 8; // keep a point only when it is 0.8 page units from the last (pts are ×10)
/** a pointer down, real or replayed from a contact's history (a contact that takes over the pen late) */
type Ptr = Pick<PointerEvent, "pointerId" | "pointerType" | "button" | "buttons" | "pressure" | "clientX" | "clientY">;
const isPen = (e: Ptr) => e.pointerType === "pen";
/** a single-finger drag this long (px) in Pen only would have been a stroke */
const DRAG_PX = 12;
const interactive = (t: EventTarget | null) => !!(t instanceof Element && t.closest("textarea, a, button, input, select, [data-ink-ui]"));

const InkCanvas = forwardRef<InkCanvasHandle, Props>(function InkCanvas(props, ref) {
  const { paper, strokes, items, tool, theme, pad = 16, label, className } = props;

  const wrapRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const overRef = useRef<HTMLDivElement>(null);
  const hlRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);

  // everything the native handlers read, kept current without re-binding them
  const P = useRef(props);
  P.current = props;

  const view = useRef<View>({ s: 0.5, tx: pad, ty: pad });
  /** device px per page unit the ink canvases are drawn at (they are page-sized and ride the page's transform) */
  const res = useRef(0);
  const lastZoom = useRef(0);
  const size = useRef({ w: 0, h: 0, dpr: 1 });
  const userZoomed = useRef(false);
  const layers = useRef<{ strokes: Stroke[]; hidden: Set<string> | null; hl: Layer; ink: Layer } | null>(null);
  const hidden = useRef<Set<string> | null>(null);
  const indexRef = useRef<{ strokes: Stroke[]; index: StrokeIndex } | null>(null);
  const action = useRef<Action | null>(null);
  const touches = useRef(new Map<number, [number, number]>());
  const pinch = useRef<{ v: View; c: [number, number]; d: number } | null>(null);
  const penDown = useRef(false);
  const rect = useRef<DOMRect | null>(null);
  const raf = useRef(0);
  const settleTimer = useRef(0);
  const inertia = useRef(0);

  const [sel, setSel] = useState<Sel | null>(null);
  const selRef = useRef<Sel | null>(null);
  selRef.current = sel;
  const [editingId, setEditingId] = useState<string | null>(null);
  // quick gestures: the long-press menu / palette, how the selection was made, the last stroke's end (the switch)
  const [press, setPress] = useState<{ kind: "sel" | "palette"; x: number; y: number } | null>(null);
  const selVia = useRef<"lasso" | "press">("lasso");
  /** where the last stroke ended (page units) and which way the switch sits from it (CSS px), clear of the edges */
  const [anchor, setAnchor] = useState<[number, number, number, number] | null>(null);
  const hold = useRef<{ pid: number; x: number; y: number; timer: number } | null>(null);
  const heldPid = useRef<number | null>(null);
  const lastInk = useRef<InkToolId>("pen");
  const switchOn = useToolSwitch();

  // ------------------------------------------------------------------ view

  /** "fit": the page's width fills the view, but never past its natural size (1 px per page unit) on big screens */
  const fitWidth = () => Math.min(1, Math.max(0.05, (size.current.w - pad * 2) / PAGE_W));
  const clamp = useCallback(
    (v: View): View => {
      const { w, h } = size.current;
      const fw = Math.max(0.05, (w - pad * 2) / PAGE_W);
      const fp = Math.min(fw, Math.max(0.05, (h - pad * 2) / PAGE_H));
      const s = Math.min(Math.max(v.s, fp * 0.7), Math.max(5, fw * 5));
      const W = PAGE_W * s;
      const H = PAGE_H * s;
      const tx = W + pad * 2 <= w ? (w - W) / 2 : Math.min(pad, Math.max(w - W - pad, v.tx));
      const ty = H + pad * 2 <= h ? Math.max(pad, (h - H) / 2) : Math.min(pad, Math.max(h - H - pad, v.ty));
      return { s, tx, ty };
    },
    [pad]
  );

  const ensureLayers = useCallback(() => {
    const st = P.current.strokes;
    const L = layers.current;
    const hid = hidden.current;
    if (L && L.strokes === st && L.hidden === hid) return false;
    // appended strokes only: extend the combined paths
    if (L && L.hidden === hid && !hid && st.length > L.strokes.length && L.strokes.every((s, i) => st[i] === s)) {
      for (let i = L.strokes.length; i < st.length; i++) addToLayer(st[i].tool === "highlighter" ? L.hl : L.ink, st[i]);
      L.strokes = st;
      return true;
    }
    layers.current = { strokes: st, hidden: hid, hl: buildLayer(st, "highlighter", hid), ink: buildLayer(st, "pen", hid) };
    return true;
  }, []);

  /** the resolution the ink canvases should have at this zoom (capped: iOS limits a canvas to ~16.7 M pixels) */
  const targetRes = () => Math.min(MAX_RES, Math.max(0.5, Math.round(view.current.s * size.current.dpr * 4) / 4));

  const pageCtx = (c: HTMLCanvasElement | null) => {
    const ctx = c?.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(res.current, 0, 0, res.current, 0, 0);
    return ctx;
  };

  const paintLayer = useCallback((c: HTMLCanvasElement | null, layer: Layer, which: Stroke["tool"]) => {
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(res.current, 0, 0, res.current, 0, 0);
    fillLayer(ctx, layer, which, P.current.theme);
  }, []);

  /** Redraw both ink canvases (whole page), first resizing them if the zoom moved far from their resolution. */
  const renderCommitted = useCallback(() => {
    ensureLayers();
    const want = targetRes();
    const L = layers.current!;
    if (!res.current || Math.abs(want - res.current) / res.current > 0.2) res.current = want;
    // size each canvas to the resolution; an empty layer (most pages have no highlighter) keeps a 1 px canvas
    ([
      [hlRef.current, L.hl.size > 0],
      [inkRef.current, L.ink.size > 0],
    ] as const).forEach(([c, used]) => {
      if (!c) return;
      const w = used ? Math.round(PAGE_W * res.current) : 1;
      const h = used ? Math.round(PAGE_H * res.current) : 1;
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
    });
    paintLayer(hlRef.current, L.hl, "highlighter");
    paintLayer(inkRef.current, L.ink, "pen");
     
  }, [ensureLayers, paintLayer]);

  const ctxAtView = (c: HTMLCanvasElement | null) => {
    const ctx = c?.getContext("2d");
    if (!ctx) return null;
    const { dpr } = size.current;
    const v = view.current;
    ctx.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * v.tx, dpr * v.ty);
    return ctx;
  };

  /** The live layer: the stroke being drawn, the lasso, the eraser, a selection being moved. */
  const drawLive = useCallback(() => {
    const c = liveRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    const a = action.current;
    if (!a) return;
    const x = ctxAtView(c)!;
    const v = view.current;
    const th = P.current.theme;
    if (a.kind === "draw") {
      let all = a.predicted.length ? a.pts.concat(a.predicted) : a.pts;
      if (a.src === "pen" && !penPressureUsable(a.pts, true)) all = withoutPressure(all);
      const { points, simulate } = strokeInput(all);
      const outline = getStroke(points, strokeOptions({ tool: a.tool, size: a.size }, simulate, false));
      fillStroke(x, { id: "", tool: a.tool, color: a.color, size: a.size, pts: [] }, th, new Path2D(outlinePathData(outline)));
    } else if (a.kind === "lasso") {
      x.save();
      x.lineWidth = 1.6 / v.s;
      x.setLineDash([6 / v.s, 5 / v.s]);
      x.strokeStyle = "#FF6B2B";
      x.fillStyle = "rgba(255,107,43,0.06)";
      x.beginPath();
      for (let i = 0; i + 1 < a.poly.length; i += 2) (i ? x.lineTo : x.moveTo).call(x, a.poly[i], a.poly[i + 1]);
      x.closePath();
      x.fill();
      x.stroke();
      x.restore();
    } else if (a.kind === "erase") {
      x.save();
      x.lineWidth = 1.5 / v.s;
      x.strokeStyle = th === "dark" ? "rgba(243,242,238,0.7)" : "rgba(11,11,11,0.6)";
      x.beginPath();
      x.arc(a.at[0], a.at[1], eraserR(), 0, Math.PI * 2);
      x.stroke();
      x.restore();
    } else if ((a.kind === "move" || a.kind === "scale") && selRef.current) {
      const s = selRef.current;
      const k = a.kind === "scale" ? a.k : 1;
      const dx = a.kind === "move" ? a.dx : 0;
      const dy = a.kind === "move" ? a.dy : 0;
      x.save();
      x.translate(s.box.x1 + dx, s.box.y1 + dy);
      x.scale(k, k);
      x.translate(-s.box.x1, -s.box.y1);
      for (const st of P.current.strokes) if (s.strokes.has(st.id)) fillStroke(x, st, th);
      x.restore();
    }
  }, []);

  const eraserR = () => Math.max(6, 12 / view.current.s);

  /**
   * Apply the view: one transform moves the paper, items and ink together, so a pan or pinch is compositing only.
   * The live layer is redrawn; the ink is redrawn sharper (or lighter) only once a zoom settles at a new scale.
   */
  const applyView = useCallback(
    (gesture = false) => {
      const v = view.current;
      const t = `translate(${v.tx}px, ${v.ty}px) scale(${v.s})`;
      if (pageRef.current) pageRef.current.style.transform = t;
      if (overRef.current) {
        overRef.current.style.transform = t;
        overRef.current.style.setProperty("--ink-inv", String(1 / v.s));
      }
      if (v.s !== lastZoom.current) {
        lastZoom.current = v.s;
        P.current.onZoom?.(v.s);
      }
      drawLive();
      window.clearTimeout(settleTimer.current);
      const want = targetRes();
      if (!res.current || Math.abs(want - res.current) / res.current > 0.2) {
        if (gesture) settleTimer.current = window.setTimeout(renderCommitted, 160);
        else renderCommitted();
      }
    },
     
    [renderCommitted, drawLive]
  );

  const schedule = useCallback(
    (gesture = false) => {
      if (raf.current) return;
      raf.current = window.requestAnimationFrame(() => {
        raf.current = 0;
        applyView(gesture);
      });
    },
    [applyView]
  );

  const setView = useCallback(
    (v: View, gesture = false) => {
      view.current = clamp(v);
      schedule(gesture);
    },
    [clamp, schedule]
  );

  const zoomAt = useCallback(
    (k: number, cx: number, cy: number, gesture = false) => {
      const v = view.current;
      const s = v.s * k;
      const c = clamp({ s, tx: 0, ty: 0 });
      const kk = c.s / v.s;
      userZoomed.current = true;
      setView({ s: c.s, tx: cx - (cx - v.tx) * kk, ty: cy - (cy - v.ty) * kk }, gesture);
    },
    [clamp, setView]
  );

  const fit = useCallback(() => {
    userZoomed.current = false;
    setView({ s: fitWidth(), tx: pad, ty: pad });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fitWidth reads refs only
  }, [pad, setView]);

  // ------------------------------------------------------------------ size

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));
      const prev = size.current;
      if (prev.w === w && prev.h === h && prev.dpr === dpr) return;
      const oldFit = prev.w ? Math.min(1, Math.max(0.05, (prev.w - pad * 2) / PAGE_W)) : 0;
      size.current = { w, h, dpr };
      const live = liveRef.current;
      if (live) {
        live.width = Math.round(w * dpr);
        live.height = Math.round(h * dpr);
        live.style.width = `${w}px`;
        live.style.height = `${h}px`;
      }
      if (!oldFit || !userZoomed.current) view.current = clamp({ s: fitWidth(), tx: pad, ty: oldFit ? view.current.ty : pad });
      else view.current = clamp({ ...view.current, s: view.current.s * (fitWidth() / oldFit) });
      applyView();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fitWidth reads refs only
  }, [pad, clamp, applyView]);

  // ------------------------------------------------------------------ content changes

  useLayoutEffect(() => {
    const before = layers.current;
    const prevLen = before?.strokes.length ?? 0;
    const appended = !!before && !hidden.current && before.hidden === null && strokes.length > prevLen && before.strokes.every((s, i) => strokes[i] === s);
    const firstOfLayer = strokes.slice(prevLen).some((st) => (st.tool === "highlighter" ? hlRef.current : inkRef.current)!.width < 2);
    if (appended && res.current && !firstOfLayer) {
      // a new stroke: draw just it onto its canvas
      ensureLayers();
      for (let i = prevLen; i < strokes.length; i++) {
        const st = strokes[i];
        const ctx = pageCtx(st.tool === "highlighter" ? hlRef.current : inkRef.current);
        if (ctx) fillStroke(ctx, st, theme, strokePath(st));
      }
    } else {
      layers.current = null;
      renderCommitted();
    }
    if (!action.current || action.current.kind !== "draw") drawLive();
     
  }, [strokes, theme, ensureLayers, renderCommitted, drawLive]);

  // keep a selection in step with undo / outside changes
  useEffect(() => {
    const s = selRef.current;
    if (!s) return;
    const st = strokes.filter((x) => s.strokes.has(x.id));
    const it = items.filter((x) => s.items.has(x.id));
    if (!st.length && !it.length) {
       
      setSel(null);
      return;
    }
    let box: Box | null = null;
    st.forEach((x) => (box = unionBox(box, strokeBox(x))));
    it.forEach((x) => (box = unionBox(box, itemBox(x))));
    setSel({ strokes: new Set(st.map((x) => x.id)), items: new Set(it.map((x) => x.id)), box: box! });
  }, [strokes, items]);

  useEffect(() => {
    if (tool === "pen" || tool === "highlighter") lastInk.current = tool;
    if (tool !== "lasso" && selVia.current !== "press") setSel(null);
    if (tool !== "text") setEditingId(null);
  }, [tool]);

  // ------------------------------------------------------------------ helpers on the content

  const commit = useCallback((next: Partial<InkContent>, mergeKey?: string) => {
    P.current.onCommit({ strokes: next.strokes ?? P.current.strokes, items: next.items ?? P.current.items }, mergeKey);
  }, []);

  const index = () => {
    const st = P.current.strokes;
    if (!indexRef.current || indexRef.current.strokes !== st) indexRef.current = { strokes: st, index: new StrokeIndex(st) };
    return indexRef.current.index;
  };

  const toPage = (cx: number, cy: number): [number, number] => {
    const r = rect.current || wrapRef.current!.getBoundingClientRect();
    const v = view.current;
    return [(cx - r.left - v.tx) / v.s, (cy - r.top - v.ty) / v.s];
  };

  const eraseAlong = (a: Extract<Action, { kind: "erase" }>, x: number, y: number) => {
    const r = eraserR();
    const from = a.last || [x, y];
    const dist = Math.hypot(x - from[0], y - from[1]);
    const steps = Math.max(1, Math.ceil(dist / (r / 2)));
    const idx = index();
    let hit = false;
    for (let i = 1; i <= steps; i++) {
      const px = from[0] + ((x - from[0]) * i) / steps;
      const py = from[1] + ((y - from[1]) * i) / steps;
      for (const s of idx.near({ x1: px - r, y1: py - r, x2: px + r, y2: py + r }))
        if (!a.erased.has(s.id) && strokeHit(s, px, py, r)) {
          a.erased.add(s.id);
          hit = true;
        }
    }
    a.last = [x, y];
    a.at = [x, y];
    if (hit) {
      hidden.current = new Set(a.erased);
      renderCommitted();
    }
  };

  const selectionHit = (x: number, y: number): "scale" | "move" | null => {
    const s = selRef.current;
    if (!s) return null;
    const b = s.box;
    const hr = 22 / view.current.s;
    if (Math.abs(x - b.x2) <= hr && Math.abs(y - b.y2) <= hr) return "scale";
    if (x >= b.x1 - 6 && x <= b.x2 + 6 && y >= b.y1 - 6 && y <= b.y2 + 6) return "move";
    return null;
  };

  const previewItems = (dx: number, dy: number, k: number) => {
    const s = selRef.current;
    const root = pageRef.current;
    if (!s || !root) return;
    s.items.forEach((id) => {
      const el = root.querySelector<HTMLElement>(`[data-ink-item="${CSS.escape(id)}"]`);
      const it = P.current.items.find((x) => x.id === id);
      if (!el || !it) return;
      el.style.transformOrigin = `${s.box.x1 - it.x}px ${s.box.y1 - it.y}px`;
      el.style.transform = dx || dy || k !== 1 ? `translate(${dx}px, ${dy}px) scale(${k})` : "";
    });
  };

  const finishSelectionEdit = (dx: number, dy: number, k: number) => {
    const s = selRef.current;
    previewItems(0, 0, 1);
    hidden.current = null;
    if (!s || (!dx && !dy && k === 1)) {
      renderCommitted();
      return;
    }
    const ox = s.box.x1;
    const oy = s.box.y1;
    commit({
      strokes: P.current.strokes.map((st) => (s.strokes.has(st.id) ? transformStroke(st, dx, dy, k, ox, oy) : st)),
      items: P.current.items.map((it) => (s.items.has(it.id) ? transformItem(it, dx, dy, k, ox, oy) : it)),
    });
  };

  const deleteSelection = useCallback(() => {
    const s = selRef.current;
    if (!s) return;
    commit({ strokes: P.current.strokes.filter((x) => !s.strokes.has(x.id)), items: P.current.items.filter((x) => !s.items.has(x.id)) });
    setSel(null);
  }, [commit]);

  useImperativeHandle(
    ref,
    () => ({
      zoomBy: (k: number) => zoomAt(k, size.current.w / 2, size.current.h / 2),
      fit,
      deleteSelection,
      clearSelection: () => {
        setSel(null);
        setPress(null);
      },
    }),
    [zoomAt, fit, deleteSelection]
  );

  // ------------------------------------------------------------------ input

  // one per surface: who writes among touch contacts (Stylus/finger), and per-pointer facts (dev log, the hint)
  const arbRef = useRef<TouchArbiter | null>(null);
  const logRef = useRef<ContactLog | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const where = P.current.surface || "page";
    const arb = (arbRef.current = new TouchArbiter(where));
    // two-finger tap = undo, three = redo (any mode)
    const taps = new TapSession();
    const log = (logRef.current = new ContactLog(where));
    const mode = () => P.current.inputMode;
    /** touch contacts go through the arbiter (Stylus/finger mode) */
    const arbitrated = (e: PointerEvent) => e.pointerType === "touch" && mode() === "touch";

    const stopInertia = () => {
      if (inertia.current) window.cancelAnimationFrame(inertia.current);
      inertia.current = 0;
    };

    const startPinch = () => {
      const pts = [...touches.current.values()];
      if (pts.length < 2) {
        pinch.current = null;
        return;
      }
      const [a, b] = pts;
      pinch.current = { v: { ...view.current }, c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], d: Math.max(10, Math.hypot(a[0] - b[0], a[1] - b[1])) };
    };

    const cancelDraw = () => {
      const a = action.current;
      if (a && (a.kind === "draw" || a.kind === "lasso" || a.kind === "erase" || a.kind === "tap")) {
        if (a.kind === "erase") {
          hidden.current = null;
          renderCommitted();
        }
        action.current = null;
        drawLive();
      } else if (a && (a.kind === "move" || a.kind === "scale")) {
        action.current = null;
        finishSelectionEdit(0, 0, 1);
        drawLive();
      }
    };

    const capture = (id: number) => {
      try {
        wrap.setPointerCapture(id);
      } catch {
        // capture is best effort (a replayed contact, a pointer already up)
      }
    };

    const begin = (e: Ptr, x: number, y: number) => {
      const p = P.current;
      const barrel = isPen(e) && (e.button === 5 || (e.buttons & 32) === 32);
      const t = barrel ? "eraser" : p.tool;
      if (t === "pen" || t === "highlighter") {
        if (p.full) {
          p.onFull?.();
          return;
        }
        const pr = isPen(e) ? Math.max(1, Math.round((e.pressure || 0.5) * 100)) : 0;
        action.current = {
          kind: "draw",
          pid: e.pointerId,
          tool: t,
          color: p.color,
          size: t === "highlighter" ? MARKER_SIZE : p.penSize,
          pts: [Math.round(x * Q), Math.round(y * Q), pr],
          predicted: [],
          src: e.pointerType,
          raw: [e.pressure || 0],
          real: false,
          ts: [performance.now()],
        };
      } else if (t === "eraser") {
        action.current = { kind: "erase", pid: e.pointerId, last: null, erased: new Set(), at: [x, y] };
        eraseAlong(action.current, x, y);
      } else if (t === "lasso") {
        const h = selectionHit(x, y);
        if (h === "scale") action.current = { kind: "scale", pid: e.pointerId, from: [x, y], k: 1 };
        else if (h === "move") action.current = { kind: "move", pid: e.pointerId, from: [x, y], dx: 0, dy: 0 };
        else {
          setSel(null);
          action.current = { kind: "lasso", pid: e.pointerId, poly: [x, y] };
        }
        if (action.current.kind !== "lasso") {
          hidden.current = new Set(selRef.current!.strokes);
          renderCommitted();
        }
      } else if (t === "text") {
        action.current = { kind: "tap", pid: e.pointerId, at: [x, y], client: [e.clientX, e.clientY] };
      }
      if (action.current) {
        capture(e.pointerId);
        drawLive();
        arm(e);
      }
    };

    // ---- long-press: the pen or the writing contact held still → a menu over ink, a palette on empty paper
    const disarm = () => {
      if (hold.current) window.clearTimeout(hold.current.timer);
      hold.current = null;
    };
    /** pointers down on the surface now (a hold fires only for one still down) */
    const downIds = new Set<number>();
    const arm = (e: Ptr, scroll = false) => {
      disarm();
      const a = action.current;
      if (!P.current.quick || (e.pointerType !== "pen" && e.pointerType !== "touch")) return;
      // Scroll mode: nothing draws, so a still hold is safe to read as "open the menu" (the way back to writing)
      if (!scroll && (!a || (a.kind !== "draw" && a.kind !== "erase"))) return;
      const pid = e.pointerId;
      const x = e.clientX;
      const y = e.clientY;
      hold.current = { pid, x, y, timer: window.setTimeout(() => fireHold(pid, x, y), HOLD_MS) };
    };
    const fireHold = (pid: number, x: number, y: number) => {
      hold.current = null;
      const a = action.current;
      if (!downIds.has(pid)) return;
      if (mode() === "scroll") {
        // the pan the hold began stops; nothing else to undo
        if (a?.pid === pid) action.current = null;
        touches.current.delete(pid);
      } else {
        if (!a || a.pid !== pid || (a.kind !== "draw" && a.kind !== "erase")) return;
        // the dot (or the eraser touch) the hold began goes; the rest of this pointer does nothing
        cancelDraw();
      }
      heldPid.current = pid;
      const [px, py] = toPage(x, y);
      const r = Math.max(4, 14 / view.current.s);
      const hitS = [...index().near({ x1: px - r, y1: py - r, x2: px + r, y2: py + r })].filter((s) => strokeHit(s, px, py, r));
      const hitI = P.current.items.filter((it) => {
        const b = itemBox(it);
        return px >= b.x1 - r && px <= b.x2 + r && py >= b.y1 - r && py <= b.y2 + r;
      });
      try {
        navigator.vibrate?.(12);
      } catch {
        // no haptics
      }
      if (!hitS.length && !hitI.length) {
        setPress({ kind: "palette", x, y });
        return;
      }
      // the strokes under the point, and the rest of the word they were written with
      let seedBox: Box | null = null;
      hitS.forEach((s) => (seedBox = unionBox(seedBox, strokeBox(s))));
      const h = seedBox ? (seedBox as Box).y2 - (seedBox as Box).y1 : 30;
      const ids = hitS.length ? wordGroup(P.current.strokes, new Set(hitS.map((s) => s.id)), Math.min(48, Math.max(12, h * 0.9))) : new Set<string>();
      let box: Box | null = null;
      P.current.strokes.forEach((s) => ids.has(s.id) && (box = unionBox(box, strokeBox(s))));
      hitI.forEach((it) => (box = unionBox(box, itemBox(it))));
      selVia.current = "press";
      setSel({ strokes: ids, items: new Set(hitI.map((it) => it.id)), box: box! });
      setPress({ kind: "sel", x, y });
    };

    /** a touch stroke's pressure, once its contact proves it real (a stylus the browser calls a finger) */
    const touchPressure = (a: Extract<Action, { kind: "draw" }>) => {
      if (a.real || a.src !== "touch") return;
      const c = arb.get(a.pid);
      if (!c || !pressureVaries(c)) return;
      a.real = true;
      for (let i = 0; i * 3 + 2 < a.pts.length; i++) a.pts[i * 3 + 2] = Math.max(1, Math.round((a.raw[i] || 0.5) * 100));
    };
    const pressureOf = (a: Extract<Action, { kind: "draw" }>, p: number) =>
      a.src === "pen" ? Math.max(1, Math.round((p || 0.5) * 100)) : a.real ? Math.max(1, Math.round((p || 0.5) * 100)) : 0;

    /** follow the pointer: points for the stroke, the eraser, the lasso */
    const extend = (a: Action, list: ContactPoint[]) => {
      if (a.kind === "draw") {
        const pts = a.pts;
        for (const ev of list) {
          const [x, y] = toPage(ev.clientX, ev.clientY);
          const qx = Math.round(Math.max(0, Math.min(PAGE_W, x)) * Q);
          const qy = Math.round(Math.max(0, Math.min(PAGE_H, y)) * Q);
          const lx = pts[pts.length - 3];
          const ly = pts[pts.length - 2];
          if ((qx - lx) ** 2 + (qy - ly) ** 2 < MIN_STEP2) continue;
          pts.push(qx, qy, pressureOf(a, ev.pressure));
          a.raw.push(ev.pressure || 0);
          a.ts.push(ev.timeStamp ?? performance.now());
        }
        touchPressure(a);
      } else if (a.kind === "erase") {
        for (const ev of list) {
          const [x, y] = toPage(ev.clientX, ev.clientY);
          eraseAlong(a, x, y);
        }
      } else if (a.kind === "lasso") {
        for (const ev of list) {
          const [x, y] = toPage(ev.clientX, ev.clientY);
          const n = a.poly.length;
          if ((x - a.poly[n - 2]) ** 2 + (y - a.poly[n - 1]) ** 2 > 9) a.poly.push(x, y);
        }
      }
    };

    /** what the arbiter decided (Stylus/finger mode) */
    const apply = (evs: ArbiterEvent[]) => {
      for (const ev of evs) {
        if (ev.type === "draw") {
          const c = arb.get(ev.id);
          if (!c || !c.hist.length || heldPid.current === c.id) continue;
          const h0 = c.hist[0];
          // the page: replay where the contact has been since it landed (nothing is lost when it takes over late)
          if (action.current?.kind === "pan") action.current = null;
          const [x, y] = toPage(h0.clientX, h0.clientY);
          begin({ pointerId: c.id, pointerType: "touch", button: 0, buttons: 1, pressure: h0.pressure, clientX: h0.clientX, clientY: h0.clientY }, x, y);
          const a = action.current as Action | null;
          if (a && a.pid === c.id && c.hist.length > 1) extend(a, c.hist.slice(1));
          drawLive();
        } else if (ev.type === "drop") {
          if (action.current?.pid === ev.id) cancelDraw();
        } else if (ev.type === "end") {
          const a = action.current;
          if (a?.pid === ev.id) complete(a, false, performance.now());
        } else if (ev.type === "gesture") {
          stopInertia();
          if (action.current && action.current.kind !== "pan") cancelDraw();
          action.current = null;
          touches.current.clear();
          for (const id of ev.ids) {
            const c = arb.get(id);
            if (c) touches.current.set(id, [c.x, c.y]);
          }
          startPinch();
        } else if (ev.type === "gesture-end") {
          pinch.current = null;
          touches.current.clear();
          const c = ev.left !== null ? arb.get(ev.left) : null;
          action.current = c ? { kind: "pan", pid: c.id, last: [c.x, c.y], samples: [] } : null;
          schedule();
        }
      }
    };

    /** a finger (Pen only, Scroll): one pans, two pan and pinch */
    const fingerDown = (e: PointerEvent, textTap: boolean) => {
      log.setRole(e.pointerId, "pan");
      touches.current.set(e.pointerId, [e.clientX, e.clientY]);
      capture(e.pointerId);
      if (touches.current.size >= 2) {
        // two fingers: whatever one finger started becomes a pinch
        cancelDraw();
        action.current = null;
        for (const id of touches.current.keys()) log.setRole(id, "gesture");
        startPinch();
        return;
      }
      if (textTap && P.current.tool === "text") {
        const [x, y] = toPage(e.clientX, e.clientY);
        action.current = { kind: "tap", pid: e.pointerId, at: [x, y], client: [e.clientX, e.clientY] };
        return;
      }
      action.current = { kind: "pan", pid: e.pointerId, last: [e.clientX, e.clientY], samples: [[e.clientX, e.clientY, e.timeStamp]] };
    };

    const onDown = (e: PointerEvent) => {
      if (interactive(e.target)) return;
      stopInertia();
      rect.current = wrap.getBoundingClientRect();
      const p = P.current;
      const m = mode();
      downIds.add(e.pointerId);
      if (e.pointerType === "touch") taps.down(e.pointerId, e.clientX, e.clientY, e.timeStamp);
      // a second pointer while one is held still: no long-press
      else disarm();
      if (hold.current && hold.current.pid !== e.pointerId) disarm();
      if (isPen(e)) {
        taps.reset();
        if (notePen()) p.onAutoPen?.();
        // a palm already panning: stop it, the pen wins
        touches.current.clear();
        pinch.current = null;
        if (action.current?.kind === "pan") action.current = null;
        if (m === "touch") {
          // a stroke a finger (or a palm) started gives way to the pen
          if (action.current && arb.get(action.current.pid)) cancelDraw();
          arb.reset();
        }
        penDown.current = true;
      }
      if (arbitrated(e)) {
        if (penDown.current) return; // a palm while the pen writes
        e.preventDefault();
        apply(arb.down(e));
        return;
      }
      log.down(e);
      if (m === "scroll") {
        // nothing draws: every pointer moves the page (a still hold opens the quick menu: the way back)
        if (e.pointerType === "touch") {
          fingerDown(e, false);
          if (touches.current.size === 1) arm(e, true);
          return;
        }
        if (e.pointerType === "pen") arm(e, true);
        if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 1) return;
        action.current = { kind: "pan", pid: e.pointerId, last: [e.clientX, e.clientY], samples: [] };
        capture(e.pointerId);
        e.preventDefault();
        return;
      }
      if (e.pointerType === "touch") {
        if (penDown.current) return; // a palm while the pen writes
        fingerDown(e, true);
        return;
      }
      if (e.pointerType === "mouse" && e.button === 1) {
        action.current = { kind: "pan", pid: e.pointerId, last: [e.clientX, e.clientY], samples: [] };
        capture(e.pointerId);
        return;
      }
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (action.current && action.current.kind !== "pan") return;
      const [x, y] = toPage(e.clientX, e.clientY);
      begin(e, x, y);
      e.preventDefault();
    };

    const onMove = (e: PointerEvent) => {
      if (hold.current && hold.current.pid === e.pointerId && Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > HOLD_PX) disarm();
      if (e.pointerType === "touch") taps.move(e.pointerId, e.clientX, e.clientY);
      if (arbitrated(e)) {
        if (!arb.get(e.pointerId)) return;
        apply(arb.move(e));
      } else log.move(e);
      if (e.pointerType === "touch" && touches.current.has(e.pointerId)) {
        touches.current.set(e.pointerId, [e.clientX, e.clientY]);
        const pc = pinch.current;
        if (pc && touches.current.size >= 2) {
          const [a, b] = [...touches.current.values()];
          const c: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          const d = Math.max(10, Math.hypot(a[0] - b[0], a[1] - b[1]));
          const r = rect.current!;
          const k = d / pc.d;
          const s = clamp({ ...pc.v, s: pc.v.s * k }).s;
          const kk = s / pc.v.s;
          const ox = pc.c[0] - r.left;
          const oy = pc.c[1] - r.top;
          userZoomed.current = true;
          setView({ s, tx: c[0] - r.left - (ox - pc.v.tx) * kk, ty: c[1] - r.top - (oy - pc.v.ty) * kk }, true);
          return;
        }
      }
      const a = action.current;
      if (!a || a.pid !== e.pointerId) return;
      if (a.kind === "pan") {
        const dx = e.clientX - a.last[0];
        const dy = e.clientY - a.last[1];
        a.last = [e.clientX, e.clientY];
        a.samples.push([e.clientX, e.clientY, e.timeStamp]);
        if (a.samples.length > 6) a.samples.shift();
        setView({ ...view.current, tx: view.current.tx + dx, ty: view.current.ty + dy }, true);
        return;
      }
      if (a.kind === "tap") {
        if (Math.hypot(e.clientX - a.client[0], e.clientY - a.client[1]) > 10) {
          // a drag in the text tool moves the page instead
          action.current = { kind: "pan", pid: a.pid, last: [e.clientX, e.clientY], samples: [] };
        }
        return;
      }
      const evs = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
      const list = evs.length ? evs : [e];
      if (a.kind === "draw") {
        extend(a, list);
        a.predicted = [];
        const pred = typeof e.getPredictedEvents === "function" ? e.getPredictedEvents() : [];
        for (const ev of pred.slice(0, 2)) {
          const [x, y] = toPage(ev.clientX, ev.clientY);
          a.predicted.push(Math.round(x * Q), Math.round(y * Q), pressureOf(a, ev.pressure));
        }
      } else if (a.kind === "erase" || a.kind === "lasso") {
        extend(a, list);
      } else if (a.kind === "move") {
        const [x, y] = toPage(e.clientX, e.clientY);
        a.dx = x - a.from[0];
        a.dy = y - a.from[1];
        previewItems(a.dx, a.dy, 1);
      } else if (a.kind === "scale") {
        const s = selRef.current!;
        const [x, y] = toPage(e.clientX, e.clientY);
        const w0 = Math.max(10, s.box.x2 - s.box.x1);
        const h0 = Math.max(10, s.box.y2 - s.box.y1);
        a.k = Math.max(0.2, Math.min(5, Math.max((x - s.box.x1) / w0, (y - s.box.y1) / h0)));
        previewItems(0, 0, a.k);
      }
      if (!raf.current) {
        raf.current = window.requestAnimationFrame(() => {
          raf.current = 0;
          drawLive();
        });
      }
    };

    /** the action of a pointer that lifted (or turned into a palm after writing a while): finish it */
    const complete = (a: Action, cancelled: boolean, timeStamp: number) => {
      action.current = null;
      if (a.kind === "pan") {
        // momentum
        const s = a.samples;
        if (!cancelled && s.length >= 2) {
          const [x0, y0, t0] = s[0];
          const [x1, y1, t1] = s[s.length - 1];
          const dt = Math.max(8, t1 - t0);
          let vx = (x1 - x0) / dt;
          let vy = (y1 - y0) / dt;
          if (timeStamp - t1 < 80 && Math.hypot(vx, vy) > 0.15) {
            let last = performance.now();
            const step = (now: number) => {
              const dt2 = now - last;
              last = now;
              const decay = Math.pow(0.995, dt2);
              vx *= decay;
              vy *= decay;
              setView({ ...view.current, tx: view.current.tx + vx * dt2, ty: view.current.ty + vy * dt2 }, true);
              inertia.current = Math.hypot(vx, vy) > 0.02 ? window.requestAnimationFrame(step) : 0;
              if (!inertia.current) schedule();
            };
            inertia.current = window.requestAnimationFrame(step);
            return;
          }
        }
        schedule();
        return;
      }
      if (a.kind === "draw") {
        const np = a.pts.length / 3;
        if (np) {
          const ex = a.pts[(np - 1) * 3] / Q;
          const ey = a.pts[(np - 1) * 3 + 1] / Q;
          const v = view.current;
          const sx = ex * v.s + v.tx;
          const sy = ey * v.s + v.ty;
          // above and to the right of where the pen lifted; below / to the left near the surface's edges
          setAnchor([ex, ey, sx + 18 + 56 > size.current.w ? -66 : 18, sy - 84 < 8 ? 36 : -84]);
        }
        // a fast zig-zag over strokes erases them instead of drawing
        if (a.tool === "pen" && np >= 8 && !cancelled) {
          const path: TimedPt[] = [];
          for (let i = 0; i < np; i++) path.push({ x: a.pts[i * 3] / Q, y: a.pts[i * 3 + 1] / Q, t: a.ts[i] ?? 0 });
          const sb = detectScribble(path, view.current.s);
          if (sb) {
            const near = index().near({ x1: sb.x1 - 4, y1: sb.y1 - 4, x2: sb.x2 + 4, y2: sb.y2 + 4 });
            const gone = scribbleTargets(path, sb, near, Math.max(1.5, 3 / view.current.s));
            if (gone.length) {
              const ids = new Set(gone.map((x) => x.id));
              commit({ strokes: P.current.strokes.filter((x) => !ids.has(x.id)) });
              drawLive();
              const q = P.current.quick;
              inkToast(`Erased ${gone.length} ${gone.length === 1 ? "stroke" : "strokes"}`, q ? { label: "Undo", run: q.onUndo } : undefined);
              return;
            }
          }
        }
        if (a.pts.length >= 3) {
          const pts = a.src === "pen" && !penPressureUsable(a.pts) ? withoutPressure(a.pts) : a.pts;
          const st: Stroke = { id: newInkId(), tool: a.tool, color: a.color, size: a.size, pts };
          commit({ strokes: [...P.current.strokes, st] });
        }
        // the committed layer draws it (layout effect); clear what is left of the live one
        drawLive();
        return;
      }
      if (a.kind === "erase") {
        drawLive();
        if (a.erased.size) {
          hidden.current = null;
          commit({ strokes: P.current.strokes.filter((s) => !a.erased.has(s.id)) });
        } else {
          hidden.current = null;
        }
        return;
      }
      if (a.kind === "lasso") {
        drawLive();
        if (a.poly.length < 6) return;
        const pb = polyBox(a.poly);
        const st = P.current.strokes.filter((s) => strokeInLasso(s, a.poly, pb));
        const it = P.current.items.filter((x) => {
          const b = itemBox(x);
          return boxesTouch(b, pb) && inPolygon(a.poly, (b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2);
        });
        if (!st.length && !it.length) return;
        let box: Box | null = null;
        st.forEach((x) => (box = unionBox(box, strokeBox(x))));
        it.forEach((x) => (box = unionBox(box, itemBox(x))));
        setSel({ strokes: new Set(st.map((x) => x.id)), items: new Set(it.map((x) => x.id)), box: box! });
        return;
      }
      if (a.kind === "move") {
        finishSelectionEdit(cancelled ? 0 : a.dx, cancelled ? 0 : a.dy, 1);
        drawLive();
        return;
      }
      if (a.kind === "scale") {
        finishSelectionEdit(0, 0, cancelled ? 1 : a.k);
        drawLive();
        return;
      }
      if (a.kind === "tap" && !cancelled) {
        const [x, y] = a.at;
        const hit = P.current.items.find((it) => {
          if (it.kind !== "text") return false;
          const b = itemBox(it);
          return x >= b.x1 && x <= b.x2 && y >= b.y1 && y <= b.y2;
        });
        if (hit) {
          setEditingId(hit.id);
          return;
        }
        if (P.current.full) {
          P.current.onFull?.();
          return;
        }
        const w = Math.max(160, Math.min(460, PAGE_W - x - 24));
        const item: PageItem = { id: newInkId(), kind: "text", text: "", x: Math.max(8, Math.min(PAGE_W - w - 8, x - 8)), y: Math.max(8, Math.min(PAGE_H - 60, y - TEXT.line / 2 - TEXT.pad)), w };
        commit({ items: [...P.current.items, item] });
        setEditingId(item.id);
      }
    };

    /** a two- or three-finger tap: undo or redo */
    const fingerTap = (n: number) => {
      const q = P.current.quick;
      if (!q) return;
      if (n === 2) {
        q.onUndo();
        inkToast("Undone · two-finger tap");
      } else {
        q.onRedo();
        inkToast("Redone · three-finger tap");
      }
    };

    const finish = (e: PointerEvent, cancelled: boolean) => {
      downIds.delete(e.pointerId);
      if (hold.current?.pid === e.pointerId) disarm();
      if (heldPid.current === e.pointerId) heldPid.current = null;
      const touch = e.pointerType === "touch";
      // a finger of a two- or three-finger tap leaves no dot
      if (touch && taps.multiSoFar(e.timeStamp) && action.current?.pid === e.pointerId && action.current.kind === "draw") cancelDraw();
      finishPointer(e, cancelled);
      if (touch) {
        const n = taps.up(e.pointerId, e.timeStamp);
        if (n) fingerTap(n);
      }
    };

    const finishPointer = (e: PointerEvent, cancelled: boolean) => {
      if (isPen(e)) penDown.current = false;
      if (e.pointerType === "touch" && mode() === "touch") {
        if (!arb.get(e.pointerId)) {
          if (!touches.current.has(e.pointerId) && action.current?.pid !== e.pointerId) return;
        } else {
          const evs = arb.up(e);
          touches.current.delete(e.pointerId);
          if (evs.length) {
            apply(evs);
            return;
          }
        }
      } else {
        const c = log.up(e);
        // Pen only: a single finger dragged where a pen would have written (the "stylus looks like a finger" hint)
        if (c && c.type === "touch" && c.role === "pan" && c.dist > DRAG_PX && mode() === "pen")
          noteFingerDrag(P.current.surface || "page", { tilt: c.tilt, pressure: pressureVaries(c) });
        if (e.pointerType === "touch") {
          const wasPinch = touches.current.size >= 2;
          touches.current.delete(e.pointerId);
          if (wasPinch) {
            pinch.current = null;
            // the finger left on the glass carries on panning (fingers don't draw in these modes)
            const left = [...touches.current.entries()][0];
            action.current = left ? { kind: "pan", pid: left[0], last: left[1], samples: [] } : null;
            schedule();
            return;
          }
        }
      }
      const a = action.current;
      if (!a || a.pid !== e.pointerId) return;
      complete(a, cancelled, e.timeStamp);
    };

    const onUp = (e: PointerEvent) => finish(e, false);
    // capture lost by the surface itself (it was released, or the surface went away) ends the pointer; a child losing
    // the browser's implicit touch capture when the surface takes it mid-stroke (a contact taking the pen) does not
    const onLost = (e: PointerEvent) => {
      if (e.target === wrap) finish(e, false);
    };
    const onCancel = (e: PointerEvent) => {
      // iPad Safari cancels a pen stroke when a system gesture starts: keep what was drawn
      finish(e, !(action.current?.kind === "draw"));
    };

    const onWheel = (e: WheelEvent) => {
      if (interactive(e.target) && !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      stopInertia();
      const r = wrap.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(-e.deltaY * 0.0045), e.clientX - r.left, e.clientY - r.top, true);
        return;
      }
      const k = e.deltaMode === 1 ? 32 : 1;
      setView({ ...view.current, tx: view.current.tx - (e.shiftKey ? e.deltaY : e.deltaX) * k, ty: view.current.ty - (e.shiftKey ? 0 : e.deltaY) * k }, true);
    };

    // iPad Safari: stop scroll, zoom, the magnifier and text selection under the pen (touch-action alone isn't
    // always honoured mid-gesture); taps on links, buttons and text boxes still go through
    const onTouch = (e: TouchEvent) => {
      if (!interactive(e.target)) e.preventDefault();
    };
    // Safari's own pinch gesture events
    const onGesture = (e: Event) => e.preventDefault();

    wrap.addEventListener("pointerdown", onDown);
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerup", onUp);
    wrap.addEventListener("pointercancel", onCancel);
    wrap.addEventListener("lostpointercapture", onLost);
    wrap.addEventListener("wheel", onWheel, { passive: false });
    wrap.addEventListener("touchstart", onTouch, { passive: false });
    wrap.addEventListener("touchmove", onTouch, { passive: false });
    wrap.addEventListener("gesturestart", onGesture);
    wrap.addEventListener("gesturechange", onGesture);
    return () => {
      stopInertia();
      disarm();
      wrap.removeEventListener("pointerdown", onDown);
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerup", onUp);
      wrap.removeEventListener("pointercancel", onCancel);
      wrap.removeEventListener("lostpointercapture", onLost);
      wrap.removeEventListener("wheel", onWheel);
      wrap.removeEventListener("touchstart", onTouch);
      wrap.removeEventListener("touchmove", onTouch);
      wrap.removeEventListener("gesturestart", onGesture);
      wrap.removeEventListener("gesturechange", onGesture);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers read the latest props through P
  }, [clamp, setView, zoomAt, schedule, renderCommitted, drawLive, commit]);

  // the mode changed: whatever fingers were doing stops (the next touch follows the new mode). A pen or a mouse
  // carries on: the first pen on a device switches the mode while its stroke is being drawn
  const inputMode = props.inputMode;
  useEffect(() => {
    const a = action.current;
    const byTouch = !!a && (!!arbRef.current?.get(a.pid) || touches.current.has(a.pid));
    arbRef.current?.reset();
    touches.current.clear();
    pinch.current = null;
    if (a && byTouch) {
      action.current = null;
      hidden.current = null;
      renderCommitted();
      drawLive();
    }
  }, [inputMode, renderCommitted, drawLive]);

  // ------------------------------------------------------------------ text boxes

  const onText = useCallback(
    (id: string, text: string) => {
      commit({ items: P.current.items.map((it) => (it.id === id && it.kind === "text" ? { ...it, text } : it)) }, `text:${id}`);
    },
    [commit]
  );
  const onDoneEditing = useCallback(
    (id: string) => {
      setEditingId((cur) => (cur === id ? null : cur));
      const it = P.current.items.find((x) => x.id === id);
      if (it && it.kind === "text" && !it.text.trim()) commit({ items: P.current.items.filter((x) => x.id !== id) }, `text:${id}`);
    },
    [commit]
  );

  // ------------------------------------------------------------------ render

  const cursor = tool === "eraser" ? "cell" : tool === "lasso" ? "default" : tool === "text" ? "text" : "crosshair";
  const box = sel?.box;
  const quick = props.quick;
  // the long-press menu: one commit per action (one undo step each)
  const closePress = () => {
    setPress(null);
    if (selVia.current === "press") {
      selVia.current = "lasso";
      if (tool !== "lasso") setSel(null);
    }
  };
  const restyle = (fn: (s: Stroke) => Stroke) => {
    const s = selRef.current;
    if (!s || !s.strokes.size) return;
    commit({ strokes: P.current.strokes.map((x) => (s.strokes.has(x.id) ? fn(x) : x)) });
  };
  const selStrokes = sel ? strokes.filter((x) => sel.strokes.has(x.id)) : [];
  const flipTool = () => quick?.onTool(tool === "eraser" ? lastInk.current : "eraser");
  const showSwitch = !!quick && switchOn && (tool === "pen" || tool === "highlighter" || tool === "eraser");
  return (
    <div
      ref={wrapRef}
      role="img"
      aria-label={label}
      className={`relative h-full w-full overflow-hidden bg-surface-2 ${className || ""}`}
      style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", cursor, overscrollBehavior: "contain" } as React.CSSProperties}
    >
      <div ref={pageRef} className="absolute left-0 top-0 origin-top-left" style={{ width: PAGE_W, height: PAGE_H, boxShadow: "0 0 0 1px var(--c-line-strong), 0 8px 30px rgba(0,0,0,0.12)" }}>
        <PaperView paper={paper} theme={theme} />
        <PageItems items={items} theme={theme} interactive={tool === "text" || tool === "lasso"} editingId={editingId} onText={onText} onDoneEditing={onDoneEditing} />
        <canvas ref={hlRef} aria-hidden className="pointer-events-none absolute left-0 top-0" style={{ width: PAGE_W, height: PAGE_H }} />
        <canvas ref={inkRef} aria-hidden className="pointer-events-none absolute left-0 top-0" style={{ width: PAGE_W, height: PAGE_H }} />
      </div>
      <canvas ref={liveRef} aria-hidden className="pointer-events-none absolute left-0 top-0" style={{ zIndex: 4 }} />
      <div ref={overRef} className="pointer-events-none absolute left-0 top-0 origin-top-left" style={{ width: PAGE_W, height: PAGE_H, zIndex: 5 }}>
        {box && (
          <>
            <div className="absolute border-2 border-dashed border-signal" style={{ left: box.x1 - 6, top: box.y1 - 6, width: box.x2 - box.x1 + 12, height: box.y2 - box.y1 + 12, borderWidth: "calc(2px * var(--ink-inv, 1))" }} />
          </>
        )}
        {box && tool === "lasso" && (
          <>
            <div
              aria-hidden
              className="absolute bg-signal"
              style={{ left: box.x2, top: box.y2, width: 16, height: 16, transform: "translate(-50%, -50%) scale(var(--ink-inv, 1))", border: "2px solid white" }}
            />
            <div data-ink-ui className="pointer-events-auto absolute flex origin-bottom-left border border-line-strong bg-surface shadow-lg" style={{ left: box.x1 - 6, top: box.y1 - 12, transform: "translateY(-100%) scale(var(--ink-inv, 1))", transformOrigin: "0 100%" }}>
              <span className="flex items-center px-3 font-mono text-[12px] text-fg-3">
                {sel!.strokes.size + sel!.items.size} selected
              </span>
              <button type="button" onClick={deleteSelection} className="min-h-10 border-l border-line px-3 text-[13px] font-semibold text-bad-text hover:bg-surface-2">
                Delete
              </button>
              <button type="button" onClick={() => setSel(null)} className="min-h-10 border-l border-line px-3 text-[13px] text-fg hover:bg-surface-2">
                Done
              </button>
            </div>
          </>
        )}
        {showSwitch && anchor && (
          <ToolSwitch
            tool={tool}
            onFlip={flipTool}
            className="absolute"
            style={{ left: Math.max(0, Math.min(PAGE_W, anchor[0])), top: Math.max(0, Math.min(PAGE_H, anchor[1])), transformOrigin: "0 0", transform: `scale(var(--ink-inv, 1)) translate(${anchor[2]}px, ${anchor[3]}px)` }}
          />
        )}
      </div>
      {showSwitch && !anchor && <ToolSwitch tool={tool} onFlip={flipTool} className="absolute right-3 top-1/2 z-[6] -translate-y-1/2" />}
      {quick && press?.kind === "sel" && sel && (
        <PressMenu
          x={press.x}
          y={press.y}
          count={sel.strokes.size + sel.items.size}
          theme={theme}
          colors={quick.colors}
          marker={selStrokes.length > 0 && selStrokes.every((x) => x.tool === "highlighter")}
          onErase={() => {
            deleteSelection();
            setPress(null);
            selVia.current = "lasso";
          }}
          onColor={(c) => restyle((x) => ({ ...x, color: c }))}
          onSize={(k) => restyle((x) => ({ ...x, size: Math.round(Math.max(1, Math.min(x.tool === "highlighter" ? 60 : 24, x.size * k)) * 10) / 10 }))}
          onLasso={
            quick.lasso
              ? () => {
                  selVia.current = "lasso";
                  setPress(null);
                  quick.onTool("lasso");
                }
              : undefined
          }
          onText={
            quick.onText
              ? () => {
                  closePress();
                  quick.onText!();
                }
              : undefined
          }
          onClose={closePress}
        />
      )}
      {quick && press?.kind === "palette" && (
        <QuickPalette
          x={press.x}
          y={press.y}
          theme={theme}
          tool={tool}
          onTool={(t: QuickTool) => quick.onTool(t)}
          colors={quick.colors}
          color={quick.color}
          onColor={(c) => {
            quick.onColor(c);
            if (tool === "eraser") quick.onTool(lastInk.current);
          }}
          sizes={quick.sizes}
          sizeIndex={quick.sizeIndex}
          onSize={
            quick.onSize
              ? (i) => {
                  quick.onSize!(i);
                  if (tool !== "pen") quick.onTool("pen");
                }
              : undefined
          }
          onClose={() => setPress(null)}
        />
      )}
      <InkToastHost />
      <InkDebugOverlay />
    </div>
  );
});

export default InkCanvas;
