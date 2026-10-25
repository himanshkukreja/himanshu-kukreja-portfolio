import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

/** GET /api/admin/ai/calls?feature=&status=&user=&email=&page=1 → one page (50) of the AI call log. */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const p = new URL(request.url).searchParams;
  const page = Math.max(1, Number(p.get("page")) || 1);
  const user = p.get("user");
  const { data, error } = await supabase.rpc("ai_calls_page", {
    p_feature: p.get("feature") || null,
    p_status: p.get("status") || null,
    p_user: user && UUID.test(user) ? user : null,
    p_email: (p.get("email") || "").slice(0, 100) || null,
    p_limit: 50,
    p_offset: (page - 1) * 50,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as { total: number }[];
  return NextResponse.json({ rows, total: rows[0]?.total ?? 0, page }, { headers: { "Cache-Control": "no-store" } });
}
