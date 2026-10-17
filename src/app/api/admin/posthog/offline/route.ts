import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { notConfigured, phErrorResponse } from "@/lib/analytics/posthogServer";
import { clampOfflineDays, getOffline } from "@/lib/analytics/offlineServer";

export const dynamic = "force-dynamic";

/** GET ?days=1|7|30|90|365 → offline reading: savers, saves by scope, top saved, installs, offline opens/reads, recent offline readers. */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const nc = notConfigured();
  if (nc) return nc;
  try {
    return NextResponse.json(await getOffline(clampOfflineDays(request.nextUrl.searchParams.get("days"))), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return phErrorResponse(e);
  }
}
