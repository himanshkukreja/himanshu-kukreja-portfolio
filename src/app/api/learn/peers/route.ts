import { NextResponse } from "next/server";
import { getLearner, noStore, requireLearner } from "../_lib/auth";
import { cancelSlot, createSlot, joinSlot, listSlots } from "@/lib/peers/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (e: unknown) => NextResponse.json({ error: (e as Error).message || "Something went wrong" }, { status: (e as { status?: number }).status || 500, headers: noStore });

/** GET → { slots } (open slots for everyone; your own and paired ones when signed in) */
export async function GET(req: Request) {
  try {
    const me = await getLearner(req);
    return NextResponse.json({ slots: await listSlots(me?.id ?? null), signedIn: !!me }, { headers: noStore });
  } catch (e) {
    return fail(e);
  }
}

/** POST { action: "create", startsAt, mockSlug, role, durationMin, note } | { action: "join" | "cancel", id } */
export async function POST(req: Request) {
  const me = await requireLearner(req);
  if (me instanceof NextResponse) return me;
  try {
    const body = ((await req.json().catch(() => ({}))) || {}) as Record<string, unknown>;
    if (body.action === "create") await createSlot(me.id, body);
    else if (body.action === "join") await joinSlot(me.id, String(body.id || ""));
    else if (body.action === "cancel") await cancelSlot(me.id, String(body.id || ""));
    else return NextResponse.json({ error: "Unknown action" }, { status: 400, headers: noStore });
    return NextResponse.json({ slots: await listSlots(me.id) }, { headers: noStore });
  } catch (e) {
    return fail(e);
  }
}
