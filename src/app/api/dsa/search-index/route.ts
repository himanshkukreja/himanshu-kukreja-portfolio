import { NextResponse, type NextRequest } from "next/server";
import { DSA_FULL } from "@/lib/dsa/flags";
import { controlMap, isLive, questKey, shortKey } from "@/lib/learn/controls";
import { TRANSCRIPT_SHORT, type TranscriptMoment, type TranscriptSource } from "@/lib/learn/lecture/transcript";
import { contentSha, loadSearchPart, type SearchPart, type StoredMoments } from "@/lib/dsa/search-index-build";
import type { DsaMoments } from "@/lib/dsa/search-index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// ⌘K on a DSA page. GET → the lessons and problems (the palette's scorer input, ~130 KB gzipped); GET ?part=moments → the lecture
// and short moments, which only "In lectures" deep links need (loaded lazily). Each is one R2 object per content commit, written by
// the deploy warm-up (/api/dsa/ai-warm), so a visit is one read (and a 304 for a browser that has it). Filtering happens in the browser.

const headers = (etag: string | null, part: SearchPart) => ({
  "Content-Type": "application/json; charset=utf-8",
  // keyed by the content commit: the ETag changes with it. Browsers re-check (max-age short), the edge keeps it long; the moments part
  // applies publishing controls per request, so the edge keeps it briefly
  "Cache-Control": part === "moments" ? "public, max-age=300, s-maxage=300, stale-while-revalidate=3600" : "public, max-age=300, s-maxage=3600, stale-while-revalidate=604800",
  ...(etag ? { ETag: etag } : {}),
});

/** hidden and not-yet-scheduled shorts (and shorts of a hidden lecture) leave the moments (publishing controls; a read failure hides nothing) */
async function applyControls(body: string): Promise<string> {
  const j = JSON.parse(body) as StoredMoments;
  const controls = await controlMap().catch(() => new Map());
  const drop = new Set<number>();
  j.transcripts.l.forEach((s: TranscriptSource, k) => {
    if (s[4] !== TRANSCRIPT_SHORT) return;
    if (!isLive(controls.get(shortKey(s[0]))) || (j.shortOf[s[0]] && !isLive(controls.get(questKey(j.shortOf[s[0]]))))) drop.add(k);
  });
  const out: DsaMoments = { v: 1, transcripts: j.transcripts };
  if (drop.size) {
    const remap: number[] = [];
    const l: TranscriptSource[] = [];
    j.transcripts.l.forEach((s, k) => { if (!drop.has(k)) remap[k] = l.push(s) - 1; });
    const m = j.transcripts.m.filter(([k]) => !drop.has(k)).map(([k, at, text]): TranscriptMoment => [remap[k], at, text]);
    out.transcripts = { ...j.transcripts, l, m };
  }
  return JSON.stringify(out);
}

export async function GET(req: NextRequest) {
  const part: SearchPart = req.nextUrl.searchParams.get("part") === "moments" ? "moments" : "docs";
  if (!DSA_FULL) return NextResponse.json(part === "docs" ? { v: 2, docs: [] } : { v: 1, transcripts: { v: 1, built: "", l: [], m: [] } });
  const sha = await contentSha();
  // the moments part has no ETag: publishing controls change what it serves without a new commit
  const etag = sha && part === "docs" ? `"sidx-${part}-${sha}"` : null;
  if (etag && req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers: headers(etag, part) });
  try {
    const { body, from } = await loadSearchPart(part, sha);
    return new NextResponse(part === "moments" ? await applyControls(body) : body, { headers: { ...headers(etag, part), "x-sidx-from": from } });
  } catch (e) {
    console.error("[dsa-search-index]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Unavailable just now." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
