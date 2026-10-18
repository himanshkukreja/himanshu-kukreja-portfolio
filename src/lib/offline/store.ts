"use client";

/**
 * The offline library, written by the page straight into Cache Storage (the service worker in
 * public/sw.js reads the same caches to answer requests with no network):
 *
 *   hk-pages   the article documents, gzip-compressed (a lesson is ~1 MB of HTML, ~100 KB gzip)
 *   hk-meta    /__hk/page/<path> → SavedMeta JSON (what the library lists)
 *   hk-static  the /_next/static files the page needs: its own scripts/CSS/fonts plus the reader's
 *              on-demand chunks (Mermaid, content chrome, boss mode, the explainers a page embeds)
 *              loaded by warmReader()
 *   hk-media   its images
 *
 * A save fetches everything first and writes the documents and the record last, so a failed save
 * leaves nothing half-listed. Saved pages keep the app files of the build that rendered them, so
 * they keep working offline after a deploy; the worker prunes files nothing references any more.
 */
import { OFFLINE_CACHES as C, type CatalogItem, type SavedMeta } from "./types";
import { warmReader } from "./warm";
import { cacheLabRuntime } from "./labs";

export const APP_BUILD = process.env.NEXT_PUBLIC_HK_BUILD || "dev";

export class OfflineSaveError extends Error {
  constructor(
    public code: "offline" | "quota" | "stale-build" | "unsupported" | "http",
    message: string
  ) {
    super(message);
  }
}

export const offlineSupported = () => typeof window !== "undefined" && "caches" in window && "serviceWorker" in navigator && typeof Response !== "undefined";

export function normPath(p: string): string {
  try {
    return encodeURI(decodeURI(p));
  } catch {
    return p;
  }
}

/** /learn/x/y (no trailing slash, encoded) for any URL or path. */
export function pathOf(url: string): string {
  const u = new URL(url, window.location.origin);
  return normPath(u.pathname.replace(/\/+$/, "") || "/");
}

/** Cache key of a saved document: the path, plus the trial's ?part= / ?view= variant. */
function docKey(url: string): string {
  const u = new URL(url, window.location.origin);
  const part = u.searchParams.get("part");
  const view = u.searchParams.get("view");
  const q = part ? `?part=${part}` : view ? `?view=${view}` : "";
  return `${window.location.origin}${pathOf(url)}${q}`;
}

const metaKey = (url: string) => `${window.location.origin}/__hk/page${pathOf(url)}`;
const staticKey = (p: string) => `${window.location.origin}${normPath(p)}`;

// ------------------------------------------------------------------------------------------------
// reading the library

export async function listSaved(): Promise<SavedMeta[]> {
  if (!offlineSupported()) return [];
  try {
    const cache = await caches.open(C.meta);
    const keys = (await cache.keys()).filter((r) => new URL(r.url).pathname.startsWith("/__hk/page/"));
    const out = await Promise.all(
      keys.map(async (k) => {
        try {
          return (await (await cache.match(k))?.json()) as SavedMeta;
        } catch {
          return null;
        }
      })
    );
    return out.filter((m): m is SavedMeta => !!m && typeof m.url === "string");
  } catch {
    return [];
  }
}

export async function removeSaved(url: string): Promise<void> {
  const meta = await caches.open(C.meta);
  const rec = (await (await meta.match(metaKey(url)))?.json().catch(() => null)) as SavedMeta | null;
  const pages = await caches.open(C.pages);
  for (const u of [url, ...(rec?.variants ?? [])]) await pages.delete(docKey(u));
  await meta.delete(metaKey(url));
  notifyChanged();
  void askWorker({ type: "hk:prune" });
}

export async function removeAll(): Promise<void> {
  for (const m of await listSaved()) {
    const pages = await caches.open(C.pages);
    for (const u of [m.url, ...(m.variants ?? [])]) await pages.delete(docKey(u));
    await (await caches.open(C.meta)).delete(metaKey(m.url));
  }
  notifyChanged();
  void askWorker({ type: "hk:prune" });
}

export type StorageInfo = { usage: number | null; quota: number | null; persisted: boolean | null };

export async function storageInfo(): Promise<StorageInfo> {
  const s = typeof navigator !== "undefined" ? navigator.storage : undefined;
  const [est, persisted] = await Promise.all([s?.estimate?.().catch(() => null) ?? null, s?.persisted?.().catch(() => null) ?? null]);
  return { usage: est?.usage ?? null, quota: est?.quota ?? null, persisted };
}

/** Ask the browser not to evict the library under storage pressure (granted silently or not). */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    const s = navigator.storage;
    if (!s?.persist) return null;
    if (await s.persisted?.()) return true;
    return await s.persist();
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------------------------------------
// saving

const CHANNEL = "hk-offline";

export function notifyChanged() {
  window.dispatchEvent(new Event("hk:offline-changed"));
  try {
    const bc = new BroadcastChannel(CHANNEL);
    bc.postMessage("changed");
    bc.close();
  } catch {
    // no BroadcastChannel: other tabs pick it up on their next load
  }
}

export function onLibraryChanged(cb: () => void): () => void {
  window.addEventListener("hk:offline-changed", cb);
  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = cb;
  } catch {
    bc = null;
  }
  return () => {
    window.removeEventListener("hk:offline-changed", cb);
    bc?.close();
  };
}

export async function askWorker<T = unknown>(msg: Record<string, unknown>, timeoutMs = 3000): Promise<T | null> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sw = navigator.serviceWorker?.controller || reg?.active;
    if (!sw) return null;
    return await new Promise<T | null>((resolve) => {
      const ch = new MessageChannel();
      const t = window.setTimeout(() => resolve(null), timeoutMs);
      ch.port1.onmessage = (e) => {
        window.clearTimeout(t);
        resolve(e.data as T);
      };
      sw.postMessage(msg, [ch.port2]);
    });
  } catch {
    return null;
  }
}

const STATIC_RE = /(?:\/_next\/)?static\/(?:chunks|css|media)\/[A-Za-z0-9_\-./%~@]+?\.(?:js|css|woff2?|ttf|otf)/g;

function staticUrls(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(STATIC_RE)) out.add(normPath(m[0].startsWith("/_next/") ? m[0] : `/_next/${m[0]}`));
  return [...out];
}

/** Every /_next/static file this document has loaded (initial + on-demand chunks). */
function loadedStatics(): string[] {
  const origin = window.location.origin;
  return performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .filter((n) => n.startsWith(`${origin}/_next/static/`))
    .map((n) => normPath(new URL(n).pathname));
}

const IMG_HOST = /(?:^|\.)imagekit\.io$|(?:^|\.)githubusercontent\.com$|\.supabase\.co$/;
const unescapeHtml = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");

/** Images an article shows: <img>/<source> src and the largest sensible srcset candidate. */
function mediaUrls(html: string): string[] {
  const out = new Set<string>();
  const add = (raw: string) => {
    const s = unescapeHtml(raw.trim());
    if (!s || s.startsWith("data:") || s.startsWith("blob:")) return;
    try {
      const u = new URL(s, window.location.origin);
      if (u.origin === window.location.origin) out.add(u.pathname + u.search);
      else if (u.protocol === "https:" && IMG_HOST.test(u.hostname)) out.add(u.href);
    } catch {
      // not a URL
    }
  };
  for (const m of html.matchAll(/<(?:img|source)\b[^>]*>/g)) {
    const tag = m[0];
    const src = /\ssrc="([^"]+)"/.exec(tag)?.[1];
    const srcset = /\ssrcset="([^"]+)"/.exec(tag)?.[1];
    if (srcset) {
      const cands = unescapeHtml(srcset)
        .split(/,\s+/)
        .map((c) => {
          const [u, d] = c.trim().split(/\s+/);
          return { u, w: parseInt(d || "0", 10) || 0 };
        })
        .filter((c) => c.u);
      const fit = cands.filter((c) => c.w && c.w <= 1300).sort((a, b) => b.w - a.w)[0] || cands.sort((a, b) => b.w - a.w)[0];
      if (fit) add(fit.u);
    } else if (src) add(src);
  }
  return [...out];
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    })
  );
}

function isQuota(e: unknown) {
  const name = (e as { name?: string })?.name || "";
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" || /quota/i.test(String((e as Error)?.message || ""));
}

async function put(cache: Cache, key: string, res: Response) {
  try {
    await cache.put(key, res);
  } catch (e) {
    if (isQuota(e)) throw new OfflineSaveError("quota", "This device is out of space for offline lessons. Remove some saved items or free up storage, then try again.");
    throw e;
  }
}

async function getDoc(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", credentials: "same-origin", headers: { Accept: "text/html" } });
  } catch {
    throw new OfflineSaveError("offline", "No connection. Saving needs the internet; what's saved so far stays.");
  }
  if (!res.ok || !(res.headers.get("content-type") || "").includes("text/html")) throw new OfflineSaveError("http", `Couldn't fetch ${url} (${res.status}).`);
  return res.text();
}

async function compress(html: string): Promise<{ res: Response; size: number }> {
  const headers: Record<string, string> = { "content-type": "text/html; charset=utf-8" };
  if (typeof CompressionStream === "undefined") {
    const blob = new Blob([html], { type: "text/html" });
    return { res: new Response(blob, { headers }), size: blob.size };
  }
  const blob = await new Response(new Blob([html]).stream().pipeThrough(new CompressionStream("gzip"))).blob();
  return { res: new Response(blob, { headers: { ...headers, "x-hk-enc": "gzip" } }), size: blob.size };
}

export type SaveInput = CatalogItem & { groupTitle: string };

/**
 * Save one article (and its variants) for offline reading. Throws OfflineSaveError for the
 * conditions the UI explains (offline, quota, site updated since this tab loaded).
 */
export async function saveArticle(item: SaveInput): Promise<SavedMeta> {
  if (!offlineSupported()) throw new OfflineSaveError("unsupported", "This browser can't store pages for offline reading.");
  const urls = [item.url, ...(item.variants ?? [])];
  const docs: { url: string; html: string }[] = [];
  for (const u of urls) docs.push({ url: u, html: await getDoc(u) });

  const build = /<meta name="hk-build" content="([^"]+)"/.exec(docs[0].html)?.[1] || APP_BUILD;
  // the page's on-demand chunks are only knowable from a document of the same build
  if (build !== APP_BUILD) throw new OfflineSaveError("stale-build", "The site was just updated. Reload this page, then save again.");
  await warmReader(docs.map((d) => d.html));
  // code labs: the editor chunk + the Python runtime (shared by every lab, stored once)
  const runtime = item.kind === "lab" && /^\/learn\/labs\/[^/]+/.test(pathOf(item.url)) ? await cacheLabRuntime() : null;

  const assets = new Set<string>(loadedStatics());
  const media = new Set<string>();
  for (const d of docs) {
    staticUrls(d.html).forEach((a) => assets.add(a));
    mediaUrls(d.html).forEach((m) => media.add(m));
  }

  // app files (shared by every saved page of this build: mostly already cached)
  const st = await caches.open(C.static);
  const ensureStatic = async (a: string) => {
    const key = staticKey(a);
    if (await st.match(key)) return;
    let res: Response;
    try {
      res = await fetch(a, { credentials: "same-origin" });
    } catch {
      throw new OfflineSaveError("offline", "No connection. Saving needs the internet; what's saved so far stays.");
    }
    if (res.ok) await put(st, key, res);
    else assets.delete(a);
  };
  await pool([...assets], 6, ensureStatic);
  // fonts and images the stylesheets load
  for (const css of [...assets].filter((a) => a.endsWith(".css"))) {
    const text = await (await st.match(staticKey(css)))?.text().catch(() => "");
    const extra = staticUrls(text || "").filter((a) => !assets.has(a));
    extra.forEach((a) => assets.add(a));
    await pool(extra, 6, ensureStatic);
  }

  // images
  const mc = await caches.open(C.media);
  let mediaBytes = 0;
  await pool([...media], 4, async (m) => {
    const key = new URL(m, window.location.origin).href;
    if (await mc.match(key)) return;
    try {
      const sameOrigin = key.startsWith(window.location.origin);
      const res = await fetch(key, sameOrigin ? { credentials: "same-origin" } : { mode: "cors", credentials: "omit" });
      if (!res.ok) {
        media.delete(m);
        return;
      }
      const blob = await res.blob();
      mediaBytes += blob.size;
      await put(mc, key, new Response(blob, { headers: { "content-type": res.headers.get("content-type") || blob.type || "application/octet-stream" } }));
    } catch (e) {
      if (e instanceof OfflineSaveError) throw e;
      media.delete(m); // no CORS / gone: the article still opens, without that image
    }
  });

  // documents + record last
  const pages = await caches.open(C.pages);
  let size = mediaBytes;
  for (const d of docs) {
    const { res, size: n } = await compress(d.html);
    size += n;
    await put(pages, docKey(d.url), res);
  }
  const prev = (await (await caches.open(C.meta)).match(metaKey(item.url)).then((r) => r?.json()).catch(() => null)) as SavedMeta | null;
  const now = Date.now();
  const rec: SavedMeta = {
    url: pathOf(item.url),
    title: item.title,
    kind: item.kind,
    tag: item.tag,
    group: item.group,
    groupTitle: item.groupTitle,
    version: item.version,
    ...(item.variants?.length ? { variants: item.variants } : {}),
    build,
    savedAt: prev?.savedAt ?? now,
    updatedAt: now,
    size,
    assets: [...assets],
    media: [...media],
    ...(runtime ? { runtime } : {}),
  };
  await put(await caches.open(C.meta), metaKey(item.url), new Response(JSON.stringify(rec), { headers: { "content-type": "application/json" } }));

  // a prune that ran while this was saving may have dropped files it had just cached
  const missing: string[] = [];
  for (const a of rec.assets) if (!(await st.match(staticKey(a)))) missing.push(a);
  if (missing.length) await pool(missing, 6, ensureStatic);
  return rec;
}
