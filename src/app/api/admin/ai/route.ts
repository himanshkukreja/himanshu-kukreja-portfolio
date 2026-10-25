import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { supabase } from "@/lib/supabase";
import { FEATURES, FEATURE_IDS } from "@/lib/ai/features";
import { MODELS, PRICES } from "@/lib/ai/prices";
import { featureConfig, getAiSettings, saveAiSettings, type AiSettings } from "@/lib/ai/settings";
import { getBudget, startOfToday } from "@/lib/ai/governor";

export const dynamic = "force-dynamic";

/** GET /api/admin/ai → settings, the governor's view, this cycle's dashboard and the feature table. */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  try {
    const settings = await getAiSettings(true);
    const budget = await getBudget(settings, true);
    const { data, error } = await supabase.rpc("ai_dashboard", { p_from: budget.cycle.start, p_today: startOfToday().toISOString() });
    if (error) throw new Error(error.message);
    return NextResponse.json(
      {
        keyConfigured: !!process.env.ANTHROPIC_API_KEY,
        settings,
        budget,
        dashboard: data,
        features: FEATURE_IDS.map((id) => ({ id, ...featureConfig(settings, id), defaultModel: FEATURES[id].model })),
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
