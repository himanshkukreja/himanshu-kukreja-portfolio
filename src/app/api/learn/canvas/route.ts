import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { canvasPrompts, myDesigns } from "@/lib/learn/canvas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → { prompts, designs }: what you can design and what you've started. */
export async function GET(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  try {
    const [prompts, designs] = await Promise.all([canvasPrompts(), myDesigns(me.id)]);
    return NextResponse.json({ prompts: prompts.map(({ path: _p, ...p }) => (void _p, p)), designs }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
