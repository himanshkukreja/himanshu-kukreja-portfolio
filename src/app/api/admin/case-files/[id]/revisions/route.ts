import { NextRequest, NextResponse } from "next/server";
import { cfError, NO_STORE, originOf, readJson, requireCaseFilesAdmin } from "@/lib/case-files/api";
import { listRevisions, restoreRevision } from "@/lib/case-files/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET → { revisions: [{ id, version, action, createdBy, createdAt, title, words, live }] } newest first */
export async function GET(req: NextRequest, { params }: Ctx) {
  const admin = await requireCaseFilesAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const { id } = await params;
    return NextResponse.json({ revisions: await listRevisions(id) }, { headers: NO_STORE });
  } catch (e) {
    return cfError(e);
  }
}

/** POST { revisionId, baseVersion } → restores that snapshot into the working copy (not live until published) */
export async function POST(req: NextRequest, { params }: Ctx) {
  const admin = await requireCaseFilesAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const { id } = await params;
    const body = await readJson(req);
    const baseVersion = Number(body.baseVersion);
    if (typeof body.revisionId !== "string" || !Number.isInteger(baseVersion)) return NextResponse.json({ error: "revisionId and baseVersion are required" }, { status: 400 });
    return NextResponse.json(await restoreRevision(id, body.revisionId, baseVersion, admin, originOf(req)), { headers: NO_STORE });
  } catch (e) {
    return cfError(e);
  }
}
