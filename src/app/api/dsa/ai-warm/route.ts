import { NextResponse } from "next/server";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getCatalog, loadCatalog } from "@/lib/dsa/ai/search";

/**
 * GET /api/dsa/ai-warm → { entries, from, ms }: builds the tutor's catalog if this content commit has none in R2 yet (and
 * writes it there), loads it into this isolate, so the first answer after a deploy doesn't wait for it. Called by the
 * warm-up (scripts/cf/warm.mjs). No model call. 404 in "soon" mode.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!DSA_FULL) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const r = await loadCatalog(); // the R2 object (written now if missing)
    await getCatalog(); // and this isolate's data-cache copy
    return NextResponse.json({ entries: r.entries.length, from: r.from, ms: r.ms }, { headers: { "Cache-Control": "no-store", "x-robots-tag": "noindex" } });
  } catch (e) {
    console.error("[dsa-ai-warm]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Unavailable just now." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
