import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** GET: every newsletter subscriber, newest first. */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const { data, error } = await supabase
    .from("newsletter_subscribers")
    .select("email, created_at, city, region, country, timezone, unsubscribed, unsubscribed_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: "Failed to load subscribers" }, { status: 500 });
  return NextResponse.json(data || []);
}

const emailOf = (v: unknown) => (typeof v === "string" && v.includes("@") && v.length <= 320 ? v.trim().toLowerCase() : null);

/** PATCH { email, unsubscribed: boolean } → unsubscribe / resubscribe. */
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const body = await req.json().catch(() => ({}));
  const email = emailOf(body?.email);
  if (!email || typeof body?.unsubscribed !== "boolean") {
    return NextResponse.json({ error: "email and unsubscribed are required" }, { status: 400 });
  }
  const { error } = await supabase
    .from("newsletter_subscribers")
    .update({ unsubscribed: body.unsubscribed, unsubscribed_at: body.unsubscribed ? new Date().toISOString() : null })
    .eq("email", email);
  if (error) return NextResponse.json({ error: "Failed to update subscriber" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** DELETE { email } → remove the subscriber row entirely. */
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const body = await req.json().catch(() => ({}));
  const email = emailOf(body?.email);
  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });
  const { error } = await supabase.from("newsletter_subscribers").delete().eq("email", email);
  if (error) return NextResponse.json({ error: "Failed to delete subscriber" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
