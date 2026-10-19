import { NextResponse } from "next/server";
import { adminSetStatus } from "@/lib/certificates/service";
import { certErrorResponse, NO_STORE, readJson, requireCertAdmin } from "@/lib/certificates/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** POST { action: "revoke", reason } | { action: "restore" } — the public page shows the change at once. */
export async function POST(req: Request, { params }: Ctx) {
  const admin = await requireCertAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const body = await readJson(req);
    const action = body.action === "revoke" || body.action === "restore" ? body.action : null;
    if (!action) return NextResponse.json({ error: "action must be revoke or restore" }, { status: 400, headers: NO_STORE });
    const row = await adminSetStatus((await params).id, action, typeof body.reason === "string" ? body.reason : "");
    return NextResponse.json({ ok: true, status: row.status, revokedAt: row.revoked_at }, { headers: NO_STORE });
  } catch (e) {
    return certErrorResponse(e);
  }
}
