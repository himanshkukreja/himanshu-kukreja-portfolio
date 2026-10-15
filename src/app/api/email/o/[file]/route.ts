import { NextRequest, NextResponse } from "next/server";
import { NO_CACHE, PIXEL, recordOpen } from "@/lib/campaigns/tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/email/o/<token>.gif → 1×1 transparent GIF; logs an open for real campaign tokens. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const token = file.replace(/\.gif$/i, "");
  await recordOpen(token, req.headers.get("user-agent"));
  return new NextResponse(new Uint8Array(PIXEL), {
    status: 200,
    headers: { "Content-Type": "image/gif", "Content-Length": String(PIXEL.length), ...NO_CACHE, "X-Robots-Tag": "noindex" },
  });
}
