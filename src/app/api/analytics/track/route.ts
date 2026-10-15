import { handleBeat } from "@/lib/analytics/ingest";

/**
 * POST /api/analytics/track — legacy alias of /api/beat. Accepts the v2 beat body and the old
 * single-event body sent by clients still running the pre-v2 bundle (mapped to a page_view;
 * any client-supplied user_id is ignored).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleBeat(request, { legacy: true });
}
