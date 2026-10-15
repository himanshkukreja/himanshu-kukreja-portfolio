import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getCourseMap } from "@/lib/learn/course";
import { lessonKey } from "@/lib/learn/types";
import { noStore, requireLearner } from "../_lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type In = { week: string; slug: string; completed: boolean; pct: number; at?: number };

/**
 * POST /api/learn/import  { course, lessons: [{ week, slug, completed, pct, at }] }
 * Copies progress made as a guest in this browser into the signed-in account. Only real lessons of
 * the course are accepted, and nothing regresses: completed stays completed, % only goes up.
 */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const body = (await request.json().catch(() => null)) as { course?: unknown; lessons?: unknown } | null;
  const course = typeof body?.course === "string" ? body.course : "";
  const map = course ? await getCourseMap(course).catch(() => null) : null;
  if (!map) return NextResponse.json({ error: "Unknown course" }, { status: 400, headers: noStore });

  const valid = new Set<string>();
  map.weeks.forEach((w) => [...w.lessons, ...(w.boss ? [w.boss] : [])].forEach((l) => valid.add(lessonKey(l.week, l.slug))));
  map.sideQuests.forEach((l) => valid.add(lessonKey(l.week, l.slug)));
  if (map.plan) valid.add(lessonKey(map.plan.week, map.plan.slug));

  const input = (Array.isArray(body?.lessons) ? (body!.lessons as In[]) : [])
    .slice(0, 400)
    .filter((l) => l && typeof l.week === "string" && typeof l.slug === "string" && valid.has(lessonKey(l.week, l.slug)))
    .map((l) => ({ week: l.week, slug: l.slug, completed: l.completed === true, pct: Math.max(0, Math.min(100, Math.round(Number(l.pct) || 0))), at: Number(l.at) || Date.now() }));
  if (!input.length) return NextResponse.json({ ok: true, imported: 0, skipped: 0 }, { headers: noStore });

  const { data: rows, error } = await supabase
    .from("learning_progress")
    .select("week, lesson_slug, status, progress_percentage, started_at, completed_at, time_spent")
    .eq("user_id", me.id)
    .eq("course_id", course);
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noStore });
  const have = new Map(
    ((rows || []) as { week: string; lesson_slug: string; status: string | null; progress_percentage: number | null; started_at: string | null; completed_at: string | null; time_spent: number | null }[]).map(
      (r) => [lessonKey(r.week, r.lesson_slug), r]
    )
  );

  const now = new Date().toISOString();
  const upserts: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const l of input) {
    const cur = have.get(lessonKey(l.week, l.slug));
    const curDone = cur?.status === "completed";
    const curPct = cur?.progress_percentage || 0;
    const completed = curDone || l.completed;
    const pct = completed ? 100 : Math.max(curPct, l.pct);
    if ((curDone || !l.completed) && pct <= curPct) {
      skipped++;
      continue;
    }
    // client-supplied: clamp to the course's lifetime so imports can't backdate or future-date activity
    const at = new Date(Math.min(Date.now(), Math.max(Date.UTC(2024, 0, 1), l.at))).toISOString();
    upserts.push({
      user_id: me.id,
      course_id: course,
      week: l.week,
      lesson_slug: l.slug,
      status: completed ? "completed" : "in_progress",
      progress_percentage: pct,
      time_spent: cur?.time_spent || 0,
      started_at: cur?.started_at || at,
      last_accessed_at: now,
      ...(completed ? { completed_at: cur?.completed_at || at } : {}),
    });
  }
  if (upserts.length) {
    const up = await supabase.from("learning_progress").upsert(upserts, { onConflict: "user_id,course_id,week,lesson_slug" });
    if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500, headers: noStore });
  }
  return NextResponse.json({ ok: true, imported: upserts.length, skipped }, { headers: noStore });
}
