import { NextResponse } from "next/server";
import { moderate, type ModAction } from "@/lib/design-week/core";
import { adminSubmission } from "@/lib/design-week/admin";
import { getStore } from "@/lib/design-week/store";
import { dowError, NO_STORE, rateLimit, readJson, requireDowAdmin } from "@/lib/design-week/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ sid: string }> };

/** GET: a submission in any status, rendered, for review. */
export async function GET(req: Request, { params }: Ctx) {
  const admin = await requireDowAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const d = await adminSubmission((await params).sid);
    if (!d) return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });
    return NextResponse.json(d, { headers: NO_STORE });
  } catch (e) {
    return dowError(e);
  }
}

/** POST { action: "hide" | "remove" | "restore", note }: moderate; resolves its open reports. */
export async function POST(req: Request, { params }: Ctx) {
  const admin = await requireDowAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    rateLimit("admin", admin.id);
    const body = await readJson(req);
    const s = await moderate(getStore(), admin, (await params).sid, body.action as ModAction, typeof body.note === "string" ? body.note : "");
    return NextResponse.json({ submission: { id: s.id, status: s.status, moderationNote: s.moderationNote } }, { headers: NO_STORE });
  } catch (e) {
    return dowError(e);
  }
}
