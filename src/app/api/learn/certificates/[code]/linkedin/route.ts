import { NextResponse } from "next/server";
import { normalizeCode } from "@/lib/certificates/core";
import { markLinkedin } from "@/lib/certificates/service";
import { certErrorResponse, NO_STORE, requireCertLearner } from "@/lib/certificates/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

/** POST — the learner pressed "Add to LinkedIn profile" (first press is kept for the admin stat). */
export async function POST(req: Request, { params }: Ctx) {
  const me = await requireCertLearner(req);
  if (me instanceof NextResponse) return me;
  const code = normalizeCode((await params).code);
  if (!code) return NextResponse.json({ error: "Certificate not found." }, { status: 404, headers: NO_STORE });
  try {
    await markLinkedin(me.id, code);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    return certErrorResponse(e);
  }
}
