import { NextResponse } from "next/server";
import { loadAwards } from "@/lib/design-week/server";
import { dowError, NO_STORE, requireDowLearner } from "@/lib/design-week/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET: XP the signed-in learner has earned here (the client applies them with awardOnce). */
export async function GET(req: Request) {
  try {
    const me = await requireDowLearner(req);
    return NextResponse.json({ awards: await loadAwards(me.id) }, { headers: NO_STORE });
  } catch (e) {
    return dowError(e);
  }
}
