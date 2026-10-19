import { NextResponse } from "next/server";
import { normalizeCode } from "@/lib/certificates/core";
import { bumpView } from "@/lib/certificates/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|linkedinbot|embedly|headless|lighthouse/i;
// one count per visitor + certificate per 30 minutes on this instance (cheap, best effort)
const seen = new Map<string, number>();
const WINDOW = 30 * 60_000;

/** POST — the verification page was viewed (admin stat "verification views, 30 days"). */
export async function POST(req: Request, { params }: Ctx) {
  const code = normalizeCode((await params).code);
  if (!code) return new NextResponse(null, { status: 204 });
  const ua = req.headers.get("user-agent") || "";
  if (!ua || BOT.test(ua)) return new NextResponse(null, { status: 204 });
  const who = `${req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?"}|${ua.slice(0, 80)}|${code}`;
  const now = Date.now();
  if ((seen.get(who) || 0) > now - WINDOW) return new NextResponse(null, { status: 204 });
  seen.set(who, now);
  if (seen.size > 5000) for (const [k, t] of seen) if (t < now - WINDOW) seen.delete(k);
  await bumpView(code).catch(() => undefined);
  return new NextResponse(null, { status: 204 });
}
