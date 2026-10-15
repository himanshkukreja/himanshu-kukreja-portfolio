import { handleBeat } from "@/lib/analytics/ingest";

// First-party analytics ingest (tracking contract v2). Named /api/beat so ad blockers that match
// "analytics"/"track" leave it alone; /api/analytics/track is a thin alias for old cached clients.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleBeat(request);
}
