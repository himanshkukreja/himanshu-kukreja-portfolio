import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { funnelReport, readParams } from "@/lib/admin/traffic/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/traffic/funnel?steps=page:/,page:/learn*,event:lesson_open → { steps: [{ step, label, visitors, pctOfFirst, pctOfPrev }] } */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  try {
    const url = new URL(request.url);
    const params = readParams(url, admin.id);
    return NextResponse.json(await funnelReport(params, url.searchParams.get("steps")), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[traffic/funnel]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
