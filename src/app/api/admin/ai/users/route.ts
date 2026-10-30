import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { getAiSettings } from "@/lib/ai/settings";
import { cycleWindow, startOfToday } from "@/lib/ai/governor";
import { usersSpend } from "@/lib/admin/aiUsers";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ai/users?feature=&user=&sort=new|cost|credits|tokens.asc|desc&page=1 → "Who spends what (this
 * cycle)": one page (25) of learners with their calls, refusals, cost, credits (course chat excluded: its own quota),
 * tokens and today's cost, plus the filter choices (features used this cycle, learners who used the picked one).
 */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  try {
    const s = await getAiSettings();
    const { start } = cycleWindow(new Date(), s.cycleDay);
    const out = await usersSpend(new URL(request.url).searchParams, start.toISOString(), startOfToday().toISOString());
    return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
