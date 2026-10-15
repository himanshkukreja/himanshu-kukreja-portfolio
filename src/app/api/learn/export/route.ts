import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { noStore, requireLearner } from "../_lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/learn/export — everything the site stores about the signed-in learner, as JSON.
 * Optional tables (level-up migration) are included when they exist.
 */
export async function GET(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const uid = me.id;
  // PostgREST caps every response at 1000 rows (`.limit(10000)` silently returned 1000), so page
  // through each table; an export must never be quietly truncated.
  const own = async (table: string, col = "user_id"): Promise<{ data: unknown[] | null; error: unknown }> => {
    const rows: unknown[] = [];
    for (let from = 0; from < 50_000; from += 1000) {
      const { data, error } = await supabase.from(table).select("*").eq(col, uid).order("id").range(from, from + 999);
      if (error) return { data: null, error };
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return { data: rows, error: null };
  };

  const [profile, progress, streaks, notes, bookmarks, answers, comments, trials, cards] = await Promise.all([
    supabase.from("user_profiles").select("*").eq("id", uid).maybeSingle(),
    own("learning_progress"),
    own("learning_streaks"),
    own("content_notes"),
    own("bookmarks"),
    own("mcq_user_answers"),
    own("lesson_comments"),
    own("trial_attempts"),
    own("review_cards"),
  ]);

  const rowsOf = (r: { data: unknown; error: unknown }) => (r.error ? null : r.data);
  const ids = Array.from(new Set(((answers.data || []) as { assessment_id: string }[]).map((a) => a.assessment_id)));
  const assess = ids.length ? await supabase.from("mcq_assessments").select("id, course_id, week, lesson_slug, title").in("id", ids) : { data: [], error: null };

  return NextResponse.json(
    {
      account: { id: uid, email: me.email },
      exportedAt: new Date().toISOString(),
      profile: rowsOf(profile),
      learning_progress: rowsOf(progress),
      learning_streaks: rowsOf(streaks),
      content_notes: rowsOf(notes),
      bookmarks: rowsOf(bookmarks),
      mcq_user_answers: rowsOf(answers),
      mcq_assessments: rowsOf(assess),
      lesson_comments: rowsOf(comments),
      trial_attempts: rowsOf(trials),
      review_cards: rowsOf(cards),
    },
    { headers: noStore }
  );
}
