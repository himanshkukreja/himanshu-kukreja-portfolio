import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { supabase } from "@/lib/supabase";
import { CONTENT_FEATURES, FEATURES, FEATURE_IDS } from "@/lib/ai/features";
import { MODELS, PRICES } from "@/lib/ai/prices";
import { featureConfig, getAiSettings, saveAiSettings, type AiSettings } from "@/lib/ai/settings";
import { getBudget, startOfToday } from "@/lib/ai/governor";
import { excludedUserIds, notAdminsFilter } from "@/lib/admin/aiCalls";

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

type XRow = { user_id: string | null; feature: string; model: string; status: string; cost_usd: number | null; credits: number | null; input_tokens: number | null; output_tokens: number | null; cache_read_tokens: number | null; latency_ms: number | null; created_at: string };

/**
 * "External users only" (`?ext=1`): the dashboard's numbers without the owner's and every admin's calls, worked out
 * from the rows (ai_dashboard and the governor's sums count everyone): the same shapes as `dashboard` and `live`, the
 * cycle's spend (status ok, as ai_spend_v2: all, live, content, today's live) and the AI users of the last 7 days.
 * Calls without a user (guests, content jobs) stay in.
 */
async function externalView(cycleStart: string, today: string, exclude: string[]) {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const from = weekAgo < cycleStart ? weekAgo : cycleStart;
  const rows: XRow[] = [];
  for (let at = 0; at < 100_000; at += 1000) {
    let q = supabase.from("ai_calls").select("user_id, feature, model, status, cost_usd, credits, input_tokens, output_tokens, cache_read_tokens, latency_ms, created_at").gte("created_at", from);
    if (exclude.length) q = q.or(notAdminsFilter(exclude));
    const { data, error } = await q.order("id", { ascending: true }).range(at, at + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as XRow[]));
    if ((data ?? []).length < 1000) break;
  }
  const isContent = (f: string) => (CONTENT_FEATURES as readonly string[]).includes(f);
  const n = (v: number | null) => Number(v) || 0;
  type F = { feature: string; calls: number; refused: number; cost: number; credits: number; input: number; output: number; cache_read: number; latSum: number; latN: number };
  const byFeature = new Map<string, F>();
  const byModel = new Map<string, { model: string; calls: number; cost: number; input: number; output: number }>();
  const liveModel = new Map<string, { model: string; calls: number; cost: number }>();
  const byStatus: Record<string, number> = {};
  const liveStatus: Record<string, number> = {};
  const daily = new Map<string, { day: string; live: number; content: number; calls: number }>();
  const active = new Set<string>();
  const spent = { cycle: 0, cycleLive: 0, cycleContent: 0, todayLive: 0 };
  for (const r of rows) {
    if (r.user_id && r.created_at >= weekAgo) active.add(r.user_id);
    if (r.created_at < cycleStart) continue;
    const content = isContent(r.feature);
    const cost = n(r.cost_usd);
    const ok = r.status === "ok";
    const f = byFeature.get(r.feature) ?? { feature: r.feature, calls: 0, refused: 0, cost: 0, credits: 0, input: 0, output: 0, cache_read: 0, latSum: 0, latN: 0 };
    if (ok) f.calls++;
    else f.refused++;
    f.cost += cost;
    f.credits += n(r.credits);
    f.input += n(r.input_tokens);
    f.output += n(r.output_tokens);
    f.cache_read += n(r.cache_read_tokens);
    if (ok && r.latency_ms != null) {
      f.latSum += n(r.latency_ms);
      f.latN++;
    }
    byFeature.set(r.feature, f);
    const m = byModel.get(r.model) ?? { model: r.model, calls: 0, cost: 0, input: 0, output: 0 };
    if (ok) m.calls++;
    m.cost += cost;
    m.input += n(r.input_tokens);
    m.output += n(r.output_tokens);
    byModel.set(r.model, m);
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    if (!content) {
      const lm = liveModel.get(r.model) ?? { model: r.model, calls: 0, cost: 0 };
      if (ok) lm.calls++;
      lm.cost += cost;
      liveModel.set(r.model, lm);
      liveStatus[r.status] = (liveStatus[r.status] ?? 0) + 1;
    }
    const day = r.created_at.slice(0, 10);
    const d = daily.get(day) ?? { day, live: 0, content: 0, calls: 0 };
    if (content) d.content += cost;
    else d.live += cost;
    if (ok) d.calls++;
    daily.set(day, d);
    if (ok) {
      spent.cycle += cost;
      if (content) spent.cycleContent += cost;
      else {
        spent.cycleLive += cost;
        if (r.created_at >= today) spent.todayLive += cost;
      }
    }
  }
  const byCost = <T extends { cost: number }>(a: T, b: T) => b.cost - a.cost;
  return {
    dashboard: {
      byFeature: [...byFeature.values()].map(({ latSum, latN, ...f }) => ({ ...f, latency: latN ? Math.round(latSum / latN) : null })).sort(byCost),
      byModel: [...byModel.values()].sort(byCost),
      byStatus,
      daily: [...daily.values()].sort((a, b) => a.day.localeCompare(b.day)),
      users: [],
    },
    live: { byModel: [...liveModel.values()].sort(byCost), byStatus: liveStatus },
    spent,
    activeUsers: active.size,
    admins: exclude.length,
  };
}

/** GET /api/admin/ai → settings, the governor's view, this cycle's dashboard (all calls, and `live`: without the
 *  content jobs) and the feature table (each feature's `content` flag: a content job, features.ts kind); with `?ext=1`
 *  also `external` (external users only: externalView). */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  try {
    const ext = new URL(request.url).searchParams.get("ext") === "1";
    const settings = await getAiSettings(true);
    const budget = await getBudget(settings, true);
    const today = startOfToday().toISOString();
    const [{ data, error }, live, external] = await Promise.all([
      supabase.rpc("ai_dashboard", { p_from: budget.cycle.start, p_today: today }),
      liveBreakdown(budget.cycle.start),
      ext ? excludedUserIds(true).then((ids) => externalView(budget.cycle.start, today, ids)) : null,
    ]);
    if (error) throw new Error(error.message);
    return NextResponse.json(
      {
        keyConfigured: !!process.env.ANTHROPIC_API_KEY,
        settings,
        budget,
        dashboard: data,
        live,
        // ?ext=1: the same views without the owner's and the admins' calls (null otherwise)
        external,
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
