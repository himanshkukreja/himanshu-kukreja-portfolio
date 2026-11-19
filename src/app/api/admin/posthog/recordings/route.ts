import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { clampDays, notConfigured, phErrorResponse } from "@/lib/analytics/posthogServer";
import { parseCourse } from "@/lib/analytics/courseFilter";
import { getRecordings } from "@/lib/analytics/journeysServer";

export const dynamic = "force-dynamic";

/** GET ?person=<uuid>&path=/…&days=7|30|90&offset=0&course=all|dsa|sdm|sdm-dsa&staging=1 (include staging hosts; left out by default) → session recordings (newest first, 50 per page). */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const nc = notConfigured();
  if (nc) return nc;
  const sp = request.nextUrl.searchParams;
  const offset = Math.max(0, Math.min(5000, Number(sp.get("offset")) || 0));
  try {
    return NextResponse.json(
      await getRecordings({ person: sp.get("person"), path: sp.get("path"), days: clampDays(sp.get("days"), 30), offset, limit: 50, includeIdle: sp.get("idle") === "1", course: parseCourse(sp.get("course")), includeStaging: sp.get("staging") === "1" })
    );
  } catch (e) {
    return phErrorResponse(e);
  }
}
