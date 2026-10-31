"use client";

/**
 * Quick gestures shared by every ink surface (notebook pages, the passage pad, written-paper sheets, annotate):
 *   - long-press: hold still HOLD_MS (moved under HOLD_PX) over ink → select it (its word-group) and show a menu; on
 *     empty paper → a quick palette. A tap still draws a dot: the dot is dropped only when the hold completes.
 *   - scribble-to-erase: a fast zig-zag over existing strokes erases them instead of drawing (detectScribble).
 *   - two-finger tap = undo, three-finger tap = redo (TapSession).
 *   - the toast ("Erased · Undo") and the floating pen ↔ eraser switch's preference.
 * Plain functions and tiny stores; the surfaces wire them to their own input handling.
 */
import { useSyncExternalStore } from "react";
import { Q, strokeBox, strokeHit, unionBox, type Box } from "./geometry";
import type { Stroke } from "./types";

/** long-press: still for this long (ms), within this many CSS px of where it landed */
export const HOLD_MS = 500;
export const HOLD_PX = 6;
/** multi-finger taps: every finger down and up within TAP_MS, none moving more than TAP_PX (a pan or pinch moves) */
export const TAP_MS = 250;
export const TAP_PX = 12;

// ------------------------------------------------------------------ two- / three-finger taps

/**
 * One touch session (first finger down → last finger up) watched for a multi-finger tap. Feed it every touch pointer
 * of the surface, in any mode. up() returns 2 or 3 when the session just ended as a two- or three-finger tap.
 */
export class TapSession {
  private pts = new Map<number, { x: number; y: number; moved: number }>();
  private t0 = 0;
  private max = 0;
  private spoiled = false;

  down(id: number, x: number, y: number, t: number) {
    if (!this.pts.size) {
      this.t0 = t;
      this.max = 0;
      this.spoiled = false;
    }
    this.pts.set(id, { x, y, moved: 0 });
    this.max = Math.max(this.max, this.pts.size);
    if (t - this.t0 > TAP_MS) this.spoiled = true;
  }
  move(id: number, x: number, y: number) {
    const p = this.pts.get(id);
    if (!p) return;
    p.moved = Math.max(p.moved, Math.hypot(x - p.x, y - p.y));
    if (p.moved > TAP_PX) this.spoiled = true;
  }
  /** a multi-finger tap so far: the writer's dot of such a session is dropped, not committed */
  multiSoFar(t: number) {
    return !this.spoiled && this.max >= 2 && t - this.t0 <= TAP_MS;
  }
  up(id: number, t: number): number {
    if (!this.pts.delete(id)) return 0;
    if (t - this.t0 > TAP_MS) this.spoiled = true;
    if (this.pts.size) return 0;
    const n = this.spoiled ? 0 : this.max;
    this.max = 0;
    return n >= 2 && n <= 3 ? n : 0;
  }
  reset() {
    this.pts.clear();
    this.max = 0;
    this.spoiled = true;
  }
}

// ------------------------------------------------------------------ scribble-to-erase

/**
 * A scribble: at least REVERSALS sharp turns (the path doubling back by more than REVERSAL_DEG) within SCRIBBLE_MS,
 * each leg at least LEG_PX long (jitter and tiny letters don't count). Handwriting has turns too ("m" retraces its
 * legs, "w" and "z" have sharp corners), so a scribble only erases what it covers: strokes it crosses at least
 * CROSSINGS times whose bounding box it covers by COVER or more. On empty paper, or next to ink, nothing is erased.
 */
const REVERSALS = 3;
const REVERSAL_DEG = 150;
const SCRIBBLE_MS = 600;
const LEG_PX = 14;
const CROSSINGS = 2;
const COVER = 0.5;

export type TimedPt = { x: number; y: number; t: number };

/** Is this path (any units; `px` = CSS px per unit) a fast zig-zag? Returns its bounding box (units) if so. */
export function detectScribble(path: TimedPt[], px: number): Box | null {
  if (path.length < 8) return null;
  // resample every 4 CSS px of arc, interpolating: a fast scribble at 60 Hz sends points 20–50 px apart
  const step = 4 / px;
  const rs: TimedPt[] = [path[0]];
  let carry = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (!d) continue;
    let at = step - carry;
    while (at <= d) {
      const f = at / d;
      rs.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, t: a.t + (b.t - a.t) * f });
      at += step;
    }
    carry = d - (at - step);
  }
  const k = 3;
  if (rs.length < k * 2 + 2) return null;
  const cosMax = Math.cos((REVERSAL_DEG * Math.PI) / 180);
  // turning points: the path doubles back over a 12 px window; one per run of candidates (the sharpest)
  const turns: { i: number; t: number }[] = [];
  let run: { i: number; c: number } | null = null;
  for (let i = k; i + k < rs.length; i++) {
    const ix = rs[i].x - rs[i - k].x;
    const iy = rs[i].y - rs[i - k].y;
    const ox = rs[i + k].x - rs[i].x;
    const oy = rs[i + k].y - rs[i].y;
    const l = Math.hypot(ix, iy) * Math.hypot(ox, oy);
    const c = l ? (ix * ox + iy * oy) / l : 1;
    if (c < cosMax) {
      if (!run || c < run.c) run = { i, c };
    } else if (run) {
      turns.push({ i: run.i, t: rs[run.i].t });
      run = null;
    }
  }
  if (run) turns.push({ i: run.i, t: rs[run.i].t });
  // legs between turns long enough to be a scribble, not jitter
  const legOk = (a: number, b: number) => {
    let d = 0;
    for (let j = a + 1; j <= b; j++) d += Math.hypot(rs[j].x - rs[j - 1].x, rs[j].y - rs[j - 1].y);
    return d * px >= LEG_PX;
  };
  const kept: { i: number; t: number }[] = [];
  for (const tp of turns) if (!kept.length || legOk(kept[kept.length - 1].i, tp.i)) kept.push(tp);
  for (let s = 0; s + REVERSALS - 1 < kept.length; s++) {
    if (kept[s + REVERSALS - 1].t - kept[s].t <= SCRIBBLE_MS) {
      let box: Box | null = null;
      for (const p of path) box = unionBox(box, { x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      return box;
    }
  }
  return null;
}

/**
 * The strokes a scribble erases: crossed CROSSINGS+ times by the scribble's path and covered by its box (COVER of
 * their own box). `r` = hit radius in the strokes' units.
 */
export function scribbleTargets(path: TimedPt[], box: Box, strokes: Iterable<Stroke>, r: number): Stroke[] {
  const out: Stroke[] = [];
  // a fast scribble's points are far apart: walk its segments every r so no crossing is jumped over
  const dense: { x: number; y: number }[] = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / r));
    for (let k = 1; k <= n; k++) dense.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  for (const s of strokes) {
    const b = strokeBox(s);
    const ix = Math.max(0, Math.min(b.x2, box.x2) - Math.max(b.x1, box.x1));
    const iy = Math.max(0, Math.min(b.y2, box.y2) - Math.max(b.y1, box.y1));
    const area = Math.max(1e-6, (b.x2 - b.x1) * (b.y2 - b.y1));
    if ((ix * iy) / area < COVER) continue;
    let crossings = 0;
    let inside = false;
    for (const p of dense) {
      const hit = strokeHit(s, p.x, p.y, r);
      if (hit && !inside) crossings++;
      inside = hit;
    }
    if (crossings >= CROSSINGS) out.push(s);
  }
  return out;
}

// ------------------------------------------------------------------ word-groups

/**
 * Strokes written together with the ones under a long-press: neighbours in writing order (the strokes array) whose
 * box is within `gap` of the group's, on the same line. Grows both ways from the seed, so a whole word comes along.
 */
export function wordGroup(strokes: Stroke[], seed: Set<string>, gap: number): Set<string> {
  const idx = strokes.map((s, i) => (seed.has(s.id) ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return seed;
  const out = new Set(seed);
  let box: Box | null = null;
  for (const i of idx) box = unionBox(box, strokeBox(strokes[i]));
  const near = (b: Box) => {
    const g = box!;
    const dx = Math.max(0, b.x1 - g.x2, g.x1 - b.x2);
    const overlapY = Math.min(b.y2, g.y2) - Math.max(b.y1, g.y1);
    return dx <= gap && overlapY > -gap * 0.25;
  };
  let lo = Math.min(...idx);
  let hi = Math.max(...idx);
  for (let i = lo - 1; i >= 0 && hi - i < 200; i--) {
    const b = strokeBox(strokes[i]);
    if (strokes[i].tool !== "pen" || !near(b)) break;
    out.add(strokes[i].id);
    box = unionBox(box, b);
    lo = i;
  }
  for (let i = hi + 1; i < strokes.length && i - lo < 200; i++) {
    const b = strokeBox(strokes[i]);
    if (strokes[i].tool !== "pen" || !near(b)) break;
    out.add(strokes[i].id);
    box = unionBox(box, b);
    hi = i;
  }
  return out;
}

/** points of a stroke (×Q flat) as page-unit points with no time (hit tests) */
export const flatToPts = (pts: number[]) => {
  const o: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < pts.length; i += 3) o.push({ x: pts[i] / Q, y: pts[i + 1] / Q });
  return o;
};

// ------------------------------------------------------------------ the toast

export type InkToastMsg = { id: number; text: string; action?: { label: string; run: () => void } };
let toast: InkToastMsg | null = null;
let toastSeq = 0;
let toastTimer = 0;
const toastListeners = new Set<() => void>();
const toastEmit = () => toastListeners.forEach((l) => l());

/** A short message over the ink surfaces ("Erased · Undo", "Undone"); one at a time. */
export function inkToast(text: string, action?: InkToastMsg["action"]) {
  toast = { id: ++toastSeq, text, action };
  toastEmit();
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast = null;
    toastEmit();
  }, 4000);
}
export function dismissInkToast() {
  toast = null;
  toastEmit();
}
export function useInkToast(): InkToastMsg | null {
  return useSyncExternalStore(
    (cb) => {
      toastListeners.add(cb);
      return () => toastListeners.delete(cb);
    },
    () => toast,
    () => null
  );
}

// ------------------------------------------------------------------ the floating pen ↔ eraser switch

const SWITCH_KEY = "hk.ink.toolSwitch";
let switchPref: boolean | null = null;
const switchListeners = new Set<() => void>();
function readSwitch(): boolean {
  if (switchPref !== null) return switchPref;
  if (typeof window === "undefined") return false;
  let v: string | null = null;
  try {
    v = window.localStorage.getItem(SWITCH_KEY);
  } catch {
    // storage unavailable
  }
  // on by default where there's a hand on the glass (touch devices); "0" / "1" once the learner chose
  switchPref = v === null ? (navigator.maxTouchPoints || 0) > 0 : v === "1";
  return switchPref;
}
/** Show the floating pen ↔ eraser switch on this device (the mode menu's toggle). */
export function useToolSwitch(): boolean {
  return useSyncExternalStore(
    (cb) => {
      switchListeners.add(cb);
      return () => switchListeners.delete(cb);
    },
    readSwitch,
    () => false
  );
}
export function setToolSwitch(on: boolean) {
  switchPref = on;
  try {
    window.localStorage.setItem(SWITCH_KEY, on ? "1" : "0");
  } catch {
    // storage unavailable
  }
  switchListeners.forEach((l) => l());
}
