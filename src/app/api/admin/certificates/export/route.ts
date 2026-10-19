import { NextResponse } from "next/server";
import { adminCsv } from "@/lib/certificates/service";
import { certErrorResponse, requireCertAdmin } from "@/lib/certificates/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → certificates.csv (every certificate, with emails, evidence and flags). */
export async function GET(req: Request) {
  const admin = await requireCertAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    return new NextResponse(await adminCsv(), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="certificates.csv"', "Cache-Control": "no-store" },
    });
  } catch (e) {
    return certErrorResponse(e);
  }
}
