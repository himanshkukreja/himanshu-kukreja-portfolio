import { NextRequest, NextResponse } from "next/server";
import { cfError, NO_STORE, originOf, readJson, requireCaseFilesAdmin } from "@/lib/case-files/api";
import { parseFields, renderPreview } from "@/lib/case-files/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { fields, id? } → { html, checkpoints, minutes, caseId, meta, totalCases, validation }.
 * The working copy (saved or not) through the exact renderer the public /stories/[slug] page uses,
 * plus the validator. Nothing is stored.
 */
export async function POST(req: NextRequest) {
  const admin = await requireCaseFilesAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const body = await readJson(req);
    const out = await renderPreview(parseFields(body.fields), typeof body.id === "string" ? body.id : undefined, originOf(req));
    return NextResponse.json(out, { headers: NO_STORE });
  } catch (e) {
    return cfError(e);
  }
}
