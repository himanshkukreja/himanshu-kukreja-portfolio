import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function requireAdmin(req: NextRequest) {
  const token = req.headers.get("x-admin-token") || req.nextUrl.searchParams.get("token");
  if (token !== process.env.NEWSLETTER_ADMIN_TOKEN) {
    throw new Error("Unauthorized");
  }
}

export async function GET(req: NextRequest) {
  try {
    requireAdmin(req);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
