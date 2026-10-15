import { NextRequest, NextResponse } from "next/server";
import { tick } from "@/lib/campaigns/engine";
import { getStore, TablesMissingError } from "@/lib/campaigns/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Optional background sender: GET with `Authorization: Bearer $CRON_SECRET` (what Vercel Cron sends)
 * runs one tick for every campaign in "sending". The admin page does the same while it's open, so
 * this is only needed to keep a long send going with the tab closed. Disabled without CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const store = getStore();
    const active = (await store.listCampaigns()).filter((c) => c.status === "sending");
    const out = [];
    for (const c of active.slice(0, 3)) {
      const r = await tick(c.id, 15_000);
      out.push({ id: c.id, sent: r.sentNow, failed: r.failedNow.length, busy: !!r.busy, status: r.campaign.status });
    }
    return NextResponse.json({ ok: true, ran: out });
  } catch (e) {
    if (e instanceof TablesMissingError) return NextResponse.json({ ok: true, ran: [], note: "tables missing" });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
