import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { isNonTrackingToken } from "@/lib/campaigns/links";
import { getStore, unsubscribeEverywhere } from "@/lib/campaigns/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const done = (req: NextRequest) => {
  const site = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
  return NextResponse.redirect(new URL("/?unsubscribed=1", site), { status: 302 });
};

/**
 * Campaign emails link here with `?t=<per-recipient token>` (and List-Unsubscribe-Post one-click
 * POSTs the same URL); older emails use `?email=`. Either way the address is upserted into
 * newsletter_subscribers as unsubscribed, which every sender (newsletter, campaigns) honours.
 * Unknown / preview / test tokens get the same response and change nothing.
 */
async function handle(req: NextRequest, oneClick: boolean) {
  const token = (req.nextUrl.searchParams.get("t") || "").trim();
  if (token) {
    if (!isNonTrackingToken(token) && /^[A-Za-z0-9_-]{8,64}$/.test(token)) {
      try {
        const hit = await getStore().markUnsubscribed(token);
        if (hit) await unsubscribeEverywhere(hit.email);
      } catch (e) {
        console.error("[unsubscribe] token unsubscribe failed", (e as Error).message);
        return oneClick ? new NextResponse("error", { status: 500 }) : NextResponse.json({ error: "Failed to unsubscribe" }, { status: 500 });
      }
    }
    return oneClick ? new NextResponse("ok", { status: 200 }) : done(req);
  }

  const email = (req.nextUrl.searchParams.get("email") || "").toLowerCase().trim();
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  // Upsert, not update: account holders who never joined the newsletter (learn announcements) get a
  // row marked unsubscribed, which every sender (newsletter + campaigns) honours.
  const { error } = await supabase
    .from("newsletter_subscribers")
    .upsert({ email, unsubscribed: true, unsubscribed_at: new Date().toISOString() }, { onConflict: "email" });

  if (error) {
    return NextResponse.json({ error: "Failed to unsubscribe" }, { status: 500 });
  }

  return oneClick ? new NextResponse("ok", { status: 200 }) : done(req);
}

export async function GET(req: NextRequest) {
  return handle(req, false);
}

/** RFC 8058 one-click unsubscribe (Gmail / Yahoo "Unsubscribe" button). */
export async function POST(req: NextRequest) {
  return handle(req, true);
}
