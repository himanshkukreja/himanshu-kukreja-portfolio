import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

/** Views (distinct viewers who pressed play) and upvotes per lecture, for every lecture; refreshed every 5 min. */
const stats = unstable_cache(
  async () => {
    const { data, error } = await supabase.rpc("lecture_stats");
    if (error) return {} as Record<string, { v: number; u: number }>;
    const out: Record<string, { v: number; u: number }> = {};
    for (const r of (data || []) as { lecture_id: string; views: number; votes: number }[]) out[r.lecture_id] = { v: Number(r.views) || 0, u: Number(r.votes) || 0 };
    return out;
  },
  ["lecture-stats-v1"],
  { revalidate: 300, tags: ["lecture-stats"] },
);

export async function GET() {
  return NextResponse.json(await stats(), { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" } });
}
