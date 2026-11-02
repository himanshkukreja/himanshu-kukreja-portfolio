import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { cachedPages, reportArgs } from "@/lib/admin/traffic/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/traffic/pages → { pages: engagement per page (views, avg engaged, depth, finished %, entries, exits, bounce) } */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  try {
    const url = new URL(request.url);
    const args = reportArgs(url, admin.id);
    return NextResponse.json(await cachedPages(args), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[traffic/pages]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
