import { NextResponse } from "next/server";
import { DowError, reportSubmission } from "@/lib/design-week/core";
import { getStore } from "@/lib/design-week/store";
import { dowError, guardWrite, NO_STORE, rateLimit, readJson, requireDowLearner } from "@/lib/design-week/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { submissionId, reason, note }: report a design to the moderators. */
export async function POST(req: Request) {
  try {
    guardWrite(req);
    const me = await requireDowLearner(req);
    rateLimit("report", me.id);
    const body = await readJson(req);
    if (typeof body.submissionId !== "string") throw new DowError(400, "invalid", "Which design?");
    const out = await reportSubmission(getStore(), me, body.submissionId, { reason: body.reason, note: body.note });
    return NextResponse.json(out, { headers: NO_STORE });
  } catch (e) {
    return dowError(e);
  }
}
