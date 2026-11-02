import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { notConfigured, phErrorResponse } from "@/lib/analytics/posthogServer";
import { getLiveFeed, getLiveHead, getLiveReplays, getLiveSessions, isLiveFilter, isLiveWindow, REPLAY_IDS_MAX } from "@/lib/analytics/liveServer";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store, private" };

/**
 * /admin/live, in parts so the page paints progressively (each part is served from the shared data cache and
 * refreshed in the background):
 *   ?part=head                                         → header stats, events per minute, pages people are on
 *   ?part=sessions&window=30m|24h|7d&filter=all|signed|learn|recorded&before=<iso>
 *                                                      → the latest sessions with their events (`before` pages back)
 *   ?part=replays&ids=<sid>,<sid>…                     → which of those sessions have a replay
 *   (no part)                                          → all of it in one response (LiveFeedRes)
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const nc = notConfigured();
  if (nc) return nc;
  const sp = request.nextUrl.searchParams;
  const w = sp.get("window");
  const f = sp.get("filter");
  const opts = { window: isLiveWindow(w) ? w : ("24h" as const), filter: isLiveFilter(f) ? f : ("all" as const), before: sp.get("before") };
  try {
    switch (sp.get("part")) {
      case "head":
        return NextResponse.json(await getLiveHead(), { headers: noStore });
      case "sessions":
        return NextResponse.json(await getLiveSessions(opts), { headers: noStore });
      case "replays": {
        const ids = (sp.get("ids") || "").split(",").filter(Boolean);
        if (ids.length > REPLAY_IDS_MAX) return NextResponse.json({ error: `at most ${REPLAY_IDS_MAX} ids` }, { status: 400 });
        return NextResponse.json(await getLiveReplays(ids), { headers: noStore });
      }
      default:
        return NextResponse.json(await getLiveFeed(opts), { headers: noStore });
    }
  } catch (e) {
    return phErrorResponse(e);
  }
}
