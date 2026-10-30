import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { callFacets, readCallQuery } from "@/lib/admin/aiCalls";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ai/calls/facets?range=30d&feature=&content=1&scope=&learner= → the call log's filter choices for the
 * window (same window, scope and content switch as /api/admin/ai/calls): { features: [{ id, label, calls }],
 * users: [{ id, email, calls }] (those who used `feature`, or any feature; none on a learner's page), usersPartial,
 * contentHidden: { calls, cost } | null }. Cached a minute on the server (lib/admin/aiCalls.ts).
 */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const q = readCallQuery(new URL(request.url).searchParams);
  try {
    return NextResponse.json(await callFacets(q), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
