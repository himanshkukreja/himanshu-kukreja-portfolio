import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/campaigns/store";
import { publishDueCaseFiles } from "@/lib/case-files/service";
import { TablesMissingError } from "@/lib/case-files/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Same secret as the email scheduler: public.email_cron_secret (sent by pg_cron) or CRON_SECRET. */
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
 * Scheduled case-file publishing, called by Supabase pg_cron (supabase/migrations/20261024_case_file_schedule.sql)
 * at five past every hour, and only when a draft is due, so it costs nothing on quiet hours.
 */
async function handle(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const r = await publishDueCaseFiles();
    if (r.failed.length) console.warn("[cron] case files not published", r.failed);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof TablesMissingError) return NextResponse.json({ ok: true, published: [], failed: [], note: "tables missing" });
    console.error("[cron] case files", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
