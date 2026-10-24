import { NextResponse } from "next/server";
import { noStore, requireLearner } from "../_lib/auth";
import { getPrefs, savePrefs, vapidPublicKey } from "@/lib/reminders/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → { prefs, vapidPublicKey } · POST { emailOn?, pushOn?, subscription?, removeEndpoint?, tz? } → { prefs } */
export async function GET(req: Request) {
  const me = await requireLearner(req);
  if (me instanceof NextResponse) return me;
  try {
    return NextResponse.json({ prefs: await getPrefs(me.id), vapidPublicKey: vapidPublicKey(), email: me.email }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}

export async function POST(req: Request) {
  const me = await requireLearner(req);
  if (me instanceof NextResponse) return me;
  try {
    const body = ((await req.json().catch(() => ({}))) || {}) as Record<string, unknown>;
    return NextResponse.json({ prefs: await savePrefs(me.id, body) }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: noStore });
  }
}
