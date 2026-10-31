"use client";

/**
 * How ink is written on this device: one setting shared by every ink surface (notebook pages, the passage pad,
 * written-paper sheets, annotate on lessons), remembered per device.
 *
 *   pen     Pen only: an active stylus (Apple Pencil, S Pen, Surface Pen; pointerType "pen") writes; fingers scroll
 *           and zoom, and a touch that lands while the pen is down is ignored (a resting palm).
 *   touch   Stylus or finger (the default until a pen is seen): one contact writes, two fingers pan / pinch. For
 *           passive "universal" styluses (a rubber or disc nib), which the browser reports exactly like a finger.
 *           Palms are rejected by contact size where the browser reports it (TouchArbiter below).
 *   scroll  Nothing writes: every pointer scrolls (pages: pan and zoom; lessons: the mode takes no input).
 *
 * Storage (localStorage): hk.ink.input = "pen" | "touch" | "scroll" once chosen (or auto-switched); before that the
 * old hk.ink.pencilOnly ("1" pen, "0" touch) is read, so a device keeps what it had. hk.ink.penSeen = "1" once a
 * pen event arrived (annotate's old hk.annot.pen counts too). hk.ink.tiltTouch = "1" once a "touch" contact
 * reported tilt (a stylus the browser calls touch: such a device is never auto-switched to Pen only). The setting is
 * written back to hk.ink.pencilOnly as well, so an older build open in another tab agrees.
 *
 * Auto-detect: the first pen event switches a device that never chose to Pen only (the surfaces say so in one line),
 * unless touch contacts on this device have reported tilt. In Pen only, when the device has never sent a pen event
 * (or its "finger" drags carry stylus traits: tilt or real pressure), three single-finger drags that would have been
 * strokes raise a one-tap hint on the surface's mode control: "Your stylus looks like a finger…".
 */
import { useSyncExternalStore } from "react";

export type InkInputMode = "pen" | "touch" | "scroll";
/** where a hint shows: the mode control of the surface the drags happened on */
export type InkSurface = "page" | "pad" | "paper" | "annotate";

export const INPUT_MODES: { id: InkInputMode; label: string; help: string }[] = [
  { id: "pen", label: "Pen only", help: "Apple Pencil, S Pen, Surface Pen: only the pen writes. Fingers scroll and zoom." },
  { id: "touch", label: "Stylus/finger", help: "Universal (rubber-tip) stylus or a finger: one contact writes. Two fingers scroll and zoom." },
  { id: "scroll", label: "Scroll", help: "Reading: nothing writes, every touch scrolls." },
];
export const MODE_LABEL: Record<InkInputMode, string> = { pen: "Pen only", touch: "Stylus/finger", scroll: "Scroll" };
/** the one line a surface shows when the first pen switched the device to Pen only */
export const PEN_FOUND = "Pen found: now only the pen writes; fingers scroll and zoom. Universal stylus? Choose Stylus/finger under Input.";
export const STYLUS_TIP = "Universal (rubber-tip) stylus? Choose Stylus/finger: it writes like a finger. Two fingers scroll.";

const KEY = "hk.ink.input";
const OLD_KEY = "hk.ink.pencilOnly";
const PEN_SEEN = "hk.ink.penSeen";
const OLD_PEN_SEEN = "hk.annot.pen";
const TILT_TOUCH = "hk.ink.tiltTouch";
const HINT_OFF = "hk.ink.penHintOff";
const CONTACT = "hk.ink.contact";
/** single-finger drags in Pen only before the hint */
const HINT_AFTER = 3;

export type InkInputState = {
  mode: InkInputMode;
  /** the learner (or the first pen) set the mode; until then a pen switches it */
  chosen: boolean;
  penSeen: boolean;
  /** the surface showing "your stylus looks like a finger", or null */
  hint: InkSurface | null;
};

const SERVER: InkInputState = { mode: "touch", chosen: false, penSeen: false, hint: null };
let state: InkInputState = SERVER;
let loaded = false;
let drags = 0;
let tiltTouch = false;
let hintOff = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function read(k: string): string | null {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
}
function write(k: string, v: string) {
  try {
    window.localStorage.setItem(k, v);
  } catch {
    // storage unavailable: the setting holds for this visit
  }
}

function load() {
  const v = read(KEY);
  const old = read(OLD_KEY);
  const penSeen = read(PEN_SEEN) === "1" || read(OLD_PEN_SEEN) === "1";
  let mode: InkInputMode = "touch";
  let chosen = false;
  if (v === "pen" || v === "touch" || v === "scroll") {
    mode = v;
    chosen = true;
  } else if (old !== null) {
    mode = old === "1" ? "pen" : "touch";
    chosen = true;
  } else if (penSeen) mode = "pen";
  tiltTouch = read(TILT_TOUCH) === "1";
  hintOff = read(HINT_OFF) === "1";
  state = { mode, chosen, penSeen, hint: null };
}

function init() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  load();
  // another tab changed it
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY && e.key !== OLD_KEY && e.key !== PEN_SEEN) return;
    const hint = state.hint;
    load();
    state = { ...state, hint };
    emit();
  });
}

export function getInkInput(): InkInputState {
  init();
  return state;
}

export function subscribeInkInput(cb: () => void): () => void {
  init();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The device's ink input setting (every surface reads this one). */
export function useInkInput(): InkInputState {
  return useSyncExternalStore(subscribeInkInput, getInkInput, () => SERVER);
}

/** The learner picked a mode. */
export function setInkInputMode(mode: InkInputMode) {
  init();
  write(KEY, mode);
  write(OLD_KEY, mode === "pen" ? "1" : "0");
  drags = 0;
  state = { ...state, mode, chosen: true, hint: null };
  emit();
}

/**
 * A pen pointer went down. Returns true when this switched the device to Pen only (the caller says so in one line):
 * the first pen on a device that never chose, unless its "touch" contacts have shown tilt (a stylus reported as
 * touch, sometimes as pen: Stylus/finger already takes both).
 */
export function notePen(): boolean {
  init();
  let switched = false;
  if (!state.penSeen) write(PEN_SEEN, "1");
  if (!state.chosen && !tiltTouch && state.mode !== "pen") {
    write(KEY, "pen");
    write(OLD_KEY, "1");
    switched = true;
  }
  const next: InkInputState = { ...state, penSeen: true, mode: switched ? "pen" : state.mode, chosen: state.chosen || switched, hint: null };
  drags = 0;
  if (next.mode !== state.mode || next.penSeen !== state.penSeen || next.chosen !== state.chosen || state.hint) {
    state = next;
    emit();
  }
  return switched;
}

/**
 * In Pen only, a single finger dragged where a pen would have written. After HINT_AFTER of them, on a device that
 * never sent a pen event (or with stylus traits on these "finger" contacts), the hint shows on `surface`.
 */
export function noteFingerDrag(surface: InkSurface, traits: { tilt: boolean; pressure: boolean }) {
  init();
  if (state.mode !== "pen" || hintOff || state.hint) return;
  if (state.penSeen && !traits.tilt && !traits.pressure) return;
  drags++;
  if (drags < HINT_AFTER) return;
  state = { ...state, hint: surface };
  emit();
}

/** The hint's ×: not again on this device. */
export function dismissInkHint() {
  init();
  hintOff = true;
  write(HINT_OFF, "1");
  drags = 0;
  if (state.hint) {
    state = { ...state, hint: null };
    emit();
  }
}

function noteTiltTouch() {
  if (tiltTouch) return;
  tiltTouch = true;
  write(TILT_TOUCH, "1");
}

// ------------------------------------------------------------------ contacts: palm rejection for Stylus/finger

/**
 * Palm thresholds, in CSS px on the contact's larger axis (PointerEvent width / height: Chrome on Android fills
 * them from the touch ellipse; 1 × 1 or 0 means "not reported").
 *
 * A fingertip is ~8–11 mm across and a universal stylus's rubber or disc nib ~4–7 mm; the heel of a hand or the side
 * of the palm is 20 mm and more. A CSS px is ~0.19 mm on a 1.5-DPR Android tablet (Honor Pad X9: 2000 px over
 * 11.5") and ~0.2 mm on an iPad, so a fingertip reads ~40–58 px at most, a nib ~20–35, a palm 100+. Some
 * browsers quantise: WebKit reports 2 × the touch radius, which on iPad steps in ~21 px (42, 63…).
 *
 * Where the browser reports no sizes (every contact 0 × 0 or 1 × 1: the Honor Pad X9 with its Dot Pencil 2, in
 * Chrome and in the Claude app's WebView, and many in-app browsers; remembered per device in hk.ink.sizes), no
 * contact is ever a palm by size, and the order and motion rules of TouchArbiter are all there is.
 *
 * So: anything ≥ PALM_MAX (64 px, ~12 mm) is a palm. Once this device's writing contacts are known (an average of
 * the contacts that wrote, kept per device), the line comes down to 3 × that, never under PALM_MIN (40 px): a
 * stylus nib that reads ~14 px makes 42 px contacts palms, while a finger that reads 30 px keeps the line at 64.
 * A contact that grows past the line (a palm lands edge first) is re-classified; a small contact that lands right
 * next to a resting palm (within its radius + SATELLITE px) belongs to the hand.
 */
export const PALM_MAX = 64;
export const PALM_MIN = 40;
const PALM_K = 3;
const SATELLITE = 40;
/**
 * Two fingers are told from a stroke plus a brushing hand by motion, never by timing alone (a hand that touches the
 * glass just after the nib lands used to turn the stroke into a scroll). A second contact that lands more than
 * GESTURE_MS into a stroke already moving is the hand, always. Otherwise it makes a two-finger gesture only if,
 * within GESTURE_MS of landing, it travels GESTURE_PX while the writing contact travels FOLLOW_PX
 * with it, in about the same direction and by a similar amount (a pan), or both move along the line between them in
 * opposite senses, closing or opening by PINCH_PX (a pinch). Until then the stroke goes on; a second contact that stays put, or moves its own way, is ignored.
 */
const GESTURE_MS = 250;
const GESTURE_PX = 24;
const FOLLOW_PX = 10;
const PINCH_PX = 30;
/** a contact that lands and lifts this fast without moving is a phantom (an active pen's double touch, a brush) */
const PHANTOM_MS = 80;
/** a contact that has moved less than this (px) is resting (a knuckle, a finger, a palm with no size) */
const REST_PX = 8;
/** …and has been down this long (ms): a nib that has just landed hasn't moved yet, but it isn't resting */
const REST_MS = 150;
/** a contact that took the pen from a resting one is a two-finger scroll if the resting one moves off this soon */
const LATE_GESTURE_MS = 300;
/** a stroke that turns into a palm this young is dropped; older, it ends where it was */
const GROW_DROP_MS = 400;
/**
 * Pressure counts as real only when it spans a wide range: P_DISTINCT values, max − min over P_RANGE, max over
 * P_TOP. Fingers report a constant (0, 0.5, 1) or junk; the Honor Pad X9 with its Dot Pencil 2, in the Claude app's
 * Android WebView, reports "touch" with pressure 0.02–0.05 (3 distinct values), which drawn as pressure would be
 * near invisible: such strokes simulate pressure from speed, like a finger.
 */
const P_DISTINCT = 3;
const P_RANGE = 0.25;
const P_TOP = 0.3;
const HISTORY_MAX = 600;

export type ContactPoint = { clientX: number; clientY: number; pressure: number };
type PointerLike = { pointerId: number; pointerType: string; clientX: number; clientY: number; pressure: number; width: number; height: number; tiltX: number; tiltY: number; timeStamp: number };

export type Contact = {
  id: number;
  type: string;
  t0: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  /** largest size seen (CSS px) */
  w: number;
  h: number;
  sized: boolean;
  moves: number;
  /** furthest from where it landed (px) */
  dist: number;
  pMin: number;
  pMax: number;
  pVals: Set<number>;
  tilt: boolean;
  palm: boolean;
  role: "draw" | "gesture" | "pan" | "rest" | "palm";
  /** a contact that gave the pen away while resting: where it was (it moving off makes a late two-finger gesture) */
  restAt: [number, number] | null;
  /** when this contact started writing */
  drawSince: number;
  /** a second contact still being judged: when it landed, where the writer was then, and the gap between them */
  pending: { t: number; at: [number, number]; gap: number } | null;
  /** where it has been since it landed, for a contact that takes over the pen late */
  hist: ContactPoint[];
};

/** real pressure: it varies, and not only between the "no pressure" values */
export const pressureVaries = (c: Contact) => c.pVals.size >= P_DISTINCT && c.pMax - c.pMin > P_RANGE && c.pMax > P_TOP;
/** a stylus the browser reports as "touch": tilt, or real pressure, on a contact that isn't a palm */
export const stylusLike = (c: Contact) => !c.palm && (c.tilt || pressureVaries(c));

export type ArbiterEvent =
  /** this contact writes now: start its stroke from contact.hist (and follow its moves) */
  | { type: "draw"; id: number }
  /** drop this contact's stroke (a palm, a resting knuckle, the first finger of a two-finger gesture) */
  | { type: "drop"; id: number }
  /** end this contact's stroke where it is (it became a palm after writing a while) */
  | { type: "end"; id: number }
  /** these two contacts pan / pinch from now */
  | { type: "gesture"; ids: [number, number] }
  /** the gesture is over; `left` is the contact still down (it pans until it lifts), if any */
  | { type: "gesture-end"; left: number | null };

let typical = 0;
let typicalLoaded = false;
function typicalSize(): number {
  if (!typicalLoaded && typeof window !== "undefined") {
    typicalLoaded = true;
    const n = Number(read(CONTACT));
    if (Number.isFinite(n) && n > 0) typical = n;
  }
  return typical;
}
function learnSize(s: number) {
  const t = typicalSize();
  typical = t ? t * 0.8 + s * 0.2 : s;
  write(CONTACT, String(Math.round(typical * 10) / 10));
}
/** the palm line for this device now (CSS px) */
export function palmLine(): number {
  const t = typicalSize();
  return t ? Math.min(PALM_MAX, Math.max(PALM_MIN, t * PALM_K)) : PALM_MAX;
}

const dev = () => process.env.NODE_ENV === "development";

/**
 * Dev only: a one-line summary per contact (type, pressure range, size, tilt, what it did), in the console and on
 * window.__hkInkContacts, to tune the thresholds from real devices.
 */
export function logContact(where: string, c: Pick<Contact, "id" | "type" | "pMin" | "pMax" | "w" | "h" | "tilt" | "role" | "dist" | "t0">, tilt: [number, number], end: number) {
  if (!dev() || typeof window === "undefined") return;
  const row = {
    where,
    type: c.type,
    p: c.pMin <= c.pMax ? `${c.pMin.toFixed(2)}–${c.pMax.toFixed(2)}` : "–",
    size: `${Math.round(c.w)}×${Math.round(c.h)}`,
    tilt: `${tilt[0]}/${tilt[1]}`,
    role: c.role,
    moved: Math.round(c.dist),
    ms: Math.round(end - c.t0),
  };
  const w = window as unknown as { __hkInkContacts?: (typeof row)[] };
  (w.__hkInkContacts ||= []).push(row);
  if (w.__hkInkContacts.length > 200) w.__hkInkContacts.shift();
  console.debug(`[ink] ${where} ${row.type} p=${row.p} size=${row.size} tilt=${row.tilt} → ${row.role} (${row.moved}px, ${row.ms}ms)`);
}

/**
 * Per-pointer facts for any pointer type (pressure range, size, tilt), kept from down to up: the dev log, and the
 * stylus traits of "finger" drags in Pen only (for the hint).
 */
export class ContactLog {
  private m = new Map<number, Contact & { tx: number; ty: number }>();
  /** the reason shown in the ?inkdebug=1 overlay when a pointer lifts (null: the arbiter reports it instead) */
  constructor(
    private where: string,
    private debugEnd: string | null = "lifted"
  ) {}
  down(e: PointerLike, role: Contact["role"] = e.pointerType === "touch" ? "rest" : "draw") {
    const c = { ...newContact(e), role, tx: e.tiltX || 0, ty: e.tiltY || 0 };
    this.m.set(e.pointerId, c);
    return c;
  }
  move(e: PointerLike) {
    const c = this.m.get(e.pointerId);
    if (!c) return;
    sample(c, e);
    if (e.tiltX || e.tiltY) {
      c.tx = e.tiltX;
      c.ty = e.tiltY;
    }
  }
  get(id: number) {
    return this.m.get(id);
  }
  setRole(id: number, role: Contact["role"]) {
    const c = this.m.get(id);
    if (c) c.role = role;
  }
  up(e: { pointerId: number; timeStamp: number }) {
    const c = this.m.get(e.pointerId);
    if (!c) return null;
    this.m.delete(e.pointerId);
    if (c.type === "touch" && c.tilt) noteTiltTouch();
    if (c.type !== "mouse") logContact(this.where, c, [c.tx, c.ty], e.timeStamp);
    if (c.type !== "mouse" && this.debugEnd) debugNote(this.where, c, null, `${c.role} (${getInkInput().mode} mode)`, this.debugEnd, e.timeStamp);
    return c;
  }
}

function newContact(e: PointerLike): Contact {
  const c: Contact = {
    id: e.pointerId,
    type: e.pointerType,
    t0: e.timeStamp,
    x0: e.clientX,
    y0: e.clientY,
    x: e.clientX,
    y: e.clientY,
    w: 0,
    h: 0,
    sized: false,
    moves: 0,
    dist: 0,
    pMin: Infinity,
    pMax: -Infinity,
    pVals: new Set(),
    tilt: false,
    palm: false,
    role: "draw",
    hist: [],
    restAt: null,
    drawSince: e.timeStamp,
    pending: null,
  };
  sample(c, e, true);
  return c;
}

function sample(c: Contact, e: PointerLike, first = false) {
  c.x = e.clientX;
  c.y = e.clientY;
  if (!first) {
    c.moves++;
    c.dist = Math.max(c.dist, Math.hypot(c.x - c.x0, c.y - c.y0));
  }
  const w = e.width || 0;
  const h = e.height || 0;
  if (w > 1.5 || h > 1.5) {
    if (!c.sized && c.type === "touch") noteSized();
    c.sized = true;
    c.w = Math.max(c.w, w);
    c.h = Math.max(c.h, h);
  }
  const p = e.pressure || 0;
  // 0 (no contact info), 0.5 (the "no pressure" default) and 1 say nothing about a stylus
  if (p > 0 && p < 1 && p !== 0.5) {
    c.pMin = Math.min(c.pMin, p);
    c.pMax = Math.max(c.pMax, p);
    if (c.pVals.size < 8) c.pVals.add(Math.round(p * 1000));
  }
  if (e.tiltX || e.tiltY) c.tilt = true;
  if (c.hist.length < HISTORY_MAX) c.hist.push({ clientX: e.clientX, clientY: e.clientY, pressure: p });
}

/**
 * Who writes, in Stylus/finger mode, among the touch contacts on a surface. Feed it every touch pointer event of the
 * surface; it returns what changed.
 *   - Palms (by size, where sizes are reported) never write.
 *   - The first contact writes at once.
 *   - A second contact is judged by motion (GESTURE_MS…): with the writer, a two-finger pan or pinch (the stroke so
 *     far is dropped); otherwise it is ignored and the stroke goes on. A phantom (lands and lifts in PHANTOM_MS
 *     without moving) changes nothing.
 *   - A writer that only rests (a knuckle, a palm with no size) gives the pen to a contact that moves, which writes
 *     from where it landed; a writer that lifts having barely moved while a later contact is down was a phantom: the
 *     later one writes.
 *   - A stylus-like contact (tilt, real pressure) is preferred over plain ones.
 * Every decision, with its reason, goes to the ?inkdebug=1 overlay.
 */
export class TouchArbiter {
  readonly contacts = new Map<number, Contact>();
  private log: ContactLog;
  /** the contact writing, if any */
  drawer: number | null = null;
  gesture: [number, number] | null = null;

  constructor(private where: string) {
    this.log = new ContactLog(where, null);
  }

  get(id: number) {
    return this.contacts.get(id);
  }
  /** contacts that aren't palms */
  live() {
    return [...this.contacts.values()].filter((c) => !c.palm);
  }

  private note(c: Contact, decision: string, reason: string, now: number) {
    debugNote(this.where, c, this.contacts, reason, decision, now);
  }

  private isPalm(c: Contact) {
    return c.sized && Math.max(c.w, c.h) >= palmLine();
  }
  private nearPalm(c: Contact) {
    for (const o of this.contacts.values()) {
      if (o === c || !o.palm) continue;
      if (Math.hypot(c.x - o.x, c.y - o.y) < Math.max(o.w, o.h) / 2 + SATELLITE) return true;
    }
    return false;
  }
  private writer() {
    return this.drawer !== null ? this.contacts.get(this.drawer) || null : null;
  }

  down(e: PointerLike): ArbiterEvent[] {
    const c = newContact(e);
    this.log.down(e);
    this.contacts.set(c.id, c);
    const now = e.timeStamp;
    if (this.isPalm(c)) {
      c.palm = true;
      c.role = "palm";
      this.note(c, "palm", `size ${Math.round(Math.max(c.w, c.h))} ≥ ${Math.round(palmLine())} px`, now);
      return [];
    }
    if (this.nearPalm(c)) {
      c.palm = true;
      c.role = "palm";
      this.note(c, "palm", "lands beside a resting palm", now);
      return [];
    }
    if (this.gesture) {
      c.role = "rest";
      this.note(c, "ignore", "a two-finger gesture is on", now);
      return [];
    }
    const d = this.writer();
    if (!d) {
      // a contact left from a gesture is panning: a new one joins it in a new gesture
      const pan = [...this.contacts.values()].find((o) => o.role === "pan");
      if (pan) {
        this.note(c, "gesture", "joins the finger still panning", now);
        return this.startGesture(pan, c);
      }
      c.role = "draw";
      c.drawSince = now;
      this.drawer = c.id;
      this.note(c, "write", "first contact", now);
      return [{ type: "draw", id: c.id }];
    }
    // a stylus beats whatever else writes; a contact already known as a stylus keeps the pen
    if (stylusLike(c) && !stylusLike(d)) {
      this.note(c, "write", "tilt: a stylus, takes the pen", now);
      return this.takeOver(d, c, now);
    }
    c.role = "rest";
    if (stylusLike(d)) {
      this.note(c, "ignore", "the writer is a stylus", now);
      return [];
    }
    // two fingers land together: a contact landing well into a stroke that is under way is the hand
    if (now - d.drawSince > GESTURE_MS && d.dist >= REST_PX) {
      this.note(c, "ignore", `lands ${Math.round(now - d.drawSince)} ms into a stroke under way`, now);
      return [];
    }
    // judged by how it moves (two fingers move together; a brushing hand doesn't)
    c.pending = { t: now, at: [d.x, d.y], gap: Math.hypot(c.x - d.x, c.y - d.y) };
    this.note(c, "wait", "second contact: a gesture only if it moves with the writer", now);
    return [];
  }

  private takeOver(from: Contact, to: Contact, now: number): ArbiterEvent[] {
    from.role = "rest";
    from.restAt = [from.x, from.y];
    from.pending = null;
    to.role = "draw";
    to.pending = null;
    to.drawSince = now;
    this.drawer = to.id;
    return [{ type: "drop", id: from.id }, { type: "draw", id: to.id }];
  }

  private startGesture(a: Contact, b: Contact): ArbiterEvent[] {
    a.role = "gesture";
    b.role = "gesture";
    a.pending = b.pending = null;
    if (this.drawer === a.id || this.drawer === b.id) this.drawer = null;
    this.gesture = [a.id, b.id];
    return [{ type: "gesture", ids: [a.id, b.id] }];
  }

  /** the second contacts still being judged, against the writer's motion since each landed */
  private judge(now: number): ArbiterEvent[] {
    const d = this.writer();
    for (const c of this.contacts.values()) {
      const pd = c.pending;
      if (!pd) continue;
      if (!d) {
        c.pending = null;
        continue;
      }
      const cx = c.x - c.x0;
      const cy = c.y - c.y0;
      const dx = d.x - pd.at[0];
      const dy = d.y - pd.at[1];
      const lc = Math.hypot(cx, cy);
      const ld = Math.hypot(dx, dy);
      if (lc > GESTURE_PX && ld > FOLLOW_PX && !stylusLike(d)) {
        const cos = (cx * dx + cy * dy) / (lc * ld);
        const ratio = lc / ld;
        const gapChange = Math.abs(Math.hypot(c.x - d.x, c.y - d.y) - pd.gap);
        if (cos > 0.6 && ratio > 0.4 && ratio < 2.5) {
          this.note(c, "gesture", `moved ${Math.round(lc)} px with the writer (${Math.round(ld)} px, same way): two-finger pan`, now);
          return [{ type: "drop", id: d.id }, ...this.startGesture(d, c)];
        }
        // a pinch: both move along the line between them, in opposite senses (a hand brushing past doesn't)
        const ax = c.x0 - pd.at[0];
        const ay = c.y0 - pd.at[1];
        const al = Math.hypot(ax, ay) || 1;
        const cu = (cx * ax + cy * ay) / al;
        const du = (dx * ax + dy * ay) / al;
        if (cu * du < 0 && Math.abs(cu) > 0.6 * lc && Math.abs(du) > 0.6 * ld && gapChange > PINCH_PX) {
          this.note(c, "gesture", `opened/closed ${Math.round(gapChange)} px on the writer: pinch`, now);
          return [{ type: "drop", id: d.id }, ...this.startGesture(d, c)];
        }
      }
      if (now - pd.t > GESTURE_MS) {
        c.pending = null;
        this.note(c, "ignore", `didn't move with the writer in ${GESTURE_MS} ms (moved ${Math.round(lc)} px, writer ${Math.round(ld)} px)`, now);
      }
    }
    return [];
  }

  move(e: PointerLike): ArbiterEvent[] {
    const c = this.contacts.get(e.pointerId);
    if (!c) return [];
    sample(c, e);
    this.log.move(e);
    const now = e.timeStamp;
    if (c.palm) return [];
    if (this.isPalm(c)) {
      // a palm that landed edge first
      c.palm = true;
      c.pending = null;
      const role = c.role;
      c.role = "palm";
      this.note(c, "palm", `grew to ${Math.round(Math.max(c.w, c.h))} px`, now);
      if (role === "draw") {
        this.drawer = null;
        return [{ type: now - c.t0 < GROW_DROP_MS ? "drop" : "end", id: c.id }];
      }
      if (role === "gesture") return this.endGesture(c.id);
      return [];
    }
    const judged = this.judge(now);
    if (judged.length) return judged;
    // the first finger of a two-finger scroll that landed late: it gave the pen to the second while still, and now
    // moves off with it (a palm or a knuckle stays put)
    if (c.role === "rest" && c.restAt && Math.hypot(c.x - c.restAt[0], c.y - c.restAt[1]) > REST_PX * 1.5) {
      const d = this.writer();
      if (d && !stylusLike(d) && now - d.drawSince < LATE_GESTURE_MS) {
        this.note(c, "gesture", "the resting first finger moved off with the second: two-finger pan", now);
        return [{ type: "drop", id: d.id }, ...this.startGesture(c, d)];
      }
      c.restAt = null;
    }
    if (c.role === "rest") {
      const d = this.writer();
      // a resting contact that turns out to be the stylus takes the pen from a plain contact
      if (stylusLike(c) && (!d || !stylusLike(d))) {
        this.note(c, "write", "real pressure: a stylus, takes the pen", now);
        if (!d) {
          c.role = "draw";
          c.pending = null;
          c.drawSince = now;
          this.drawer = c.id;
          return [{ type: "draw", id: c.id }];
        }
        return this.takeOver(d, c, now);
      }
      // the writer has only been resting (a knuckle, a palm with no size) and this one moves: it writes
      if (d && !stylusLike(d) && d.dist < REST_PX && now - d.drawSince > REST_MS && c.dist > REST_PX && !c.restAt) {
        this.note(c, "write", `moves (${Math.round(c.dist)} px) while the writer rests (${Math.round(d.dist)} px): takes the pen`, now);
        this.note(d, "drop", "was only resting", now);
        return this.takeOver(d, c, now);
      }
    }
    return [];
  }

  private endGesture(gone: number): ArbiterEvent[] {
    const g = this.gesture;
    if (!g || (g[0] !== gone && g[1] !== gone)) return [];
    this.gesture = null;
    const other = g[0] === gone ? g[1] : g[0];
    const o = this.contacts.get(other);
    if (o && !o.palm && o.id !== gone) {
      o.role = "pan";
      return [{ type: "gesture-end", left: o.id }];
    }
    return [{ type: "gesture-end", left: null }];
  }

  up(e: { pointerId: number; timeStamp: number }): ArbiterEvent[] {
    const c = this.contacts.get(e.pointerId);
    if (!c) return [];
    const now = e.timeStamp;
    this.contacts.delete(e.pointerId);
    const lc = this.log.get(e.pointerId);
    if (lc) lc.role = c.role;
    this.log.up(e);
    const out: ArbiterEvent[] = [];
    const age = Math.round(now - c.t0);
    if (this.drawer === c.id) {
      this.drawer = null;
      // a writer that barely moved and lifted fast while a later contact is down was a phantom: the later one writes
      const next = c.dist < REST_PX && now - c.t0 < PHANTOM_MS * 2 ? [...this.contacts.values()].find((o) => !o.palm && o.role === "rest" && o.t0 > c.t0) : undefined;
      if (next) {
        this.note(c, "drop", `phantom writer: lifted in ${age} ms without moving`, now);
        this.note(next, "write", "the contact still down writes", now);
        next.role = "draw";
        next.pending = null;
        next.drawSince = now;
        this.drawer = next.id;
        return [{ type: "drop", id: c.id }, { type: "draw", id: next.id }];
      }
      this.note(c, "stroke", `ends (${Math.round(c.dist)} px, ${age} ms)`, now);
      // a contact that wrote teaches the palm line this device's writing size
      if (c.sized && c.dist > REST_PX) learnSize(Math.max(c.w, c.h));
    } else if (c.pending && now - c.pending.t < PHANTOM_MS && c.dist < REST_PX) {
      this.note(c, "ignore", `phantom: lifted in ${Math.round(now - c.pending.t)} ms without moving`, now);
    } else if (c.role === "rest" || c.role === "palm") {
      this.note(c, "lifted", c.role === "palm" ? "palm lifted" : "ignored contact lifted", now);
    } else {
      this.note(c, "lifted", c.role, now);
    }
    if (this.gesture) out.push(...this.endGesture(c.id));
    return out;
  }

  /** the surface lost every pointer (it unmounted, the mode changed) */
  reset() {
    this.contacts.clear();
    this.drawer = null;
    this.gesture = null;
  }

  get name() {
    return this.where;
  }
}

// ------------------------------------------------------------------ ?inkdebug=1: the on-screen decision log

/**
 * Production diagnostics: open any ink surface with ?inkdebug=1 (remembered in localStorage hk.ink.debug; the
 * overlay's Off button or ?inkdebug=0 turns it off) and an overlay lists the last contact decisions (pointer type,
 * size, pressure, contacts down, each one's travel, decision, reason) with "Copy log". Nothing is sent anywhere.
 */
export type InkDebugRow = { t: number; where: string; type: string; id: number; size: string; p: string; n: number; travel: string; decision: string; reason: string };
const DEBUG_KEY = "hk.ink.debug";
const SIZES_KEY = "hk.ink.sizes";
let debugLoaded = false;
let debugOn = false;
let debugRows: InkDebugRow[] = [];
let debugState = { on: false, rows: debugRows };
const debugListeners = new Set<() => void>();
const debugEmit = () => {
  debugState = { on: debugOn, rows: debugRows };
  debugListeners.forEach((l) => l());
};

function debugInit() {
  if (debugLoaded || typeof window === "undefined") return;
  debugLoaded = true;
  try {
    const q = new URLSearchParams(window.location.search).get("inkdebug");
    if (q === "1") write(DEBUG_KEY, "1");
    else if (q === "0") window.localStorage.removeItem(DEBUG_KEY);
  } catch {
    // no URL / storage
  }
  debugOn = read(DEBUG_KEY) === "1";
  debugState = { on: debugOn, rows: debugRows };
}

/** sizes reported by this device's touch contacts: "yes" once any was, else unknown (shown in the overlay) */
function noteSized() {
  if (read(SIZES_KEY) !== "yes") write(SIZES_KEY, "yes");
}
export const deviceSizes = () => (read(SIZES_KEY) === "yes" ? "reported" : "none seen (0×0): order and motion rules only");

export function setInkDebug(on: boolean) {
  debugInit();
  debugOn = on;
  if (on) write(DEBUG_KEY, "1");
  else
    try {
      window.localStorage.removeItem(DEBUG_KEY);
    } catch {
      // storage unavailable
    }
  debugEmit();
}

function debugNote(where: string, c: Contact, all: Map<number, Contact> | null, reason: string, decision: string, now: number) {
  debugInit();
  if (!debugOn) return;
  const others = all ? [...all.values()] : [c];
  if (!others.includes(c)) others.push(c);
  const row: InkDebugRow = {
    t: Math.round(now),
    where,
    type: c.type,
    id: c.id,
    size: c.sized ? `${Math.round(c.w)}×${Math.round(c.h)}` : "0×0",
    p: c.pMin <= c.pMax ? `${c.pMin.toFixed(2)}–${c.pMax.toFixed(2)}` : "–",
    n: all ? all.size : 1,
    travel: others.map((o) => `#${o.id}:${Math.round(o.dist)}`).join(" "),
    decision,
    reason,
  };
  debugRows = [...debugRows.slice(-99), row];
  // listeners may re-render: never inside the pointer handler's own frame
  queueMicrotask(debugEmit);
}

export function useInkDebug(): { on: boolean; rows: InkDebugRow[] } {
  return useSyncExternalStore(
    (cb) => {
      debugInit();
      debugListeners.add(cb);
      return () => debugListeners.delete(cb);
    },
    () => {
      debugInit();
      return debugState;
    },
    () => SERVER_DEBUG
  );
}
const SERVER_DEBUG = { on: false, rows: [] as InkDebugRow[] };

/** the overlay's "Copy log": every row kept, with the device facts */
export function inkDebugText(): string {
  const head = [
    `ink debug ${new Date().toISOString()}`,
    `ua: ${navigator.userAgent}`,
    `screen: ${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}, maxTouchPoints ${navigator.maxTouchPoints}`,
    `mode: ${getInkInput().mode} (chosen: ${getInkInput().chosen}, pen seen: ${getInkInput().penSeen}), sizes: ${deviceSizes()}, palm line: ${Math.round(palmLine())} px`,
  ];
  return [...head, ...debugRows.map((r) => `${r.t} ${r.where} ${r.type}#${r.id} ${r.size} p=${r.p} n=${r.n} [${r.travel}] ${r.decision}: ${r.reason}`)].join("\n");
}
