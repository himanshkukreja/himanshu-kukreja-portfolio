import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { apiError } from "@/lib/campaigns/api";
import { searchRecipients } from "@/lib/campaigns/audience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?q= → up to 8 people (most recently active first when q is empty) (accounts, then subscribers) with their real merge data, for "preview as". */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const q = (req.nextUrl.searchParams.get("q") || "").slice(0, 120);
    const recipients = await searchRecipients(q);
    return NextResponse.json({ recipients }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return apiError(e);
  }
}
