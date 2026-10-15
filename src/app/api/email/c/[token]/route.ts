import { NextRequest, NextResponse } from "next/server";
import { NO_CACHE, clickTarget, recordClick } from "@/lib/campaigns/tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/email/c/<token>?u=<url> → 302 to <url> when it's on an allowed host (our domain + known
 * social hosts + EMAIL_CLICK_HOSTS), else to the site home. Logs the click for real campaign tokens.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const target = clickTarget(req.nextUrl.searchParams.get("u"));
  if (target.allowed) await recordClick(token, target.url, req.headers.get("user-agent"));
  return new NextResponse(null, { status: 302, headers: { Location: target.url, ...NO_CACHE, "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" } });
}
