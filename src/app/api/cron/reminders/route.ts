import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/campaigns/store";
import { runReminders } from "@/lib/reminders/server";

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

/** Daily streak reminders (supabase/migrations/20261025_learner_reminders.sql, 14:00 UTC = 19:30 IST). */
async function handle(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await runReminders()) });
  } catch (e) {
    console.error("[cron] reminders", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
