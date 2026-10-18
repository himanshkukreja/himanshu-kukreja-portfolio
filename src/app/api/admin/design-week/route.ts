import { NextResponse } from "next/server";
import { adminCreate, adminList } from "@/lib/design-week/admin";
import { dowError, NO_STORE, rateLimit, readJson, requireDowAdmin } from "@/lib/design-week/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET: every challenge with participation stats, open reports, templates. */
export async function GET(req: Request) {
  const admin = await requireDowAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    return NextResponse.json(await adminList(), { headers: NO_STORE });
  } catch (e) {
    return dowError(e);
  }
}

/** POST { template?, monday? } (or full fields): create a draft challenge on the weekly schedule. */
export async function POST(req: Request) {
  const admin = await requireDowAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    rateLimit("admin", admin.id);
    const c = await adminCreate(await readJson(req), admin.id);
    return NextResponse.json({ challenge: c }, { status: 201, headers: NO_STORE });
  } catch (e) {
    return dowError(e);
  }
}
