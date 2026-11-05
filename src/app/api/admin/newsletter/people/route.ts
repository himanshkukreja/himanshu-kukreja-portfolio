import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { apiError } from "@/lib/campaigns/api";
import { pickablePeople } from "@/lib/campaigns/audience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → everyone an email could go to (accounts, then subscribers), for the audience's "choose people" list. */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const people = await pickablePeople();
    return NextResponse.json({ people }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return apiError(e);
  }
}
