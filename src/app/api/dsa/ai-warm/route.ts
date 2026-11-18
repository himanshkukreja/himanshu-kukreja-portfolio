import { NextResponse } from "next/server";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getCatalog, loadCatalog } from "@/lib/dsa/ai/search";
import { contentSha, loadMomentChunk, loadSearchPart, momentChunks, type SearchPart } from "@/lib/dsa/search-index-build";

/**
 * GET /api/dsa/ai-warm → { entries, from, ms }: builds the tutor's catalog if this content commit has none in R2 yet (and
 * writes it there), loads it into this isolate, so the first answer after a deploy doesn't wait for it. ?part=docs|moments
 * does the same for ⌘K's DSA index (search-index route): one object per content commit and part, written here. Called by the
 * warm-up (scripts/cf/warm.mjs). No model call. 404 in "soon" mode.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!DSA_FULL) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const part = new URL(req.url).searchParams.get("part");
  if (part === "docs" || part === "moments") {
    try {
      const t = Date.now();
      const sha = await contentSha();
      const chunk = new URL(req.url).searchParams.get("chunk");
      if (part === "moments" && chunk !== null) {
        // one slice of the moments (a request can't read every lecture: Workers cap subrequests): ?chunk=0 also says how many there are
        const total = await momentChunks();
        const n = Number(chunk);
        if (!Number.isInteger(n) || n < 0 || n >= Math.max(total, 1)) return NextResponse.json({ error: "No such chunk", chunks: total }, { status: 404, headers: { "Cache-Control": "no-store" } });
        const r = await loadMomentChunk(sha, n);
        return NextResponse.json({ part, chunk: n, chunks: total, entries: r.entries.length, from: r.from, ms: Date.now() - t }, { headers: { "Cache-Control": "no-store", "x-robots-tag": "noindex" } });
      }
      const r = await loadSearchPart(part as SearchPart, sha);
      return NextResponse.json({ part, bytes: r.body.length, from: r.from, ms: Date.now() - t }, { headers: { "Cache-Control": "no-store", "x-robots-tag": "noindex" } });
    } catch (e) {
      console.error("[dsa-ai-warm]", e instanceof Error ? e.message : e);
      return NextResponse.json({ error: "Unavailable just now." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
  }
  try {
    const r = await loadCatalog(); // the R2 object (written now if missing)
    await getCatalog(); // and this isolate's data-cache copy
    return NextResponse.json({ entries: r.entries.length, from: r.from, ms: r.ms }, { headers: { "Cache-Control": "no-store", "x-robots-tag": "noindex" } });
  } catch (e) {
    console.error("[dsa-ai-warm]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Unavailable just now." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
