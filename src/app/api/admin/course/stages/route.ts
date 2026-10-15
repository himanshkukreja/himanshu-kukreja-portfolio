import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { safeTz } from "@/lib/admin/learners/compute";
import { getStageDropoff } from "@/lib/admin/learners/courseStats";

export const dynamic = "force-dynamic";

const SAFE = /^[A-Za-z0-9._-]{1,160}$/;

/** GET /api/admin/course/stages?week=&lesson= → StageDropoff */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const p = new URL(request.url).searchParams;
  const week = p.get("week") || "";
  const lesson = p.get("lesson") || "";
  if (!SAFE.test(week) || !SAFE.test(lesson)) return NextResponse.json({ error: "week and lesson are required" }, { status: 400 });
  try {
    return NextResponse.json(await getStageDropoff(week, lesson, safeTz(p.get("tz"))), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("stage dropoff", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
