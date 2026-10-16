import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { handleProblem, HANDLE_MESSAGES, suggestHandle } from "@/lib/share/handle";
import { cleanVisibility, type ShareState } from "@/lib/share/model";
import { freeHandle, HandleTakenError, saveSettings, settingsForUser, shareLearner, ShareUnavailableError } from "@/lib/share/store";
import { ownerInfo, shareTag } from "@/lib/share/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

/**
 * GET /api/learn/share — the signed-in learner's share settings, a suggested handle and the numbers
 * the share text uses. `?fresh=1` also drops the cached public page (the share sheet calls it when
 * it opens, so a just-earned achievement is on the page the link points to).
 */
export async function GET(request: Request) {
  const me = await shareLearner(request);
  if (!me) return NextResponse.json({ error: "Sign in to share your progress" }, { status: 401, headers: noStore });
  try {
    const [{ available, settings }, info] = await Promise.all([settingsForUser(me.id), ownerInfo(me.id).catch(() => ({ summary: null, fullName: null, hofHandle: null }))]);
    const suggested = settings?.handle || (available ? await freeHandle(suggestHandle(info.fullName, info.hofHandle), me.id, (h) => handleProblem(h) === null) : suggestHandle(info.fullName, info.hofHandle));
    if (settings?.handle && new URL(request.url).searchParams.get("fresh") === "1") revalidateTag(shareTag(settings.handle));
    const body: ShareState = { available, settings, suggested, summary: info.summary };
    return NextResponse.json(body, { headers: noStore });
  } catch (e) {
    console.error("[share] GET", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't load your share settings" }, { status: 500, headers: noStore });
  }
}

/** PUT /api/learn/share { enabled, handle, visibility } — save; the public page updates at once. */
export async function PUT(request: Request) {
  const me = await shareLearner(request);
  if (!me) return NextResponse.json({ error: "Sign in to share your progress" }, { status: 401, headers: noStore });
  const body = (await request.json().catch(() => null)) as { enabled?: unknown; handle?: unknown; visibility?: unknown } | null;
  if (!body || typeof body.enabled !== "boolean" || typeof body.handle !== "string") return NextResponse.json({ error: "Bad request" }, { status: 400, headers: noStore });
  const handle = body.handle.trim().toLowerCase();
  const problem = handleProblem(handle);
  if (problem) return NextResponse.json({ error: HANDLE_MESSAGES[problem], problem }, { status: 422, headers: noStore });
  try {
    const prev = await settingsForUser(me.id);
    if (!prev.available) throw new ShareUnavailableError();
    const settings = await saveSettings(me.id, { enabled: body.enabled, handle, visibility: cleanVisibility(body.visibility) });
    revalidateTag(shareTag(handle));
    if (prev.settings?.handle && prev.settings.handle !== handle) revalidateTag(shareTag(prev.settings.handle));
    return NextResponse.json({ settings }, { headers: noStore });
  } catch (e) {
    if (e instanceof HandleTakenError) return NextResponse.json({ error: "That handle is taken. Try another.", problem: "taken" }, { status: 409, headers: noStore });
    if (e instanceof ShareUnavailableError) return NextResponse.json({ error: e.message, problem: "unavailable" }, { status: 503, headers: noStore });
    console.error("[share] PUT", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't save your share settings" }, { status: 500, headers: noStore });
  }
}
