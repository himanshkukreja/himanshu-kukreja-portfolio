import "server-only";
/**
 * The smart-search engine on the server: built once per instance from the two cached index routes
 * (/api/search/index for documents, /api/search/transcripts for lecture moments and shorts, both ISR and
 * served from the CDN), kept 15 minutes, then rebuilt in the background while the old one keeps answering.
 * If the routes can't be fetched (a protected preview deployment), the same builders run in-process.
 *
 * Also the shared request gate: while SMART_SEARCH_PUBLIC is false only admins get through.
 */
import { controlMap, isLive } from "@/lib/learn/controls";
import type { TranscriptIndex } from "@/lib/learn/lecture/transcript";
import { getAdmin } from "@/lib/admin/auth";
import { SmartEngine, transcriptDocs } from "./engine";
import { SMART_SEARCH_PUBLIC } from "./flag";
import { rowToDoc, type DocIndex } from "./types";
import { buildDocIndex, INDEX_PARTS, type IndexPart } from "./build";

const TTL = 15 * 60_000;
let state: { at: number; engine: Promise<SmartEngine>; refreshing: boolean } | null = null;

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

async function load(origin: string): Promise<SmartEngine> {
  const part = (p: IndexPart) => fetchJson<DocIndex>(`${origin}/api/search/index/${p}`).then((d) => (d && Array.isArray(d.d) ? d : buildDocIndex(p)));
  const [parts, moments] = await Promise.all([
    Promise.all(INDEX_PARTS.map(part)),
    fetchJson<TranscriptIndex>(`${origin}/api/search/transcripts`).then(async (t) => {
      if (t && Array.isArray(t.m)) return t;
      const { GET } = await import("@/app/api/search/transcripts/route");
      return (await (await GET()).json()) as TranscriptIndex;
    }),
  ]);
  const docs = parts.flatMap((p) => p.d.map(rowToDoc));
  const built = parts.map((p) => p.built).sort().pop() ?? "";
  return new SmartEngine([...docs, ...transcriptDocs(moments)], `${built}|${moments.built}`, parts.flatMap((p) => p.syn ?? []));
}

export async function getEngine(origin: string): Promise<SmartEngine> {
  if (state && Date.now() - state.at < TTL) return state.engine;
  if (state && !state.refreshing) {
    // stale: answer from the old engine, swap in the new one when it's ready
    const old = state;
    old.refreshing = true;
    load(origin)
      .then((e) => (state = { at: Date.now(), engine: Promise.resolve(e), refreshing: false }))
      .catch(() => (old.refreshing = false));
    return old.engine;
  }
  if (state) return state.engine;
  const engine = load(origin);
  state = { at: Date.now(), engine, refreshing: false };
  engine.catch(() => (state = null));
  return engine;
}

/** The publishing-control check every query runs (hidden or not-yet-due content never comes back). */
export async function liveCheck(): Promise<(gate: string) => boolean> {
  const controls = await controlMap();
  const now = Date.now();
  return (gate: string) => isLive(controls.get(gate), now);
}

/**
 * Local development only: `/learn/chat?preview=1` sends this header so the page can be tried and
 * screenshotted without signing in (like /admin?preview=1). Never honoured outside `next dev`.
 */
export const devPreview = (request: Request) => process.env.NODE_ENV === "development" && request.headers.get("x-smart-preview") === "1";

/** Admin check per access token, remembered 5 minutes (the preview gate runs on every keystroke-settled query). */
const admins = new Map<string, { at: number; ok: boolean }>();
export async function previewAllowed(request: Request): Promise<boolean> {
  if (SMART_SEARCH_PUBLIC || devPreview(request)) return true;
  const token = (request.headers.get("authorization") || "").slice(7).trim();
  if (!token) return false;
  const hit = admins.get(token);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.ok;
  const ok = !!(await getAdmin(request).catch(() => null));
  if (admins.size > 200) admins.clear();
  admins.set(token, { at: Date.now(), ok });
  return ok;
}

/** Where to fetch the cached index routes: production's own site URL, else this deployment's origin. */
export const originOf = (request: Request) =>
  (process.env.VERCEL_ENV === "production" && process.env.NEXT_PUBLIC_SITE_URL ? process.env.NEXT_PUBLIC_SITE_URL : new URL(request.url).origin).replace(/\/$/, "");
