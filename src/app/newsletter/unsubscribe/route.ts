import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get("email") || "").toLowerCase().trim();
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("newsletter_subscribers")
    .update({ unsubscribed: true, unsubscribed_at: new Date().toISOString() })
    .eq("email", email);

  if (error) {
    return NextResponse.json({ error: "Failed to unsubscribe" }, { status: 500 });
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL || "/";
  return NextResponse.redirect(`${site}/?unsubscribed=1`, { status: 302 });
}
