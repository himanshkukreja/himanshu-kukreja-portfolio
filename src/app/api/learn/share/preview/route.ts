import { NextResponse } from "next/server";
import { settingsForUser, shareLearner } from "@/lib/share/store";
import { previewProfile } from "@/lib/share/stats";
import { DSA_FULL } from "@/lib/dsa/flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

/**
 * GET /api/learn/share/preview → { profile } — the signed-in learner's public page as visitors would see it with their
 * saved settings, published or not (the owner's preview at /dashboard/preview). Staging only for now (DSA full mode).
 */
export async function GET(request: Request) {
  if (!DSA_FULL) return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStore });
  const me = await shareLearner(request);
  if (!me) return NextResponse.json({ error: "Sign in to preview your page" }, { status: 401, headers: noStore });
  try {
    const { settings } = await settingsForUser(me.id);
    if (!settings) return NextResponse.json({ error: "Pick a handle in your sharing settings first" }, { status: 404, headers: noStore });
    const profile = await previewProfile(me.id, settings.handle, settings.visibility);
    return NextResponse.json({ profile, enabled: settings.enabled }, { headers: noStore });
  } catch (e) {
    console.error("[share] preview", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't build the preview" }, { status: 500, headers: noStore });
  }
}
