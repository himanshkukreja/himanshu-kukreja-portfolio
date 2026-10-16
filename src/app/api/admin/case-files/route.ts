import { NextRequest, NextResponse } from "next/server";
import { cfError, NO_STORE, readJson, requireCaseFilesAdmin } from "@/lib/case-files/api";
import { createCaseFile, listCaseFiles, type CreateInput } from "@/lib/case-files/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → { setup, items: CMS rows + repo stories, nextCaseId } */
export async function GET(req: NextRequest) {
  const admin = await requireCaseFilesAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    return NextResponse.json(await listCaseFiles(), { headers: NO_STORE });
  } catch (e) {
    return cfError(e);
  }
}

/** POST { from: "template" | "blank" | "duplicate" | "import", sourceId?, title? } → { row } */
export async function POST(req: NextRequest) {
  const admin = await requireCaseFilesAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const body = await readJson(req);
    const from = String(body.from || "template") as CreateInput["from"];
    if (!["template", "blank", "duplicate", "import"].includes(from)) return NextResponse.json({ error: "Unknown source" }, { status: 400 });
    const row = await createCaseFile({ from, sourceId: typeof body.sourceId === "string" ? body.sourceId : undefined, title: typeof body.title === "string" ? body.title.slice(0, 200) : undefined }, admin);
    return NextResponse.json({ row }, { status: 201, headers: NO_STORE });
  } catch (e) {
    return cfError(e);
  }
}
