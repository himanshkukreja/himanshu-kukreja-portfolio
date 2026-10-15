import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { sendTest } from "@/lib/announce/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** POST { name? } → sends one "[test]" copy to the signed-in admin only. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim().slice(0, 80) : null;
  try {
    const r = await sendTest({ email: admin.email, name, userId: admin.id });
    return NextResponse.json({ ok: true, to: admin.email, transport: r.kind, messageId: r.messageId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Test send failed" }, { status: 500 });
  }
}
