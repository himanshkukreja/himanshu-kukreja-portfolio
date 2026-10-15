import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { apiError, bad, parseContent } from "@/lib/campaigns/api";
import { summarize } from "@/lib/campaigns/engine";
import { getStore } from "@/lib/campaigns/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function load(id: string) {
  const c = await getStore().getCampaign(id);
  if (!c) throw bad("Campaign not found", 404);
  return c;
}

/** GET → campaign (with document), counts and the 40 latest open/click/unsubscribe events. */
export async function GET(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const c = await load((await ctx.params).id);
    const [summary, events] = await Promise.all([summarize(c), getStore().events(c.id, 40)]);
    return NextResponse.json({ campaign: { ...summary, doc: c.doc }, events }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return apiError(e);
  }
}

/** PATCH { ...content } → save a draft (only drafts are editable; sent mail can't change). */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const c = await load((await ctx.params).id);
    const patch = parseContent(await req.json().catch(() => ({})));
    const next = await getStore().updateCampaign(c.id, patch, ["draft"]);
    if (!next) throw bad("Only drafts can be edited. Duplicate it to send a changed version.", 409);
    return NextResponse.json({ campaign: { ...(await summarize(next)), doc: next.doc } });
  } catch (e) {
    return apiError(e);
  }
}

/** DELETE → remove a draft or cancelled campaign (and its rows). */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const c = await load((await ctx.params).id);
    if (c.status !== "draft" && c.status !== "cancelled") throw bad("Only drafts and cancelled campaigns can be deleted (sent ones keep their tracking history).", 409);
    await getStore().deleteCampaign(c.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
