import { NextResponse } from "next/server";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getEditorial } from "@/lib/dsa/load";
import { getLearner } from "@/app/api/learn/_lib/auth";
import { supabase } from "@/lib/supabase";
import { forgetUnlocks } from "@/lib/dsa/ai/unlock";

/**
 * GET /api/dsa/editorial/<id> → { html }: a problem's editorial with its four reference solutions. Fetched by the problem
 * room only after an accepted solve, three failed submits, or "show the editorial" (which forfeits the solve XP), so the
 * page itself never carries it. 404 in "soon" mode.
 */
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!DSA_FULL) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;
  const e = await getEditorial(id).catch(() => null);
  if (!e) return NextResponse.json({ error: "No editorial for this problem yet" }, { status: 404 });
  return NextResponse.json(e, { headers: { "Cache-Control": "public, max-age=300, s-maxage=86400", "x-robots-tag": "noindex" } });
}

/**
 * POST /api/dsa/editorial/<id> → { stored }: the signed-in learner chose "show the editorial" before solving. Recorded in
 * dsa_problem_progress (editorial_viewed), so the AI tutor (lib/dsa/ai/unlock.ts) may use the editorial for them from
 * now on, as the page does. A guest's reveal stays on their device ({ stored: false }).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!DSA_FULL) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return NextResponse.json({ error: "Unknown problem" }, { status: 400 });
  const me = await getLearner(req);
  if (!me) return NextResponse.json({ stored: false }, { headers: { "Cache-Control": "no-store" } });
  if (!(await getEditorial(id).catch(() => null))) return NextResponse.json({ error: "Unknown problem" }, { status: 404 });
  const { error } = await supabase.from("dsa_problem_progress").upsert({ user_id: me.id, problem_id: id, editorial_viewed: true, updated_at: new Date().toISOString() }, { onConflict: "user_id,problem_id" });
  if (error) console.warn("[dsa-editorial] reveal not stored", error.message);
  forgetUnlocks(me.id);
  return NextResponse.json({ stored: !error }, { headers: { "Cache-Control": "no-store" } });
}
