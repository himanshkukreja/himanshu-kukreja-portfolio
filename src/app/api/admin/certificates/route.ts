import { NextResponse } from "next/server";
import { adminList } from "@/lib/certificates/service";
import { certErrorResponse, NO_STORE, requireCertAdmin } from "@/lib/certificates/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?q= → { available, stats, rows } (search: name, email, code, certificate). */
export async function GET(req: Request) {
  const admin = await requireCertAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const q = (new URL(req.url).searchParams.get("q") || "").slice(0, 120);
    return NextResponse.json(await adminList(q), { headers: NO_STORE });
  } catch (e) {
    return certErrorResponse(e);
  }
}
