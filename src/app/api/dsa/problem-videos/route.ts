import { NextResponse } from "next/server";
import { DSA_FULL } from "@/lib/dsa/flags";
import { problemVideoIds } from "@/lib/dsa/media";

/**
 * GET /api/dsa/problem-videos → { ids }: the problems whose solution video is published (src/lib/dsa/media.ts
 * problemVideoIds), for the problems page's video marks and "Has solution video" filter. Not part of the page: working
 * it out cold reads every problem's solution and media (105 s inside the page's render on staging, Nov 2026). Kept by
 * the edge cache (s-maxage) and the data cache (an hour). 404 in "soon" mode.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!DSA_FULL) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const ids = await problemVideoIds();
    return NextResponse.json({ ids }, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400", "x-robots-tag": "noindex" } });
  } catch (e) {
    console.error("[dsa-problem-videos]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Unavailable just now." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
