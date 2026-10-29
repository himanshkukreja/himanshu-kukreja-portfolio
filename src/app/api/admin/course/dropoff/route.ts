import { NextResponse } from "next/server";
import { requireAdmin, type AdminUser } from "@/lib/admin/auth";
import { PREVIEW_HEADER } from "@/lib/admin/gaps/gate";
import { dropoffFixtures } from "@/lib/admin/dropoff/fixtures";
import { dropoffReport } from "@/lib/admin/dropoff/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAYS = new Set([7, 30, 90]);
const KEY = /^[A-Za-z0-9._-]{1,160}\/[A-Za-z0-9._-]{1,160}$/;

/** In `next dev` with DROPOFF_FIXTURES=1 the admin preview header stands in for an admin (sample data only). */
async function gate(req: Request): Promise<AdminUser | NextResponse> {
  if (process.env.NODE_ENV === "development" && dropoffFixtures() && req.headers.get(PREVIEW_HEADER) === "1") return { id: "preview", email: "preview@localhost" };
  return requireAdmin(req);
}

/**
 * GET ?days=7|30|90[&lesson=<week>/<slug>][&fresh=1] → section drop-off: every lesson's starters, completion and
 * worst single-section drop, plus the selected lesson's section funnel. Kept 5 minutes per window on the instance.
 * See src/lib/admin/dropoff/aggregate.ts.
 */
export async function GET(request: Request) {
  const admin = await gate(request);
  if (admin instanceof NextResponse) return admin;
  const sp = new URL(request.url).searchParams;
  const d = Number(sp.get("days"));
  const days = DAYS.has(d) ? d : 30;
  const lesson = sp.get("lesson");
  if (lesson && !KEY.test(lesson)) return NextResponse.json({ error: "Bad lesson." }, { status: 400 });
  try {
    const report = await dropoffReport({ days, lessonKey: lesson, fresh: sp.get("fresh") === "1" });
    return NextResponse.json(report, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("[dropoff]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't build the drop-off report" }, { status: 500 });
  }
}
