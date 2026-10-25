import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** GET /api/admin/ai/transcript?id=<call id> → the conversation text (kept 30 days) for abuse checks. */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { data, error } = await supabase.from("ai_transcripts").select("input, output, created_at").eq("call_id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ transcript: data ?? null }, { headers: { "Cache-Control": "no-store" } });
}
