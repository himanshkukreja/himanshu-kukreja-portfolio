import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { revalidateControlled } from "@/lib/learn/controlsRevalidate";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Hourly (vercel.json crons): shorts and side quests whose scheduled time passed in the last 3 hours get
 * their pages refreshed, so they appear on time. Idempotent and harmless to call; does nothing when
 * nothing is due.
 */
export async function GET() {
  const now = Date.now();
  const { data, error } = await supabase
    .from("content_controls")
    .select("key")
    .eq("status", "scheduled")
    .gt("publish_at", new Date(now - 3 * 3600_000).toISOString())
    .lte("publish_at", new Date(now).toISOString())
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const keys = (data || []).map((r) => r.key as string);
  if (keys.length) revalidateControlled(keys);
  return NextResponse.json({ ok: true, due: keys.length });
}
