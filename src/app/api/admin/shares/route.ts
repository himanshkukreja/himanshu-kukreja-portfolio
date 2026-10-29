import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireGapsAdmin } from "@/lib/admin/gaps/gate";
import { answerTag, listShares, setShareHidden } from "@/lib/share/answers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

/** GET → the newest shared answers (question, date, sources, hidden). No sharer is shown. */
export async function GET(request: Request) {
  const admin = await requireGapsAdmin(request);
  if (admin instanceof NextResponse) return admin;
  try {
    return NextResponse.json(await listShares(200), { headers: noStore });
  } catch (e) {
    console.error("[shares] GET", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't load shared answers" }, { status: 500, headers: noStore });
  }
}

/** PATCH { id, hidden } → hide (the page 404s at once) or show again. */
export async function PATCH(request: Request) {
  const admin = await requireGapsAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const body = (await request.json().catch(() => null)) as { id?: unknown; hidden?: unknown } | null;
  if (!body || typeof body.id !== "string" || typeof body.hidden !== "boolean") return NextResponse.json({ error: "Bad request" }, { status: 400, headers: noStore });
  try {
    const ok = await setShareHidden(body.id, body.hidden);
    if (!ok) return NextResponse.json({ error: "No such shared answer" }, { status: 404, headers: noStore });
    revalidateTag(answerTag(body.id));
    revalidatePath(`/learn/answer/${body.id}`);
    return NextResponse.json({ ok: true, id: body.id, hidden: body.hidden }, { headers: noStore });
  } catch (e) {
    console.error("[shares] PATCH", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't update it" }, { status: 500, headers: noStore });
  }
}
