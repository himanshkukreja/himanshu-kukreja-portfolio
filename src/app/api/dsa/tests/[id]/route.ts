import { NextResponse } from "next/server";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getProblemTests } from "@/lib/dsa/load";

/**
 * GET /api/dsa/tests/<id>?v=<hash> → { signature, checker, limits, visible, hidden, version }: the cases a browser Submit
 * runs (plan §7.3). Hidden tests reach the browser here, as in code labs: fine for practice, and points will only count
 * verified re-judges on the server. Cached by version at the edge. 404 in "soon" mode.
 */
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!DSA_FULL) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;
  const t = await getProblemTests(id).catch(() => null);
  if (!t) return NextResponse.json({ error: "Unknown problem" }, { status: 404 });
  return NextResponse.json(t, { headers: { "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800", "x-robots-tag": "noindex" } });
}
