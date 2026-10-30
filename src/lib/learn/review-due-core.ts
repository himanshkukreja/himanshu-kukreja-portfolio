/**
 * What a learner should review next, ranked: the pure half of lib/learn/review-due.ts (which loads the
 * signals on the server for a signed-in learner). Safe in the browser and in Node tests: type-only imports.
 *
 * Sources, and where each lives
 *   review cards         review_cards (server) · hk.review.v1 (this browser: guests, or before the table existed)
 *   lesson quick checks  analytics_events `quiz_answer` (server, signed in, tracking allowed) · sd:quiz:<course>/
 *                        <week>/<lesson> (this browser: first-try verdict `f` and the current pick `p`)
 *                        · user_profiles.game_done `quiz:<id>` (first try right, any device)
 *   lecture checkpoints  analytics_events `lecture_quiz` (server) · game_done `lecture-quiz:<lecture>:<scene>` (right)
 *   "your turn" checks   sd:verdict:<week>/<slug> → { qid: "knew" | "review" } (this browser only, no dates)
 *   trial parts          trial_attempts (server)
 *   started lessons      learning_progress + game_done stage:/lesson: keys (server) · hk.lesson.v1 (this browser)
 *   scheduled steps      saved paths in game flags (spath:*), steps with a `due` date that isn't done
 *
 * A miss is due the day after it happened (Leitner box 1), a card on its due date, a started lesson now.
 * Ranking: a value score per item (overdue, how much was missed, how weak, how recent), at most two items of a
 * kind while others wait, `limit` (5) in all.
 */
import type { CourseLesson, CourseMap } from "./types";

// ---------------------------------------------------------------- output

export type DueKind = "review" | "quiz" | "checkpoint" | "weak" | "resume" | "plan";

export type DueItem = {
  /** review: due cards · quiz: missed lesson quick checks · checkpoint: missed lecture or "your turn" checks ·
   *  weak: a trial part below the pass mark · resume: a lesson started, not finished · plan: an overdue saved-path step */
  kind: DueKind;
  /** stable: review:<week>/<slug>, quiz:<week>/<slug>, checkpoint:lecture:<slug>, checkpoint:lesson:<week>/<slug>,
   *  weak:trial:<week>/<part>, resume:<week>/<slug>, plan:<path id>:<step id> */
  id: string;
  title: string;
  /** site-relative link */
  href: string;
  /** one line on why, e.g. "you missed 2 of 3 checkpoint questions on Consistent hashing 4 days ago" */
  why: string;
  /** yyyy-mm-dd (the learner's day) it became due */
  dueAt: string;
  /** rough minutes it takes */
  minutes: number;
};

export type DueReviews = { items: DueItem[] };

// ---------------------------------------------------------------- inputs

export type CardSignal = {
  id: string;
  source: string;
  sourceRef: string;
  week: string | null;
  lessonSlug: string | null;
  front: string;
  /** the card's short title (detail.short), when it has one */
  short?: string;
  box: number;
  /** yyyy-mm-dd */
  dueAt: string;
  lastGrade: string | null;
  reviews: number;
};

/** One lesson quick-check answer event. qid = quiz:<course>/<week>/<lesson>:<block>:<q> */
export type QuizEvent = { qid: string; week: string; lesson: string; correct: boolean; first: boolean; at: number };

/** This browser's quick-check state (sd:quiz:*): `firstTry` false = missed first time; `pick` the current answer. */
export type DeviceQuiz = { qid: string; week: string; lesson: string; firstTry: boolean | null; pick: number | null };

export type LectureQuizEvent = { lecture: string; scene: string; right: boolean; at: number };

export type TrialSignal = { week: string; part: number; score: number; total: number; passed: boolean; at: number };

export type LessonSignal = { status: "not_started" | "in_progress" | "completed"; pct: number; lastStage: string | null; lastAt: number };

export type VerdictSignal = { lesson: string; review: number; knew: number };

export type PlanStepSignal = { pathId: string; pathTitle: string; stepId: string; title: string; href: string; kind: string; due: string; done: boolean };

export type ReviewSignals = {
  /** epoch ms */
  now: number;
  /** IANA zone the learner's days are counted in (default Asia/Kolkata) */
  tz?: string;
  map: CourseMap | null;
  cards?: CardSignal[];
  quiz?: QuizEvent[];
  deviceQuiz?: DeviceQuiz[];
  /** qid → index of the right option (from the question bank), to tell a corrected device pick from a wrong one */
  answers?: Record<string, number>;
  /** qid → the question, for the "why" line */
  prompts?: Record<string, string>;
  lectureQuiz?: LectureQuizEvent[];
  /** lecture slug → what it teaches (its title) and link */
  lectures?: Record<string, { title: string; href: string }>;
  trials?: TrialSignal[];
  /** keyed <week>/<slug> */
  lessons?: Record<string, LessonSignal>;
  verdicts?: VerdictSignal[];
  planSteps?: PlanStepSignal[];
  /** user_profiles.game_done (or this browser's hk.game.v1 done) */
  done?: Record<string, number>;
};

export type RankOptions = { limit?: number };

// ---------------------------------------------------------------- dates

const fmt = new Map<string, Intl.DateTimeFormat>();
/** yyyy-mm-dd of an instant in a zone */
export function dayIn(ms: number, tz = "Asia/Kolkata"): string {
  let f = fmt.get(tz);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    } catch {
      f = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
    }
    fmt.set(tz, f);
  }
  const parts: Record<string, string> = {};
  f.formatToParts(new Date(ms)).forEach((p) => (parts[p.type] = p.value));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const utc = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, dd);
};
const addDay = (d: string, n: number) => new Date(utc(d) + n * 86_400_000).toISOString().slice(0, 10);
/** whole days from a to b (b later → positive) */
export const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / 86_400_000);

/** "today", "yesterday", "4 days ago", "2 weeks ago", "3 months ago" */
export function agoLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

// ---------------------------------------------------------------- course lookups

type LessonInfo = { title: string; href: string; tag: string };

function courseIndex(map: CourseMap | null) {
  const lessons = new Map<string, LessonInfo>();
  const trials = new Map<string, { code: string; passPct: number; parts: Map<number, { title: string; href: string; questions: number }> }>();
  if (map) {
    const add = (l: CourseLesson) => lessons.set(`${l.week}/${l.slug}`, { title: l.title, href: l.href, tag: l.tag });
    map.weeks.forEach((w) => {
      w.lessons.forEach(add);
      if (w.boss) add(w.boss);
      if (w.trial)
        trials.set(w.trial.week, { code: `W${w.code}`, passPct: w.trial.passPct || 80, parts: new Map(w.trial.parts.map((p) => [p.n, { title: p.title, href: p.href, questions: p.questions }])) });
    });
    map.sideQuests.forEach(add);
    (map.problems ?? []).forEach(add);
    (map.lld ?? []).forEach(add);
    if (map.plan) add(map.plan);
  }
  return { lessons, trials, courseId: map?.courseId || "system-design-mastery" };
}

const humanize = (slug: string) =>
  slug
    .replace(/^(day|part)-\d+-/, "")
    .replace(/[-_]+/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());

const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trim()}…` : t;
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------- ranking

type Scored = DueItem & { score: number };

/** Rank the signals into at most `limit` items, most valuable first. Pure; never throws on partial input. */
export function rankDueReviews(sig: ReviewSignals, opts: RankOptions = {}): DueReviews {
  const limit = Math.min(10, Math.max(1, Math.floor(opts.limit ?? 5)));
  const tz = sig.tz || "Asia/Kolkata";
  const today = dayIn(sig.now, tz);
  const ix = courseIndex(sig.map);
  const done = sig.done || {};
  const lessonOf = (week: string | null, slug: string | null): LessonInfo | null => (week && slug ? ix.lessons.get(`${week}/${slug}`) || null : null);
  const lessonTitle = (week: string, slug: string) => lessonOf(week, slug)?.title || humanize(slug);
  const lessonHref = (week: string, slug: string) => lessonOf(week, slug)?.href || `/learn/${ix.courseId}/${week}/${slug}`;
  const ago = (at: number) => agoLabel(daysBetween(dayIn(at, tz), today));
  const out: Scored[] = [];

  // ---- review cards: due ones, one item per lesson (cards with no lesson grouped by source)
  {
    const due = (sig.cards || []).filter((c) => c.dueAt && c.dueAt <= today);
    const groups = new Map<string, CardSignal[]>();
    for (const c of due) {
      const k = c.week && c.lessonSlug ? `${c.week}/${c.lessonSlug}` : `~${c.source}`;
      groups.set(k, [...(groups.get(k) || []), c]);
    }
    const totalDue = due.length;
    const SOURCE_TITLE: Record<string, string> = { highlight: "Your highlights", interview: "Interview answers", notes: "Your notebook cards", trial_miss: "Trial questions you missed", trial_flag: "Trial questions you flagged" };
    for (const [k, cards] of groups) {
      cards.sort((a, b) => a.box - b.box || a.dueAt.localeCompare(b.dueAt));
      const oldest = cards.reduce((m, c) => (c.dueAt < m ? c.dueAt : m), today);
      const overdue = daysBetween(oldest, today);
      const again = cards.filter((c) => c.lastGrade === "again" || c.lastGrade === "hard");
      const minBox = Math.min(...cards.map((c) => c.box || 1));
      const lesson = k.startsWith("~") ? null : (() => {
        const [w, s] = k.split("/");
        return { title: lessonTitle(w, s), week: w, slug: s };
      })();
      const name = lesson ? lesson.title : SOURCE_TITLE[k.slice(1)] || "Review cards";
      const sample = again[0] || cards[0];
      const q = clip(sample.short || sample.front, 70);
      const why = [
        `${plural(cards.length, "card")} due${overdue > 0 ? `, the oldest ${plural(overdue, "day")} overdue` : " today"}`,
        again.length ? `last time you graded “${q}” ${again[0].lastGrade === "again" ? "again" : "hard"}` : `starting with “${q}”`,
      ].join("; ");
      out.push({
        kind: "review",
        id: lesson ? `review:${k}` : `review:${k.slice(1)}`,
        title: `${name} · ${plural(cards.length, "review card")}`,
        href: "/learn/review",
        why: totalDue > cards.length ? `${why} (${totalDue} due in all)` : why,
        dueAt: oldest,
        minutes: Math.max(1, Math.ceil((cards.length * 25) / 60)),
        score: 60 + Math.min(20, overdue * 2) + (minBox <= 1 ? 10 : minBox === 2 ? 5 : 0) + Math.min(10, again.length * 3) + Math.min(10, cards.length),
      });
    }
  }

  // ---- lesson quick checks missed first time and not answered right since
  {
    type Q = { week: string; lesson: string; firstAt: number; missed: boolean; fixed: boolean; lastAt: number };
    const qs = new Map<string, Q>();
    const events = [...(sig.quiz || [])].sort((a, b) => a.at - b.at);
    for (const e of events) {
      if (!e.qid || !e.week || !e.lesson) continue;
      let q = qs.get(e.qid);
      if (!q) {
        q = { week: e.week, lesson: e.lesson, firstAt: e.at, missed: !e.correct, fixed: false, lastAt: e.at };
        qs.set(e.qid, q);
      } else if (e.correct) q.fixed = true;
      q.lastAt = Math.max(q.lastAt, e.at);
    }
    // this browser: a first-try miss with no right pick since (when the answer key is known)
    for (const d of sig.deviceQuiz || []) {
      if (!d.qid || !d.week || !d.lesson) continue;
      const answer = sig.answers?.[d.qid];
      const fixedNow = d.pick !== null && answer !== undefined && d.pick === answer;
      const q = qs.get(d.qid);
      if (q) {
        if (fixedNow) q.fixed = true;
        continue;
      }
      if (d.firstTry === null) continue;
      qs.set(d.qid, { week: d.week, lesson: d.lesson, firstAt: 0, missed: d.firstTry === false, fixed: fixedNow, lastAt: 0 });
    }
    const byLesson = new Map<string, { week: string; lesson: string; n: number; missed: string[]; at: number }>();
    for (const [qid, q] of qs) {
      const k = `${q.week}/${q.lesson}`;
      const g = byLesson.get(k) || { week: q.week, lesson: q.lesson, n: 0, missed: [], at: 0 };
      g.n++;
      // a first-try right answer recorded on any device (game_done) also clears it
      if (q.missed && !q.fixed && !done[qid]) {
        g.missed.push(qid);
        g.at = Math.max(g.at, q.firstAt);
      }
      byLesson.set(k, g);
    }
    for (const [k, g] of byLesson) {
      if (!g.missed.length) continue;
      const title = lessonTitle(g.week, g.lesson);
      const when = g.at ? ` ${ago(g.at)}` : " (on this device)";
      const prompt = g.missed.map((id) => sig.prompts?.[id]).find(Boolean);
      const dueAt = g.at ? addDay(dayIn(g.at, tz), 1) : today;
      const notYet = dueAt > today;
      out.push({
        kind: "quiz",
        id: `quiz:${k}`,
        title: `Quick checks · ${title}`,
        href: lessonHref(g.week, g.lesson),
        why: `you missed ${g.missed.length} of ${plural(g.n, "quick-check question")} in ${title}${when}${prompt ? `, e.g. “${clip(prompt, 80)}”` : ""}`,
        dueAt,
        minutes: Math.max(3, g.missed.length * 2),
        score: 55 + Math.min(20, g.missed.length * 6) + (g.missed.length / g.n >= 0.5 ? 8 : 0) - (notYet ? 30 : 0),
      });
    }
  }

  // ---- lecture checkpoints missed and not answered right since
  {
    type S = { firstAt: number; missed: boolean; fixed: boolean };
    const byLecture = new Map<string, Map<string, S>>();
    for (const e of [...(sig.lectureQuiz || [])].sort((a, b) => a.at - b.at)) {
      if (!e.lecture || !e.scene) continue;
      const scenes = byLecture.get(e.lecture) || new Map<string, S>();
      const s = scenes.get(e.scene);
      if (!s) scenes.set(e.scene, { firstAt: e.at, missed: !e.right, fixed: false });
      else if (e.right) s.fixed = true;
      byLecture.set(e.lecture, scenes);
    }
    for (const [lecture, scenes] of byLecture) {
      const missed = [...scenes.entries()].filter(([scene, s]) => s.missed && !s.fixed && !done[`lecture-quiz:${lecture}:${scene}`]);
      if (!missed.length) continue;
      const at = Math.max(...missed.map(([, s]) => s.firstAt));
      const info = sig.lectures?.[lecture];
      const topic = info?.title || humanize(lecture.split("--").pop() || lecture);
      const dueAt = addDay(dayIn(at, tz), 1);
      out.push({
        kind: "checkpoint",
        id: `checkpoint:lecture:${lecture}`,
        title: `Lecture checkpoints · ${topic}`,
        href: info?.href || `/learn/lectures/${lecture}`,
        why: `you missed ${missed.length} of ${plural(scenes.size, "checkpoint question")} on ${topic} ${ago(at)}`,
        dueAt,
        minutes: Math.max(3, missed.length * 3),
        score: 55 + Math.min(20, missed.length * 6) + (missed.length / scenes.size >= 0.5 ? 8 : 0) - (dueAt > today ? 30 : 0),
      });
    }
  }

  // ---- "your turn" checkpoints marked "missed some" (this browser only)
  for (const v of sig.verdicts || []) {
    if (!v.review || !v.lesson.includes("/")) continue;
    const [week, slug] = v.lesson.split("/");
    const title = lessonTitle(week, slug);
    out.push({
      kind: "checkpoint",
      id: `checkpoint:lesson:${v.lesson}`,
      title: `Your-turn checkpoints · ${title}`,
      href: lessonHref(week, slug),
      why: `you marked ${v.review} of ${plural(v.review + v.knew, "“your turn” checkpoint")} in ${title} as “missed some” (on this device)`,
      dueAt: today,
      minutes: Math.max(3, v.review * 3),
      score: 50 + Math.min(20, v.review * 5),
    });
  }

  // ---- weak trial parts: best score under the pass mark and never passed
  {
    const best = new Map<string, TrialSignal & { attempts: number; last: number }>();
    for (const t of sig.trials || []) {
      if (!t.week || !t.part || !(t.total > 0)) continue;
      const k = `${t.week}/${t.part}`;
      const prev = best.get(k);
      const attempts = (prev?.attempts || 0) + 1;
      const last = Math.max(prev?.last || 0, t.at || 0);
      if (!prev || t.score / t.total > prev.score / prev.total) best.set(k, { ...t, passed: t.passed || !!prev?.passed, attempts, last });
      else best.set(k, { ...prev, passed: prev.passed || t.passed, attempts, last });
    }
    for (const [k, t] of best) {
      const info = ix.trials.get(t.week);
      const passPct = info?.passPct ?? 80;
      const pct = Math.round((t.score / t.total) * 100);
      if (t.passed || done[`trial:${t.week}/part-${t.part}`] || pct >= passPct) continue;
      const part = info?.parts.get(t.part);
      const name = `${info?.code ? `${info.code} · ` : ""}Trial part ${t.part}${part?.title ? ` · ${part.title}` : ""}`;
      const dueAt = t.last ? addDay(dayIn(t.last, tz), 1) : today;
      out.push({
        kind: "weak",
        id: `weak:trial:${k}`,
        title: name,
        href: part?.href || `/learn/${ix.courseId}`,
        why: `your best on ${part?.title ? `“${part.title}”` : `part ${t.part}`} is ${t.score}/${t.total} (${pct}%), the pass mark is ${passPct}%${t.last ? `; last try ${ago(t.last)}` : ""}${t.attempts > 1 ? ` after ${t.attempts} attempts` : ""}`,
        dueAt,
        minutes: Math.max(10, part?.questions || t.total),
        score: 50 + Math.min(25, Math.round((passPct - pct) / 2)) - (dueAt > today ? 20 : 0),
      });
    }
  }

  // ---- lessons started and not finished
  for (const [k, l] of Object.entries(sig.lessons || {})) {
    if (l.status !== "in_progress" || l.pct >= 100 || done[`lesson:${k}`] || !k.includes("/")) continue;
    const [week, slug] = k.split("/");
    const info = lessonOf(week, slug);
    if (!info && sig.map) continue; // not in the course any more
    const days = l.lastAt ? daysBetween(dayIn(l.lastAt, tz), today) : 30;
    const stage = l.lastStage ? l.lastStage.replace(/[-_]+/g, " ") : "";
    const minutesLeft = (() => {
      const full = sig.map ? [...sig.map.weeks.flatMap((w) => [...w.lessons, ...(w.boss ? [w.boss] : [])]), ...sig.map.sideQuests].find((x) => `${x.week}/${x.slug}` === k)?.minutes : 0;
      return full ? Math.max(5, Math.round(full * (1 - Math.min(99, l.pct) / 100))) : 15;
    })();
    out.push({
      kind: "resume",
      id: `resume:${k}`,
      title: info?.title || humanize(slug),
      href: `${info?.href || lessonHref(week, slug)}${l.lastStage ? `#${l.lastStage}` : ""}`,
      why: `you're ${l.pct > 0 ? `${Math.round(l.pct)}% through it` : "partway through it"}, last opened ${agoLabel(days)}${stage ? `, at “${stage}”` : ""}`,
      dueAt: l.lastAt ? dayIn(l.lastAt, tz) : today,
      minutes: minutesLeft,
      score: 40 + (l.pct >= 50 ? 8 : 0) + (days <= 3 ? 8 : days <= 14 ? 4 : days > 45 ? -10 : 0),
    });
  }

  // ---- saved-path steps scheduled for today or earlier and not done
  {
    const late = (sig.planSteps || []).filter((s) => !s.done && s.due && s.due <= today && !done[`lesson:${lessonKeyOfHref(s.href) ?? "-"}`]);
    const byPath = new Map<string, PlanStepSignal[]>();
    late.forEach((s) => byPath.set(s.pathId, [...(byPath.get(s.pathId) || []), s]));
    for (const [pathId, steps] of byPath) {
      steps.sort((a, b) => a.due.localeCompare(b.due));
      const first = steps[0];
      const overdue = daysBetween(first.due, today);
      out.push({
        kind: "plan",
        id: `plan:${pathId}:${first.stepId}`,
        title: first.title,
        href: first.href,
        why: `due ${overdue <= 0 ? "today" : agoLabel(overdue)} in your saved path “${clip(first.pathTitle, 60)}”${steps.length > 1 ? ` (${steps.length} steps due)` : ""}`,
        dueAt: first.due,
        minutes: 20,
        score: 45 + Math.min(15, overdue * 3) + Math.min(6, steps.length * 2),
      });
    }
  }

  // ---- pick: by score (older due date breaks ties), two of a kind while other kinds wait
  out.sort((a, b) => b.score - a.score || a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id));
  const picked: Scored[] = [];
  const perKind = new Map<string, number>();
  for (const it of out) {
    if (picked.length >= limit) break;
    if ((perKind.get(it.kind) || 0) >= 2) continue;
    picked.push(it);
    perKind.set(it.kind, (perKind.get(it.kind) || 0) + 1);
  }
  for (const it of out) {
    if (picked.length >= limit) break;
    if (!picked.includes(it)) picked.push(it);
  }
  picked.sort((a, b) => b.score - a.score || a.dueAt.localeCompare(b.dueAt));
  return { items: picked.map(({ score: _s, ...rest }) => (void _s, rest)) };
}

/** "<week>/<slug>" of a lesson link (/learn/<course>/<week>/<slug>[#…]), else null. */
export function lessonKeyOfHref(href: string): string | null {
  const m = /^\/learn\/[^/]+\/(week-[^/#?]+|bonus-[^/#?]+|problem-bank|low-level-design)\/([^/#?]+)/.exec(href);
  return m ? `${m[1]}/${m[2]}` : null;
}

// ---------------------------------------------------------------- learning_progress + game_done → lesson signals

export type ProgressRow = {
  week: string;
  lesson_slug: string;
  status?: string | null;
  progress_percentage?: number | null;
  max_progress?: number | null;
  completed_stages?: string[] | null;
  last_stage?: string | null;
  last_accessed_at?: string | null;
  completed_at?: string | null;
};

const ms = (s?: string | null) => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? t : 0;
};

/** Lesson state from server rows and the game's done record (the same rules as lib/learn/progress.ts mergeProgress). */
export function lessonSignals(rows: ProgressRow[], done: Record<string, number>): Record<string, LessonSignal> {
  const out: Record<string, LessonSignal> = {};
  const get = (k: string) => (out[k] ||= { status: "not_started", pct: 0, lastStage: null, lastAt: 0 });
  for (const r of rows) {
    if (!r.week || !r.lesson_slug) continue;
    const p = get(`${r.week}/${r.lesson_slug}`);
    const pct = Math.max(Number(r.progress_percentage) || 0, Number(r.max_progress) || 0);
    if (r.status === "completed") p.status = "completed";
    else if (p.status !== "completed" && (pct > 0 || r.status === "in_progress" || (r.completed_stages || []).length)) p.status = "in_progress";
    p.pct = Math.max(p.pct, pct);
    if (r.last_stage) p.lastStage = r.last_stage;
    p.lastAt = Math.max(p.lastAt, ms(r.last_accessed_at), ms(r.completed_at));
  }
  const stageAt: Record<string, number> = {};
  for (const [key, at] of Object.entries(done)) {
    if (key.startsWith("lesson:")) {
      const p = get(key.slice(7));
      p.status = "completed";
      p.lastAt = Math.max(p.lastAt, at || 0);
    } else if (key.startsWith("stage:")) {
      const rest = key.slice(6);
      const i = rest.lastIndexOf("/");
      if (i <= 0) continue;
      const lk = rest.slice(0, i);
      const p = get(lk);
      if (p.status === "not_started") p.status = "in_progress";
      p.lastAt = Math.max(p.lastAt, at || 0);
      if (!p.lastStage && (at || 0) >= (stageAt[lk] || 0)) {
        stageAt[lk] = at || 0;
        p.lastStage = rest.slice(i + 1);
      }
    }
  }
  for (const p of Object.values(out)) if (p.status === "completed") p.pct = 100;
  return out;
}

// ---------------------------------------------------------------- this browser's signals (localStorage)

/** The part of Storage this reads (window.localStorage, or a stub in tests). */
export type StorageLike = { readonly length: number; key(i: number): string | null; getItem(k: string): string | null };

export type ClientReviewSignals = {
  cards: CardSignal[];
  deviceQuiz: DeviceQuiz[];
  verdicts: VerdictSignal[];
  lessons: Record<string, LessonSignal>;
  done: Record<string, number>;
};

const parse = (s: string | null): unknown => {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {});

/**
 * Review signals that exist only in this browser, read from localStorage: the local review queue
 * (hk.review.v1), quick-check state (sd:quiz:*), "your turn" verdicts (sd:verdict:*), the reader's lesson
 * records (hk.lesson.v1) and the game's done record (hk.game.v1). Pure over `storage`; never throws.
 * Send the result to the server's getDueReviews({ client }) or rank it here with rankDueReviews.
 */
export function collectClientSignals(storage: StorageLike, courseId = "system-design-mastery"): ClientReviewSignals {
  const out: ClientReviewSignals = { cards: [], deviceQuiz: [], verdicts: [], lessons: {}, done: {} };
  const get = (k: string) => {
    try {
      return storage.getItem(k);
    } catch {
      return null;
    }
  };
  // local review queue
  const rq = obj(parse(get("hk.review.v1")));
  for (const c of Array.isArray(rq.cards) ? rq.cards.slice(0, 2000) : []) {
    const o = obj(c);
    if (typeof o.front !== "string" || typeof o.dueAt !== "string") continue;
    const d = obj(o.detail);
    out.cards.push({
      id: String(o.id || ""),
      source: String(o.source || ""),
      sourceRef: String(o.sourceRef || ""),
      week: typeof o.week === "string" ? o.week : null,
      lessonSlug: typeof o.lessonSlug === "string" ? o.lessonSlug : null,
      front: o.front,
      short: typeof d.short === "string" ? d.short : undefined,
      box: Number(o.box) || 1,
      dueAt: o.dueAt.slice(0, 10),
      lastGrade: typeof o.lastGrade === "string" ? o.lastGrade : null,
      reviews: Number(o.reviews) || 0,
    });
  }
  // game done record
  const game = obj(parse(get("hk.game.v1")));
  for (const [k, v] of Object.entries(obj(game.done))) if (Number(v) > 0) out.done[k] = Number(v);
  // reader lesson records
  const lessonRec = obj(parse(get("hk.lesson.v1")));
  const prefix = `${courseId}/`;
  for (const [k, v] of Object.entries(lessonRec)) {
    if (!k.startsWith(prefix)) continue;
    const lk = k.slice(prefix.length);
    if (!lk.includes("/")) continue;
    const r = obj(v);
    const stages = Array.isArray(r.stages) ? r.stages : [];
    const completed = !!r.completed;
    const max = Number(r.max) || 0;
    if (!completed && !max && !stages.length && !r.last) continue;
    out.lessons[lk] = {
      status: completed ? "completed" : "in_progress",
      pct: completed ? 100 : Math.min(99, max),
      lastStage: typeof r.last === "string" ? r.last : null,
      lastAt: Math.max(Number(r.updatedAt) || 0, Number(r.completedAt) || 0),
    };
  }
  // quick checks and "your turn" verdicts
  let n = 0;
  try {
    n = storage.length;
  } catch {
    n = 0;
  }
  for (let i = 0; i < Math.min(n, 5000); i++) {
    let key: string | null = null;
    try {
      key = storage.key(i);
    } catch {
      key = null;
    }
    if (!key) continue;
    if (key.startsWith("sd:quiz:")) {
      const scope = key.slice(8);
      const [course, week, lesson] = scope.split("/");
      if (course !== courseId || !week || !lesson) continue;
      for (const [block, st] of Object.entries(obj(parse(get(key))))) {
        for (const [q, a] of Object.entries(obj(obj(st).a))) {
          const s = obj(a);
          const f = s.f === 1 ? true : s.f === 0 ? false : null;
          const p = typeof s.p === "number" ? s.p : null;
          if (f === null && p === null) continue;
          out.deviceQuiz.push({ qid: `quiz:${scope}:${block}:${q}`, week, lesson, firstTry: f, pick: p });
        }
      }
    } else if (key.startsWith("sd:verdict:")) {
      const lesson = key.slice(11);
      let review = 0;
      let knew = 0;
      for (const v of Object.values(obj(parse(get(key))))) {
        if (v === "review") review++;
        else if (v === "knew") knew++;
      }
      if (review + knew) out.verdicts.push({ lesson, review, knew });
    }
  }
  return out;
}

/** Fold this browser's signals into the server's (cards de-duplicated by source + ref, lesson state never regresses). */
export function mergeClientSignals(server: ReviewSignals, client: Partial<ClientReviewSignals> | null | undefined): ReviewSignals {
  if (!client) return server;
  const cards = [...(server.cards || [])];
  const seen = new Set(cards.map((c) => `${c.source}|${c.sourceRef}`));
  for (const c of client.cards || []) if (!seen.has(`${c.source}|${c.sourceRef}`)) cards.push(c);
  const lessons: Record<string, LessonSignal> = { ...(server.lessons || {}) };
  for (const [k, l] of Object.entries(client.lessons || {})) {
    const p = lessons[k];
    if (!p) lessons[k] = l;
    else
      lessons[k] = {
        status: p.status === "completed" || l.status === "completed" ? "completed" : p.status === "in_progress" || l.status === "in_progress" ? "in_progress" : "not_started",
        pct: Math.max(p.pct, l.pct),
        lastStage: (l.lastAt >= p.lastAt ? l.lastStage : p.lastStage) || p.lastStage || l.lastStage,
        lastAt: Math.max(p.lastAt, l.lastAt),
      };
    if (lessons[k].status === "completed") lessons[k].pct = 100;
  }
  return {
    ...server,
    cards,
    lessons,
    deviceQuiz: [...(server.deviceQuiz || []), ...(client.deviceQuiz || [])],
    verdicts: [...(server.verdicts || []), ...(client.verdicts || [])],
    done: { ...(client.done || {}), ...(server.done || {}) },
  };
}
