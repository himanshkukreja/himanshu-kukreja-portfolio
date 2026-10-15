import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { getLearners, parseRange, safeTz } from "@/lib/admin/learners/compute";
import type { LearnersSort, Segment } from "@/lib/admin/learners/types";

export const dynamic = "force-dynamic";

const SEGMENTS = new Set(["all", "active-now", "at-risk", "week-done", "never-started", "power"]);

/**
 * GET /api/admin/learners?range=30d&tz=&q=&segment=&sort=lastSeen&dir=desc&page=1&pageSize=50
 * → LearnersResponse (KPIs, activity trend, segment counts, one page of learner rows).
 */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const p = new URL(request.url).searchParams;
  const segment = p.get("segment") || "all";
  try {
    const data = await getLearners({
      range: parseRange(p.get("range"), "30d"),
      tz: safeTz(p.get("tz")),
      q: (p.get("q") || "").slice(0, 100),
      segment: (SEGMENTS.has(segment) ? segment : "all") as Segment | "all",
      sort: (p.get("sort") || "lastSeen") as LearnersSort,
      dir: p.get("dir") === "asc" ? "asc" : "desc",
      page: Number(p.get("page")) || 1,
      pageSize: Number(p.get("pageSize")) || 50,
    });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("learners", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
