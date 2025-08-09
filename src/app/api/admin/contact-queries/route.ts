import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-admin-token");
  
  if (!token || token !== process.env.NEWSLETTER_ADMIN_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: queries, error } = await supabase
      .from("contact_queries")
      .select("id, name, email, message, status, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Failed to fetch contact queries:", error);
      return NextResponse.json({ error: "Failed to fetch queries" }, { status: 500 });
    }

    return NextResponse.json(queries || []);
  } catch (error) {
    console.error("Contact queries API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
