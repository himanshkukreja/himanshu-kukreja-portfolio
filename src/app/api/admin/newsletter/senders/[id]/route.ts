import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { apiError, bad } from "@/lib/campaigns/api";
import { getStore } from "@/lib/campaigns/store";
import { parseSender } from "../parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH → edit a stored sender; DELETE → remove it. Env senders (env:*) are read-only. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const { id } = await ctx.params;
    if (id.startsWith("env:")) throw bad("Env senders are set with SMTP_FROM / SMTP2_FROM.");
    const s = parseSender(await req.json().catch(() => ({})));
    return NextResponse.json({ sender: await getStore().saveSender({ ...s, id }) });
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const { id } = await ctx.params;
    if (id.startsWith("env:")) throw bad("Env senders can't be deleted.");
    await getStore().deleteSender(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
