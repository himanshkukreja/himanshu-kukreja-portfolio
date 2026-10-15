import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { apiError, bad } from "@/lib/campaigns/api";
import { invalidateAudience } from "@/lib/campaigns/audience";
import { queueCampaign, retryCampaign, setStatus, tick } from "@/lib/campaigns/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// one tick sends for ≤ 40 s (BUDGET_MS), well inside this limit
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST { action, ... }
 *   queue  { confirm: "send to <n>" }  snapshot the (new) audience into per-recipient rows, status → sending
 *   tick                               send the next batch(es) for ≤ 40 s; the admin page loops on this
 *   pause | resume | cancel
 *   retry  { failed?: true, stuck?: false }  failed (and optionally interrupted) rows → queued
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    switch (action) {
      case "queue":
        invalidateAudience(); // re-read unsubscribes right before the snapshot
        return NextResponse.json(await queueCampaign(id, typeof body?.confirm === "string" ? body.confirm : "", admin.email));
      case "tick":
        return NextResponse.json(await tick(id));
      case "pause":
      case "resume":
      case "cancel":
        return NextResponse.json({ campaign: await setStatus(id, action) });
      case "retry":
        return NextResponse.json(await retryCampaign(id, { failed: body?.failed !== false, stuck: body?.stuck === true }));
      default:
        throw bad("Unknown action");
    }
  } catch (e) {
    return apiError(e);
  }
}
