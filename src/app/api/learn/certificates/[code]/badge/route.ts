import { NextResponse } from "next/server";
import { normalizeCode } from "@/lib/certificates/core";
import { ownBadge } from "@/lib/certificates/service";
import { certErrorResponse, NO_STORE, requireCertLearner } from "@/lib/certificates/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

/** GET — your certificate as an Open Badges 3.0 credential: { jwt, credential, assertion (2.0 URL when public) }. */
export async function GET(req: Request, { params }: Ctx) {
  const me = await requireCertLearner(req);
  if (me instanceof NextResponse) return me;
  const code = normalizeCode((await params).code);
  if (!code) return NextResponse.json({ error: "Certificate not found." }, { status: 404, headers: NO_STORE });
  try {
    return NextResponse.json(await ownBadge(me.id, code), { headers: NO_STORE });
  } catch (e) {
    return certErrorResponse(e);
  }
}
