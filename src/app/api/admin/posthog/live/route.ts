import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { notConfigured, phErrorResponse } from "@/lib/analytics/posthogServer";
import { getLive } from "@/lib/analytics/journeysServer";

export const dynamic = "force-dynamic";

/** GET → visitors in the last 5 min, pages they're on, and the latest 60 events (24 h). */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const nc = notConfigured();
  if (nc) return nc;
  try {
    return NextResponse.json(await getLive());
  } catch (e) {
    return phErrorResponse(e);
  }
}
