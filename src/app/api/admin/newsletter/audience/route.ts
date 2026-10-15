import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { apiError, parseAudience } from "@/lib/campaigns/api";
import { presetCounts, resolveAudience } from "@/lib/campaigns/audience";
import { getStore } from "@/lib/campaigns/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST { audience, campaignId? } → live count for that spec (+ preset counts). Read-only. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const body = await req.json().catch(() => ({}));
    const spec = parseAudience(body?.audience);
    let exclude: Set<string> | undefined;
    if (typeof body?.campaignId === "string" && body.campaignId) {
      try {
        exclude = await getStore().existingEmails(body.campaignId);
      } catch {
        exclude = undefined; // tables missing: nobody queued yet
      }
    }
    const [{ count }, presets] = await Promise.all([resolveAudience(spec, { exclude }), presetCounts()]);
    return NextResponse.json({ count, presets }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return apiError(e);
  }
}
