import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { clampDays, notConfigured, phErrorResponse } from "@/lib/analytics/posthogServer";
import { getPeople } from "@/lib/analytics/journeysServer";

export const dynamic = "force-dynamic";

/** GET ?q=&days=7|30|90&kind=all|identified|anonymous → people seen in the window (max 300). */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const nc = notConfigured();
  if (nc) return nc;
  const sp = request.nextUrl.searchParams;
  const kind = sp.get("kind");
  try {
    return NextResponse.json(
      await getPeople({
        q: sp.get("q") || "",
        days: clampDays(sp.get("days"), 30),
        kind: kind === "identified" || kind === "anonymous" ? kind : "all",
      })
    );
  } catch (e) {
    return phErrorResponse(e);
  }
}
