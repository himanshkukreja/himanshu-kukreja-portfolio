import { NextRequest, NextResponse } from "next/server";
import { cfError, NO_STORE, originOf, readJson, requireCaseFilesAdmin } from "@/lib/case-files/api";
import { deleteCaseFile, getCaseFile, parseFields, saveCaseFile } from "@/lib/case-files/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET → { row, validation, caseId, setup } */
export async function GET(req: NextRequest, { params }: Ctx) {
  const admin = await requireCaseFilesAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const { id } = await params;
    return NextResponse.json(await getCaseFile(id, originOf(req)), { headers: NO_STORE });
  } catch (e) {
    return cfError(e);
  }
}

/** PATCH { fields, baseVersion, autosave? } → { row, validation, caseId }   409 { code: "conflict" } when edited elsewhere */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const admin = await requireCaseFilesAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const { id } = await params;
    const body = await readJson(req);
    const baseVersion = Number(body.baseVersion);
    if (!Number.isInteger(baseVersion)) return NextResponse.json({ error: "baseVersion is required" }, { status: 400 });
    const detail = await saveCaseFile(id, parseFields(body.fields), baseVersion, { autosave: body.autosave === true, origin: originOf(req) }, admin);
    return NextResponse.json(detail, { headers: NO_STORE });
  } catch (e) {
    return cfError(e);
  }
}

/** DELETE → { ok } (drafts that were never published only) */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const admin = await requireCaseFilesAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const { id } = await params;
    await deleteCaseFile(id);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    return cfError(e);
  }
}
