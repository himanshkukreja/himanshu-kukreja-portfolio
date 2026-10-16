import { NextResponse } from "next/server";
import { isBotUA } from "@/lib/analytics/ua";
import { isValidHandle } from "@/lib/share/handle";
import { recordVisit } from "@/lib/share/referrals";
import { shareLearner } from "@/lib/share/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/share/visit { h, vid, path, ch } — a browser arrived through a share link (public).
 * One row per referrer × visitor; bots, unknown/unpublished handles and the sharer's own visits
 * are ignored. Nothing about the visitor beyond the analytics visitor id is stored.
 */
export async function POST(request: Request) {
  const ok = (result: string) => NextResponse.json({ result }, { status: 202, headers: { "Cache-Control": "no-store" } });
  if (isBotUA(request.headers.get("user-agent"))) return ok("ignored");
  const body = (await request.json().catch(() => null)) as { h?: unknown; vid?: unknown; path?: unknown; ch?: unknown } | null;
  if (!body || !isValidHandle(body.h) || typeof body.vid !== "string") return ok("ignored");
  try {
    const viewer = request.headers.get("authorization") ? await shareLearner(request) : null;
    const result = await recordVisit({
      handle: body.h,
      visitorId: body.vid,
      path: typeof body.path === "string" ? body.path : undefined,
      channel: typeof body.ch === "string" ? body.ch : undefined,
      viewerId: viewer?.id ?? null,
    });
    return ok(result);
  } catch (e) {
    console.error("[share] visit", e instanceof Error ? e.message : e);
    return ok("error");
  }
}
