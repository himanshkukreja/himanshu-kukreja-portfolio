import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { clampDays, notConfigured, phErrorResponse } from "@/lib/analytics/posthogServer";
import { getPerson } from "@/lib/analytics/journeysServer";

export const dynamic = "force-dynamic";

/**
 * GET ?id=<PostHog person UUID | distinct id (e.g. a Supabase user id)>&days=7|30|90
 * → profile, event timeline (newest first, max 1500) and their session recordings.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const nc = notConfigured();
  if (nc) return nc;
  const sp = request.nextUrl.searchParams;
  const id = (sp.get("id") || "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const res = await getPerson(id, clampDays(sp.get("days"), 30));
    if (!res) return NextResponse.json({ error: "No events for this person in PostHog" }, { status: 404 });
    return NextResponse.json(res);
  } catch (e) {
    return phErrorResponse(e);
  }
}
