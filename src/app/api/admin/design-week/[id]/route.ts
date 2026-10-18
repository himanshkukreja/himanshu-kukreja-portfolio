import { NextResponse } from "next/server";
import { adminDelete, adminDetail, adminUpdate } from "@/lib/design-week/admin";
import { dowError, NO_STORE, rateLimit, readJson, requireDowAdmin } from "@/lib/design-week/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET: one challenge with every submission (any status), live counts, reports, preselected winners. */
export async function GET(req: Request, { params }: Ctx) {
  const admin = await requireDowAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const d = await adminDetail((await params).id);
    if (!d) return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });
    return NextResponse.json(d, { headers: NO_STORE });
  } catch (e) {
    return dowError(e);
  }
}

/** PATCH: fields, schedule (or { monday } for the weekly default) and status. */
export async function PATCH(req: Request, { params }: Ctx) {
  const admin = await requireDowAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    rateLimit("admin", admin.id);
    const c = await adminUpdate((await params).id, await readJson(req));
    return NextResponse.json({ challenge: c }, { headers: NO_STORE });
  } catch (e) {
    return dowError(e);
  }
}

/** DELETE: drafts with no submissions only. */
export async function DELETE(req: Request, { params }: Ctx) {
  const admin = await requireDowAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    await adminDelete((await params).id);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    return dowError(e);
  }
}
