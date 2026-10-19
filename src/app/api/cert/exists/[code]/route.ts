import { NextResponse } from "next/server";
import { normalizeCode } from "@/lib/certificates/core";
import { certExists } from "@/lib/certificates/service";

export const runtime = "nodejs";
// CDN-cached per code (on-demand ISR): the /cert middleware gate reads it on every certificate
// visit. Issuing, revoking, restoring or hiding a certificate calls revalidatePath on it.
export const revalidate = 3600;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Ctx = { params: Promise<{ code: string }> };

/**
 * GET /api/cert/exists/<code> → { ok } — does /cert/<code> have a page (found and public)? Lets the
 * middleware answer unknown and private codes with a real HTTP 404. A database error throws (500,
 * never cached) and the gate then lets the page decide.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const code = normalizeCode((await params).code);
  return NextResponse.json({ ok: code ? await certExists(code) : false });
}
