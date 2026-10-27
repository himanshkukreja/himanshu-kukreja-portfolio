/**
 * First-party client tracker (tracking contract v2). Everything lands in `analytics_events`
 * through POST /api/beat.
 *
 *   import { track } from "@/lib/track";
 *   track("lesson_open", { course, week, lesson, stage });
 *
 * - visitor id: localStorage `analytics_visitor_id` (same key as the v1 tracker, so history stays
 *   continuous); session id: sessionStorage `analytics_session_id`, rotated after 30 min idle.
 * - page views on route change (wired by <AnalyticsTracker/>); the first view of a session carries
 *   the entry info (external referrer only on a real landing, utm_*, ?ref=).
 * - engaged time per view: counted only while the tab is visible AND the user was active
 *   (scroll / pointer / key / touch) in the last 60 s; plus max scroll depth %. Sent as a
 *   `page_leave` on route change / pagehide / tab hidden (sendBeacon, fetch keepalive fallback)
 *   and as a heartbeat every 30 s while engaged. The server upserts one row per view, so
 *   heartbeats never double count.
 * - product events are batched (flush after 1.5 s or at 20 items).
 * - privacy: GPC → ephemeral ids (nothing persisted); localStorage `hk.notrack=1` → nothing
 *   is sent at all; /admin is never tracked. Signed-in users send their access token, which the
 *   server verifies — a client-side user id is never trusted.
 */
import { isLocalHost } from "@/lib/analytics/exclude";
import { supabaseClient } from "@/lib/supabase-client";
import { emitProduct } from "@/lib/analytics/bus";

export type TrackProps = Record<string, string | number | boolean | null | undefined>;

const VID_KEY = "analytics_visitor_id";
const SID_KEY = "analytics_session_id";
const SID_LAST_KEY = "analytics_session_last";
export const NOTRACK_KEY = "hk.notrack";

const ENDPOINT = "/api/beat";
const IDLE_SESSION_MS = 30 * 60_000;
const ACTIVE_WINDOW_MS = 60_000;
const HEARTBEAT_MS = 30_000;
const TICK_MS = 5_000;
const FLUSH_MS = 1_500;
const FLUSH_AT = 20;
const MAX_ITEMS = 20;
const MAX_BYTES = 14_000;

type Item = Record<string, unknown> & { k: "pv" | "pl" | "ev"; ts: number };

type View = {
  id: string;
  path: string;
  sid: string;
  start: number;
  engaged: number;
  lastTick: number;
  lastActive: number;
  depth: number;
  sentEngaged: number;
  lastBeat: number;
  beats: number;
  sentFinal: boolean;
  item: Item;
};

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";

let initialised = false;
let ephemeral = false;
let memVid = "";
let memSid = "";
let memSidLast = 0;
let createdVisitor = false;
let firstViewOfLoad = true;
let token: string | null = null;
let tokenReady: Promise<void> | null = null;
let queue: Item[] = [];
let flushTimer: number | null = null;
let view: View | null = null;
let depthRaf = 0;

// ---------------------------------------------------------------------------------------------
// ids

const rid = (n = 12) => {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
};
const uuid = () => (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${rid(8)}-${rid(4)}-${rid(4)}-${rid(4)}-${rid(12)}`);

function safeGet(store: Storage | undefined, key: string): string | null {
  try {
    return store ? store.getItem(key) : null;
  } catch {
    return null;
  }
}
function safeSet(store: Storage | undefined, key: string, value: string) {
  try {
    store?.setItem(key, value);
  } catch {
    /* private mode / quota — fall back to memory */
  }
}

function privacySignal(): boolean {
  // Global Privacy Control only: it is a legal opt-out signal in several places. Do Not Track is
  // deprecated and carries no legal meaning, so it no longer switches analytics off.
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

export function isNoTrack(): boolean {
  if (!isBrowser()) return true;
  // localhost (dev servers) is never tracked; the owner's test accounts set hk.notrack on sign-in
  if (isLocalHost(window.location.hostname)) return true;
  return safeGet(window.localStorage, NOTRACK_KEY) === "1";
}

/** Admin toggle: stop (or resume) tracking this browser. */
export function setNoTrack(on: boolean) {
  if (!isBrowser()) return;
  try {
    if (on) window.localStorage.setItem(NOTRACK_KEY, "1");
    else window.localStorage.removeItem(NOTRACK_KEY);
  } catch {
    /* ignore */
  }
}

const isAdminPath = (p: string) => p === "/admin" || p.startsWith("/admin/");

function visitorId(): string {
  if (ephemeral) {
    if (!memVid) memVid = uuid();
    return memVid;
  }
  let v = safeGet(window.localStorage, VID_KEY);
  if (!v) {
    v = uuid();
    createdVisitor = true;
    safeSet(window.localStorage, VID_KEY, v);
    if (safeGet(window.localStorage, VID_KEY) !== v) {
      ephemeral = true; // storage unavailable
      memVid = v;
    }
  }
  return v;
}

function storedSession(now: number): { sid: string; expired: boolean } {
  const sid = ephemeral ? memSid : safeGet(window.sessionStorage, SID_KEY) || "";
  const last = ephemeral ? memSidLast : Number(safeGet(window.sessionStorage, SID_LAST_KEY) || 0);
  // A pre-v2 session id without a timestamp keeps going (no artificial split on deploy).
  return { sid, expired: !sid || (!!last && now - last > IDLE_SESSION_MS) };
}

/** Current session id; rotates after 30 min without activity. `fresh` = a new session started. */
function session(): { sid: string; fresh: boolean } {
  const now = Date.now();
  const cur = storedSession(now);
  let sid = cur.sid;
  const fresh = cur.expired;
  if (fresh) sid = uuid();
  if (ephemeral) {
    memSid = sid;
    memSidLast = now;
  } else {
    safeSet(window.sessionStorage, SID_KEY, sid);
    safeSet(window.sessionStorage, SID_LAST_KEY, String(now));
  }
  return { sid, fresh };
}

// ---------------------------------------------------------------------------------------------
// auth token (verified server side)

function watchAuth() {
  tokenReady = Promise.race([
    supabaseClient.auth
      .getSession()
      .then(({ data }) => {
        token = data.session?.access_token ?? null;
      })
      .catch(() => {}),
    new Promise<void>((r) => window.setTimeout(r, 1500)),
  ]);
  try {
    supabaseClient.auth.onAuthStateChange((_e, s) => {
      token = s?.access_token ?? null;
    });
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------------------------
// transport

function payload(items: Item[]) {
  let tz: string | undefined;
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    tz = undefined;
  }
  return {
    v: 2,
    vid: visitorId(),
    sid: view?.sid ?? session().sid,
    tk: token ?? undefined,
    sw: window.screen?.width,
    sh: window.screen?.height,
    now: Date.now(),
    lang: navigator.language,
    tz,
    items,
  };
}

function send(items: Item[], unloading: boolean) {
  if (!items.length) return;
  // Resolve page titles lazily: app-router metadata lands after the route effect runs.
  for (const it of items) if (it.k === "pv" && !it.ti && view && it.id === view.id) it.ti = document.title;
  const body = JSON.stringify(payload(items));
  if (body.length > MAX_BYTES && items.length > 1) {
    const half = Math.ceil(items.length / 2);
    send(items.slice(0, half), unloading);
    send(items.slice(half), unloading);
    return;
  }
  if (unloading && typeof navigator.sendBeacon === "function") {
    try {
      if (navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain" }))) return;
    } catch {
      /* fall through */
    }
  }
  try {
    void fetch(ENDPOINT, { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
  } catch {
    /* ignore */
  }
}

function flush(unloading = false) {
  if (flushTimer) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!queue.length) return;
  if (isNoTrack()) {
    queue = [];
    return;
  }
  const items = queue;
  queue = [];
  const go = () => {
    for (let i = 0; i < items.length; i += MAX_ITEMS) send(items.slice(i, i + MAX_ITEMS), unloading);
  };
  if (unloading || !tokenReady) go();
  else void tokenReady.then(go);
}

function enqueue(item: Item, now = false) {
  if (isNoTrack()) return;
  queue.push(item);
  if (now || queue.length >= FLUSH_AT) flush();
  else if (!flushTimer) flushTimer = window.setTimeout(() => flush(), FLUSH_MS);
}

// ---------------------------------------------------------------------------------------------
// engagement

function accrue(now = Date.now()) {
  if (!view) return;
  if (document.visibilityState === "visible") {
    const end = Math.min(now, view.lastActive + ACTIVE_WINDOW_MS);
    if (end > view.lastTick) view.engaged += end - view.lastTick;
  }
  view.lastTick = now;
}

function measureDepth() {
  depthRaf = 0;
  if (!view) return;
  const doc = document.documentElement;
  const h = Math.max(doc.scrollHeight, document.body?.scrollHeight ?? 0);
  const seen = window.scrollY + window.innerHeight;
  const pct = h <= 0 ? 100 : Math.min(100, Math.round((seen / h) * 100));
  if (pct > view.depth) view.depth = pct;
}

function onActivity() {
  if (!view) return;
  const now = Date.now();
  accrue(now);
  view.lastActive = now;
}

function onScroll() {
  onActivity();
  if (!depthRaf) depthRaf = window.requestAnimationFrame(measureDepth);
}

function leaveItem(v: View, final: boolean): Item {
  return { k: "pl", pv: v.id, p: v.path, d: Math.round(v.engaged), dp: v.depth, ts: Date.now(), ...(final ? { f: 1 } : {}) };
}

function sendLeave(final: boolean, unloading: boolean) {
  if (!view) return;
  accrue();
  measureDepth();
  // nothing new since the last beat → skip (the first one always goes, so 0-second bounces have depth)
  if (view.beats > 0 && view.engaged === view.sentEngaged && (!final || view.sentFinal)) return;
  view.sentEngaged = view.engaged;
  view.lastBeat = Date.now();
  view.beats++;
  view.sentFinal = final;
  queue.push(leaveItem(view, final));
  flush(unloading);
}

function tick() {
  if (!view) return;
  accrue();
  const now = Date.now();
  if (document.visibilityState === "visible" && now - view.lastBeat >= HEARTBEAT_MS && view.engaged - view.sentEngaged >= 1000) {
    sendLeave(false, false);
  }
}

function init() {
  if (initialised || !isBrowser()) return;
  initialised = true;
  ephemeral = privacySignal();
  watchAuth();
  const opts: AddEventListenerOptions = { passive: true, capture: true };
  window.addEventListener("scroll", onScroll, opts);
  window.addEventListener("pointerdown", onActivity, opts);
  window.addEventListener("pointermove", onActivity, opts);
  window.addEventListener("keydown", onActivity, opts);
  window.addEventListener("touchstart", onActivity, opts);
  window.addEventListener("wheel", onActivity, opts);
  document.addEventListener("visibilitychange", () => {
    if (!view) return;
    if (document.visibilityState === "hidden") {
      sendLeave(true, true);
      flush(true);
    } else {
      view.lastTick = Date.now();
      view.lastActive = Date.now();
    }
  });
  window.addEventListener("pagehide", () => {
    sendLeave(true, true);
    flush(true);
  });
  window.addEventListener("pageshow", (e) => {
    if ((e as PageTransitionEvent).persisted && view) {
      view.lastTick = Date.now();
      view.lastActive = Date.now();
    }
  });
  window.setInterval(tick, TICK_MS);
}

// ---------------------------------------------------------------------------------------------
// public API

function entryInfo(): Record<string, unknown> {
  const out: Record<string, unknown> = { e: 1 };
  try {
    const q = new URLSearchParams(window.location.search);
    const u: Record<string, string> = {};
    const pick = (k: string, as: string) => {
      const v = q.get(k);
      if (v) u[as] = v.slice(0, 150);
    };
    pick("utm_source", "s");
    pick("utm_medium", "m");
    pick("utm_campaign", "c");
    pick("utm_term", "t");
    pick("utm_content", "ct");
    if (Object.keys(u).length) out.u = u;
    const ref = q.get("ref") || q.get("source");
    if (ref) out.ref = ref.slice(0, 100);
    if (firstViewOfLoad && document.referrer) {
      const r = new URL(document.referrer);
      if (r.host !== window.location.host) out.r = document.referrer.slice(0, 1000);
    }
  } catch {
    /* ignore */
  }
  return out;
}

/** Start a page view for `path` (called on every app-router navigation). */
export function pageview(path?: string) {
  if (!isBrowser()) return;
  init();
  const p = path || window.location.pathname;
  const now = Date.now();
  // StrictMode double effects / duplicate calls for the same route
  if (view && view.path === p && now - view.start < 1000) return;

  if (view) sendLeave(true, false);
  if (isAdminPath(p) || isNoTrack()) {
    view = null;
    return;
  }

  const { sid, fresh } = session();
  visitorId(); // sets createdVisitor on a first-ever visit
  const item: Item = {
    k: "pv",
    id: rid(12),
    p,
    ts: now,
    ...(fresh ? entryInfo() : {}),
    ...(createdVisitor && firstViewOfLoad ? { n: 1 } : {}),
  };
  firstViewOfLoad = false;
  view = { id: item.id as string, path: p, sid, start: now, engaged: 0, lastTick: now, lastActive: now, depth: 0, sentEngaged: 0, lastBeat: now, beats: 0, sentFinal: false, item };
  enqueue(item);
  window.setTimeout(measureDepth, 600);
}

/** Product event. Props: flat string / number / boolean values (others are dropped). */
export function track(name: string, props: TrackProps = {}) {
  if (!isBrowser()) return;
  init();
  const p = window.location.pathname;
  if (isAdminPath(p) || isNoTrack()) return;
  // the session expired after a long idle: open a fresh entry view for the current page first
  if (storedSession(Date.now()).expired || !view) pageview(p);
  else session(); // keep the session alive
  const pr: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) pr[k] = v;
  }
  enqueue({ k: "ev", n: name, p, pr, ts: Date.now(), ...(view ? { pv: view.id } : {}) });
  // optional PostHog / GA4 mirror (no-op unless configured; see src/lib/analytics/client.ts)
  emitProduct(name, pr);
}
