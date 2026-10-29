import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { supabase } from "@/lib/supabase";
import { COURSE_ID, getCourseMap } from "@/lib/learn/course";
import { getDueReviews } from "@/lib/learn/review-due";
import { buildSnapshot, type ProgressRaw } from "@/lib/ai/chat/progress-model";
import { rateLimited } from "@/lib/learn/chat-history-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatContext = {
  due: { kind: string; title: string; href: string; why: string; minutes: number }[];
  progress: {
    xp: number;
    streak: number;
    lessonsDone: number;
    lessonsTotal: number;
    week: { code: string; title: string } | null;
    next: { title: string; href: string; code: string; minutes: number } | null;
  } | null;
};

/** per learner and server instance: the rail asks at most every few minutes, and this keeps repeat views cheap */
const cache = new Map<string, { at: number; v: ChatContext }>();
const TTL = 5 * 60_000;

/**
 * GET /api/learn/ai/chat/context → ChatContext, for the course chat's context rail: what is due for review
 * (lib/learn/review-due.ts, the same ranking the tutor's get_due_reviews tool uses) and a small progress snapshot.
 * Signed in; no AI call; loaded by the verified user id only.
 */
export async function GET(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const headers = { "Cache-Control": "private, max-age=120" };
  const hit = cache.get(me.id);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json(hit.v, { headers });
  if (rateLimited(me.id, "read")) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const [due, map, profile, rows, trials, cards] = await Promise.all([
    getDueReviews({ userId: me.id, limit: 4 }).catch(() => null),
    getCourseMap().catch(() => null),
    supabase.from("user_profiles").select("xp, game_done, current_streak").eq("id", me.id).maybeSingle(),
    supabase.from("learning_progress").select("*").eq("user_id", me.id).eq("course_id", COURSE_ID).limit(2000),
    supabase.from("trial_attempts").select("week, part, score, total, passed").eq("user_id", me.id).eq("course_id", COURSE_ID).limit(1000),
    supabase.from("review_cards").select("front, week, lesson_slug, box, last_grade, due_at").eq("user_id", me.id).eq("course_id", COURSE_ID).limit(500),
  ]);
  let progress: ChatContext["progress"] = null;
  if (map) {
    const raw: ProgressRaw = {
      profile: (profile.data ?? null) as ProgressRaw["profile"],
      rows: (rows.data ?? []) as ProgressRaw["rows"],
      trials: trials.error ? [] : ((trials.data ?? []) as ProgressRaw["trials"]),
      cards: cards.error ? [] : ((cards.data ?? []) as ProgressRaw["cards"]),
    };
    const s = buildSnapshot(raw, map);
    const n = s.inProgress[0] ? { ...s.inProgress[0], code: s.currentWeek?.code ?? "", minutes: 0 } : s.next[0];
    progress = {
      xp: s.xp,
      streak: s.streak,
      lessonsDone: s.lessonsDone,
      lessonsTotal: s.lessonsTotal,
      week: s.currentWeek ? { code: s.currentWeek.code, title: s.currentWeek.title } : null,
      next: n ? { title: n.title, href: `/learn/${COURSE_ID}/${n.week}/${n.slug}`, code: n.code, minutes: n.minutes } : null,
    };
  }
  const v: ChatContext = { due: (due?.items ?? []).map((i) => ({ kind: i.kind, title: i.title, href: i.href, why: i.why, minutes: i.minutes })), progress };
  cache.set(me.id, { at: Date.now(), v });
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  return NextResponse.json(v, { headers });
}
