import { NextRequest, NextResponse } from "next/server";
import { cfError, NO_STORE, originOf, readJson, requireCaseFilesAdmin } from "@/lib/case-files/api";
import { reserveCaseNumber, runAction, scheduleCaseFile, type Action } from "@/lib/case-files/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS: Action[] = ["publish", "unpublish", "archive", "restore"];

/**
 * POST { action: "publish" | "unpublish" | "archive" | "restore" } → { row, validation, caseId }
 *      { action: "number", caseNumber: n | null } reserves the case number for a never-published draft.
 *      { action: "schedule", publishAt: ISO | null } sets or clears a draft's scheduled publish.
 * publish validates first (422 { code: "invalid", validation } on errors), copies the working copy
 * to the live snapshot, assigns the case number on first publish and revalidates the public pages.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireCaseFilesAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const { id } = await params;
    const body = await readJson(req);
    const action = String(body.action || "") as Action | "number";
    // { action: "number", caseNumber: 12 | null }: reserve the CASE number a draft gets at first publish
    if (action === "number") return NextResponse.json(await reserveCaseNumber(id, body.caseNumber == null || body.caseNumber === "" ? null : Number(body.caseNumber), admin, originOf(req)), { headers: NO_STORE });
    if ((action as string) === "schedule") return NextResponse.json(await scheduleCaseFile(id, body.publishAt ? String(body.publishAt) : null, admin, originOf(req)), { headers: NO_STORE });
    if (!ACTIONS.includes(action)) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    return NextResponse.json(await runAction(id, action, admin, originOf(req)), { headers: NO_STORE });
  } catch (e) {
    return cfError(e);
  }
}
