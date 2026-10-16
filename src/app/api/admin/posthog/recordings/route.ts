import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { clampDays, notConfigured, phErrorResponse } from "@/lib/analytics/posthogServer";
import { getRecordings } from "@/lib/analytics/journeysServer";

export const dynamic = "force-dynamic";

/** GET ?person=<uuid>&path=/learn/…&days=7|30|90&offset=0 → session recordings (newest first, 50 per page). */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const nc = notConfigured();
  if (nc) return nc;
  const sp = request.nextUrl.searchParams;
  const offset = Math.max(0, Math.min(5000, Number(sp.get("offset")) || 0));
  try {
    return NextResponse.json(
      await getRecordings({ person: sp.get("person"), path: sp.get("path"), days: clampDays(sp.get("days"), 30), offset, limit: 50 })
    );
  } catch (e) {
    return phErrorResponse(e);
  }
}
