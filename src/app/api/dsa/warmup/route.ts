import { NextResponse } from "next/server";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getWarmupTiers } from "@/lib/dsa/warmup-load";

/**
 * GET /api/dsa/warmup?recent=a,b,c&station=x,y → { tiers: [recent, station, toolkit] }: the quiz questions and predict
 * exercises of those lessons (the browser picks today's one: src/lib/dsa/warmup.ts). Public lesson content, the same for
 * the same ids, so cached at the edge. 404 in "soon" mode.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ids = (v: string | null) =>
  (v || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[a-z0-9][a-z0-9-]{0,80}$/.test(s))
    .slice(0, 12);

export async function GET(req: Request) {
  if (!DSA_FULL) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const u = new URL(req.url);
  try {
    const tiers = await getWarmupTiers(ids(u.searchParams.get("recent")), ids(u.searchParams.get("station")));
    return NextResponse.json({ tiers }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600", "x-robots-tag": "noindex" } });
  } catch (e) {
    console.error("[dsa-warmup]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The warm-up is unavailable just now." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
