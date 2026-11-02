import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { cachedLive, reportArgs } from "@/lib/admin/traffic/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/traffic/live → { live, pages: [{ path, n }], recent: [{ at, path, country, city, device, channel }] } */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  try {
    const url = new URL(request.url);
    const args = reportArgs(url, admin.id);
    return NextResponse.json(await cachedLive(args.f, args.me), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[traffic/live]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
