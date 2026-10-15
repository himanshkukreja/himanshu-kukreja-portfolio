import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { listTemplates } from "@/lib/campaigns/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → starting templates (learn revamp, welcome, blank) as editable documents. */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  return NextResponse.json({ templates: listTemplates() }, { headers: { "Cache-Control": "no-store" } });
}
