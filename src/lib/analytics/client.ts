"use client";

/**
 * Browser runtime for the optional third-party analytics: PostHog (product analytics, session
 * replay, heatmaps) and Google Analytics 4. Mounted by <AnalyticsProvider/> in the root layout.
 *
 * Dormant by default: with no NEXT_PUBLIC_POSTHOG_KEY / NEXT_PUBLIC_GA_ID nothing below loads or
 * sends anything (posthog-js is a lazy chunk that is never fetched, gtag.js is never injected).
 *
 * Never loads / captures:
 *   - on /admin* (admin's own browsing): not loaded when the visit starts there; when navigating
 *     into /admin, PostHog drops every event in before_send and pauses replay, GA is disabled
 *     with the official `ga-disable-<id>` flag before the navigation commits;
 *   - with localStorage hk.notrack=1 (admin "Exclude my visits", visitor opt-out on /privacy);
 *   - with Global Privacy Control on (Do Not Track is not treated as an opt-out).
 *
 * PostHog talks to /hkr (first-party proxy, see next.config.ts) so ad blockers don't drop it.
 * GA cannot be proxied without server-side GTM, so it is blockable by design.
 *
 * Offline reading: product events that happen with no connection (lib/offline/connectivity says
 * so) never go to posthog-js, whose retry queue lives in memory, gives up after a few failed
 * tries and is gone with the page. They are flagged `offline: true` and kept in a durable queue
 * (./offlineQueue) with their original time and a fixed uuid, then sent once the site is reachable
 * straight to PostHog's batch endpoint through the same proxy, with `timestamp` = when they
 * happened. (posthog.capture() with a past timestamp would also move the live session's activity
 * clock back and split the reader's current session, so the flush builds the events itself.)
 */
import { isExcludedEmail, isLocalHost } from "./exclude";
import type { CaptureResult, PostHog, Properties } from "posthog-js";
import { supabaseClient } from "@/lib/supabase-client";
import { startEngagedClock, type EngagedClock } from "@/lib/learn/engagedClock";
import { isOffline, pageSource, reportNetworkFailure } from "@/lib/offline/connectivity";
import { onProduct, onRouteStart, type ProductProps } from "./bus";
import { GA_ID, POSTHOG_KEY, POSTHOG_PROXY_PATH, POSTHOG_UI_HOST, gaEnabled, posthogEnabled } from "./config";
import { clearEvents, enqueueEvent, newEventId, pendingEvents, removeEvents, withFlushLock, type QueuedEvent } from "./offlineQueue";

export const NOTRACK_KEY = "hk.notrack";
/** Fired on window when the visitor's opt-out state changes (for toggles). */
export const OPTOUT_EVENT = "hk:analytics-optout";

type Gtag = (...args: unknown[]) => void;
type GaWindow = Window & { dataLayer?: unknown[]; gtag?: Gtag } & Record<string, unknown>;

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";
export const isAdminPath = (p: string) => p === "/admin" || p.startsWith("/admin/");

export function privacySignal(): boolean {
  if (!isBrowser()) return false;
  // Global Privacy Control only: it is a legal opt-out signal in several places. Do Not Track is
  // deprecated and carries no legal meaning, so it no longer switches analytics off.
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

export function isOptedOut(): boolean {
  if (!isBrowser()) return false;
  // localhost (dev servers) is never tracked
  if (isLocalHost(window.location.hostname)) return true;
  try {
    return window.localStorage.getItem(NOTRACK_KEY) === "1";
  } catch {
    return false;
  }
}

/** Analytics may run for this visitor at all (path checks are separate). */
const allowed = () => !isOptedOut() && !privacySignal();
const currentPath = () => (isBrowser() ? window.location.pathname : "/");

/* ───────────────────────────── content context ───────────────────────────── */

const LEARN_RESERVED = new Set(["dashboard", "notes", "bookmarks", "review", "arena", "notebook"]);

export type ContentRef =
  | { content_type: "lesson"; course: string; week: string; lesson: string }
  | { content_type: "story"; story: string };

/** /learn/<course>/<week>/<slug> → lesson, /stories/<slug> → story. */
export function contentOf(pathname: string): ContentRef | null {
  const seg = pathname.split("/").filter(Boolean).map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
  if (seg[0] === "learn" && seg.length === 4 && !LEARN_RESERVED.has(seg[1])) return { content_type: "lesson", course: seg[1], week: seg[2], lesson: seg[3] };
  if (seg[0] === "stories" && seg.length === 2) return { content_type: "story", story: seg[1] };
  return null;
}

function pageContext(pathname: string): Properties {
  const c = contentOf(pathname);
  if (!c) return {};
  const hash = window.location.hash.slice(1);
  return { ...c, ...(hash && hash.length <= 80 ? { stage: hash } : {}), page_title: document.title };
}

/* ───────────────────────────── PostHog ───────────────────────────── */

let ph: PostHog | null = null;
let phLoading: Promise<PostHog | null> | null = null;
let replayPaused = false;

function beforeSend(ev: CaptureResult | null): CaptureResult | null {
  if (!ev) return ev;
  const path = currentPath();
  if (isAdminPath(path) || !allowed()) return null;
  // posthog-js's own events ($pageview, autocapture…) while offline: best effort, but labelled
  if (isOffline() && ev.properties && ev.properties.offline === undefined) ev.properties = { ...ev.properties, offline: true };
  if (ev.event === "$pageview" || ev.event === "$pageleave") {
    const p = (ev.properties?.$pathname as string | undefined) || path;
    ev.properties = { ...ev.properties, ...pageContext(p) };
  }
  return ev;
}

/**
 * posthog-js is ~300 KB of script: fetching and running it while the page is still loading cost
 * mobile visitors ~0.5 s of blocked main thread. So it starts once the page has loaded and the
 * browser is idle (at most ~1.5 s later). Nothing is lost meanwhile: capture() puts events fired
 * before it's ready in the durable queue, sent with their real time once posthog-js is up.
 */
/** Run once the page has loaded and the browser is idle (at most ~1.5 s later). */
function afterLoadIdle(fn: () => void) {
  const go = () => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) idle(fn, { timeout: 1500 });
    else window.setTimeout(fn, 300);
  };
  if (document.readyState === "complete") go();
  else window.addEventListener("load", go, { once: true });
}

let phScheduled = false;
function schedulePosthog() {
  if (ph || phLoading || phScheduled) return;
  phScheduled = true;
  afterLoadIdle(() => void loadPosthog());
}

function loadPosthog(): Promise<PostHog | null> {
  if (!posthogEnabled()) return Promise.resolve(null);
  if (phLoading) return phLoading;
  // The replay recorder ships in the same chunk: posthog-js would otherwise fetch it as a second
  // script after its remote config arrives, and visits that end (or whose fetch fails) before then
  // were never recorded.
  phLoading = Promise.all([import("posthog-js"), import("posthog-js/dist/posthog-recorder")])
    .then(([{ default: posthog }]) => {
      posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_PROXY_PATH,
        ui_host: POSTHOG_UI_HOST,
        defaults: "2026-05-30",
        // App-router navigations are pushState: one $pageview per history change, no manual call.
        capture_pageview: "history_change",
        capture_pageleave: true,
        autocapture: true,
        rageclick: true,
        capture_dead_clicks: true,
        // batch heatmap points every 5 s instead of every 1 s (fewer $$heatmap requests)
        capture_heatmaps: { flush_interval_milliseconds: 5000 },
        // Every visitor gets a person profile so anonymous journeys show up in /admin/journeys.
        person_profiles: "always",
        // GPC is checked above (privacySignal); Do Not Track alone doesn't turn analytics off
        respect_dnt: false,
        disable_session_recording: false,
        session_recording: {
          maskAllInputs: true,
          // Anything marked data-ph-mask (auth inputs, notes, comment editors, admin) is masked.
          maskTextSelector: "[data-ph-mask], [data-ph-mask] *",
        },
        before_send: beforeSend,
      });
      ph = posthog;
      // Record from the start, without waiting for the remote config to switch replay on (the
      // project records every session anyway: no sampling, triggers or linked flag)
      if (!isAdminPath(currentPath()) && allowed()) {
        try {
          posthog.startSessionRecording(true);
        } catch {
          /* ignore */
        }
      }
      syncGates(currentPath());
      applyContext();
      if (pendingEvents().length) scheduleFlush(2000);
      return posthog;
    })
    .catch(() => {
      // offline and the chunk isn't cached: try again once the connection is back
      phLoading = null;
      return null;
    });
  return phLoading;
}

/* ───────────────────────────── Google Analytics 4 ───────────────────────────── */

let gaLoaded = false;

function gtag(...args: unknown[]) {
  const w = window as unknown as GaWindow;
  if (typeof w.gtag === "function") w.gtag(...args);
}

function loadGa() {
  if (!gaEnabled() || gaLoaded) return;
  gaLoaded = true;
  const w = window as unknown as GaWindow;
  w.dataLayer = w.dataLayer || [];
  w.gtag = function gtagShim() {
    // gtag.js expects the Arguments object itself, not an array
    // eslint-disable-next-line prefer-rest-params
    (w.dataLayer as unknown[]).push(arguments);
  };
  w[`ga-disable-${GA_ID}`] = false;
  // Consent Mode v2 defaults: analytics allowed (we only get here without GPC or an opt-out),
  // everything advertising-related denied.
  gtag("consent", "default", {
    analytics_storage: privacySignal() ? "denied" : "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  gtag("js", new Date());
  // Initial page_view comes from config; later app-router navigations are counted by GA4's
  // Enhanced measurement → "Page changes based on browser history events" (on by default).
  gtag("config", GA_ID);
  // the queue (dataLayer) is live now; only the script download waits for an idle moment after load
  afterLoadIdle(() => {
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
    document.head.appendChild(s);
  });
}

function setGaDisabled(off: boolean) {
  if (!GA_ID || !isBrowser()) return;
  (window as unknown as GaWindow)[`ga-disable-${GA_ID}`] = off;
}

/* ───────────────────────────── gates ───────────────────────────── */

/** Apply the admin / opt-out gates for `path` to whatever is loaded. */
function syncGates(path: string) {
  const off = isAdminPath(path) || !allowed();
  setGaDisabled(off);
  if (!ph) return;
  if (off && !replayPaused) {
    replayPaused = true;
    try {
      ph.stopSessionRecording();
    } catch {
      /* ignore */
    }
  } else if (!off && replayPaused) {
    replayPaused = false;
    try {
      ph.startSessionRecording();
    } catch {
      /* ignore */
    }
  }
}

/* ───────────────────────────── identity ───────────────────────────── */

type AuthUser = {
  id: string;
  email?: string | null;
  created_at?: string;
  last_sign_in_at?: string | null;
  app_metadata?: { provider?: string };
  user_metadata?: { full_name?: string; name?: string };
};

const LOGIN_SEEN_KEY = "hk.an.login";
const IDENT_KEY = "hk.an.ident";

function identify(user: AuthUser) {
  const name = user.user_metadata?.full_name || user.user_metadata?.name || undefined;
  const provider = user.app_metadata?.provider || "email";
  if (ph) {
    // identify() on an already-identified id re-sends a $set on every page load: skip unless
    // the id or the profile changed (each $set is a billable event)
    const sig = `${user.id}|${user.email ?? ""}|${name ?? ""}|${provider}`;
    let prev: string | null = null;
    try {
      prev = window.localStorage.getItem(IDENT_KEY);
    } catch {
      /* ignore */
    }
    try {
      if (ph.get_distinct_id() !== user.id || prev !== sig) {
        ph.identify(user.id, { email: user.email ?? undefined, name, provider }, { signed_up_at: user.created_at });
        window.localStorage.setItem(IDENT_KEY, sig);
      }
    } catch {
      /* ignore */
    }
  }
  if (gaLoaded) gtag("set", { user_id: user.id });

  // sign_up / login once per real sign-in (last_sign_in_at only changes on an actual sign-in)
  const mark = `${user.id}:${user.last_sign_in_at || ""}`;
  let seen: string | null = null;
  try {
    seen = window.localStorage.getItem(LOGIN_SEEN_KEY);
  } catch {
    /* ignore */
  }
  if (seen === mark || !user.last_sign_in_at) return;
  try {
    window.localStorage.setItem(LOGIN_SEEN_KEY, mark);
  } catch {
    /* ignore */
  }
  // first visit after the record was created → treat as the sign-up
  const created = user.created_at ? Date.parse(user.created_at) : 0;
  const isNew = created > 0 && Date.parse(user.last_sign_in_at) - created < 10 * 60_000 && Date.now() - created < 60 * 60_000;
  if (ph) ph.capture(isNew ? "signed_up" : "signed_in", { provider });
  if (gaLoaded) gtag("event", isNew ? "sign_up" : "login", { method: provider });
}

let authWatched = false;
function watchAuth() {
  if (authWatched) return;
  authWatched = true;
  try {
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        try {
          ph?.reset();
          window.localStorage.removeItem(IDENT_KEY);
        } catch {
          /* ignore */
        }
        if (gaLoaded) gtag("set", { user_id: null });
        return;
      }
      const user = session?.user as AuthUser | undefined;
      // the owner's test accounts: this browser stops being tracked, now and after sign-out
      if (user && isExcludedEmail(user.email)) {
        try {
          window.localStorage.setItem(NOTRACK_KEY, "1");
          ph?.stopSessionRecording?.();
          ph?.opt_out_capturing();
          ph?.reset();
        } catch {
          /* ignore */
        }
        return;
      }
      if (!user || isAdminPath(currentPath()) || !allowed()) return;
      // posthog-js may still be loading: identify once it's there
      void (phLoading ?? Promise.resolve(null)).then(() => identify(user));
    });
  } catch {
    /* ignore */
  }
}

/* ───────────────────────────── product events fan-out ───────────────────────────── */

const quiz = { answered: 0, correct: 0, firstCorrect: 0, ctx: {} as ProductProps };

function flushQuiz() {
  if (!quiz.answered) return;
  if (gaLoaded && !isAdminPath(currentPath()) && allowed())
    gtag("event", "quiz_answers", { ...quiz.ctx, answered: quiz.answered, correct: quiz.correct, first_try_correct: quiz.firstCorrect, transport_type: "beacon" });
  quiz.answered = quiz.correct = quiz.firstCorrect = 0;
  quiz.ctx = {};
}

/** GA4 gets the key moments only (PostHog gets everything). */
function toGa(name: string, p: ProductProps) {
  if (!gaLoaded) return;
  switch (name) {
    case "lesson_complete":
      gtag("event", "lesson_complete", { course: p.course, week: p.week, lesson: p.lesson, minutes: p.minutes });
      break;
    case "case_closed":
      gtag("event", "case_closed", { story: p.slug, minutes: p.minutes });
      break;
    case "trial_result":
      gtag("event", "trial_result", { week: p.week, part: p.part, score: p.score, total: p.total, passed: p.passed });
      break;
    case "ask_ai":
      gtag("event", "ask_ai", { client: p.client, kind: p.kind });
      break;
    case "share_link":
      gtag("event", "share", { method: p.channel, content_type: p.kind });
      break;
    case "quiz_answer":
      quiz.answered++;
      if (p.correct === true) quiz.correct++;
      if (p.correct === true && p.first === true) quiz.firstCorrect++;
      quiz.ctx = { course: p.course ?? "", week: p.week ?? "", lesson: p.lesson ?? "" };
      break;
  }
}

function onProductEvent(name: string, props: ProductProps) {
  if (isAdminPath(currentPath()) || !allowed()) return;
  capture(name, props);
  // GA4 can't take events late with their real time: online moments only
  if (!isOffline()) toGa(name, props);
}

/* ───────────────────────────── offline queue ───────────────────────────── */

/** Context added to every event captured with no connection. */
function offlineProps(): Properties {
  const src = pageSource();
  const shell = window.location.pathname.startsWith("/learn/offline") ? "library" : "fallback";
  return { offline: true, ...(src && src !== "network" ? { offline_source: src === "shell" ? shell : src } : {}) };
}

/**
 * One path per event: online → posthog-js (events fired while it is still downloading wait for
 * it); offline, or posthog-js couldn't load → the durable queue, sent later with the real time.
 */
function capture(name: string, props: Properties) {
  if (isAdminPath(currentPath()) || !allowed()) return;
  if (isOffline()) {
    queueEvent(name, { ...props, ...offlineProps() });
    return;
  }
  if (ph) ph.capture(name, props);
  // (the connection may have gone while it loaded: a page answered from the saved copy says so late)
  else if (phLoading) void phLoading.then((p) => (p && !isOffline() ? p.capture(name, props) : queueEvent(name, isOffline() ? { ...props, ...offlineProps() } : props)));
  else queueEvent(name, props);
}

function queueEvent(name: string, props: Properties) {
  const id = newEventId();
  const ts = Date.now();
  let p: Properties = { ...ctx, ...props, $current_url: window.location.href, $pathname: window.location.pathname };
  let full = false;
  if (ph) {
    try {
      // the full property set of this moment (session, device, super properties); read-only, so
      // the live session is untouched
      p = ph.calculateEventProperties(name, p, new Date(ts), id, true);
      full = true;
    } catch {
      /* fall back to the basics, completed at flush time */
    }
  }
  enqueueEvent({ id, e: name, p, ts, ...(full ? { full: 1 as const } : {}) });
  scheduleFlush();
}

let flushTimer: number | null = null;
let flushing: Promise<number> | null = null;

function scheduleFlush(delayMs = 1500) {
  if (flushTimer) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushOffline();
  }, delayMs);
}

function batchItem(q: QueuedEvent, p: PostHog) {
  let properties = q.p as Properties;
  if (!q.full) {
    try {
      properties = p.calculateEventProperties(q.e, q.p as Properties, new Date(), q.id, true);
    } catch {
      properties = { ...q.p, distinct_id: p.get_distinct_id(), token: POSTHOG_KEY, $lib: "web" };
    }
    // computed now, not then: today's session/window ids don't belong to an event from earlier
    const { $session_id: _s, $window_id: _w, ...rest } = properties;
    void _s;
    void _w;
    properties = { ...rest, ...q.p };
  }
  return { event: q.e, properties, timestamp: new Date(q.ts).toISOString(), uuid: q.id };
}

async function postBatch(batch: ReturnType<typeof batchItem>[]): Promise<"ok" | "retry" | "drop"> {
  try {
    const res = await fetch(`${POSTHOG_PROXY_PATH}/batch/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      // sent_at lets PostHog correct the device clock against its own (timestamps stay relative)
      body: JSON.stringify({ api_key: POSTHOG_KEY, sent_at: new Date().toISOString(), batch }),
    });
    if (res.ok) return "ok";
    // a malformed batch never gets better: drop it instead of retrying forever
    return res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429 ? "drop" : "retry";
  } catch {
    reportNetworkFailure();
    return "retry";
  }
}

/** Send what was queued offline, once (resolves to how many were sent). */
export function flushOffline(): Promise<number> {
  if (flushing) return flushing;
  if (!isBrowser()) return Promise.resolve(0);
  if (!allowed()) {
    clearEvents();
    return Promise.resolve(0);
  }
  const p = ph;
  // posthog-js drops bot traffic (headless browsers, crawlers); the direct flush does the same
  if (p && (p as PostHog & { _is_bot?: () => boolean })._is_bot?.()) {
    clearEvents();
    return Promise.resolve(0);
  }
  if (!p || isOffline() || isAdminPath(currentPath()) || !pendingEvents().length) {
    if (p && !isOffline()) syncPersonProps();
    return Promise.resolve(0);
  }
  flushing = (async () => {
    let sent = 0;
    await withFlushLock(async () => {
      const list = pendingEvents(); // re-read under the lock: another tab may have sent some
      for (let i = 0; i < list.length; i += 50) {
        const chunk = list.slice(i, i + 50);
        const result = await postBatch(chunk.map((q) => batchItem(q, p)));
        if (result === "retry") break;
        removeEvents(chunk.map((q) => q.id));
        if (result === "ok") sent += chunk.length;
      }
    });
    syncPersonProps();
    return sent;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/* ───────────────────────────── analytics context ───────────────────────────── */

/** Super + person properties: how the site is shown, what's saved for offline reading. */
export type AnalyticsContext = { display_mode?: string; offline_saved_count?: number; offline_saved_bytes?: number };

const ctx: Record<string, string | number> = {};
const PERSON_KEY = "hk.an.pp";
let personTimer: number | null = null;

export function setAnalyticsContext(patch: AnalyticsContext) {
  let changed = false;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || ctx[k] === v) continue;
    ctx[k] = v;
    changed = true;
  }
  if (changed) applyContext();
}

function applyContext() {
  if (!ph || !Object.keys(ctx).length || isAdminPath(currentPath()) || !allowed()) return;
  try {
    ph.register({ ...ctx }); // local only (posthog persistence): rides on every later event
  } catch {
    /* ignore */
  }
  if (personTimer) window.clearTimeout(personTimer);
  personTimer = window.setTimeout(syncPersonProps, 3000);
}

/** Person properties for cohorts, sent only when they changed (each $set is a billable event). */
function syncPersonProps() {
  if (!ph || isOffline() || !Object.keys(ctx).length || isAdminPath(currentPath()) || !allowed()) return;
  const set: Properties = { ...ctx };
  if (ctx.display_mode && ctx.display_mode !== "browser" && ctx.display_mode !== "fullscreen") set.pwa_installed = true;
  let sig = "";
  try {
    sig = `${ph.get_distinct_id()}|${JSON.stringify(set)}`;
    if (window.localStorage.getItem(PERSON_KEY) === sig) return;
  } catch {
    /* ignore */
  }
  try {
    ph.setPersonProperties(set);
    window.localStorage.setItem(PERSON_KEY, sig);
  } catch {
    /* ignore */
  }
}

/* ───────────────────────────── reading depth ───────────────────────────── */

const READ_MARKS = [25, 50, 75, 100] as const;

type Reader = { path: string; ref: ContentRef; clock: EngagedClock; sent: Set<number>; timer: number; onScroll: () => void };
let reader: Reader | null = null;

function stopReader() {
  if (!reader) return;
  reader.clock.stop();
  window.clearInterval(reader.timer);
  window.removeEventListener("scroll", reader.onScroll);
  reader = null;
}

/** Depth through the article body (.course-content), 0–100, by the bottom of the viewport. */
function articleDepth(): { pct: number; minutes: number } | null {
  const root = document.querySelector<HTMLElement>(".course-content");
  if (!root) return null;
  const r = root.getBoundingClientRect();
  if (r.height < 50) return null;
  const seen = window.innerHeight - r.top;
  const pct = Math.max(0, Math.min(100, Math.round((seen / r.height) * 100)));
  const words = (root.textContent || "").split(/\s+/).length;
  return { pct, minutes: Math.max(1, words / 230) };
}

function checkReader() {
  const rd = reader;
  if (!rd) return;
  const d = articleDepth();
  if (!d) return;
  const secs = rd.clock.seconds();
  for (const m of READ_MARKS) {
    if (rd.sent.has(m) || d.pct < m) continue;
    // engaged-time floor so a flick to the bottom doesn't count as reading:
    // a quarter of the expected reading time up to this mark (8 s – 2 min per mark)
    const need = Math.min(120 * (m / 25), Math.max(8 * (m / 25), d.minutes * 60 * 0.25 * (m / 100)));
    if (secs < need) break;
    rd.sent.add(m);
    capture("read_progress", { ...rd.ref, pct: m, engaged_sec: secs, est_minutes: Math.round(d.minutes) });
  }
}

function startReader(path: string) {
  if (reader?.path === path) return;
  stopReader();
  if (!posthogEnabled()) return;
  const ref = contentOf(path);
  if (!ref) return;
  let raf = 0;
  const onScroll = () => {
    if (raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      checkReader();
    });
  };
  reader = { path, ref, clock: startEngagedClock(), sent: new Set(), timer: window.setInterval(checkReader, 2000), onScroll };
  window.addEventListener("scroll", onScroll, { passive: true });
}

/* ───────────────────────────── public API ───────────────────────────── */

let wired = false;

function wire() {
  if (wired) return;
  wired = true;
  onProduct(onProductEvent);
  onRouteStart((path) => {
    flushQuiz();
    syncGates(path);
  });
  window.addEventListener("pagehide", flushQuiz);
  // back online: load posthog-js if it couldn't load offline, then send the queue
  const back = (delayMs: number) => () => {
    if (!ph && !phLoading && !isOffline()) void loadPosthog();
    scheduleFlush(delayMs);
  };
  window.addEventListener("hk:reconnected", back(800));
  window.addEventListener("online", back(3000));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && pendingEvents().length) back(1000)();
  });
  watchAuth();
}

/** Called on every app-router pathname change (and once on load). */
export function analyticsRoute(pathname: string) {
  if (!isBrowser()) return;
  if (!posthogEnabled() && !gaEnabled()) return; // dormant
  syncGates(pathname);
  if (isAdminPath(pathname) || !allowed()) {
    stopReader();
    return;
  }
  wire();
  schedulePosthog();
  loadGa();
  startReader(pathname);
}

/** Visitor opt-out (footer / privacy page). Also stops the first-party tracker (hk.notrack). */
export function setAnalyticsOptOut(out: boolean) {
  if (!isBrowser()) return;
  try {
    if (out) window.localStorage.setItem(NOTRACK_KEY, "1");
    else window.localStorage.removeItem(NOTRACK_KEY);
  } catch {
    /* storage blocked */
  }
  if (out) {
    stopReader();
    clearEvents();
    try {
      ph?.opt_out_capturing();
    } catch {
      /* ignore */
    }
    if (gaLoaded) gtag("consent", "update", { analytics_storage: "denied" });
  } else {
    try {
      if (ph?.has_opted_out_capturing()) ph.opt_in_capturing();
    } catch {
      /* ignore */
    }
    if (gaLoaded) gtag("consent", "update", { analytics_storage: privacySignal() ? "denied" : "granted" });
  }
  syncGates(currentPath());
  if (!out) analyticsRoute(currentPath());
  window.dispatchEvent(new Event(OPTOUT_EVENT));
}

/** Which third-party tools this build has configured (for the privacy page). */
export const analyticsTools = () => ({ posthog: posthogEnabled(), ga: gaEnabled() });

/** Test/QA hook: the loaded PostHog instance (null when dormant). */
export const posthogInstance = () => ph;
