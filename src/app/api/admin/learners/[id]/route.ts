import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { safeTz } from "@/lib/admin/learners/compute";
import { getLearnerDetail } from "@/lib/admin/learners/detail";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/admin/learners/:id?tz= → LearnerDetail */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  try {
    const data = await getLearnerDetail(id, safeTz(new URL(request.url).searchParams.get("tz")));
    if (!data) return NextResponse.json({ error: "Learner not found" }, { status: 404 });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("learner detail", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
