/**
 * The learner's progress as the course chat sees it: a compact snapshot built from the same sources and
 * merge rules as the progress page and the share page (lib/share/stats.ts `derive`):
 *   learning_progress  lesson status and percentage (+ completed_stages, last_stage)
 *   user_profiles      game_done (lesson:/stage:/boss:/trial:/mock:/offer: keys), xp, streak
 *   trial_attempts     trial part scores (best attempt per part)
 *   review_cards       spaced-repetition cards (box 1-2 or graded again/hard = weak spots)
 * Pure, so the route and the eval build the same snapshot (the eval from a fixture). Never includes
 * anyone else's data: the route loads the raw rows by the verified user id.
 */
import type { CourseMap, CourseLesson } from "@/lib/learn/types";
import { lessonKey } from "@/lib/learn/types";

export type ProgressRaw = {
  profile: { xp?: number | null; game_done?: Record<string, number> | null; current_streak?: number | null } | null;
  rows: { week: string; lesson_slug: string; status?: string | null; progress_percentage?: number | null; max_progress?: number | null; completed_stages?: string[] | null; last_stage?: string | null; last_accessed_at?: string | null; completed_at?: string | null }[];
  trials: { week: string; part: number; score: number; total: number; passed: boolean }[];
  cards: { front: string; week: string | null; lesson_slug: string | null; box: number; last_grade: string | null; due_at: string | null }[];
};

export type ProgressSnapshot = {
  started: boolean;
  lessonsDone: number;
  lessonsTotal: number;
  questsDone: number;
  questsTotal: number;
  xp: number;
  streak: number;
  currentWeek: { key: string; code: string; title: string } | null;
  weeks: { key: string; code: string; title: string; lessons: number; lessonsDone: number; bossDone: boolean; partsPassed: number; partsTotal: number; cleared: boolean; started: boolean }[];
  inProgress: { week: string; slug: string; title: string; pct: number; lastStage: string | null; at: number }[];
  recentDone: { week: string; slug: string; title: string; at: number }[];
  trials: { code: string; part: number; title: string; best: number; total: number; passed: boolean; attempts: number }[];
  weak: { front: string; week: string | null; slug: string | null; box: number; lastGrade: string | null }[];
  dueCards: number;
  mocks: { slug: string; title: string; offer: boolean }[];
  next: { week: string; slug: string; title: string; code: string; minutes: number }[];
};

const ms = (s?: string | null) => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? t : 0;
};
const unreleased = (week: string) => /-next(?:--|\/|$)/.test(week);

export function buildSnapshot(raw: ProgressRaw, map: CourseMap, today = new Date()): ProgressSnapshot {
  const done = (raw.profile?.game_done && typeof raw.profile.game_done === "object" ? raw.profile.game_done : {}) as Record<string, number>;
  type L = { status: "not_started" | "in_progress" | "completed"; pct: number; lastStage: string | null; at: number };
  const st: Record<string, L> = {};
  const get = (k: string) => (st[k] ||= { status: "not_started", pct: 0, lastStage: null, at: 0 });
  for (const r of raw.rows) {
    if (!r.week || !r.lesson_slug) continue;
    const p = get(lessonKey(r.week, r.lesson_slug));
    const pct = Math.max(Number(r.progress_percentage) || 0, Number(r.max_progress) || 0);
    if (r.status === "completed") p.status = "completed";
    else if (p.status !== "completed" && (pct > 0 || r.status === "in_progress" || (r.completed_stages || []).length)) p.status = "in_progress";
    p.pct = Math.max(p.pct, r.status === "completed" ? 100 : pct);
    p.lastStage = r.last_stage ?? p.lastStage;
    p.at = Math.max(p.at, ms(r.completed_at), ms(r.last_accessed_at));
  }
  for (const [k, at] of Object.entries(done)) {
    if (k.startsWith("lesson:")) {
      const p = get(k.slice(7));
      p.status = "completed";
      p.pct = 100;
      p.at = Math.max(p.at, Number(at) || 0);
    } else if (k.startsWith("stage:")) {
      const rest = k.slice(6);
      const p = get(rest.slice(0, rest.lastIndexOf("/")));
      if (p.status === "not_started") p.status = "in_progress";
      p.at = Math.max(p.at, Number(at) || 0);
    }
  }
  const isDone = (l: CourseLesson) => st[lessonKey(l.week, l.slug)]?.status === "completed";
  const started = (l: CourseLesson) => (st[lessonKey(l.week, l.slug)]?.status ?? "not_started") !== "not_started";

  // best trial attempt per part
  const best = new Map<string, { best: number; total: number; passed: boolean; attempts: number }>();
  for (const t of raw.trials) {
    const k = `${t.week}|${t.part}`;
    const b = best.get(k) ?? { best: 0, total: t.total, passed: false, attempts: 0 };
    best.set(k, { best: Math.max(b.best, t.score), total: t.total || b.total, passed: b.passed || !!t.passed, attempts: b.attempts + 1 });
  }

  const weeks = map.weeks.filter((w) => !unreleased(w.key));
  const wk = weeks.map((w) => {
    const lessonsDone = w.lessons.filter(isDone).length;
    const bossDone = !!w.boss && (!!done[`boss:${w.key}`] || isDone(w.boss));
    const parts = w.trial?.parts ?? [];
    const partsPassed = parts.filter((p) => !!done[`trial:${w.trial!.week}/part-${p.n}`] || !!done[`trial:${w.key}/part-${p.n}`] || !!best.get(`${w.trial!.week}|${p.n}`)?.passed || !!best.get(`${w.key}|${p.n}`)?.passed).length;
    const total = w.lessons.length + (w.boss ? 1 : 0) + parts.length;
    const nodes = lessonsDone + (bossDone ? 1 : 0) + partsPassed;
    return {
      key: w.key,
      code: w.code,
      title: w.title,
      lessons: w.lessons.length,
      lessonsDone,
      bossDone,
      partsPassed,
      partsTotal: parts.length,
      cleared: total > 0 && nodes === total,
      started: nodes > 0 || w.lessons.some(started) || (!!w.boss && started(w.boss)),
    };
  });
  const cur = wk.find((w) => w.started && !w.cleared) ?? wk.find((w) => !w.cleared) ?? null;

  const titleOf = new Map<string, { title: string; code: string; minutes: number }>();
  for (const w of weeks) for (const l of [...w.lessons, ...(w.boss ? [w.boss] : [])]) titleOf.set(lessonKey(l.week, l.slug), { title: l.title, code: w.code, minutes: l.minutes });
  for (const l of [...map.sideQuests, ...(map.problems ?? []), ...(map.lld ?? [])]) titleOf.set(lessonKey(l.week, l.slug), { title: l.title, code: l.code, minutes: l.minutes });
  if (map.plan) titleOf.set(lessonKey(map.plan.week, map.plan.slug), { title: map.plan.title, code: "00", minutes: map.plan.minutes });

  const entries = Object.entries(st).filter(([k]) => titleOf.has(k) && !unreleased(k));
  const split = (k: string) => {
    const i = k.indexOf("/");
    return { week: k.slice(0, i), slug: k.slice(i + 1) };
  };
  const inProgress = entries
    .filter(([, v]) => v.status === "in_progress")
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, 6)
    .map(([k, v]) => ({ ...split(k), title: titleOf.get(k)!.title, pct: Math.round(v.pct), lastStage: v.lastStage, at: v.at }));
  const recentDone = entries
    .filter(([, v]) => v.status === "completed" && v.at > 0)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, 6)
    .map(([k, v]) => ({ ...split(k), title: titleOf.get(k)!.title, at: v.at }));

  // the next unfinished lessons: the current week first, then the weeks after it
  const next: ProgressSnapshot["next"] = [];
  const from = cur ? weeks.findIndex((w) => w.key === cur.key) : 0;
  for (const w of weeks.slice(Math.max(0, from))) {
    for (const l of [...w.lessons, ...(w.boss ? [w.boss] : [])]) {
      if (next.length >= 3) break;
      if (!isDone(l)) next.push({ week: l.week, slug: l.slug, title: l.title, code: w.code, minutes: l.minutes });
    }
    if (next.length >= 3) break;
  }

  const trials: ProgressSnapshot["trials"] = [];
  for (const w of weeks)
    for (const p of w.trial?.parts ?? []) {
      const b = best.get(`${w.trial!.week}|${p.n}`) ?? best.get(`${w.key}|${p.n}`);
      if (b) trials.push({ code: w.code, part: p.n, title: p.title, best: b.best, total: b.total, passed: b.passed, attempts: b.attempts });
    }

  const day = today.toISOString().slice(0, 10);
  const weak = raw.cards
    .filter((c) => c.box <= 2 || c.last_grade === "again" || c.last_grade === "hard")
    .sort((a, b) => a.box - b.box)
    .slice(0, 6)
    .map((c) => ({ front: c.front.slice(0, 200), week: c.week, slug: c.lesson_slug, box: c.box, lastGrade: c.last_grade }));

  const mockTitle = new Map((map.mocks ?? []).map((m) => [m.slug, `${m.title} (${m.company})`]));
  const mocks = Object.keys(done)
    .filter((k) => k.startsWith("mock:"))
    .map((k) => k.slice(5))
    .map((slug) => ({ slug, title: mockTitle.get(slug) ?? slug, offer: !!done[`offer:${slug}`] }));

  const core = weeks.flatMap((w) => [...w.lessons, ...(w.boss ? [w.boss] : [])]);
  const quests = map.sideQuests.filter((q) => !unreleased(q.week));
  return {
    started: entries.length > 0 || Object.keys(done).some((k) => /^(lesson|stage|trial|boss|mock):/.test(k)),
    lessonsDone: core.filter(isDone).length,
    lessonsTotal: core.length,
    questsDone: quests.filter(isDone).length,
    questsTotal: quests.length,
    xp: Number(raw.profile?.xp) || 0,
    streak: Number(raw.profile?.current_streak) || 0,
    currentWeek: cur ? { key: cur.key, code: cur.code, title: cur.title } : null,
    weeks: wk,
    inProgress,
    recentDone,
    trials,
    weak,
    dueCards: raw.cards.filter((c) => c.due_at && c.due_at.slice(0, 10) <= day).length,
    mocks,
    next,
  };
}
