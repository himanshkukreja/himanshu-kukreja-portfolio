/**
 * Notebook pages and annotate: the stroke being drawn, drawn at a cost that doesn't grow with its length.
 *
 * LiveOutline is perfect-freehand 1.2.3 (getStrokePoints + getStrokeOutlinePoints) run incrementally, for the
 * options render.ts uses (no taper, round caps): the streamline filter and the outline's left / right points are
 * causal, so the part of the outline more than a few points behind the nib never changes again. That part is cut
 * into pieces (filled once, each overlapping the last by a few outline points so no seam shows); every frame only the
 * tail (the last points, the end cap, the predicted points) is outlined again. The points match getStroke exactly
 * (`outlinePoints()` returns the whole polygon, point for point what getStroke returns for the same input), and the tail is outlined as a
 * finished stroke (last: true), so the live ink ends under the nib and is the shape the page keeps: nothing moves
 * on pen-up.
 *
 * LivePainter puts it on a canvas: a new piece is filled where it lands; the tail's rect from the frame before is
 * cleared, the pieces under it are filled again (clipped to it) and the new tail is filled. A full redraw only when
 * the view moved or the stroke started over (its pressure decided: real or simulated). Highlighter strokes are
 * filled opaque with the canvas element at the marker's opacity (pieces overlap without darkening, the way one
 * committed stroke looks). A desynchronized ("low latency") context shows the ink without waiting for the page's
 * compositor where the browser supports it (Chrome on Android, ChromeOS, Windows); its finished stroke stays up a
 * few frames after pen-up (retire), until the committed layer that replaces it has reached the screen.
 *
 * Flags (localStorage, or the URL once: ?inkclassic=1|0, ?inkdesync=0|1; the ?inkdebug=1 overlay has both):
 *   hk.ink.classic = "1"   the old renderer: the whole stroke outlined and filled every frame (to compare on device)
 *   hk.ink.desync = "0"    no low-latency canvas
 */
import { getStroke, type StrokeOptions } from "perfect-freehand";
import { Q } from "./geometry";
import { INK, MARKER, MARKER_ALPHA, strokeOptions, type InkTheme } from "./render";
import type { InkColor, Stroke } from "./types";

type V = [number, number];
type SP = { point: V; pressure: number; vector: V; distance: number; runningLength: number };
type Box = { x1: number; y1: number; x2: number; y2: number };

// perfect-freehand's constants
const FIXED_PI = Math.PI + 0.0001;
const END_NOISE = 3;
const START_CAP = 13;
const END_CAP = 29;
const CORNER_CAP = 13;
const RATE = 0.275;

/** a piece is cut once both sides have this many new outline points; pieces (and the tail) overlap by OVERLAP */
const PIECE = 16;
const OVERLAP = 3;

const rotAround = (A: V, C: V, r: number): V => {
  const s = Math.sin(r);
  const c = Math.cos(r);
  const px = A[0] - C[0];
  const py = A[1] - C[1];
  return [px * c - py * s + C[0], px * s + py * c + C[1]];
};
const simPressure = (prev: number, distance: number, size: number) => {
  const sp = Math.min(1, distance / size);
  const rp = Math.min(1, 1 - sp);
  return Math.min(1, prev + (rp - prev) * (sp * RATE));
};

type OutState = { i: number; prevPressure: number; radius: number; prevVector: V; prevLeft: V; prevRight: V; prevSharp: boolean };
type Opts = { size: number; thinning: number; smoothing: number; streamline: number; easing: (t: number) => number };

export type Piece = { path: Path2D; box: Box };

export class LiveOutline {
  private o: Opts;
  private t: number;
  private sim = false;
  // stroke points: inputs below n are in sp (every input but the last real one, which may yet be the stroke's end)
  private n = 0;
  private sp: SP[] = [];
  private rl = 0;
  private reached = false;
  // outline: sp below out.i are in L / R
  private out: OutState | null = null;
  private L: V[] = [];
  private R: V[] = [];
  private initPressure = 0;
  // pieces: the outline from cut (a, b) on is not in one yet
  private a = 0;
  private b = 0;
  private fresh: Piece[] = [];
  /** set when sync started over (the caller redraws everything) */
  restarted = false;

  constructor(private stroke: Pick<Stroke, "tool" | "size">) {
    this.o = this.opts(false);
    this.t = 0.15 + (1 - this.o.streamline) * 0.85;
  }

  private opts(sim: boolean): Opts {
    const s: StrokeOptions = strokeOptions(this.stroke, sim, false);
    return { size: s.size ?? 16, thinning: s.thinning ?? 0.5, smoothing: s.smoothing ?? 0.5, streamline: s.streamline ?? 0.5, easing: s.easing || ((t) => t) };
  }

  private reset(sim: boolean) {
    this.sim = sim;
    this.o = this.opts(sim);
    this.t = 0.15 + (1 - this.o.streamline) * 0.85;
    this.n = 0;
    this.sp = [];
    this.rl = 0;
    this.reached = false;
    this.out = null;
    this.L = [];
    this.R = [];
    this.a = this.b = 0;
    this.fresh = [];
    this.restarted = true;
  }

  /** Start over (the stroke's pressures were rewritten). */
  invalidate() {
    this.reset(this.sim);
  }

  private input(pts: number[], i: number): [number, number, number] {
    return [pts[i * 3] / Q, pts[i * 3 + 1] / Q, this.sim ? 0.5 : pts[i * 3 + 2] / 100];
  }

  /** One input through the streamline filter (getStrokePoints' loop body); null when it adds no point. */
  private step(prev: SP, P: [number, number, number], st: { rl: number; reached: boolean }, isMax: boolean, last: boolean): SP | null {
    const t = this.t;
    const point: V = last && isMax ? [P[0], P[1]] : [prev.point[0] + (P[0] - prev.point[0]) * t, prev.point[1] + (P[1] - prev.point[1]) * t];
    if (prev.point[0] === point[0] && prev.point[1] === point[1]) return null;
    const distance = Math.hypot(point[1] - prev.point[1], point[0] - prev.point[0]);
    st.rl += distance;
    if (!isMax && !st.reached) {
      if (st.rl < this.o.size) return null;
      st.reached = true;
    }
    const vx = prev.point[0] - point[0];
    const vy = prev.point[1] - point[1];
    const len = Math.hypot(vx, vy);
    return { point, pressure: P[2] >= 0 ? P[2] : 0.5, vector: [vx / len, vy / len], distance, runningLength: st.rl };
  }

  /** Bring the settled part up to date with the stroke's points (flat, ×Q, pressure 0–100). */
  sync(pts: number[], simulate: boolean) {
    if (simulate !== this.sim) this.reset(simulate);
    const real = Math.floor(pts.length / 3);
    if (!real) return;
    if (!this.n) {
      const P = this.input(pts, 0);
      this.sp.push({ point: [P[0], P[1]], pressure: P[2] >= 0 ? P[2] : 0.25, vector: [1, 1], distance: 0, runningLength: 0 });
      this.n = 1;
    }
    const st = { rl: this.rl, reached: this.reached };
    for (; this.n < real - 1; this.n++) {
      const p = this.step(this.sp[this.sp.length - 1], this.input(pts, this.n), st, false, false);
      if (!p) continue;
      this.sp.push(p);
      if (this.sp.length === 2) this.sp[0].vector = p.vector;
    }
    this.rl = st.rl;
    this.reached = st.reached;
    // the outline of points that can't change any more: ten points in (the start pressure), one point of lookahead,
    // END_NOISE behind the last settled point (the stroke only gets longer)
    const sp = this.sp;
    if (sp.length < 10) return;
    if (!this.out) {
      this.initPressure = this.startPressure((i) => sp[i], sp.length);
      this.out = { i: 0, prevPressure: this.initPressure, radius: 0, prevVector: sp[0].vector, prevLeft: sp[0].point, prevRight: sp[0].point, prevSharp: false };
    }
    const Lc = sp[sp.length - 1].runningLength;
    let end = this.out.i;
    while (end + 1 < sp.length && Lc - sp[end].runningLength >= END_NOISE) end++;
    if (end > this.out.i) this.outline((i) => sp[i], sp.length, end, Infinity, this.out, this.L, this.R);
    // cut a piece when both sides moved on far enough
    if (this.L.length - this.a >= PIECE && this.R.length - this.b >= PIECE) {
      const first = this.a === 0 && this.b === 0;
      const left = this.L.slice(this.a);
      const right = this.R.slice(this.b);
      this.fresh.push(band(left, right, first ? this.startCap(this.R[0]) : null, null));
      this.a = this.L.length - OVERLAP;
      this.b = this.R.length - OVERLAP;
    }
  }

  /** pieces cut since the last call */
  take(): Piece[] {
    const f = this.fresh;
    this.fresh = [];
    return f;
  }

  private startPressure(at: (i: number) => SP, n: number) {
    const { size } = this.o;
    let acc = at(0).pressure;
    for (let i = 0; i < Math.min(10, n); i++) {
      const c = at(i);
      const p = this.sim ? simPressure(acc, c.distance, size) : c.pressure;
      acc = (acc + p) / 2;
    }
    return acc;
  }

  /** getStrokeOutlinePoints' loop over stroke points st.i … to-1 (n points in all, totalLength as given) */
  private outline(at: (i: number) => SP, n: number, to: number, totalLength: number, st: OutState, L: V[], R: V[]) {
    const { size, thinning, easing } = this.o;
    const minDistance = Math.pow(size * this.o.smoothing, 2);
    for (let i = st.i; i < to; i++) {
      const sp = at(i);
      let pressure = sp.pressure;
      const { point, vector, distance, runningLength } = sp;
      const isLast = i === n - 1;
      if (!isLast && totalLength - runningLength < END_NOISE) continue;
      if (thinning) {
        if (this.sim) pressure = simPressure(st.prevPressure, distance, size);
        st.radius = size * easing(0.5 - thinning * (0.5 - pressure));
      } else st.radius = size / 2;
      st.radius = Math.max(0.01, st.radius);
      const r = st.radius;
      const nextVector = (!isLast ? at(i + 1) : sp).vector;
      const nextDpr = !isLast ? vector[0] * nextVector[0] + vector[1] * nextVector[1] : 1.0;
      const prevDpr = vector[0] * st.prevVector[0] + vector[1] * st.prevVector[1];
      const isPointSharp = prevDpr < 0 && !st.prevSharp;
      const isNextSharp = nextDpr < 0;
      if (isPointSharp || isNextSharp) {
        const ox = st.prevVector[1] * r;
        const oy = -st.prevVector[0] * r;
        const step = 1 / CORNER_CAP;
        let tl = st.prevLeft;
        let tr = st.prevRight;
        for (let t = 0; t <= 1; t += step) {
          tl = rotAround([point[0] - ox, point[1] - oy], point, FIXED_PI * t);
          L.push(tl);
          tr = rotAround([point[0] + ox, point[1] + oy], point, FIXED_PI * -t);
          R.push(tr);
        }
        st.prevLeft = tl;
        st.prevRight = tr;
        if (isNextSharp) st.prevSharp = true;
        continue;
      }
      st.prevSharp = false;
      if (isLast) {
        const ox = vector[1] * r;
        const oy = -vector[0] * r;
        L.push([point[0] - ox, point[1] - oy]);
        R.push([point[0] + ox, point[1] + oy]);
        continue;
      }
      const lx = nextVector[0] + (vector[0] - nextVector[0]) * nextDpr;
      const ly = nextVector[1] + (vector[1] - nextVector[1]) * nextDpr;
      const ox = ly * r;
      const oy = -lx * r;
      const tl: V = [point[0] - ox, point[1] - oy];
      if (i <= 1 || (st.prevLeft[0] - tl[0]) ** 2 + (st.prevLeft[1] - tl[1]) ** 2 > minDistance) {
        L.push(tl);
        st.prevLeft = tl;
      }
      const tr: V = [point[0] + ox, point[1] + oy];
      if (i <= 1 || (st.prevRight[0] - tr[0]) ** 2 + (st.prevRight[1] - tr[1]) ** 2 > minDistance) {
        R.push(tr);
        st.prevRight = tr;
      }
      st.prevPressure = pressure;
      st.prevVector = vector;
    }
    st.i = Math.max(st.i, to);
  }

  private startCap(r0: V): V[] {
    const c = this.sp[0].point;
    const cap: V[] = [];
    const step = 1 / START_CAP;
    for (let t = step; t <= 1; t += step) cap.push(rotAround(r0, c, FIXED_PI * t));
    return cap;
  }

  /**
   * The unsettled rest: stroke points from the inputs not yet settled plus `predicted` (flat, ×Q), outlined to the
   * end with its cap. `last`: the final input is taken as is (the finished-stroke shape). null: too few points (the
   * caller outlines the whole stroke with getStroke).
   */
  private rest(pts: number[], predicted: number[], last: boolean) {
    const real = Math.floor(pts.length / 3);
    const np = Math.floor(predicted.length / 3);
    const total = real + np;
    if (total < 3 || !this.n) return null;
    const tail: SP[] = [];
    const st = { rl: this.rl, reached: this.reached };
    let prev = this.sp[this.sp.length - 1];
    for (let i = this.n; i < total; i++) {
      const P = i < real ? this.input(pts, i) : this.input(predicted, i - real);
      const p = this.step(prev, P, st, i === total - 1, last);
      if (!p) continue;
      tail.push(p);
      prev = p;
    }
    const sp = this.sp;
    const N = sp.length + tail.length;
    if (N < 2) return null;
    // the first point's vector is the second's
    const first = sp.length > 1 ? sp[0] : { ...sp[0], vector: tail[0].vector };
    const at = (i: number) => (i === 0 ? first : i < sp.length ? sp[i] : tail[i - sp.length]);
    const totalLength = at(N - 1).runningLength;
    const tl: V[] = [];
    const tr: V[] = [];
    let state: OutState;
    if (this.out) state = { ...this.out };
    else {
      const p0 = this.startPressure(at, N);
      state = { i: 0, prevPressure: p0, radius: 0, prevVector: first.vector, prevLeft: first.point, prevRight: first.point, prevSharp: false };
    }
    this.outline(at, N, N, totalLength, state, tl, tr);
    const lastSp = at(N - 1);
    const center: V = [lastSp.point[0], lastSp.point[1]];
    const dir: V = [-lastSp.vector[1], lastSp.vector[0]];
    const start: V = [center[0] + dir[0] * state.radius, center[1] + dir[1] * state.radius];
    const endCap: V[] = [];
    const step = 1 / END_CAP;
    for (let t = step; t < 1; t += step) endCap.push(rotAround(start, center, FIXED_PI * 3 * t));
    return { tl, tr, endCap };
  }

  /** The tail to draw this frame: from the last cut (overlapping it) to the end, with the start cap while uncut. */
  tail(pts: number[], predicted: number[], last = true): Piece | null {
    const r = this.rest(pts, predicted, last);
    if (!r) return null;
    const left = this.L.slice(this.a).concat(r.tl);
    const right = this.R.slice(this.b).concat(r.tr);
    if (left.length < 2 || right.length < 2) return null;
    const first = this.a === 0 && this.b === 0;
    return band(left, right, first ? this.startCap(this.R[0] || r.tr[0]) : null, r.endCap);
  }

  /** The whole outline polygon, as getStroke returns it (checks). */
  outlinePoints(pts: number[], predicted: number[], last: boolean): V[] | null {
    const r = this.rest(pts, predicted, last);
    if (!r) return null;
    const left = this.L.concat(r.tl);
    const right = this.R.concat(r.tr);
    return left.concat(r.endCap, right.reverse(), this.startCap(this.R[0] || r.tr[0]));
  }
}

const mid = (a: V, b: V): V => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** A closed outline polygon as outlinePathData draws it (without its rounding). */
function polygon(S: V[]): Piece {
  const p = new Path2D();
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  const n = S.length;
  p.moveTo(S[0][0], S[0][1]);
  for (let i = 0; i < n; i++) {
    const a = S[i];
    const b = S[(i + 1) % n];
    p.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    if (a[0] < x1) x1 = a[0];
    if (a[0] > x2) x2 = a[0];
    if (a[1] < y1) y1 = a[1];
    if (a[1] > y2) y2 = a[1];
  }
  p.closePath();
  return { path: p, box: { x1, y1, x2, y2 } };
}

/**
 * A band of the outline as a Path2D: the left side, the end cap (or a straight cut across the stroke), the right
 * side back, the start cap (or a cut). Quadratic curves through the midpoints, as outlinePathData draws the whole.
 */
function band(left: V[], right: V[], startCap: V[] | null, endCap: V[] | null): Piece {
  const p = new Path2D();
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  const grow = (pts: V[]) => {
    for (const v of pts) {
      if (v[0] < x1) x1 = v[0];
      if (v[0] > x2) x2 = v[0];
      if (v[1] < y1) y1 = v[1];
      if (v[1] > y2) y2 = v[1];
    }
  };
  grow(left);
  grow(right);
  if (startCap) grow(startCap);
  if (endCap) grow(endCap);
  // the whole stroke: exactly outlinePathData's polygon
  if (startCap && endCap) return polygon(left.concat(endCap, right.slice().reverse(), startCap));
  const q = (c: V, e: V) => p.quadraticCurveTo(c[0], c[1], e[0], e[1]);
  if (startCap) {
    p.moveTo(left[0][0], left[0][1]);
    q(left[0], mid(left[0], left[1]));
  } else {
    const m = mid(left[0], left[1]);
    p.moveTo(m[0], m[1]);
  }
  for (let i = 1; i < left.length - 1; i++) q(left[i], mid(left[i], left[i + 1]));
  const rn = right.length;
  if (endCap) {
    const E = [left[left.length - 1], ...endCap, right[rn - 1]];
    for (let i = 0; i < E.length - 1; i++) q(E[i], mid(E[i], E[i + 1]));
    q(right[rn - 1], mid(right[rn - 1], right[rn - 2]));
  } else {
    const m = mid(right[rn - 1], right[rn - 2]);
    p.lineTo(m[0], m[1]);
  }
  for (let i = rn - 2; i >= 1; i--) q(right[i], mid(right[i], right[i - 1]));
  if (startCap) {
    const C = [right[0], ...startCap, left[0]];
    for (let i = 0; i < C.length - 1; i++) q(C[i], mid(C[i], C[i + 1]));
  }
  p.closePath();
  return { path: p, box: { x1, y1, x2, y2 } };
}

// ------------------------------------------------------------------ flags

const CLASSIC_KEY = "hk.ink.classic";
const DESYNC_KEY = "hk.ink.desync";
let flags: { classic: boolean; desync: boolean } | null = null;
const flagListeners = new Set<() => void>();

function readFlags() {
  const f = { classic: false, desync: true };
  if (typeof window === "undefined") return f;
  try {
    const q = new URLSearchParams(window.location.search);
    const c = q.get("inkclassic");
    if (c === "1") window.localStorage.setItem(CLASSIC_KEY, "1");
    else if (c === "0") window.localStorage.removeItem(CLASSIC_KEY);
    const d = q.get("inkdesync");
    if (d === "0") window.localStorage.setItem(DESYNC_KEY, "0");
    else if (d === "1") window.localStorage.removeItem(DESYNC_KEY);
    f.classic = window.localStorage.getItem(CLASSIC_KEY) === "1";
    f.desync = window.localStorage.getItem(DESYNC_KEY) !== "0";
  } catch {
    // no URL / storage: the defaults
  }
  return f;
}

/** the renderer flags (read once; setInkFlag changes them) */
export function inkFlags() {
  if (!flags) flags = readFlags();
  return flags;
}

export function setInkFlag(k: "classic" | "desync", on: boolean) {
  const f = inkFlags();
  flags = { ...f, [k]: on };
  try {
    if (k === "classic") {
      if (on) window.localStorage.setItem(CLASSIC_KEY, "1");
      else window.localStorage.removeItem(CLASSIC_KEY);
    } else if (on) window.localStorage.removeItem(DESYNC_KEY);
    else window.localStorage.setItem(DESYNC_KEY, "0");
  } catch {
    // storage unavailable: this page only
  }
  flagListeners.forEach((l) => l());
}

export function subscribeInkFlags(cb: () => void) {
  flagListeners.add(cb);
  return () => flagListeners.delete(cb);
}

// ------------------------------------------------------------------ frame numbers (the ?inkdebug=1 overlay)

const RING = 240;
const paintMs = new Float32Array(RING);
const frameMs = new Float32Array(RING);
let paintN = 0;
let frameN = 0;
let lastFrame = 0;
let frameEst = 16.7;
let lowLatency = false;

/** a paint of the live stroke took ms */
export function notePaint(ms: number) {
  paintMs[paintN++ % RING] = ms;
}
/** a stroke starts: the gap since the last one is no dropped frame */
export function frameStart() {
  lastFrame = 0;
}
/** a frame while a stroke is drawn (rAF time) */
export function noteFrame(t: number) {
  const d = t - lastFrame;
  lastFrame = t;
  if (d <= 0 || d > 100) return;
  frameMs[frameN++ % RING] = d;
  frameEst = frameEst * 0.9 + Math.min(34, Math.max(6, d)) * 0.1;
}
/** how long a frame lasts here (ms; predicted points reach this far ahead) */
export const frameInterval = () => frameEst;
export const noteLowLatency = (on: boolean) => {
  lowLatency = on;
};

const pct = (a: Float32Array, n: number, k: number) => {
  const m = Math.min(n, RING);
  if (!m) return 0;
  const s = Array.from(a.subarray(0, m)).sort((x, y) => x - y);
  return s[Math.min(m - 1, Math.floor(k * (m - 1)))];
};
export function inkPerf() {
  const m = Math.min(frameN, RING);
  const med = pct(frameMs, frameN, 0.5) || 16.7;
  let dropped = 0;
  for (let i = 0; i < m; i++) dropped += Math.max(0, Math.round(frameMs[i] / med) - 1);
  return { paint: pct(paintMs, paintN, 0.5), paint95: pct(paintMs, paintN, 0.95), frame: med, dropped, frames: m, lowLatency, ...inkFlags() };
}

// ------------------------------------------------------------------ painting

/** device px = k × (page or overlay units) + (x, y) */
export type LiveXf = { k: number; x: number; y: number };

export class LivePainter {
  private ctx: CanvasRenderingContext2D | null = null;
  /** the context is low-latency (desynchronized) */
  readonly lowLatency: boolean;
  private s: { tool: Stroke["tool"]; size: number; fill: string; outline: LiveOutline; pieces: Piece[]; tip: [number, number, number, number] | null; key: string; all: boolean } | null = null;
  /** a finished stroke still on the canvas (low latency only) until the committed one is on screen */
  private stale: { path: Path2D; fill: string; xf: LiveXf; frames: number; raf: number } | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    desync: boolean
  ) {
    const ctx = desync ? (canvas.getContext("2d", { desynchronized: true }) as CanvasRenderingContext2D | null) : canvas.getContext("2d");
    this.ctx = ctx;
    this.lowLatency = !!(desync && ctx && typeof ctx.getContextAttributes === "function" && ctx.getContextAttributes().desynchronized);
  }

  get active() {
    return !!this.s;
  }

  /** A stroke starts: its look (opaque fill; the highlighter's opacity goes on the canvas element). */
  start(st: { tool: Stroke["tool"]; color: InkColor; size: number }, theme: InkTheme) {
    const marker = st.tool === "highlighter";
    this.canvas.style.opacity = marker ? String(MARKER_ALPHA[theme]) : "";
    this.s = { tool: st.tool, size: st.size, fill: marker ? MARKER[theme][st.color] || MARKER[theme].ink : INK[theme][st.color] || INK[theme].ink, outline: new LiveOutline(st), pieces: [], tip: null, key: "", all: true };
  }

  /** the stroke's pressures were rewritten (a stylus proved real): outline it again */
  restart() {
    this.s?.outline.invalidate();
  }

  /** Draw the stroke so far. */
  paint(pts: number[], simulate: boolean, predicted: number[], xf: LiveXf) {
    const s = this.s;
    const ctx = this.ctx;
    if (!s || !ctx) return;
    const c = this.canvas;
    const t0 = performance.now();
    s.outline.sync(pts, simulate);
    const fresh = s.outline.take();
    const key = `${xf.k},${xf.x},${xf.y},${c.width},${c.height}`;
    if (s.outline.restarted) {
      // started over (the pressure was decided): the pieces so far are gone
      s.outline.restarted = false;
      s.pieces = [];
      s.all = true;
    }
    if (key !== s.key) {
      s.key = key;
      s.all = true;
    }
    ctx.fillStyle = s.fill;
    if (s.all) {
      s.all = false;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.setTransform(xf.k, 0, 0, xf.k, xf.x, xf.y);
      this.fillStale();
      for (const p of s.pieces) ctx.fill(p.path);
    } else if (s.tip) {
      const [x, y, w, h] = s.tip;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(x, y, w, h);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      const bx1 = (x - xf.x) / xf.k;
      const by1 = (y - xf.y) / xf.k;
      const bx2 = (x + w - xf.x) / xf.k;
      const by2 = (y + h - xf.y) / xf.k;
      this.fillStale();
      ctx.setTransform(xf.k, 0, 0, xf.k, xf.x, xf.y);
      ctx.fillStyle = s.fill;
      for (const p of s.pieces) if (p.box.x2 >= bx1 && p.box.x1 <= bx2 && p.box.y2 >= by1 && p.box.y1 <= by2) ctx.fill(p.path);
      ctx.restore();
    }
    ctx.setTransform(xf.k, 0, 0, xf.k, xf.x, xf.y);
    ctx.fillStyle = s.fill;
    for (const p of fresh) {
      ctx.fill(p.path);
      s.pieces.push(p);
    }
    let tip = s.outline.tail(pts, predicted, true);
    if (!tip) {
      // a stroke of one or two points: perfect-freehand's own special cases
      const all = predicted.length ? pts.concat(predicted) : pts;
      const n = Math.floor(all.length / 3);
      const points: number[][] = [];
      for (let j = 0; j < n; j++) points.push([all[j * 3] / Q, all[j * 3 + 1] / Q, simulate ? 0.5 : all[j * 3 + 2] / 100]);
      const out = getStroke(points, strokeOptions(s, simulate, true));
      if (out.length > 2) tip = polygon(out as V[]);
    }
    if (tip) {
      ctx.fill(tip.path);
      const m = 2;
      const x1 = Math.max(0, Math.floor(tip.box.x1 * xf.k + xf.x) - m);
      const y1 = Math.max(0, Math.floor(tip.box.y1 * xf.k + xf.y) - m);
      const x2 = Math.min(c.width, Math.ceil(tip.box.x2 * xf.k + xf.x) + m);
      const y2 = Math.min(c.height, Math.ceil(tip.box.y2 * xf.k + xf.y) + m);
      s.tip = x2 > x1 && y2 > y1 ? [x1, y1, x2 - x1, y2 - y1] : null;
    } else s.tip = null;
    notePaint(performance.now() - t0);
  }

  /** the finished stroke left over from pen-up (within the clip, if one is set) */
  private fillStale() {
    const st = this.stale;
    const ctx = this.ctx;
    if (!st || !ctx) return;
    ctx.save();
    ctx.setTransform(st.xf.k, 0, 0, st.xf.k, st.xf.x, st.xf.y);
    ctx.fillStyle = st.fill;
    ctx.fill(st.path);
    ctx.restore();
  }

  /**
   * Pen-up with the stroke kept (`path`: its committed outline). A normal canvas clears now (it reaches the screen
   * in the same frame as the committed layer); a low-latency one keeps the stroke a few frames, until the
   * committed layer is surely on screen, so it never blinks out.
   */
  retire(path: Path2D | null, xf: LiveXf) {
    const s = this.s;
    this.s = null;
    if (!this.lowLatency || !path || !s || s.tool === "highlighter") {
      this.clear();
      return;
    }
    if (this.stale) window.cancelAnimationFrame(this.stale.raf);
    this.stale = { path, fill: s.fill, xf, frames: 3, raf: 0 };
    const tick = () => {
      const st = this.stale;
      if (!st) return;
      if (--st.frames > 0) {
        st.raf = window.requestAnimationFrame(tick);
        return;
      }
      this.stale = null;
      // a new stroke started meanwhile: redraw it without the old one
      if (this.s) this.s.all = true;
      else this.wipe();
    };
    this.stale.raf = window.requestAnimationFrame(tick);
  }

  /** Forget the stroke and clear the canvas now. */
  clear() {
    this.s = null;
    if (this.stale) window.cancelAnimationFrame(this.stale.raf);
    this.stale = null;
    this.wipe();
  }

  private wipe() {
    const ctx = this.ctx;
    this.canvas.style.opacity = "";
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

// dev / QA: the numbers from the console
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") (window as unknown as { __inkPerf: typeof inkPerf }).__inkPerf = inkPerf;
