import { NextResponse } from "next/server";
import { ob2Issuer } from "@/lib/certificates/badges";

export const revalidate = 86400;

/** Open Badges 2.0 Issuer profile (also the issuer id of the 3.0 credentials). */
export function GET() {
  return NextResponse.json(ob2Issuer(), { headers: { "access-control-allow-origin": "*" } });
}
