import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * GET /api/admin/ai/calls?feature=&status=&user=&email=&system=0&page=1 → one page (50) of the AI call
 * log. system=0 leaves out system calls (no learner: evaluations and batch content jobs).
 */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const p = new URL(request.url).searchParams;
  const page = Math.max(1, Number(p.get("page")) || 1);
  const user = p.get("user");
  const feature = p.get("feature") || null;
  const status = p.get("status") || null;
  const email = (p.get("email") || "").slice(0, 100) || null;
  const noSystem = p.get("system") === "0";

  // learner-only and not narrowed to a user or email (those never match system calls anyway): read the
  // table directly with user_id set, then the page's emails (the RPC can't leave system calls out)
  if (noSystem && !email && !(user && UUID.test(user))) {
    let q = supabase
      .from("ai_calls")
      .select("id, created_at, user_id, feature, model, input_tokens, output_tokens, cache_read_tokens, cost_usd, credits, latency_ms, status, error, request_id, meta", { count: "exact" })
      .not("user_id", "is", null)
      .order("created_at", { ascending: false })
      .range((page - 1) * 50, page * 50 - 1);
    if (feature) q = q.eq("feature", feature);
    if (status) q = q.eq("status", status);
    const { data, error, count } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const ids = [...new Set((data ?? []).map((r) => r.user_id as string))];
    const emails = new Map<string, string | null>();
    await Promise.all(
      ids.map(async (id) => {
        const { data: u } = await supabase.auth.admin.getUserById(id).catch(() => ({ data: null }));
        emails.set(id, u?.user?.email ?? null);
      })
    );
    const rows = (data ?? []).map((r) => ({ ...r, email: emails.get(r.user_id as string) ?? null, total: count ?? 0 }));
    return NextResponse.json({ rows, total: count ?? 0, page }, { headers: { "Cache-Control": "no-store" } });
  }

  const { data, error } = await supabase.rpc("ai_calls_page", {
    p_feature: feature,
    p_status: status,
    p_user: user && UUID.test(user) ? user : null,
    p_email: email,
    p_limit: 50,
    p_offset: (page - 1) * 50,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as { total: number }[];
  return NextResponse.json({ rows, total: rows[0]?.total ?? 0, page }, { headers: { "Cache-Control": "no-store" } });
}
