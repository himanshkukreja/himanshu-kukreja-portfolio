import { NextResponse } from "next/server";
import { castVote, DowError } from "@/lib/design-week/core";
import { getStore } from "@/lib/design-week/store";
import { dowError, guardWrite, NO_STORE, rateLimit, readJson, requireDowLearner } from "@/lib/design-week/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { submissionId, on }: vote for a design or take the vote back. */
export async function POST(req: Request) {
  try {
    guardWrite(req);
    const me = await requireDowLearner(req);
    rateLimit("vote", me.id);
    const body = await readJson(req);
    if (typeof body.submissionId !== "string") throw new DowError(400, "invalid", "Which design?");
    const out = await castVote(getStore(), me, body.submissionId, body.on !== false);
    return NextResponse.json(out, { headers: NO_STORE });
  } catch (e) {
    return dowError(e);
  }
}
