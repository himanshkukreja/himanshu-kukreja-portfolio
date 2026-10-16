import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { clampDays, notConfigured, phErrorResponse } from "@/lib/analytics/posthogServer";
import { getPage } from "@/lib/analytics/journeysServer";

export const dynamic = "force-dynamic";

/** GET ?path=/learn/…&days= → most clicked elements, reading depth and PostHog heatmap links for one page. */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const nc = notConfigured();
  if (nc) return nc;
  const sp = request.nextUrl.searchParams;
  const path = sp.get("path") || "";
  if (!path.startsWith("/")) return NextResponse.json({ error: "path must start with /" }, { status: 400 });
  try {
    return NextResponse.json(await getPage(path, clampDays(sp.get("days"), 30)));
  } catch (e) {
    return phErrorResponse(e);
  }
}
