import { NextResponse } from "next/server";
import { DowError } from "@/lib/design-week/core";
import { getStore } from "@/lib/design-week/store";
import { dowError, NO_STORE, readJson, requireDowAdmin } from "@/lib/design-week/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { action: "dismiss" }: close a report without touching the design (hide/remove go through the submission). */
export async function POST(req: Request, { params }: { params: Promise<{ rid: string }> }) {
  const admin = await requireDowAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const body = await readJson(req);
    if (body.action !== "dismiss") throw new DowError(400, "invalid", "Unknown action.");
    const store = getStore();
    const { rid } = await params;
    const [r] = (await store.listReports({ status: "open" })).filter((x) => x.id === rid);
    if (!r) throw new DowError(404, "not-found", "That report is already closed.");
    await store.resolveReports([rid], "dismissed", admin.id);
    const left = await store.listReports({ submissionId: r.submissionId, status: "open" });
    await store.updateSubmission(r.submissionId, { reportCount: left.length });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    return dowError(e);
  }
}
