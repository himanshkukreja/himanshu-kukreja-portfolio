import { gzipSync } from "node:zlib";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { notConfigured, phErrorResponse } from "@/lib/analytics/posthogServer";
import { getSnapshotChunk, getSnapshotSources } from "@/lib/analytics/replayServer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Replay snapshots for the admin's own rrweb player (speed controls, skip inactivity).
 *   GET ?id=<session id>                → { sources, start, end, chunk } (JSON)
 *   GET ?id=<session id>&from=0&to=7    → JSONL `[windowId, rrwebEvent]`, compressed events inflated
 * Admin-only; the personal API key never leaves the server. Read-only against PostHog.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const nc = notConfigured();
  if (nc) return nc;
  const sp = request.nextUrl.searchParams;
  const id = sp.get("id") || "";
  try {
    if (!sp.has("from")) return NextResponse.json(await getSnapshotSources(id));
    const body = await getSnapshotChunk(id, Number(sp.get("from")), Number(sp.get("to") ?? sp.get("from")));
    const headers: Record<string, string> = { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "private, max-age=86400, immutable" }; // a blob range never changes once written
    // Inflated DOM JSON compresses ~8×; gzip it ourselves so big chunks stay small on the wire.
    if (/\bgzip\b/.test(request.headers.get("accept-encoding") || "") && body.length > 2048) {
      headers["Content-Encoding"] = "gzip";
      headers.Vary = "Accept-Encoding";
      return new Response(new Uint8Array(gzipSync(body, { level: 6 })), { headers });
    }
    return new Response(body, { headers });
  } catch (e) {
    return phErrorResponse(e);
  }
}
