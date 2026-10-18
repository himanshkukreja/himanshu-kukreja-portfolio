import { NextResponse } from "next/server";
import { loadHubSummary } from "@/lib/design-week/server";
import { dowFixtures } from "@/lib/design-week/store";
import { dowError } from "@/lib/design-week/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET: the hub card (current challenge + last winner). Public; cached at the edge for a minute. */
export async function GET() {
  try {
    const data = await loadHubSummary();
    return NextResponse.json(data, { headers: { "Cache-Control": dowFixtures() ? "no-store" : "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch (e) {
    return dowError(e);
  }
}
