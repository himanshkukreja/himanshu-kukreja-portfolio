import { NextResponse } from "next/server";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getEditorial } from "@/lib/dsa/load";

/**
 * GET /api/dsa/editorial/<id> → { html }: a problem's editorial with its four reference solutions. Fetched by the problem
 * room only after an accepted solve, three failed submits, or "show the editorial" (which forfeits the solve XP), so the
 * page itself never carries it. 404 in "soon" mode.
 */
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!DSA_FULL) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;
  const e = await getEditorial(id).catch(() => null);
  if (!e) return NextResponse.json({ error: "No editorial for this problem yet" }, { status: 404 });
  return NextResponse.json(e, { headers: { "Cache-Control": "public, max-age=300, s-maxage=86400", "x-robots-tag": "noindex" } });
}
