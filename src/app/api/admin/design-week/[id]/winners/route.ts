import { NextResponse } from "next/server";
import { confirmWinners } from "@/lib/design-week/core";
import { getStore } from "@/lib/design-week/store";
import { dowError, NO_STORE, rateLimit, readJson, requireDowAdmin } from "@/lib/design-week/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { ids: [winner, runner-up, …] }: feature the designs and close the challenge. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireDowAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    rateLimit("admin", admin.id);
    const body = await readJson(req);
    const c = await confirmWinners(getStore(), admin, (await params).id, body.ids);
    return NextResponse.json({ challenge: c }, { headers: NO_STORE });
  } catch (e) {
    return dowError(e);
  }
}
