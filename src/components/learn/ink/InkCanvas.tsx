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
 * Palm rejection: once a pen is seen (pointerType "pen"), the editor turns "pencil only" on (remembered per
 * device): then only the pen draws, one finger pans, two fingers pan and pinch-zoom, and any touch that lands
 * while the pen is down is ignored (a resting palm). With no stylus, a finger draws and two fingers move the page.
 * touch-action: none on the surface (plus preventDefault on touchstart/move, for iPad Safari) keeps the browser
 * from scrolling or zooming the page under the pen; the view handles finger scrolling itself (with momentum).
 * A pen's barrel / eraser button (button 5, buttons & 32) erases where the browser reports it.
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
import { MARKER_SIZE, addToLayer, buildLayer, fillLayer, fillStroke, outlinePathData, strokeInput, strokeOptions, strokePath, type InkTheme, type Layer } from "@/lib/learn/ink/render";
import { PAGE_H, PAGE_W, type InkColor, type PageItem, type Paper, type Stroke } from "@/lib/learn/ink/types";
import PaperView from "./Paper";
import PageItems from "./PageItems";

export type InkToolId = "pen" | "highlighter" | "eraser" | "lasso" | "text";
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
  pencilOnly: boolean;
  /** the page is at its size limit: new ink is refused (onFull) */
  full: boolean;
  /** space around the sheet at "fit width" (px) */
  pad?: number;
  /** a change made on the page; mergeKey folds consecutive changes into one undo step (typing) */
  onCommit: (next: InkContent, mergeKey?: string) => void;
  onPenSeen?: () => void;
  onFull?: () => void;
  /** the zoom: 1 = 100% = the page at 1000 px wide */
  onZoom?: (z: number) => void;
  label: string;
  className?: string;
};

type View = { s: number; tx: number; ty: number };
type Sel = { strokes: Set<string>; items: Set<string>; box: Box };
type Action =
  | { kind: "draw"; pid: number; tool: "pen" | "highlighter"; color: InkColor; size: number; pts: number[]; predicted: number[] }
  | { kind: "erase"; pid: number; last: [number, number] | null; erased: Set<string>; at: [number, number] }
  | { kind: "lasso"; pid: number; poly: number[] }
  | { kind: "move"; pid: number; from: [number, number]; dx: number; dy: number }
  | { kind: "scale"; pid: number; from: [number, number]; k: number }
  | { kind: "tap"; pid: number; at: [number, number]; client: [number, number] }
  | { kind: "pan"; pid: number; last: [number, number]; samples: [number, number, number][] };

const MAX_RES = 2.5;
const MIN_STEP2 = 8 * 8; // keep a point only when it is 0.8 page units from the last (pts are ×10)
const isPen = (e: PointerEvent) => e.pointerType === "pen";
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
      const all = a.predicted.length ? a.pts.concat(a.predicted) : a.pts;
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
    if (tool !== "lasso") setSel(null);
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
      clearSelection: () => setSel(null),
    }),
    [zoomAt, fit, deleteSelection]
  );

  // ------------------------------------------------------------------ input

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

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
      }
    };

    const begin = (e: PointerEvent, x: number, y: number) => {
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
        try {
          wrap.setPointerCapture(e.pointerId);
        } catch {
          // capture is best effort
        }
        drawLive();
      }
    };

    const onDown = (e: PointerEvent) => {
      if (interactive(e.target)) return;
      stopInertia();
      rect.current = wrap.getBoundingClientRect();
      const p = P.current;
      if (isPen(e)) {
        p.onPenSeen?.();
        // a palm already panning: stop it, the pen wins
        touches.current.clear();
        pinch.current = null;
        if (action.current?.kind === "pan") action.current = null;
        penDown.current = true;
      }
      if (e.pointerType === "touch") {
        if (penDown.current) return; // a palm while the pen writes
        touches.current.set(e.pointerId, [e.clientX, e.clientY]);
        try {
          wrap.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        if (touches.current.size >= 2) {
          // two fingers: whatever one finger started becomes a pinch
          cancelDraw();
          action.current = null;
          startPinch();
          return;
        }
        if (p.pencilOnly) {
          if (p.tool === "text") {
            const [x, y] = toPage(e.clientX, e.clientY);
            action.current = { kind: "tap", pid: e.pointerId, at: [x, y], client: [e.clientX, e.clientY] };
            return;
          }
          action.current = { kind: "pan", pid: e.pointerId, last: [e.clientX, e.clientY], samples: [[e.clientX, e.clientY, e.timeStamp]] };
          return;
        }
      }
      if (e.pointerType === "mouse" && e.button === 1) {
        action.current = { kind: "pan", pid: e.pointerId, last: [e.clientX, e.clientY], samples: [] };
        wrap.setPointerCapture(e.pointerId);
        return;
      }
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (action.current && action.current.kind !== "pan") return;
      const [x, y] = toPage(e.clientX, e.clientY);
      begin(e, x, y);
      e.preventDefault();
    };

    const onMove = (e: PointerEvent) => {
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
        const pts = a.pts;
        for (const ev of list) {
          const [x, y] = toPage(ev.clientX, ev.clientY);
          const qx = Math.round(Math.max(0, Math.min(PAGE_W, x)) * Q);
          const qy = Math.round(Math.max(0, Math.min(PAGE_H, y)) * Q);
          const lx = pts[pts.length - 3];
          const ly = pts[pts.length - 2];
          if ((qx - lx) ** 2 + (qy - ly) ** 2 < MIN_STEP2) continue;
          pts.push(qx, qy, pts[2] > 0 ? Math.max(1, Math.round((ev.pressure || 0.5) * 100)) : 0);
        }
        a.predicted = [];
        const pred = typeof e.getPredictedEvents === "function" ? e.getPredictedEvents() : [];
        for (const ev of pred.slice(0, 2)) {
          const [x, y] = toPage(ev.clientX, ev.clientY);
          a.predicted.push(Math.round(x * Q), Math.round(y * Q), pts[2] > 0 ? Math.max(1, Math.round((ev.pressure || 0.5) * 100)) : 0);
        }
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

    const finish = (e: PointerEvent, cancelled: boolean) => {
      if (isPen(e)) penDown.current = false;
      if (e.pointerType === "touch") {
        const wasPinch = touches.current.size >= 2;
        touches.current.delete(e.pointerId);
        if (wasPinch) {
          pinch.current = null;
          // the finger left on the glass carries on panning in pencil-only mode
          const left = [...touches.current.entries()][0];
          action.current = left && P.current.pencilOnly ? { kind: "pan", pid: left[0], last: left[1], samples: [] } : null;
          schedule();
          return;
        }
      }
      const a = action.current;
      if (!a || a.pid !== e.pointerId) return;
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
          if (e.timeStamp - t1 < 80 && Math.hypot(vx, vy) > 0.15) {
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
        if (a.pts.length >= 3) {
          const st: Stroke = { id: newInkId(), tool: a.tool, color: a.color, size: a.size, pts: a.pts };
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

    const onUp = (e: PointerEvent) => finish(e, false);
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
    wrap.addEventListener("lostpointercapture", onUp);
    wrap.addEventListener("wheel", onWheel, { passive: false });
    wrap.addEventListener("touchstart", onTouch, { passive: false });
    wrap.addEventListener("touchmove", onTouch, { passive: false });
    wrap.addEventListener("gesturestart", onGesture);
    wrap.addEventListener("gesturechange", onGesture);
    return () => {
      stopInertia();
      wrap.removeEventListener("pointerdown", onDown);
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerup", onUp);
      wrap.removeEventListener("pointercancel", onCancel);
      wrap.removeEventListener("lostpointercapture", onUp);
      wrap.removeEventListener("wheel", onWheel);
      wrap.removeEventListener("touchstart", onTouch);
      wrap.removeEventListener("touchmove", onTouch);
      wrap.removeEventListener("gesturestart", onGesture);
      wrap.removeEventListener("gesturechange", onGesture);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers read the latest props through P
  }, [clamp, setView, zoomAt, schedule, renderCommitted, drawLive, commit]);

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
      </div>
    </div>
  );
});

export default InkCanvas;
