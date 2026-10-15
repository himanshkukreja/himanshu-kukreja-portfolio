import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get("email") || "").toLowerCase().trim();
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  // Upsert, not update: account holders who never joined the newsletter (learn announcements) get a
  // row marked unsubscribed, which every sender (newsletter + /api/admin/announce) honours.
  const { error } = await supabase
    .from("newsletter_subscribers")
    .upsert({ email, unsubscribed: true, unsubscribed_at: new Date().toISOString() }, { onConflict: "email" });

  if (error) {
    return NextResponse.json({ error: "Failed to unsubscribe" }, { status: 500 });
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL || "/";
  return NextResponse.redirect(`${site}/?unsubscribed=1`, { status: 302 });
}
