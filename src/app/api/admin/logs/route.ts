import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;


export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = Math.min(Math.max(parseInt(limitParam || "100", 10) || 100, 1), 1000);

  const { data, error } = await supabase
    .from("newsletter_logs")
    .select("email, status, detail, created_at, campaign_id, story_slugs")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: "Failed to load logs" }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
