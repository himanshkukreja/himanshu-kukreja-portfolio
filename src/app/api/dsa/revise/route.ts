import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getLearner, isMissing } from "@/app/api/learn/_lib/auth";
import { DSA_FULL } from "@/lib/dsa/flags";
import type { SubmitEvent } from "@/lib/dsa/revise";

/**
 * GET /api/dsa/revise → { events, editorial }: the signed-in learner's submits (problem, verdict, time; newest 3,000)
 * from dsa_submissions and the problems whose editorial they opened before solving (dsa_problem_progress), for the
 * re-solve queue on /dsa/revise (src/lib/dsa/revise.ts runs the schedule in the browser, merged with this device's
 * history). Guests: 401 (their history lives in the browser). 404 in "soon" mode.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: Request) {
  if (!DSA_FULL) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const me = await getLearner(req);
  if (!me) return NextResponse.json({ error: "Sign in" }, { status: 401, headers: NO_STORE });
  const [subs, prog] = await Promise.all([
    supabase.from("dsa_submissions").select("problem_id, verdict, created_at").eq("user_id", me.id).order("created_at", { ascending: false }).limit(3000),
    supabase.from("dsa_problem_progress").select("problem_id").eq("user_id", me.id).eq("editorial_viewed", true).limit(5000),
  ]);
  if (subs.error && !isMissing(subs.error)) console.warn("[dsa-revise]", subs.error.message);
  const events: SubmitEvent[] = ((subs.data || []) as { problem_id: string; verdict: string; created_at: string }[]).map((r) => ({ p: r.problem_id, v: r.verdict, at: Date.parse(r.created_at) }));
  const editorial = ((prog.data || []) as { problem_id: string }[]).map((r) => r.problem_id);
  return NextResponse.json({ events, editorial }, { headers: NO_STORE });
}
