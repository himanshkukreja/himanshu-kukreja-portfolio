import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { supabase } from "@/lib/supabase";
import { CONTENT_FEATURES, FEATURES, FEATURE_IDS } from "@/lib/ai/features";
import { MODELS, PRICES } from "@/lib/ai/prices";
import { featureConfig, getAiSettings, saveAiSettings, type AiSettings } from "@/lib/ai/settings";
import { getBudget, startOfToday } from "@/lib/ai/governor";

export const dynamic = "force-dynamic";

/**
 * The cycle's learner usage by model and by status, without the content jobs (eval, batch): the dashboard's
 * "exclude content jobs" view (ai_dashboard sums every call). Read in pages of the live rows' three columns.
 */
async function liveBreakdown(from: string) {
  const byModel = new Map<string, { model: string; calls: number; cost: number }>();
  const byStatus: Record<string, number> = {};
  for (let at = 0; at < 50_000; at += 1000) {
    const { data, error } = await supabase
      .from("ai_calls")
      .select("model, status, cost_usd")
      .gte("created_at", from)
      .not("feature", "in", `(${CONTENT_FEATURES.join(",")})`)
      .order("id", { ascending: true })
      .range(at, at + 999);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as { model: string; status: string; cost_usd: number | null }[]) {
      const m = byModel.get(r.model) ?? { model: r.model, calls: 0, cost: 0 };
      if (r.status === "ok") m.calls++;
      m.cost += Number(r.cost_usd) || 0;
      byModel.set(r.model, m);
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    }
    if ((data ?? []).length < 1000) break;
  }
  return { byModel: [...byModel.values()].sort((a, b) => b.cost - a.cost), byStatus };
}

/** GET /api/admin/ai → settings, the governor's view, this cycle's dashboard (all calls, and `live`: without the
 *  content jobs) and the feature table (each feature's `content` flag: a content job, features.ts kind). */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  try {
    const settings = await getAiSettings(true);
    const budget = await getBudget(settings, true);
    const [{ data, error }, live] = await Promise.all([supabase.rpc("ai_dashboard", { p_from: budget.cycle.start, p_today: startOfToday().toISOString() }), liveBreakdown(budget.cycle.start)]);
    if (error) throw new Error(error.message);
    return NextResponse.json(
      {
        keyConfigured: !!process.env.ANTHROPIC_API_KEY,
        settings,
        budget,
        dashboard: data,
        live,
        features: FEATURE_IDS.map((id) => ({ id, ...featureConfig(settings, id), defaultModel: FEATURES[id].model, content: FEATURES[id].kind === "content" })),
        models: Object.values(MODELS).map((id) => ({ id, price: PRICES[id] })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[admin/ai]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

/** PATCH /api/admin/ai { ...Partial<AiSettings> } → saved settings */
export async function PATCH(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  try {
    const patch = (await request.json()) as Partial<AiSettings>;
    if (patch.endsOn && !/^\d{4}-\d{2}-\d{2}$/.test(patch.endsOn)) return NextResponse.json({ error: "endsOn must be YYYY-MM-DD" }, { status: 400 });
    const settings = await saveAiSettings(patch, admin.email);
    return NextResponse.json({ settings });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
