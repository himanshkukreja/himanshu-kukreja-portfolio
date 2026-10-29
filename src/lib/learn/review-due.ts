import "server-only";
/**
 * Spaced repetition for one signed-in learner, on the server: what to review next, ranked, at most ~5
 * items, each with a one-line reason. The course chat calls it as a tool with the verified user id; nothing
 * here calls an AI model. Ranking and the client-only signals live in ./review-due-core (pure, browser-safe).
 *
 * Loaded by the user id with the service-role client (the same pattern as /api/learn/progress and the
 * chat's own loaders), never from anything the request says about the user:
 *   user_profiles      game_done (stage:/lesson:/quiz:/lecture-quiz:/trial: keys), game_flags (saved paths)
 *   learning_progress  lesson status, %, last stage, last opened
 *   review_cards       the Leitner queue (due_at <= today)
 *   trial_attempts     trial part scores
 *   analytics_events   quiz_answer / lecture_quiz events, last 120 days (only for learners whose browser
 *                      sends events: GPC / hk.notrack / blockers drop them, so misses are best effort)
 * Plus the course map (titles, links, pass marks), the question bank for a missed question's wording (only
 * when there is a quick-check miss; cached per instance) and the lecture scripts for missed lecture titles.
 *
 * Client-only (pass them as `client`, from collectClientSignals(localStorage) on the learner's device):
 * "your turn" verdicts (sd:verdict:*), quick-check picks (sd:quiz:*), a review queue kept in the browser
 * (hk.review.v1), the reader's own lesson records (hk.lesson.v1). Without them the server signals stand.
 * Every source is optional: a missing table or a failed query means fewer items, never an error.
 */
import { supabase } from "@/lib/supabase";
import { COURSE_ID, getCourseMap } from "@/lib/learn/course";
import { getLecture } from "@/lib/learn/lecture/load";
import { getQuestionBank } from "@/lib/learn/arena/bank";
import { lessonKeyOfStep, listSavedPaths } from "@/lib/learn/saved-paths";
import {
  dayIn,
  lessonSignals,
  mergeClientSignals,
  rankDueReviews,
  type CardSignal,
  type ClientReviewSignals,
  type DueReviews,
  type LectureQuizEvent,
  type PlanStepSignal,
  type ProgressRow,
  type QuizEvent,
  type ReviewSignals,
  type TrialSignal,
} from "./review-due-core";

export * from "./review-due-core";

export type GetDueReviewsInput = {
  /** the verified user id (never one from a request body) */
  userId: string;
  courseId?: string;
  /** items to return, default 5 (max 10) */
  limit?: number;
  /** default now */
  now?: Date;
  /** zone the learner's days are counted in, default Asia/Kolkata */
  tz?: string;
  /** signals only the learner's browser has (collectClientSignals), when the caller has them */
  client?: Partial<ClientReviewSignals> | null;
};

const EVENT_DAYS = 120;
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
const yes = (v: unknown) => v === true || v === "true" || v === 1;
const ms = (s?: string | null) => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? t : 0;
};

/** The card's short title, from the JSON the client encodes into `back` when a card has details. */
function shortOf(back: string): string | undefined {
  if (!back || !back.startsWith('{"hk":1,')) return undefined;
  try {
    const d = (JSON.parse(back) as { d?: { short?: unknown } }).d;
    return typeof d?.short === "string" ? d.short : undefined;
  } catch {
    return undefined;
  }
}

/** Load every server-side signal for one learner (no ranking). Exported for the chat's eval and debugging. */
export async function loadReviewSignals(input: Omit<GetDueReviewsInput, "limit">): Promise<ReviewSignals> {
  const courseId = input.courseId || COURSE_ID;
  const now = (input.now ?? new Date()).getTime();
  const tz = input.tz || "Asia/Kolkata";
  const today = dayIn(now, tz);
  const uid = input.userId;
  const since = new Date(now - EVENT_DAYS * 86_400_000).toISOString();

  const [map, profile, rows, cards, trials, events] = await Promise.all([
    getCourseMap(courseId).catch(() => null),
    supabase.from("user_profiles").select("game_done, game_flags").eq("id", uid).maybeSingle(),
    supabase.from("learning_progress").select("week, lesson_slug, status, progress_percentage, max_progress, completed_stages, last_stage, last_accessed_at, completed_at").eq("user_id", uid).eq("course_id", courseId).limit(2000),
    supabase.from("review_cards").select("id, source, source_ref, week, lesson_slug, front, back, box, due_at, last_grade, reviews").eq("user_id", uid).eq("course_id", courseId).lte("due_at", today).order("due_at", { ascending: true }).limit(500),
    supabase.from("trial_attempts").select("week, part, score, total, passed, started_at, finished_at").eq("user_id", uid).eq("course_id", courseId).limit(1000),
    supabase
      .from("analytics_events")
      .select("created_at, metadata")
      .eq("user_id", uid)
      .eq("event_type", "event")
      .in("metadata->>name", ["quiz_answer", "lecture_quiz"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  const prof = (profile.error ? null : profile.data) as { game_done?: unknown; game_flags?: unknown } | null;
  const done = (prof?.game_done && typeof prof.game_done === "object" ? prof.game_done : {}) as Record<string, number>;
  const flags = (prof?.game_flags && typeof prof.game_flags === "object" ? prof.game_flags : {}) as Record<string, unknown>;

  const cardSignals: CardSignal[] = cards.error
    ? []
    : ((cards.data || []) as { id: string; source: string; source_ref: string; week: string | null; lesson_slug: string | null; front: string; back: string; box: number; due_at: string; last_grade: string | null; reviews: number }[]).map((c) => ({
        id: c.id,
        source: c.source,
        sourceRef: c.source_ref,
        week: c.week,
        lessonSlug: c.lesson_slug,
        front: c.front,
        short: shortOf(c.back),
        box: c.box || 1,
        dueAt: String(c.due_at || "").slice(0, 10),
        lastGrade: c.last_grade,
        reviews: c.reviews || 0,
      }));

  const trialSignals: TrialSignal[] = trials.error
    ? []
    : ((trials.data || []) as { week: string; part: number; score: number; total: number; passed: boolean; started_at: string | null; finished_at: string | null }[])
        // an attempt never finished isn't a score
        .filter((t) => t.finished_at || t.passed || t.score > 0)
        .map((t) => ({ week: t.week, part: t.part, score: t.score, total: t.total, passed: !!t.passed, at: ms(t.finished_at) || ms(t.started_at) }));

  const quiz: QuizEvent[] = [];
  const lectureQuiz: LectureQuizEvent[] = [];
  for (const e of (events.error ? [] : events.data || []) as { created_at: string; metadata: Record<string, unknown> | null }[]) {
    const m = e.metadata || {};
    const at = ms(e.created_at);
    if (!at) continue;
    if (m.name === "quiz_answer") {
      const course = str(m.course) || courseId;
      const week = str(m.week);
      const lesson = str(m.lesson);
      const block = num(m.block);
      const q = num(m.q);
      if (course !== courseId || !week || !lesson || !Number.isFinite(block) || !Number.isFinite(q)) continue;
      quiz.push({ qid: `quiz:${course}/${week}/${lesson}:${block}:${q}`, week, lesson, correct: yes(m.correct), first: yes(m.first), at });
    } else if (m.name === "lecture_quiz") {
      const lecture = str(m.quest);
      const scene = str(m.scene);
      if (lecture && scene) lectureQuiz.push({ lecture, scene, right: yes(m.right), at });
    }
  }

  // saved-path steps with a date, done when ticked or (a whole lesson) completed
  const planSteps: PlanStepSignal[] = [];
  for (const p of listSavedPaths(flags)) {
    for (const s of p.steps) {
      if (!s.due) continue;
      const lk = lessonKeyOfStep(s);
      planSteps.push({ pathId: p.id, pathTitle: p.title, stepId: s.id, title: s.title, href: s.href, kind: s.kind, due: s.due, done: !!p.ticks[s.id] || !!(lk && done[`lesson:${lk}`]) });
    }
  }

  return {
    now,
    tz,
    map,
    cards: cardSignals,
    quiz,
    lectureQuiz,
    trials: trialSignals,
    lessons: lessonSignals((rows.error ? [] : rows.data || []) as ProgressRow[], done),
    planSteps,
    done,
  };
}

/** Wording for the "why" lines: question prompts for missed quick checks, titles for missed lectures. */
async function addNames(sig: ReviewSignals): Promise<ReviewSignals> {
  const done = sig.done || {};
  const quizMissed = (sig.quiz || []).some((e) => e.first && !e.correct && !done[e.qid]) || (sig.deviceQuiz || []).some((d) => d.firstTry === false);
  const lectures = Array.from(new Set((sig.lectureQuiz || []).filter((e) => !e.right).map((e) => e.lecture))).slice(0, 8);
  const [bank, lecs] = await Promise.all([
    quizMissed ? getQuestionBank().catch(() => null) : Promise.resolve(null),
    Promise.all(lectures.map(async (slug) => [slug, await getLecture(slug).catch(() => null)] as const)),
  ]);
  const prompts: Record<string, string> = {};
  const answers: Record<string, number> = {};
  if (bank) {
    const ids = new Set([...(sig.quiz || []).map((e) => e.qid), ...(sig.deviceQuiz || []).map((d) => d.qid)]);
    for (const id of ids) {
      const q = bank.byId.get(id);
      if (q) {
        prompts[id] = q.prompt;
        answers[id] = q.answer;
      }
    }
  }
  const names: Record<string, { title: string; href: string }> = {};
  for (const [slug, l] of lecs) if (l) names[slug] = { title: l.title, href: `/learn/lectures/${slug}` };
  return { ...sig, prompts, answers, lectures: names };
}

/**
 * The learner's due reviews, most valuable first (about 5): due review cards, quick-check and lecture
 * checkpoint misses not answered right since, trial parts under the pass mark, lessons started and not
 * finished, and saved-path steps past their date. Never throws: on any failure the list is shorter.
 */
export async function getDueReviews(input: GetDueReviewsInput): Promise<DueReviews> {
  if (!input?.userId || !/^[0-9a-f-]{16,64}$/i.test(input.userId)) return { items: [] };
  try {
    const server = await loadReviewSignals(input);
    const merged = mergeClientSignals(server, input.client);
    return rankDueReviews(await addNames(merged), { limit: input.limit ?? 5 });
  } catch (e) {
    console.error("[review-due]", (e as Error).message);
    return { items: [] };
  }
}
