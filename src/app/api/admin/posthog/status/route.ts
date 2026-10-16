import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { phStatus } from "@/lib/analytics/posthogServer";

export const dynamic = "force-dynamic";

/** GET → which analytics pieces are configured (never returns secret values). */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  return NextResponse.json(phStatus());
}
