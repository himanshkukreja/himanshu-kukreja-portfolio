import { NextResponse } from "next/server";
import { claim } from "@/lib/certificates/service";
import { certErrorResponse, NO_STORE, readJson, requireCertLearner } from "@/lib/certificates/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { kind: "course" | "world", world?: "<week folder>", name, isPublic } → { certificate, existing }.
 * The rules are re-checked from the database here; 409 { eligibility } when something is missing.
 * Idempotent: claiming again returns the certificate already issued (201 only for a new one).
 */
export async function POST(req: Request) {
  const me = await requireCertLearner(req);
  if (me instanceof NextResponse) return me;
  try {
    const body = await readJson(req);
    const out = await claim(me.id, body);
    return NextResponse.json(out, { status: out.existing ? 200 : 201, headers: NO_STORE });
  } catch (e) {
    return certErrorResponse(e);
  }
}
