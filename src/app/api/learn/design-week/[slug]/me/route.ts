import { NextResponse } from "next/server";
import { loadMe } from "@/lib/design-week/server";
import { dowError, NO_STORE, requireDowLearner } from "@/lib/design-week/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET: my submission (with the draft body), my votes, whether I can vote, my XP awards. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const me = await requireDowLearner(req);
    const { slug } = await params;
    return NextResponse.json(await loadMe(me.id, slug), { headers: NO_STORE });
  } catch (e) {
    return dowError(e);
  }
}
