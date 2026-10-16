import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { runCron } from "@/lib/campaigns/engine";
import { getStore, TablesMissingError } from "@/lib/campaigns/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Bearer must match the secret in public.email_cron_secret (what the Supabase pg_cron job sends) or CRON_SECRET. */
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

/**
 * Background sender, called every minute by Supabase (pg_cron + pg_net, see
 * supabase/migrations/20261016_email_scheduling.sql) — only while a campaign is due or sending.
 * Promotes due scheduled campaigns (freezing their recipients now) and sends for every campaign in
 * "sending" for ≤ 45 s. The per-campaign lease keeps it from double-sending with an open admin tab.
 */
async function handle(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const r = await runCron();
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof TablesMissingError) return NextResponse.json({ ok: true, promoted: [], ticks: [], note: "tables missing" });
    console.error("[cron] email campaigns", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
