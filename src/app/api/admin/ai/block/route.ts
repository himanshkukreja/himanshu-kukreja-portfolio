import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** POST /api/admin/ai/block { userId, blocked, reason? } → turns AI off (or back on) for one account. */
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const { userId, blocked, reason } = (await request.json().catch(() => ({}))) as { userId?: string; blocked?: boolean; reason?: string };
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) return NextResponse.json({ error: "userId required" }, { status: 400 });
  const { error } = blocked
    ? await supabase.from("ai_blocks").upsert({ user_id: userId, reason: (reason || "").slice(0, 200) || null, created_by: admin.email })
    : await supabase.from("ai_blocks").delete().eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, blocked: !!blocked });
}
