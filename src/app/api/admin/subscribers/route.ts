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

  const { data, error } = await supabase
    .from("newsletter_subscribers")
    .select("email, created_at, city, region, country, timezone, unsubscribed")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load subscribers" }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
