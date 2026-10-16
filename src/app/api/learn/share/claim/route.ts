import { NextResponse } from "next/server";
import { isValidHandle } from "@/lib/share/handle";
import { claimReferral } from "@/lib/share/referrals";
import { shareLearner } from "@/lib/share/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/learn/share/claim { h, vid, at } — the browser that followed someone's share link
 * signed in: attribute the sign-up. The referred user id comes from the verified token only.
 */
export async function POST(request: Request) {
  const me = await shareLearner(request);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const body = (await request.json().catch(() => null)) as { h?: unknown; vid?: unknown; at?: unknown } | null;
  if (!body || !isValidHandle(body.h)) return NextResponse.json({ result: "ignored" }, { headers: { "Cache-Control": "no-store" } });
  try {
    const result = await claimReferral({
      userId: me.id,
      handle: body.h,
      visitorId: typeof body.vid === "string" ? body.vid.slice(0, 64) : null,
      firstSeenAt: typeof body.at === "number" ? body.at : null,
    });
    return NextResponse.json({ result }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[share] claim", e instanceof Error ? e.message : e);
    return NextResponse.json({ result: "error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
