import { NextResponse } from "next/server";
import { jwks } from "@/lib/certificates/badges";

export const runtime = "nodejs";
export const revalidate = 86400;

/** The public key that signs Open Badges 3.0 credentials (RS256). */
export function GET() {
  return NextResponse.json(jwks(), { headers: { "access-control-allow-origin": "*", "content-type": "application/jwk-set+json" } });
}
