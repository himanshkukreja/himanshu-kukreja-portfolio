import { NextResponse } from "next/server";
import { DSA_FULL } from "@/lib/dsa/flags";
import { istDate } from "@/lib/learn/arena/shared";
import { dsaDailyDays } from "@/lib/dsa/daily-server";
import type { DsaDailyResponse } from "@/lib/dsa/daily";

/**
 * GET /api/dsa/daily → { today, daily, recent }: today's DSA problem (Asia/Kolkata day, the same for everyone) and the
 * previous 13 days' (the streak strip on /dsa/daily). Public and the same for everyone, so cached for 5 minutes at the
 * edge (the day rolls over within that). 404 in "soon" mode.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!DSA_FULL) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const today = istDate();
  try {
    const days = await dsaDailyDays(today, 14);
    const daily = days[0]?.date === today ? days[0] : null;
    const body: DsaDailyResponse = { today, daily, recent: days.filter((d) => d.date !== today) };
    return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600", "x-robots-tag": "noindex" } });
  } catch (e) {
    console.error("[dsa-daily]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The daily problem is unavailable just now." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
