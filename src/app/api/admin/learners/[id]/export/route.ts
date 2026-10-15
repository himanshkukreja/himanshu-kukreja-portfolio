import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { safeTz } from "@/lib/admin/learners/compute";
import { getLearnerDetail } from "@/lib/admin/learners/detail";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * GET /api/admin/learners/:id/export?format=json|csv
 * json: the full drilldown; csv: one row per lesson (course map + side quests) with progress.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const url = new URL(request.url);
  const detail = await getLearnerDetail(id, safeTz(url.searchParams.get("tz")));
  if (!detail) return NextResponse.json({ error: "Learner not found" }, { status: 404 });
  const base = `learner-${(detail.learner.email || id).replace(/[^a-z0-9._-]+/gi, "_")}`;
  if (url.searchParams.get("format") === "csv") {
    const head = ["week", "lesson", "code", "title", "status", "pct", "time_sec", "visits", "started_at", "completed_at", "last_at"];
    const rows = [...detail.map.flatMap((w) => w.cells), ...detail.sideQuests].map((c) =>
      [c.week, c.slug, c.code, c.title, c.status, c.pct, c.timeSec, c.visits, c.startedAt, c.completedAt, c.lastAt].map(csvCell).join(",")
    );
    return new NextResponse([head.join(","), ...rows].join("\n"), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"`, "Cache-Control": "no-store" },
    });
  }
  return new NextResponse(JSON.stringify(detail, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${base}.json"`, "Cache-Control": "no-store" },
  });
}
