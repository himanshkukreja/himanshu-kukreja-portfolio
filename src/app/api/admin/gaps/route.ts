import { NextResponse } from "next/server";
import { requireGapsAdmin } from "@/lib/admin/gaps/gate";
import { gapReport } from "@/lib/admin/gaps/report";
import { originOf } from "@/lib/search/smart/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET ?days=30[&fresh=1] → the content-gap radar's report (admins only; kept 5 minutes per window). */
export async function GET(request: Request) {
  const admin = await requireGapsAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const sp = new URL(request.url).searchParams;
  const days = Math.min(90, Math.max(1, Number(sp.get("days")) || 30));
  try {
    const report = await gapReport({ days, origin: originOf(request), fresh: sp.get("fresh") === "1" });
    return NextResponse.json(report, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("[gaps]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't build the gap report" }, { status: 500 });
  }
}
