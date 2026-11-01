import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store, private" };

/**
 * GET → { admin: true, owner, email } when the Bearer session belongs to an admin (owner: may manage admins), else 401.
 * Used by the /admin gate. `?soft=1` (the site header's Admin link) answers 200 { admin: false } instead of 401, so a
 * learner's check isn't an error. Never returns the admin list.
 */
export async function GET(req: NextRequest) {
  const admin = await getAdmin(req).catch(() => null);
  if (!admin) return req.nextUrl.searchParams.get("soft") === "1" ? NextResponse.json({ admin: false }, { headers: noStore }) : NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  return NextResponse.json({ admin: true, owner: !!admin.owner, email: admin.email }, { headers: noStore });
}
