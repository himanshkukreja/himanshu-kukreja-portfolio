import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { apiError } from "@/lib/campaigns/api";
import { BATCH, BUDGET_MS, GAP_MS, listSenders, summarize, trackingBase } from "@/lib/campaigns/engine";
import { allTransports, transportMode } from "@/lib/campaigns/senders";
import { getStore } from "@/lib/campaigns/store";
import type { NewsletterInfo } from "@/lib/campaigns/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → setup (tables, transport mode), transports, senders, campaigns with counts. */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const store = getStore();
    const ready = await store.ready();
    const { senders } = await listSenders();
    const campaigns = ready.ready ? await Promise.all((await store.listCampaigns()).map(summarize)) : [];
    const info: NewsletterInfo = {
      setup: { tablesReady: ready.ready, missing: ready.missing, transportMode: transportMode(), trackingBase: trackingBase(), batch: { size: BATCH, gapMs: GAP_MS, budgetMs: BUDGET_MS }, admin: admin.email },
      transports: allTransports(),
      senders,
      campaigns,
    };
    return NextResponse.json(info, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return apiError(e);
  }
}
