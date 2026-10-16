import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { apiError } from "@/lib/campaigns/api";
import { getStore } from "@/lib/campaigns/store";
import { listStoryOptions } from "@/lib/campaigns/story";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → every story (newest first) with its generated "Case file update" email and how many people already got it. */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const sent = await getStore()
      .storySends()
      .catch(() => new Map<string, Set<string>>());
    return NextResponse.json({ stories: await listStoryOptions(sent) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return apiError(e);
  }
}
