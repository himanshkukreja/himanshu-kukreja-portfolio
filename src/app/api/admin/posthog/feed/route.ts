import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { notConfigured, phErrorResponse } from "@/lib/analytics/posthogServer";
import { getLiveFeed, isLiveFilter, isLiveWindow } from "@/lib/analytics/liveServer";

export const dynamic = "force-dynamic";

/**
 * GET ?window=30m|24h|7d&filter=all|signed|learn|recorded&before=<iso> → /admin/live: header stats,
 * events per minute, live pages and the latest sessions (events grouped by $session_id, with their
 * replay if PostHog has one). `before` pages to older sessions.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const nc = notConfigured();
  if (nc) return nc;
  const sp = request.nextUrl.searchParams;
  const w = sp.get("window");
  const f = sp.get("filter");
  try {
    return NextResponse.json(await getLiveFeed({ window: isLiveWindow(w) ? w : "24h", filter: isLiveFilter(f) ? f : "all", before: sp.get("before") }));
  } catch (e) {
    return phErrorResponse(e);
  }
}
