"use client";

/**
 * Offline video lectures. The player draws the animation live and plays recorded narration, so a
 * saved lecture is its page (saved like any article) plus the media its media.json lists: the
 * narration, the background music, captions and the poster. Not video.mp4: the player never uses it.
 *
 * Files are stored content-addressed in hk-media, so a file several lectures share (the music is the
 * same bytes in every lecture) is stored once:
 *
 *   <file URL>                       a pointer: empty body, header x-hk-blob: <blob key>
 *   <origin>/__hk/blob/<content id>  the bytes (content id: the server's ETag + size, else SHA-256)
 *
 * The saved record lists both keys in `media`, so the worker's prune keeps a shared blob while any
 * saved lecture still points at it and drops it with the last one. The worker answers the file URLs
 * from these (Range requests as 206 slices, so seeking works offline): see LECTURE_FILE in sw.js.
 */
import { LECTURE_FILE, OFFLINE_CACHES as C, type Catalog, type SavedMeta } from "./types";
import { OfflineSaveError } from "./store";

export type LectureFiles = { files: { url: string; key: string; bytes: number }[]; keys: string[]; bytes: number; stored: number };

const isQuota = (e: unknown) => /quota/i.test(`${(e as { name?: string })?.name || ""} ${(e as Error)?.message || ""}`);

async function put(cache: Cache, key: string, res: Response) {
  try {
    await cache.put(key, res);
  } catch (e) {
    if (isQuota(e)) throw new OfflineSaveError("quota", "This device is out of space for this lecture's audio. Remove some saved lectures or free up storage, then try again.");
    throw e;
  }
}

const TYPES: Record<string, string> = { mp3: "audio/mpeg", json: "application/json", vtt: "text/vtt; charset=utf-8", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const typeOf = (url: string, res?: Response) => {
  const ext = new URL(url).pathname.split(".").pop()?.toLowerCase() || "";
  return TYPES[ext] || res?.headers.get("content-type") || "application/octet-stream";
};

async function getFile(url: string, signal?: AbortSignal): Promise<Response> {
  const same = new URL(url).origin === window.location.origin;
  let res: Response;
  try {
    res = await fetch(url, same ? { credentials: "same-origin", cache: "no-cache", signal } : { mode: "cors", credentials: "omit", cache: "no-cache", signal });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    if (!navigator.onLine) throw new OfflineSaveError("offline", "No connection. Saving needs the internet; what's saved so far stays.");
    throw new OfflineSaveError("http", `Couldn't download ${url.split("/").slice(-2).join("/")} (blocked or unreachable).`);
  }
  if (!res.ok) throw new OfflineSaveError("http", `Couldn't download ${url.split("/").slice(-2).join("/")} (${res.status}).`);
  return res;
}

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");

/** Read a body to the end, reporting bytes as they arrive. */
async function readAll(res: Response, onBytes: (n: number) => void): Promise<Uint8Array<ArrayBuffer>> {
  if (!res.body) {
    const b = new Uint8Array(await res.arrayBuffer());
    onBytes(b.byteLength);
    return b;
  }
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    n += value.byteLength;
    onBytes(value.byteLength);
  }
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

/**
 * Store one file: a pointer at its URL and the bytes under their content id (skipped when another
 * lecture already stored the same bytes). Returns the blob key and its size.
 */
async function storeFile(cache: Cache, url: string, onBytes: (n: number) => void): Promise<{ key: string; bytes: number; fresh: boolean }> {
  // a versioned URL (…/narration.mp3?v=<recording>) never changes: a stored copy is reused as is
  if (new URL(url).search) {
    const ptr = await cache.match(url);
    const key = ptr?.headers.get("x-hk-blob");
    if (key && (await cache.match(key))) return { key, bytes: Number(ptr!.headers.get("x-hk-size")) || 0, fresh: false };
  }
  const ctl = new AbortController();
  const res = await getFile(url, ctl.signal);
  const type = typeOf(url, res);
  const etag = (res.headers.get("etag") || "").replace(/^W\//, "").replace(/[^A-Za-z0-9]/g, "");
  const len = Number(res.headers.get("content-length")) || 0;
  let key: string;
  let bytes = len;
  let fresh = false;
  if (etag && len) {
    // the server named the content: a file another lecture stored is not downloaded again
    key = `${window.location.origin}/__hk/blob/e-${etag}-${len}`;
    if (await cache.match(key)) ctl.abort();
    else {
      // streamed straight into the cache (an 11 MB narration never sits in memory)
      const counted = res.body
        ? res.body.pipeThrough(
            new TransformStream<Uint8Array, Uint8Array>({
              transform(chunk, c) {
                onBytes(chunk.byteLength);
                c.enqueue(chunk);
              },
            })
          )
        : await readAll(res, onBytes);
      await put(cache, key, new Response(counted, { headers: { "content-type": type, "content-length": String(len) } }));
      fresh = true;
    }
  } else {
    const body = await readAll(res, onBytes);
    const digest = hex(await crypto.subtle.digest("SHA-256", body)).slice(0, 40);
    key = `${window.location.origin}/__hk/blob/s-${digest}-${body.byteLength}`;
    bytes = body.byteLength;
    if (!(await cache.match(key))) {
      await put(cache, key, new Response(body, { headers: { "content-type": type, "content-length": String(body.byteLength) } }));
      fresh = true;
    }
  }
  await put(cache, url, new Response(null, { headers: { "x-hk-blob": key, "content-type": type, "x-hk-size": String(bytes) } }));
  return { key, bytes, fresh };
}

type MediaJson = { source?: string; audio?: string; music?: string; poster?: string; captions?: string; video?: string };

/**
 * Save a lecture's recorded media (`base`: its folder URL). `version`: the script hash the catalog
 * expects; a recording made from another script is skipped (the player wouldn't use it).
 */
export async function cacheLectureMedia(base: string, version: string, onBytes: (n: number) => void = () => {}): Promise<LectureFiles> {
  const folder = new URL(base.endsWith("/") ? base : `${base}/`, window.location.origin).href;
  const cache = await caches.open(C.media);
  const manifestUrl = `${folder}media.json`;
  const res = await getFile(manifestUrl);
  const text = await res.text();
  let m: MediaJson;
  try {
    m = JSON.parse(text) as MediaJson;
  } catch {
    throw new OfflineSaveError("http", "This lecture's media list is unreadable.");
  }
  const urls: string[] = [];
  if (!m.source || m.source === version || version === "unknown") {
    for (const f of [m.audio, m.music, m.captions, m.poster]) if (f) urls.push(new URL(f, folder).href);
  }
  const out: LectureFiles = { files: [], keys: [], bytes: 0, stored: 0 };
  for (const u of urls) {
    const r = await storeFile(cache, u, onBytes);
    out.files.push({ url: u, key: r.key, bytes: r.bytes });
    out.keys.push(u, r.key);
    out.bytes += r.bytes;
    if (r.fresh) out.stored += r.bytes;
  }
  // the manifest last: with it, the player finds the files above
  const blob = new Blob([text], { type: "application/json" });
  const mkey = `${window.location.origin}/__hk/blob/s-${hex(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())).slice(0, 40)}-${blob.size}`;
  await put(cache, mkey, new Response(blob, { headers: { "content-type": "application/json" } }));
  await put(cache, manifestUrl, new Response(null, { headers: { "x-hk-blob": mkey, "content-type": "application/json", "x-hk-size": String(blob.size) } }));
  out.files.push({ url: manifestUrl, key: mkey, bytes: blob.size });
  out.keys.push(manifestUrl, mkey);
  out.bytes += blob.size;
  return out;
}

/** Re-store any file a prune dropped while the lecture was saving (its record was not written yet). */
export async function repairLectureMedia(rec: SavedMeta, base: string | undefined): Promise<void> {
  if (!rec.files?.length || !base) return;
  const cache = await caches.open(C.media);
  for (const f of rec.files) {
    if ((await cache.match(f.key)) && (await cache.match(f.url))) continue;
    await cacheLectureMedia(base, "unknown");
    return;
  }
}

/** Bytes a save of these items adds for the lectures' shared music: once per device. */
export function lectureSharedExtra(catalog: Catalog | null | undefined, saved: Map<string, SavedMeta>, items: { kind: string }[]): number {
  if (!catalog?.lectureSharedBytes || !items.some((i) => i.kind === "lecture")) return 0;
  for (const m of saved.values()) if (m.kind === "lecture" && m.files?.length) return 0;
  return catalog.lectureSharedBytes;
}

/** Distinct stored bytes of saved lectures' media (shared files counted once). */
export function lectureMediaBytes(saved: Iterable<SavedMeta>): number {
  const seen = new Map<string, number>();
  for (const m of saved) for (const f of m.files ?? []) seen.set(f.key, f.bytes);
  let n = 0;
  for (const b of seen.values()) n += b;
  return n;
}

/**
 * Drop lecture files no saved lecture points at any more (the worker's prune does the same; this
 * runs right after a removal so the space comes back even before the worker wakes up). Files several
 * lectures share stay until the last of them is removed.
 */
export async function pruneLectureFiles(): Promise<void> {
  try {
    const meta = await caches.open(C.meta);
    const keep = new Set<string>();
    for (const req of await meta.keys()) {
      if (!new URL(req.url).pathname.startsWith("/__hk/page/")) continue;
      const m = (await (await meta.match(req))?.json().catch(() => null)) as SavedMeta | null;
      (m?.media ?? []).forEach((k) => keep.add(new URL(k, window.location.origin).href));
    }
    const media = await caches.open(C.media);
    for (const req of await media.keys()) {
      const u = new URL(req.url);
      const lectureFile = u.pathname.startsWith("/__hk/blob/") || LECTURE_FILE.test(u.pathname);
      if (lectureFile && !keep.has(req.url)) await media.delete(req);
    }
  } catch {
    // the worker's prune catches up
  }
}
