import { NextResponse } from "next/server";
import { DSA_FULL } from "@/lib/dsa/flags";
import { DSA_COURSE_ID, DSA_PROBLEMS_WEEK } from "@/lib/dsa/types";
import { getLearner } from "@/app/api/learn/_lib/auth";
import { supabase } from "@/lib/supabase";
import { forgetUnlocks } from "@/lib/dsa/ai/unlock";

/**
 * POST /api/dsa/reset/<id> → { ok }: "Reset problem" for a signed-in learner (the account half of the room's fresh start;
 * the device half and the Bits rule are in src/lib/dsa/reset.ts). Clears, for this learner and problem only:
 *   learning_progress   the course-dsa "problems" row (the solved mark on the map and the lists)
 *   dsa_submissions     the submit history, which is also what the server's editorial unlock counts (an AC, three fails)
 *   dsa_problem_progress  status back to attempted, languages, hints, the editorial_viewed reveal flag and first_solved_at
 *                       (interview_passed is kept: the Interview tab's result is its own record)
 * Bits are never touched: they live in game_done as `dsa:b:solve:<id>=<bits>`, which a reset leaves alone, so solving again
 * earns nothing new. The editorial therefore locks again on the account too, the same as in the room. Guests reset on the device only.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!DSA_FULL) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return NextResponse.json({ error: "Unknown problem" }, { status: 400, headers: NO_STORE });
  const me = await getLearner(req);
  if (!me) return NextResponse.json({ ok: true, stored: false }, { headers: NO_STORE });
  const results = await Promise.all([
    supabase.from("learning_progress").delete().eq("user_id", me.id).eq("course_id", DSA_COURSE_ID).eq("week", DSA_PROBLEMS_WEEK).eq("lesson_slug", id),
    supabase.from("dsa_submissions").delete().eq("user_id", me.id).eq("problem_id", id),
    supabase
      .from("dsa_problem_progress")
      .update({ status: "attempted", languages: [], hints_used: 0, editorial_viewed: false, verified: false, first_solved_at: null, updated_at: new Date().toISOString() })
      .eq("user_id", me.id)
      .eq("problem_id", id),
  ]);
  forgetUnlocks(me.id);
  const failed = results.find((r) => r.error && !/relation .* does not exist|schema cache|does not exist/i.test(r.error.message));
  if (failed?.error) {
    console.warn("[dsa-reset]", failed.error.message);
    return NextResponse.json({ ok: false }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true, stored: true }, { headers: NO_STORE });
}
