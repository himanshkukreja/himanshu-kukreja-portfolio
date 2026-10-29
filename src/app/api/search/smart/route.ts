import { NextResponse } from "next/server";
import { getEngine, liveCheck, originOf, previewAllowed } from "@/lib/search/smart/server";
import { SMART_SEARCH_PUBLIC } from "@/lib/search/smart/flag";
import { queryKey } from "@/lib/search/smart/text";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/search/smart?q=… → deterministic results across the whole course, grouped by kind (no AI).
 * A few ms of ranking on a warm instance; once public, the CDN keeps each distinct query for 5 minutes,
 * so repeated queries cost no function time. Admins only while SMART_SEARCH_PUBLIC is false.
 */
export async function GET(request: Request) {
  const t0 = Date.now();
  if (!(await previewAllowed(request))) return NextResponse.json({ error: "Not available yet" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  const q = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 300);
  if (!queryKey(q)) return NextResponse.json({ error: "Type something to search for" }, { status: 400 });
  const [engine, live] = await Promise.all([getEngine(originOf(request)), liveCheck()]);
  const { candidates: _c, ...res } = engine.search(q, { live });
  void _c;
  return NextResponse.json(res, {
    headers: {
      "Cache-Control": SMART_SEARCH_PUBLIC ? "public, max-age=0, s-maxage=300, stale-while-revalidate=3600" : "private, no-store",
      "Server-Timing": `rank;dur=${res.ms}, total;dur=${Date.now() - t0}`,
    },
  });
}
