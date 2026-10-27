import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * Comment counts per short. Short discussions reuse lesson_comments (course_id "shorts", lesson_slug = the
 * short's id), so this is one grouped read. Cached briefly at the edge; ?fresh=1 skips it after posting.
 */
export async function GET(request: Request) {
  const fresh = new URL(request.url).searchParams.has("fresh");
  const { data, error } = await supabase.from("lesson_comments").select("lesson_slug").eq("course_id", "shorts").limit(20000);
  const out: Record<string, number> = {};
  if (!error) for (const r of data || []) out[r.lesson_slug as string] = (out[r.lesson_slug as string] || 0) + 1;
  return NextResponse.json(out, { headers: { "Cache-Control": fresh ? "no-store" : "public, max-age=30, s-maxage=60, stale-while-revalidate=300" } });
}
