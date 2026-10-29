import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { canvasPrompts, deleteDesign, FREE_RE, getDesign, isPromptKey, promptBrief, promptSeed, saveDesign } from "@/lib/learn/canvas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ key: string }> };
const NO_STORE = { "Cache-Control": "no-store" };

async function keyOf(ctx: Ctx) {
  const key = decodeURIComponent((await ctx.params).key);
  return isPromptKey(key) ? key : null;
}

/** GET → { prompt: { title, brief, href } | null (free), design | null, seed?: { title, sticky } (a capstone with no design yet) }. */
export async function GET(request: Request, ctx: Ctx) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const key = await keyOf(ctx);
  if (!key) return NextResponse.json({ error: "Unknown design." }, { status: 404, headers: NO_STORE });
  try {
    const design = await getDesign(me.id, key);
    if (FREE_RE.test(key)) return NextResponse.json({ prompt: null, design }, { headers: NO_STORE });
    const p = (await canvasPrompts()).find((x) => x.key === key);
    if (!p) return NextResponse.json({ error: "Unknown design." }, { status: 404, headers: NO_STORE });
    const [brief, seed] = await Promise.all([promptBrief(p), design ? null : promptSeed(p).catch(() => null)]);
    return NextResponse.json({ prompt: { title: p.title, group: p.group, href: p.href, brief }, design, ...(seed ? { seed } : {}) }, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500, headers: NO_STORE });
  }
}

/** PUT { scene?, notes?, title?, brief? } → { updatedAt } (autosave). */
export async function PUT(request: Request, ctx: Ctx) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const key = await keyOf(ctx);
  if (!key) return NextResponse.json({ error: "Unknown design." }, { status: 404, headers: NO_STORE });
  const b = (await request.json().catch(() => ({}))) as { scene?: unknown; notes?: unknown; title?: unknown; brief?: unknown };
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
  const scene = str(b.scene, 2_000_000);
  if (typeof b.scene === "string" && b.scene.length > 2_000_000) return NextResponse.json({ error: "The drawing is too big to save (over 2 MB). Remove some images or blocks." }, { status: 413, headers: NO_STORE });
  const free = FREE_RE.test(key);
  try {
    const row = await saveDesign(me.id, key, {
      scene,
      notes: str(b.notes, 8000),
      ...(free ? { title: str(b.title, 120)?.trim() || null, brief: str(b.brief, 1000)?.trim() || null } : {}),
    });
    return NextResponse.json({ updatedAt: row.updated_at }, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500, headers: NO_STORE });
  }
}

/** DELETE → the design is gone. */
export async function DELETE(request: Request, ctx: Ctx) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const key = await keyOf(ctx);
  if (!key) return NextResponse.json({ error: "Unknown design." }, { status: 404, headers: NO_STORE });
  try {
    await deleteDesign(me.id, key);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500, headers: NO_STORE });
  }
}
