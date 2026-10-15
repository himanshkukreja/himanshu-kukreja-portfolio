import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { eventsReport, readParams } from "@/lib/admin/traffic/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/traffic/events → { events: [{ name, count, visitors, users, last, top }] } */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  try {
    const url = new URL(request.url);
    const params = readParams(url, admin.id);
    return NextResponse.json(await eventsReport(params), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[traffic/events]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
