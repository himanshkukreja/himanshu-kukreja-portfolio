import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { cleanGoal, parseLearningGoal, serializeLearningGoal } from "@/components/learn/progress/goal";
import { noStore, requireLearner } from "../_lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PUT /api/learn/goal  { goal: LearningGoal | null }
 * Stores the weekly goal as JSON in user_profiles.learning_goal, keeping an earlier purpose string.
 */
export async function PUT(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const body = (await request.json().catch(() => null)) as { goal?: unknown } | null;
  if (!body || !("goal" in body)) return NextResponse.json({ error: "Missing goal" }, { status: 400, headers: noStore });
  const goal = body.goal === null ? null : cleanGoal(body.goal);
  if (body.goal !== null && !goal) return NextResponse.json({ error: "Invalid goal" }, { status: 400, headers: noStore });

  const cur = await supabase.from("user_profiles").select("learning_goal").eq("id", me.id).maybeSingle();
  if (cur.error) return NextResponse.json({ error: cur.error.message }, { status: 500, headers: noStore });
  const { purpose } = parseLearningGoal((cur.data as { learning_goal: string | null } | null)?.learning_goal);
  const value = serializeLearningGoal(goal ? { ...goal, setAt: Date.now() } : null, purpose);
  const up = await supabase.from("user_profiles").update({ learning_goal: value }).eq("id", me.id);
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500, headers: noStore });
  return NextResponse.json({ ok: true, learningGoal: value }, { headers: noStore });
}
