import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { clampDays, notConfigured, phErrorResponse } from "@/lib/analytics/posthogServer";
import { getPaths } from "@/lib/analytics/journeysServer";

export const dynamic = "force-dynamic";

/** GET ?days=7|30|90 → entry/exit pages, top 2–4 step paths, learn funnel, top pages. */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const nc = notConfigured();
  if (nc) return nc;
  try {
    return NextResponse.json(await getPaths(clampDays(request.nextUrl.searchParams.get("days"), 7)));
  } catch (e) {
    return phErrorResponse(e);
  }
}
