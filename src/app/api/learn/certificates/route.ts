import { NextResponse } from "next/server";
import { learnerState } from "@/lib/certificates/service";
import { certErrorResponse, NO_STORE, requireCertLearner } from "@/lib/certificates/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → CertState: the course + per-world checklists (checked on the server) and issued certificates. */
export async function GET(req: Request) {
  const me = await requireCertLearner(req);
  if (me instanceof NextResponse) return me;
  try {
    return NextResponse.json(await learnerState(me.id), { headers: NO_STORE });
  } catch (e) {
    return certErrorResponse(e);
  }
}
