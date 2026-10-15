import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { invalidateDataset } from "@/lib/admin/learners/dataset";
import { resetLearnerData, type ResetParts, type ResetScope } from "@/lib/learn/reset";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PARTS = ["progress", "mcq", "notes", "bookmarks", "streaks", "game"] as const;

/**
 * POST /api/admin/learners/:id/reset  body: { scope: ResetScope, parts: ResetParts }
 * → { deleted: Record<table, count> }. Destructive; the UI confirms first.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { scope?: ResetScope; parts?: ResetParts } | null;
  if (!body?.scope || !body.parts) return NextResponse.json({ error: "scope and parts are required" }, { status: 400 });
  const parts: ResetParts = {};
  PARTS.forEach((k) => {
    if (body.parts?.[k] === true) parts[k] = true;
  });
  if (!Object.keys(parts).length) return NextResponse.json({ error: "Pick at least one part to reset" }, { status: 400 });
  try {
    const result = await resetLearnerData(id, body.scope, parts);
    invalidateDataset();
    console.info("admin reset", { by: admin.email, user: id, scope: body.scope, parts, deleted: result.deleted });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: /^Invalid/.test(msg) ? 400 : 500 });
  }
}
