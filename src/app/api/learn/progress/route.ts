import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { COURSE_ID, getCourseMap } from "@/lib/learn/course";
import { scoreMcqParts } from "@/lib/learn/actions";
import { noStore, requireLearner } from "../_lib/auth";
import type { ProgressSummary, TrialScore } from "@/components/learn/progress/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/learn/progress?course=… — the signed-in learner's own progress, in one round trip. */
export async function GET(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const course = new URL(request.url).searchParams.get("course") || COURSE_ID;
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(course)) return NextResponse.json({ error: "Bad course" }, { status: 400, headers: noStore });

  const uid = me.id;
  const [rows, streaks, profile, highlights, notes, bookmarks] = await Promise.all([
    supabase.from("learning_progress").select("*").eq("user_id", uid).eq("course_id", course),
    supabase.from("learning_streaks").select("activity_date, lessons_completed, time_spent").eq("user_id", uid).order("activity_date", { ascending: true }).limit(2000),
    supabase.from("user_profiles").select("current_streak, longest_streak, total_time_spent, total_lessons_completed, learning_goal").eq("id", uid).maybeSingle(),
    supabase.from("content_notes").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("course_id", course).not("highlight_text", "is", null).neq("highlight_text", ""),
    supabase.from("content_notes").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("course_id", course).not("note_text", "is", null).neq("note_text", ""),
    supabase.from("bookmarks").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("course_id", course),
  ]);
  if (rows.error) return NextResponse.json({ error: rows.error.message }, { status: 500, headers: noStore });

  // Trials: trial_attempts when the migration is applied, else score saved MCQ answers per part.
  let trials: Record<string, TrialScore[]> = {};
  let trialSource: ProgressSummary["trialSource"] = "none";
  let mcqAnswered = 0;
  const attempts = await supabase.from("trial_attempts").select("week, part, score, total, passed").eq("user_id", uid).eq("course_id", course);
  if (!attempts.error && (attempts.data || []).length) {
    trialSource = "attempts";
    const best = new Map<string, TrialScore>();
    (attempts.data as { week: string; part: number; score: number; total: number; passed: boolean }[]).forEach((a) => {
      const k = `${a.week}|${a.part}`;
      const prev = best.get(k);
      const cur: TrialScore = { part: a.part, correct: a.score, answered: a.total, total: a.total, passed: !!a.passed, attempts: (prev?.attempts || 0) + 1 };
      if (!prev || a.score > prev.correct) best.set(k, { ...cur, passed: cur.passed || !!prev?.passed });
      else best.set(k, { ...prev, attempts: cur.attempts, passed: prev.passed || cur.passed });
    });
    best.forEach((v, k) => (trials[k.split("|")[0]] ||= []).push(v));
  }
  // table missing (migration not applied) or no attempts yet: score saved answers instead
  if (trialSource === "none") {
    const assess = await supabase.from("mcq_assessments").select("id, week, lesson_slug").eq("course_id", course);
    const list = (assess.data || []) as { id: string; week: string; lesson_slug: string }[];
    if (list.length) {
      // paged: PostgREST returns at most 1000 rows per request (`.limit(5000)` quietly got 1000,
      // and a learner with >1000 saved answers would have had trial scores computed from a slice)
      const answerRows: unknown[] = [];
      for (let from = 0; from < 20_000; from += 1000) {
        const page = await supabase
          .from("mcq_user_answers")
          .select("assessment_id, question_number, selected_option")
          .eq("user_id", uid)
          .in(
            "assessment_id",
            list.map((a) => a.id)
          )
          .order("id")
          .range(from, from + 999);
        if (page.error || !page.data) break;
        answerRows.push(...page.data);
        if (page.data.length < 1000) break;
      }
      const byLesson: Record<string, Record<string, string>> = {};
      (answerRows as { assessment_id: string; question_number: number; selected_option: string | null }[]).forEach((r) => {
        const a = list.find((x) => x.id === r.assessment_id);
        if (!a || !r.selected_option) return;
        mcqAnswered++;
        (byLesson[`${a.week}|${a.lesson_slug}`] ||= {})[String(r.question_number)] = r.selected_option;
      });
      const map = await getCourseMap(course).catch(() => null);
      const trialSlugs = new Set((map?.weeks || []).filter((w) => w.trial).map((w) => `${w.trial!.week}|${w.trial!.slug}`));
      const input = Object.entries(byLesson)
        .filter(([k]) => !map || trialSlugs.has(k))
        .map(([k, a]) => {
          const [week, slug] = k.split("|");
          return { week, slug, answers: a };
        });
      if (input.length) {
        const scored = await scoreMcqParts(input).catch(() => ({}) as Awaited<ReturnType<typeof scoreMcqParts>>);
        trials = Object.fromEntries(Object.entries(scored).map(([w, parts]) => [w, parts.map((p) => ({ part: p.part, correct: p.correct, answered: p.answered, total: p.total, passed: p.passed }))]));
        trialSource = "answers";
      }
    }
  }

  const p = profile.data as { current_streak: number | null; longest_streak: number | null; total_time_spent: number | null; total_lessons_completed: number | null; learning_goal: string | null } | null;
  const body: ProgressSummary = {
    rows: (rows.data || []) as Record<string, unknown>[],
    streaks: ((streaks.data || []) as { activity_date: string; lessons_completed: number | null; time_spent: number | null }[]).map((s) => ({
      date: String(s.activity_date).slice(0, 10),
      lessons: s.lessons_completed || 0,
      seconds: s.time_spent || 0,
    })),
    profile: p
      ? {
          currentStreak: p.current_streak || 0,
          longestStreak: p.longest_streak || 0,
          totalSeconds: p.total_time_spent || 0,
          lessonsCompleted: p.total_lessons_completed || 0,
          learningGoal: p.learning_goal ?? null,
        }
      : null,
    notebook: { highlights: highlights.count || 0, notes: notes.count || 0, bookmarks: bookmarks.count || 0 },
    trials,
    trialSource,
    mcqAnswered,
  };
  return NextResponse.json(body, { headers: noStore });
}
