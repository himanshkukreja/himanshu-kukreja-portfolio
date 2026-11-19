import { NextResponse } from "next/server";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getCatalog, loadCatalog } from "@/lib/dsa/ai/search";
import { assembleShorts, loadShortsChunk, shortsChunks, shortsSha } from "@/lib/dsa/shorts-manifest";
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
  if (part === "shorts") {
    // the shorts manifest (lists of shorts): ?chunk=n builds one slice (?fresh=1, admins only: read media.json again), no chunk puts the slices together
    try {
      const t = Date.now();
      const sha = await shortsSha();
      const q = new URL(req.url).searchParams;
      const chunk = q.get("chunk");
      if (chunk !== null) {
        const total = await shortsChunks();
        const n = Number(chunk);
        if (!Number.isInteger(n) || n < 0 || n >= Math.max(total, 1)) return NextResponse.json({ error: "No such chunk", chunks: total }, { status: 404, headers: { "Cache-Control": "no-store" } });
        let fresh = false;
        if (q.get("fresh")) {
          const given = (req.headers.get("authorization") || "").replace(/^Bearer /, "").trim();
          const want = process.env.ANALYTICS_ADMIN_TOKEN || "";
          if (!want || given !== want) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
          fresh = true;
        }
        const r = await loadShortsChunk(sha, n, fresh);
        return NextResponse.json({ part, chunk: n, chunks: total, entries: r.rows.length, from: r.from, ms: Date.now() - t }, { headers: { "Cache-Control": "no-store", "x-robots-tag": "noindex" } });
      }
      if (!sha) return NextResponse.json({ part, note: "no content bundle: built in memory on read" }, { headers: { "Cache-Control": "no-store" } });
      const r = await assembleShorts(sha);
      return NextResponse.json({ part, ...r, ms: Date.now() - t }, { headers: { "Cache-Control": "no-store", "x-robots-tag": "noindex" } });
    } catch (e) {
      console.error("[dsa-ai-warm]", e instanceof Error ? e.message : e);
      return NextResponse.json({ error: "Unavailable just now.", why: String(e instanceof Error ? e.message : e).slice(0, 200) }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
  }
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
      return NextResponse.json({ error: "Unavailable just now.", why: String(e instanceof Error ? e.message : e).slice(0, 200) }, { status: 503, headers: { "Cache-Control": "no-store" } });
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
