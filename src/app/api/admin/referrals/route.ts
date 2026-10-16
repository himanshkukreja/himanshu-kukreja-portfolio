import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { referralSummary } from "@/lib/share/referrals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/referrals?range=30d — top sharers, referred sign-ups, conversion. */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const range = new URL(request.url).searchParams.get("range") || "30d";
  try {
    return NextResponse.json(await referralSummary(range), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Referrals unavailable" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
