/* eslint-disable */
/**
 * Offline reading service worker (hand-written, no build plugin).
 *
 * Registered as /sw.js?v=<build id> by src/components/offline/OfflineProvider.tsx, so every deploy
 * installs a fresh worker (new shell, old caches pruned) while this file itself stays static.
 *
 * Caches (Cache Storage, shared with the page, which writes the saved library itself — see
 * src/lib/offline/store.ts):
 *   hk-shell-<v>  offline fallback (/offline) + library (/learn/offline) HTML, icons, manifest; per build
 *   hk-static     /_next/static/** (content-hashed, immutable): cache-first, pruned on activate to
 *                 what saved pages still reference
 *   hk-media      images/fonts outside /_next/static: stale-while-revalidate + saved-page images,
 *                 and saved lectures' media: a pointer at each file URL (x-hk-blob: <key>) and the
 *                 bytes once under <origin>/__hk/blob/<content id> (shared files stored once; see
 *                 src/lib/offline/lectures.ts)
 *   hk-pages      saved article documents (gzip) — only ever changed by the page (save/update/remove)
 *   hk-meta       one JSON record per saved article (title, kind, version, assets, …)
 *   hk-recent     the last few course pages opened online (gzip), a safety net; cleared per build
 *   hk-runtime    code labs' Python runtime (/pyodide/<version>/**, /labs-runtime/**): cache first,
 *                 filled on first use and by saving a lab; other versions pruned unless a saved lab
 *                 still lists them
 *
 * Requests:
 *   navigations     network first (4 s timeout when a saved copy exists) → saved copy → recent copy
 *                   → library for the course start URLs → /offline fallback
 *   RSC (?_rsc)     network only; offline it answers 503 so the Next router falls back to a full
 *                   document navigation, which the navigation handler serves from the saved copy
 *   /_next/static   cache first
 *   /_next/image    network first, any cached width of the same image offline
 *   lecture media   (any origin, LECTURE_FILE) saved: audio/captions/poster from the device (Range
 *                   requests answered as 206 slices, so seeking works), media.json network first
 *                   with the saved copy as fallback; not saved: the network as before
 *   never touched   non-GET, /api/**, /admin/**, /auth/**, /hkr/** (PostHog), /_vercel/**, OG and
 *                   Twitter images, Supabase/GA/any other origin (except saved images offline)
 *
 * Kill switch: ship this file as `self.registration.unregister()` + `caches.delete` of hk-*, or set
 * NEXT_PUBLIC_OFFLINE_DISABLED=1 (the provider then unregisters it).
 */
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const SHELL = "hk-shell-" + VERSION;
const STATIC = "hk-static";
const MEDIA = "hk-media";
const PAGES = "hk-pages";
const META = "hk-meta";
const RECENT = "hk-recent";
const RUNTIME = "hk-runtime";
// keep in sync with PYODIDE_VERSION in src/lib/learn/labs/runtime.ts (scripts/labs/vendor-pyodide.mjs checks)
const RUNTIME_VERSION = "314.0.7";
const RUNTIME_PREFIX = "/pyodide/" + RUNTIME_VERSION + "/";
const RUNTIME_PATH = /^\/(?:pyodide|labs-runtime)\//;
const SHELL_PAGES = ["/offline", "/learn/offline"];
const SHELL_FILES = ["/manifest.webmanifest", "/icon.svg", "/favicon.ico", "/apple-icon.png", "/icons/icon-192.png", "/icons/icon-512.png"];
const COURSE_START = /^\/learn(?:\/system-design-mastery)?\/?$/;
const HUB = "/learn/system-design-mastery";
const NAV_TIMEOUT_MS = 4000;
const RECENT_MAX = 10;
const BYPASS = /^\/(?:api|admin|auth|hkr|_vercel|monitoring)(?:\/|$)|^\/sw\.js$|\/(?:opengraph|twitter)-image(?:[/-]|$)/;
// keep in sync with SAVEABLE_PATH in src/lib/offline/types.ts (minus the course map, the HUB rule)
const ARTICLE = /^\/learn\/[^/]+\/[^/]+\/[^/]+\/?$|^\/learn\/mock\/[^/]+\/?$|^\/learn\/(?:revise|cheatsheet)\/[^/]+\/?$|^\/learn\/labs(?:\/[^/]+)?\/?$|^\/learn\/(?:numbers|plan|practice|reading|revise|mock|mastery|prep)\/?$|^\/learn\/lectures\/[^/]+\/?$|^\/learn\/war-stories(?:\/[^/]+)?\/?$|^\/stories\/[^/]+\/?$/;
// a lecture's recorded media, on R2 or /lecture-media (keep in sync with LECTURE_FILE in types.ts)
const LECTURE_FILE = /\/[A-Za-z0-9-]+\/(?:media\.json|narration\.mp3|music\.mp3|captions\.vtt|poster\.jpg|chapters\.json)$/;
const MEDIA_JSON_TIMEOUT_MS = 4000;
// never kept as a "recent" copy: design of the week is live (phases, votes, drafts) and needs a connection
const NO_RECENT = /^\/learn\/design-week(?:\/|$)/;
const IMAGE_HOSTS = /(?:^|\.)imagekit\.io$|(?:^|\.)githubusercontent\.com$/;

/** where each navigation was answered from, by the client it created (asked for by the page) */
const sources = new Map();
const sourcesByUrl = new Map();

// ------------------------------------------------------------------------------------------------
// helpers

/** "/_next/static/chunks/app/learn/[course]/x.js" and the %5B form are the same file: one key. */
function normPath(p) {
  try {
    return encodeURI(decodeURI(p));
  } catch (e) {
    return p;
  }
}

function staticKey(url) {
  const u = new URL(url, self.location.origin);
  return self.location.origin + normPath(u.pathname);
}

/** Saved pages are keyed by path (+ the trial's ?part= / ?view= variants). */
function docKeys(url) {
  const u = new URL(url, self.location.origin);
  const path = normPath(u.pathname.replace(/\/+$/, "") || "/");
  const keys = [];
  const part = u.searchParams.get("part");
  const view = u.searchParams.get("view");
  if (part) keys.push(path + "?part=" + part);
  else if (view) keys.push(path + "?view=" + view);
  keys.push(path);
  return keys.map((k) => self.location.origin + k);
}

async function findDoc(cacheName, url) {
  const cache = await caches.open(cacheName);
  for (const key of docKeys(url)) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }
  return null;
}

function inflate(res, source) {
  const headers = new Headers({ "content-type": "text/html; charset=utf-8", "x-hk-offline": source });
  if (res.headers.get("x-hk-enc") === "gzip" && typeof DecompressionStream !== "undefined" && res.body) {
    return new Response(res.body.pipeThrough(new DecompressionStream("gzip")), { status: 200, headers });
  }
  return new Response(res.body, { status: 200, headers });
}

async function deflate(res) {
  if (typeof CompressionStream === "undefined" || !res.body) {
    return new Response(await res.blob(), { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  const blob = await new Response(res.body.pipeThrough(new CompressionStream("gzip"))).blob();
  return new Response(blob, { headers: { "content-type": "text/html; charset=utf-8", "x-hk-enc": "gzip" } });
}

function timeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function mark(event, url, source) {
  const rec = { source, url, at: Date.now() };
  if (event.resultingClientId) sources.set(event.resultingClientId, rec);
  sourcesByUrl.set(url, rec);
  if (sources.size > 50) sources.delete(sources.keys().next().value);
  if (sourcesByUrl.size > 50) sourcesByUrl.delete(sourcesByUrl.keys().next().value);
}

/** /_next/static/… and /_next/static/media/… URLs referenced by an HTML page or a CSS file. */
function staticUrls(text) {
  const out = new Set();
  const re = /(?:\/_next\/)?static\/(?:chunks|css|media)\/[A-Za-z0-9_\-./%~@]+?\.(?:js|css|woff2?|ttf|otf)/g;
  let m;
  while ((m = re.exec(text))) {
    const p = m[0].startsWith("/_next/") ? m[0] : "/_next/" + m[0];
    out.add(normPath(p));
  }
  return [...out];
}

async function putIfMissing(cacheName, url) {
  const cache = await caches.open(cacheName);
  const key = staticKey(url);
  if (await cache.match(key)) return;
  const res = await fetch(url, { credentials: "same-origin" });
  if (res.ok) await cache.put(key, res);
}

// ------------------------------------------------------------------------------------------------
// lifecycle

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL);
      const assets = new Set();
      for (const path of SHELL_PAGES) {
        try {
          const res = await fetch(path, { cache: "reload", credentials: "same-origin" });
          if (!res.ok) continue;
          const html = await res.clone().text();
          await shell.put(path, res);
          staticUrls(html).forEach((a) => assets.add(a));
        } catch (e) {
          // offline while updating: the previous shell keeps serving until the next try
        }
      }
      await Promise.all(
        SHELL_FILES.map(async (f) => {
          try {
            const res = await fetch(f, { cache: "reload" });
            if (res.ok) await shell.put(f, res);
          } catch (e) {}
        })
      );
      // the shell pages' app files, and the fonts their CSS loads
      await Promise.all([...assets].map((a) => putIfMissing(STATIC, a).catch(() => {})));
      const st = await caches.open(STATIC);
      for (const css of [...assets].filter((a) => a.endsWith(".css"))) {
        try {
          const hit = await st.match(staticKey(css));
          if (!hit) continue;
          for (const f of staticUrls(await hit.text())) {
            assets.add(f);
            await putIfMissing(STATIC, f).catch(() => {});
          }
        } catch (e) {}
      }
      const meta = await caches.open(META);
      await meta.put(self.location.origin + "/__hk/shell/" + VERSION, new Response(JSON.stringify({ build: VERSION, assets: [...assets] }), { headers: { "content-type": "application/json" } }));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      } catch (e) {}
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("hk-shell-") && n !== SHELL).map((n) => caches.delete(n)));
      // recent copies were rendered by an older build whose app files are pruned below
      const recentBuild = await (await caches.open(META)).match(self.location.origin + "/__hk/recent-build");
      if (!recentBuild || (await recentBuild.text()) !== VERSION) {
        await caches.delete(RECENT);
        await (await caches.open(META)).put(self.location.origin + "/__hk/recent-build", new Response(VERSION));
      }
      await self.clients.claim();
      await prune().catch(() => {});
    })()
  );
});

/**
 * Keep only the app files and images something still needs: saved pages (every build they were
 * saved under) and this build's shell. Everything else in hk-static / hk-media was a runtime copy.
 */
async function prune() {
  const meta = await caches.open(META);
  const keepStatic = new Set();
  const keepMedia = new Set();
  const keepRuntime = new Set();
  for (const req of await meta.keys()) {
    const path = new URL(req.url).pathname;
    try {
      if (path.startsWith("/__hk/page/")) {
        const m = await (await meta.match(req)).json();
        (m.assets || []).forEach((a) => keepStatic.add(staticKey(a)));
        (m.media || []).forEach((a) => keepMedia.add(new URL(a, self.location.origin).href));
        (m.runtime || []).forEach((a) => keepRuntime.add(new URL(a, self.location.origin).href));
      } else if (path.startsWith("/__hk/shell/")) {
        if (path === "/__hk/shell/" + VERSION) {
          const m = await (await meta.match(req)).json();
          (m.assets || []).forEach((a) => keepStatic.add(staticKey(a)));
        } else {
          await meta.delete(req);
        }
      }
    } catch (e) {}
  }
  const st = await caches.open(STATIC);
  for (const req of await st.keys()) if (!keepStatic.has(staticKey(req.url))) await st.delete(req);
  const media = await caches.open(MEDIA);
  for (const req of await media.keys()) if (!keepMedia.has(req.url)) await media.delete(req);
  // the current Python runtime stays (it is the HTTP cache for labs too); older ones only for saved labs
  const rt = await caches.open(RUNTIME);
  for (const req of await rt.keys()) {
    const u = new URL(req.url);
    const current = u.pathname.startsWith(RUNTIME_PREFIX) || (u.pathname.startsWith("/labs-runtime/") && u.search.indexOf(RUNTIME_VERSION) >= 0);
    if (!current && !keepRuntime.has(req.url)) await rt.delete(req);
  }
}

// ------------------------------------------------------------------------------------------------
// fetch

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (LECTURE_FILE.test(url.pathname) && (url.origin !== self.location.origin || url.pathname.startsWith("/lecture-media/"))) {
    event.respondWith(lectureFile(req, url));
    return;
  }

  if (url.origin !== self.location.origin) {
    // saved case-file / lesson images hosted elsewhere: network, saved copy when offline
    if (req.destination === "image" && (IMAGE_HOSTS.test(url.hostname) || url.pathname.startsWith("/storage/v1/object/public/"))) {
      event.respondWith(fetch(req).catch(() => mediaFallback(req)));
    }
    return;
  }
  const path = url.pathname;
  if (BYPASS.test(path)) return;

  if (req.mode === "navigate") {
    event.respondWith(navigate(event, url));
    return;
  }
  if (req.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) {
    event.respondWith(rsc(req));
    return;
  }
  if (RUNTIME_PATH.test(path)) {
    event.respondWith(runtimeFirst(req));
    return;
  }
  if (path.startsWith("/_next/static/")) {
    event.respondWith(staticFirst(req));
    return;
  }
  if (path === "/_next/image") {
    event.respondWith(nextImage(event, url));
    return;
  }
  if (path.startsWith("/_next/")) return;
  if (req.destination === "image" || req.destination === "font" || req.destination === "manifest" || path === "/manifest.webmanifest") {
    event.respondWith(staleWhileRevalidate(event));
  }
});

async function navigate(event, url) {
  const req = event.request;
  const saved = await findDoc(PAGES, url.href).catch(() => null);
  let net = null;
  try {
    const p = (async () => (await event.preloadResponse) || fetch(req))();
    net = saved ? await timeout(p, NAV_TIMEOUT_MS) : await p;
  } catch (e) {
    net = null;
  }
  // the network answered (pages, redirects, 404s as they are); a 5xx falls back to a saved copy
  if (net && (net.status < 500 || !saved)) {
    mark(event, url.href, "network");
    if (net.ok && net.status === 200 && (ARTICLE.test(url.pathname) || url.pathname === HUB) && !NO_RECENT.test(url.pathname) && !saved && (net.headers.get("content-type") || "").includes("text/html")) {
      event.waitUntil(remember(url, net.clone()).catch(() => {}));
    }
    return net;
  }
  if (saved) {
    mark(event, url.href, "saved");
    return inflate(saved, "saved");
  }
  const shellHit = await caches.match(url.pathname, { cacheName: SHELL });
  if (shellHit) {
    mark(event, url.href, "shell");
    return shellHit;
  }
  const recent = await findDoc(RECENT, url.href).catch(() => null);
  if (recent) {
    mark(event, url.href, "recent");
    return inflate(recent, "recent");
  }
  // The installed app opens on /learn: go to the saved course map, else the library. Redirects,
  // not rewrites: a page hydrating under another URL would not match its server render.
  if (COURSE_START.test(url.pathname)) {
    const hub = url.pathname.replace(/\/+$/, "") !== HUB && (await findDoc(PAGES, HUB).catch(() => null));
    if (hub) return Response.redirect(HUB, 302);
    if (await caches.match("/learn/offline", { cacheName: SHELL })) return Response.redirect("/learn/offline", 302);
  }
  if (await caches.match("/offline", { cacheName: SHELL })) {
    return Response.redirect("/offline?from=" + encodeURIComponent(url.pathname + url.search), 302);
  }
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Offline</title><body style="font:16px system-ui;padding:24px;background:#000;color:#f3f2ee">You are offline and this page is not saved. <a style="color:#ff6b2b" href="/learn/offline">Open your offline library</a>.',
    { status: 503, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

/** A copy of the last few course pages opened online, so a lesson read at the gate still opens. */
async function remember(url, res) {
  const body = await deflate(res);
  const cache = await caches.open(RECENT);
  await cache.put(docKeys(url.href)[0], body);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - RECENT_MAX; i++) await cache.delete(keys[i]);
}

async function rsc(req) {
  try {
    return await fetch(req);
  } catch (e) {
    // not a flight response → the Next router does a full navigation, answered by navigate()
    return new Response("", { status: 503, headers: { "content-type": "text/plain", "x-hk-offline": "1" } });
  }
}

async function staticFirst(req) {
  const key = staticKey(req.url);
  const cache = await caches.open(STATIC);
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === "basic") {
    const copy = res.clone();
    cache.put(key, copy).catch(() => {});
  }
  return res;
}

/** Code labs' Python runtime: versioned files, cache first, kept for offline runs. */
async function runtimeFirst(req) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.status === 200 && res.type === "basic") {
    const copy = res.clone();
    cache.put(req.url, copy).catch(() => {});
  }
  return res;
}

// ------------------------------------------------------------------------------------------------
// saved lectures' media

/** The stored bytes behind a saved lecture file (its pointer names a content-addressed blob). */
// the same R2 bucket under its old and new hosts: a lecture saved before the move to the CDN domain
// (28 Oct 2026) is stored under r2.dev, and must still play offline when the page asks the new host
const MEDIA_HOSTS = ["https://media.himanshukukreja.in/", "https://pub-0ff4982d0a60493db492786c7c330ded.r2.dev/"];

async function savedLectureFile(url) {
  const cache = await caches.open(MEDIA);
  let ptr = await cache.match(url);
  if (!ptr) {
    const from = MEDIA_HOSTS.find((h) => url.startsWith(h));
    for (const to of from ? MEDIA_HOSTS.filter((h) => h !== from) : []) {
      ptr = await cache.match(to + url.slice(from.length));
      if (ptr) break;
    }
  }
  if (!ptr) return null;
  const key = ptr.headers.get("x-hk-blob");
  if (!key) return ptr;
  return (await cache.match(key)) || null;
}

/** A full or partial (Range: bytes=a-b, a-, -n) answer from a stored response. */
async function rangeAnswer(stored, req, url) {
  const blob = await stored.blob();
  const type = stored.headers.get("content-type") || blob.type || "application/octet-stream";
  const size = blob.size;
  const base = { "content-type": type, "accept-ranges": "bytes", "x-hk-offline": "saved", "cache-control": "no-store" };
  const range = req.headers.get("range");
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m || (m[1] === "" && m[2] === "")) {
    return new Response(blob, { status: 200, headers: { ...base, "content-length": String(size) } });
  }
  let start;
  let end;
  if (m[1] === "") {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (!(start <= end) || start >= size) {
    return new Response(null, { status: 416, headers: { ...base, "content-range": "bytes */" + size } });
  }
  return new Response(blob.slice(start, end + 1, type), {
    status: 206,
    headers: { ...base, "content-length": String(end - start + 1), "content-range": "bytes " + start + "-" + end + "/" + size },
  });
}

async function lectureFile(req, url) {
  const saved = await savedLectureFile(req.url).catch(() => null);
  if (!saved) return fetch(req);
  // the manifest can change (a re-recorded lecture): network first, the saved copy offline
  if (url.pathname.endsWith("/media.json")) {
    try {
      const net = await timeout(fetch(req), MEDIA_JSON_TIMEOUT_MS);
      if (net.ok) return net;
    } catch (e) {}
    return rangeAnswer(saved, req, url);
  }
  // audio, captions, poster: their URLs carry the recording's version, so the saved bytes are right
  return rangeAnswer(saved, req, url);
}

async function mediaFallback(req) {
  const hit = await caches.match(req.url, { cacheName: MEDIA });
  return hit || Response.error();
}

async function nextImage(event, url) {
  const req = event.request;
  const cache = await caches.open(MEDIA);
  try {
    const res = await fetch(req);
    if (res.ok) {
      const copy = res.clone();
      event.waitUntil(cache.put(req.url, copy).catch(() => {}));
    }
    return res;
  } catch (e) {
    const exact = await cache.match(req.url);
    if (exact) return exact;
    // any saved width of the same image
    const src = url.searchParams.get("url");
    let best = null;
    let bestW = -1;
    for (const k of await cache.keys()) {
      const ku = new URL(k.url);
      if (ku.pathname !== "/_next/image" || ku.searchParams.get("url") !== src) continue;
      const w = Number(ku.searchParams.get("w")) || 0;
      if (w > bestW) {
        best = k;
        bestW = w;
      }
    }
    if (best) return (await cache.match(best)) || Response.error();
    return Response.error();
  }
}

async function staleWhileRevalidate(event) {
  const req = event.request;
  const cache = await caches.open(MEDIA);
  const key = new URL(req.url).href;
  const hit = await cache.match(key);
  const refresh = fetch(req)
    .then((res) => {
      if (res.ok && res.type === "basic") cache.put(key, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => null);
  if (hit) {
    event.waitUntil(refresh);
    return hit;
  }
  return (await refresh) || (await caches.match(new URL(req.url).pathname, { cacheName: SHELL })) || Response.error();
}

// ------------------------------------------------------------------------------------------------
// messages from the page

self.addEventListener("message", (event) => {
  const data = event.data || {};
  const port = event.ports && event.ports[0];
  if (data.type === "hk:source") {
    const id = event.source && event.source.id;
    // by the client this navigation created; else the latest answer for the URL (the page checks
    // its age against its own load time)
    const rec = (id && sources.get(id)) || sourcesByUrl.get(data.url) || null;
    if (port) port.postMessage(rec);
  } else if (data.type === "hk:version") {
    if (port) port.postMessage({ version: VERSION });
  } else if (data.type === "hk:prune") {
    event.waitUntil(
      prune()
        .catch(() => {})
        .then(() => port && port.postMessage({ ok: true }))
    );
  }
});

// ------------------------------------------------------------------------------------------------
// push: opt-in streak reminders (src/lib/reminders/server.ts). Payload { title, body, url, tag }.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "System Design Mastery";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || "sdm",
      data: { url: data.url || "/learn/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/learn/dashboard", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          w.navigate(target).catch(() => {});
          return w.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
