import { NextResponse } from "next/server";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getBadgeDefs } from "@/lib/dsa/load";
import type { BadgeDef } from "@/lib/dsa/rewards";

/**
 * GET /api/dsa/badges → { defs }: every DSA Mastery mastery badge and what it needs (src/lib/dsa/rewards.ts
 * badgeDefsFor over the world specs). The browser checks them against the learner's progress and awards the badge
 * Bits (DsaRewardsHost). Public, the same for everyone, cached at the edge. 404 in "soon" mode.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!DSA_FULL) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const defs: BadgeDef[] = await getBadgeDefs();
    return NextResponse.json({ defs }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400", "x-robots-tag": "noindex" } });
  } catch (e) {
    console.error("[dsa-badges]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Badges are unavailable just now." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
