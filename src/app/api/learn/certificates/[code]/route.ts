import { NextResponse } from "next/server";
import { normalizeCode } from "@/lib/certificates/core";
import { setPublic, withdraw } from "@/lib/certificates/service";
import { certErrorResponse, NO_STORE, readJson, requireCertLearner } from "@/lib/certificates/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

/** PATCH { isPublic } — show or hide the verification page of one of your certificates. */
export async function PATCH(req: Request, { params }: Ctx) {
  const me = await requireCertLearner(req);
  if (me instanceof NextResponse) return me;
  const code = normalizeCode((await params).code);
  if (!code) return NextResponse.json({ error: "Certificate not found." }, { status: 404, headers: NO_STORE });
  try {
    const body = await readJson(req);
    if (typeof body.isPublic !== "boolean") return NextResponse.json({ error: "isPublic must be true or false." }, { status: 400, headers: NO_STORE });
    return NextResponse.json({ certificate: await setPublic(me.id, code, body.isPublic) }, { headers: NO_STORE });
  } catch (e) {
    return certErrorResponse(e);
  }
}

/** DELETE — withdraw one of your certificates (its page and QR code stop working). */
export async function DELETE(req: Request, { params }: Ctx) {
  const me = await requireCertLearner(req);
  if (me instanceof NextResponse) return me;
  const code = normalizeCode((await params).code);
  if (!code) return NextResponse.json({ error: "Certificate not found." }, { status: 404, headers: NO_STORE });
  try {
    await withdraw(me.id, code);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    return certErrorResponse(e);
  }
}
