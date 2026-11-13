import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/campaigns/store";
import { runWeeklyDigest } from "@/lib/reminders/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Same secret as the other schedulers: public.email_cron_secret (sent by pg_cron) or CRON_SECRET. */
async function authorized(req: NextRequest): Promise<boolean> {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (token.length < 16) return false;
  const env = process.env.CRON_SECRET;
  if (env && same(token, env)) return true;
  const db = await getStore()
    .cronSecret()
    .catch(() => null);
  return !!db && same(token, db);
}

/** Weekly progress email (supabase/migrations/20261113_weekly_digest.sql, Sundays 03:30 UTC = 09:00 IST). */
async function handle(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await runWeeklyDigest()) });
  } catch (e) {
    console.error("[cron] weekly-digest", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
