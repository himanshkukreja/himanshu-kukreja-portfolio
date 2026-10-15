import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["new", "replied", "resolved"] as const;

/** GET ?limit=200: latest contact form messages (rendered as plain text in admin). */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("limit") || "200", 10) || 200, 1), 1000);
  const { data, error } = await supabase
    .from("contact_queries")
    .select("id, name, email, message, status, created_at, admin_notes")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[admin/contact-queries] fetch failed:", error.message);
    return NextResponse.json({ error: "Failed to fetch queries" }, { status: 500 });
  }
  return NextResponse.json(data || []);
}

/** PATCH { id, status?, admin_notes? } */
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : null;
  const patch: Record<string, string> = {};
  if (typeof body?.status === "string" && (STATUSES as readonly string[]).includes(body.status)) patch.status = body.status;
  if (typeof body?.admin_notes === "string") patch.admin_notes = body.admin_notes.slice(0, 4000);
  if (!id || !Object.keys(patch).length) return NextResponse.json({ error: "id and a valid status or admin_notes are required" }, { status: 400 });

  const { error } = await supabase.from("contact_queries").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: "Failed to update query" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** DELETE { id } */
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const body = await req.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const { error } = await supabase.from("contact_queries").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "Failed to delete query" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
