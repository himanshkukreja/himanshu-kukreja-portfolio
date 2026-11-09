import { NextResponse } from "next/server";
import { getLearner } from "@/app/api/learn/_lib/auth";
import { RateLimiter } from "@/lib/design-week/core";
import { DSA_FULL } from "@/lib/dsa/flags";
import { claimDsaCert, dsaCertState, DsaCertError } from "@/lib/dsa/cert/service";

/**
 * GET  /api/dsa/certificate → { available, eligibility, certificate }   the signed-in learner's DSA Mastery ·
 *      Foundations requirements, checked on the server, and their certificate if issued
 * POST /api/dsa/certificate { name, isPublic } → { certificate, existing } (rules re-checked here; 403 until earned)
 * Signed in only (guests see the requirements from their browser's progress). 404 in "soon" mode.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const limiter = new RateLimiter(6, 60_000);

export async function GET(req: Request) {
  if (!DSA_FULL) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const me = await getLearner(req);
  if (!me) return NextResponse.json({ error: "Sign in" }, { status: 401, headers: NO_STORE });
  try {
    return NextResponse.json(await dsaCertState(me.id), { headers: NO_STORE });
  } catch (e) {
    if (e instanceof DsaCertError) return NextResponse.json({ error: e.message }, { status: e.status, headers: NO_STORE });
    console.error("[dsa-cert] GET", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't load your certificate." }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(req: Request) {
  if (!DSA_FULL) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const me = await getLearner(req);
  if (!me) return NextResponse.json({ error: "Sign in to claim your certificate." }, { status: 401, headers: NO_STORE });
  if (!limiter.hit(me.id)) return NextResponse.json({ error: "Too many tries. Wait a minute." }, { status: 429, headers: NO_STORE });
  const body = (await req.json().catch(() => ({}))) as { name?: unknown; isPublic?: unknown };
  try {
    return NextResponse.json(await claimDsaCert(me.id, body), { headers: NO_STORE });
  } catch (e) {
    if (e instanceof DsaCertError) return NextResponse.json({ error: e.message }, { status: e.status, headers: NO_STORE });
    console.error("[dsa-cert] POST", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't issue the certificate. Please try again." }, { status: 500, headers: NO_STORE });
  }
}
