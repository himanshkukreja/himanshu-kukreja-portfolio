import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { notConfigured, phErrorResponse } from "@/lib/analytics/posthogServer";
import { shareRecording } from "@/lib/analytics/journeysServer";

export const dynamic = "force-dynamic";

/**
 * POST { id, enabled? = true } → enables PostHog sharing for one recording and returns the
 * embeddable player URL ({ui host}/embedded/{access_token}). `enabled: false` revokes the link.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const nc = notConfigured();
  if (nc) return nc;
  const body = (await request.json().catch(() => ({}))) as { id?: string; enabled?: boolean };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    return NextResponse.json(await shareRecording(String(body.id), body.enabled !== false));
  } catch (e) {
    return phErrorResponse(e);
  }
}
