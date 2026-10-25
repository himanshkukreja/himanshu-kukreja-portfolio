import { NextResponse } from "next/server";
import { getLearner } from "@/app/api/learn/_lib/auth";
import { aiStatus } from "@/lib/ai/access";
import { ownKey } from "@/lib/ai/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/learn/ai/status → which AI features this person can use now and their credits left today. */
export async function GET(request: Request) {
  const me = await getLearner(request);
  const s = await aiStatus(me, !!ownKey(request));
  return NextResponse.json(s, { headers: { "Cache-Control": "private, no-store" } });
}
