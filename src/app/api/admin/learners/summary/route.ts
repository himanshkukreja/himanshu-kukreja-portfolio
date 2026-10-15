import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { getLearnersSummary, parseRange, safeTz } from "@/lib/admin/learners/compute";

export const dynamic = "force-dynamic";

/** GET /api/admin/learners/summary?range=7d&tz=Asia/Kolkata → LearnersSummary (Overview page). */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const url = new URL(request.url);
  try {
    const data = await getLearnersSummary(parseRange(url.searchParams.get("range"), "7d"), safeTz(url.searchParams.get("tz")));
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("learners summary", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
