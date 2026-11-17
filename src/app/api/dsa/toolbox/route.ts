import { NextResponse } from "next/server";
import { DSA_FULL } from "@/lib/dsa/flags";
import { loadOutline, stationLessons } from "@/lib/dsa/toolbox-load";

/**
 * GET /api/dsa/toolbox → { stations: [{ id, lessonIds }] }: each metro station's written lessons. The browser checks them
 * against the learner's finished lessons to record a newly earned tool and show its toast (DsaRewardsHost). Public, the same
 * for everyone, cached at the edge. 404 in "soon" mode.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!DSA_FULL) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const { outline } = await loadOutline();
    if (!outline) throw new Error("no outline");
    return NextResponse.json({ stations: stationLessons(outline) }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400", "x-robots-tag": "noindex" } });
  } catch (e) {
    console.error("[dsa-toolbox]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The toolbox is unavailable just now." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
