import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { apiError, parseContent } from "@/lib/campaigns/api";
import { summarize } from "@/lib/campaigns/engine";
import { getStore } from "@/lib/campaigns/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { ...content } → new draft campaign. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const c = parseContent(await req.json().catch(() => ({})));
    const created = await getStore().createCampaign({ ...c, createdBy: admin.email });
    return NextResponse.json({ campaign: { ...(await summarize(created)), doc: created.doc } });
  } catch (e) {
    return apiError(e);
  }
}
