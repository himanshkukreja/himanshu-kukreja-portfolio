import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { apiError, bad, parseContent } from "@/lib/campaigns/api";
import { contentProblems, sendTest } from "@/lib/campaigns/engine";
import { isEmail } from "@/lib/campaigns/senders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST { ...content, to?, asEmail? } → one "[test]" copy. `to` defaults to the signed-in admin;
 * `asEmail` resolves merge tags with that person's data. Nothing is written to the database and the
 * tracking links use the "test" token (never recorded). Console transport outside production.
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const body = await req.json().catch(() => ({}));
    const content = parseContent(body);
    const problems = contentProblems(content);
    if (problems.length) throw bad(`Fix ${problems.length} problem(s) first: ${problems[0].message}`);
    const to = typeof body?.to === "string" && body.to.trim() ? body.to.trim().toLowerCase() : admin.email;
    if (!isEmail(to)) throw bad("That test address isn't valid.");
    const asEmail = typeof body?.asEmail === "string" && isEmail(body.asEmail) ? body.asEmail.toLowerCase() : admin.email;
    const r = await sendTest({ content, senderId: content.senderId, to, asEmail });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return apiError(e);
  }
}
