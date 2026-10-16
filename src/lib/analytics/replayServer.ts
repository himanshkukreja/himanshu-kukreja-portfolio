import "server-only";
import zlib from "node:zlib";
import type { SnapshotSourcesRes } from "./journeys";
import { cached, isUuid, phFetch, phFetchText, PhError } from "./posthogServer";

/**
 * Session replay snapshots for our own player (/admin replay with speed controls).
 *
 * PostHog's snapshot API (v2 "blob_v2" sources, see posthog/session_recordings/session_recording_api.py):
 *   1. GET /session_recordings/{id}/snapshots → { sources: [{ source: "blob_v2", blob_key: "0", start_timestamp, end_timestamp }…] }
 *   2. GET …/snapshots?source=blob_v2&start_blob_key=a&end_blob_key=b → JSONL (decompressed server-side
 *      by PostHog), one `[windowId, rrwebEvent]` per line. A personal API key may ask for ≤ 20 blob
 *      keys per call.
 *
 * posthog-js compresses the heavy parts of rrweb events on capture (`cv: "2024-10"`): a full
 * snapshot's `data`, and a mutation's / stylesheet rule's adds/removes/texts/attributes are gzip
 * (or zstd) bytes stored as latin1 strings. We inflate them here (same logic as PostHog's
 * replay-shared `decompressEvent`) so the browser gets plain rrweb events, and gzip the response:
 * the inflated DOM JSON compresses ~8× (a raw blob range is mostly incompressible binary-in-JSON),
 * which keeps every chunk well under serverless response limits.
 */

/** Blobs per chunk request. The first chunk holds the full snapshot and is usually the largest. */
export const SNAPSHOT_CHUNK = 8;
const MAX_RANGE = 19; // PostHog: end - start ≤ 20 for personal API keys

type SourcesApi = { sources?: { source?: string; blob_key?: string; start_timestamp?: string | null; end_timestamp?: string | null }[] };

export async function getSnapshotSources(id: string): Promise<SnapshotSourcesRes> {
  if (!isUuid(id)) throw new PhError("Bad recording id", 400);
  const r = await cached(`snap_src:${id}`, 10_000, () => phFetch<SourcesApi>(`/session_recordings/${id}/snapshots`, {}, 30_000)).catch((e: PhError) => {
    if (e?.upstream === 404) throw new PhError("No recording for this session", 404, 404);
    throw e;
  });
  const sources = (r?.sources ?? [])
    .filter((s) => s.source === "blob_v2" && s.blob_key != null && /^\d+$/.test(String(s.blob_key)))
    .map((s) => ({ key: Number(s.blob_key), start: s.start_timestamp ?? null, end: s.end_timestamp ?? null }))
    .sort((a, b) => a.key - b.key);
  const starts = sources.map((s) => s.start).filter(Boolean) as string[];
  const ends = sources.map((s) => s.end).filter(Boolean) as string[];
  return {
    configured: true,
    id,
    sources,
    start: starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null,
    end: ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : null,
    chunk: SNAPSHOT_CHUNK,
  };
}

/* ───────────────────────────── cv decompression ───────────────────────────── */

type Ev = { type?: number; cv?: string; data?: unknown; timestamp?: number };

const FULL_SNAPSHOT = 2;
const INCREMENTAL = 3;
const SRC_MUTATION = 0;
const SRC_STYLE_RULE = 8;

function inflate(s: unknown): unknown {
  if (typeof s !== "string" || !s) return s;
  const raw = Buffer.from(s, "latin1");
  let out: Buffer;
  if (raw[0] === 0x1f && raw[1] === 0x8b) out = zlib.gunzipSync(raw);
  else if (raw[0] === 0x28 && raw[1] === 0xb5 && raw[2] === 0x2f && raw[3] === 0xfd) {
    const z = (zlib as unknown as { zstdDecompressSync?: (b: Buffer) => Buffer }).zstdDecompressSync;
    if (!z) throw new Error("zstd payload but this Node has no zstd");
    out = z(raw);
  } else throw new Error("cv payload is neither gzip nor zstd");
  return JSON.parse(out.toString("utf8"));
}

/** posthog-js `cv: "2024-10"` compressed event → plain rrweb event (unknown versions pass through). */
export function decompressEvent(ev: Ev): Ev {
  if (!ev || typeof ev !== "object" || !("cv" in ev)) return ev;
  if (ev.cv !== "2024-10") return ev;
  const { cv: _cv, ...rest } = ev;
  void _cv;
  try {
    if (ev.type === FULL_SNAPSHOT && typeof ev.data === "string") return { ...rest, data: inflate(ev.data) };
    const d = ev.data as Record<string, unknown> | undefined;
    if (ev.type === INCREMENTAL && d && typeof d === "object") {
      if (d.source === SRC_STYLE_RULE) return { ...rest, data: { ...d, adds: inflate(d.adds), removes: inflate(d.removes) } };
      if (d.source === SRC_MUTATION && "texts" in d)
        return { ...rest, data: { ...d, adds: inflate(d.adds), removes: inflate(d.removes), texts: inflate(d.texts), attributes: inflate(d.attributes) } };
    }
    return rest;
  } catch {
    return ev; // leave it; the player skips what it can't apply
  }
}

/**
 * Blob range → JSONL of `[windowId, event]` with compressed events inflated. Lines PostHog sends as
 * `{ window_id, data: [...] }` (older shape) are flattened to the same pairs.
 */
export async function getSnapshotChunk(id: string, from: number, to: number): Promise<string> {
  if (!isUuid(id)) throw new PhError("Bad recording id", 400);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to - from > MAX_RANGE) throw new PhError("Bad blob range", 400);
  const text = await phFetchText(`/session_recordings/${id}/snapshots?source=blob_v2&start_blob_key=${from}&end_blob_key=${to}`);
  const out: string[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (Array.isArray(parsed)) {
      out.push(JSON.stringify([String(parsed[0] ?? ""), decompressEvent(parsed[1] as Ev)]));
    } else if (parsed && typeof parsed === "object") {
      const o = parsed as { window_id?: string; windowId?: string; data?: unknown[]; type?: number; timestamp?: number };
      if (Array.isArray(o.data) && o.type === undefined) {
        const w = String(o.window_id ?? o.windowId ?? "");
        for (const d of o.data) out.push(JSON.stringify([w, decompressEvent(d as Ev)]));
      } else if (typeof o.type === "number" && typeof o.timestamp === "number") {
        const { windowId, ...ev } = o as Ev & { windowId?: string };
        out.push(JSON.stringify([String(windowId ?? ""), decompressEvent(ev)]));
      }
    }
  }
  return out.join("\n");
}
