import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { parseRange, safeTz } from "@/lib/admin/learners/compute";
import { getCourseAnalytics } from "@/lib/admin/learners/courseStats";

export const dynamic = "force-dynamic";

/** GET /api/admin/course?range=30d&tz= → CourseAnalytics */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const p = new URL(request.url).searchParams;
  try {
    const data = await getCourseAnalytics(parseRange(p.get("range"), "30d"), safeTz(p.get("tz")));
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("course analytics", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
