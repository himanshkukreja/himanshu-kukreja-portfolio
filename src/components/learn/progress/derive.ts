/**
 * Pure derivations for the progress page: course map cells, time, activity, pace and projections.
 * Inputs are the merged lesson map (Supabase rows + game done keys + hk.lesson.v1), the game's done
 * record, and for signed-in learners the /api/learn/progress summary.
 */
import type { CourseLesson, CourseMap, CourseWeek } from "@/lib/learn/types";
import { lessonKey } from "@/lib/learn/types";
import type { LessonProgress, WeekState } from "@/lib/learn/progress";
import { orderedLessons, trialPassed } from "@/lib/learn/progress";
import { addDays, localDate } from "@/lib/learn/review";
import type { LearningGoal } from "./goal";

export type CellStatus = "none" | "progress" | "done" | "passed" | "failed";

export type Cell = {
  id: string;
  code: string;
  label: string;
  href: string;
  kind: "lesson" | "boss" | "trial";
  status: CellStatus;
  /** 0-100 */
  pct: number;
  /** trial: best score % */
  score?: number;
  week: string;
  slug: string;
};

export type TrialScoreLike = { part: number; correct: number; answered?: number; total: number; passed: boolean; attempts?: number };
export type LocalTrialRecord = { best: number; total: number; attempts: number; passed: boolean };

/** Best known score per trial part (server answers/attempts + this browser's trial records + passed keys). */
export function trialScores(
  map: CourseMap,
  done: Record<string, number>,
  server: Record<string, TrialScoreLike[]> | null,
  local: Record<string, Record<string, LocalTrialRecord>>
): Record<string, { part: number; pct: number | null; passed: boolean; attempts: number; answered: number; total: number }[]> {
  const out: Record<string, { part: number; pct: number | null; passed: boolean; attempts: number; answered: number; total: number }[]> = {};
  map.weeks.forEach((w) => {
    if (!w.trial) return;
    const t = w.trial;
    out[w.key] = t.parts.map((p) => {
      const s = (server?.[t.week] || server?.[w.key] || []).find((x) => x.part === p.n);
      const lrec = local[t.week]?.[String(p.n)] || local[t.week]?.[`part-${p.n}`] || local[w.key]?.[String(p.n)];
      const ratios: number[] = [];
      if (s && s.total && (s.answered ?? s.total) > 0) ratios.push(s.correct / s.total);
      if (lrec && lrec.total) ratios.push(lrec.best / lrec.total);
      const passed = trialPassed(done, w, p.n) || !!s?.passed || !!lrec?.passed;
      return {
        part: p.n,
        pct: ratios.length ? Math.round(Math.max(...ratios) * 100) : null,
        passed,
        attempts: Math.max(s?.attempts || (s && (s.answered ?? 0) > 0 ? 1 : 0), lrec?.attempts || 0),
        answered: s?.answered ?? 0,
        total: p.questions,
      };
    });
  });
  return out;
}

export function weekCells(w: CourseWeek, lessons: Record<string, LessonProgress>, s: WeekState, scores: ReturnType<typeof trialScores>): Cell[] {
  const lessonCell = (l: CourseLesson, kind: "lesson" | "boss"): Cell => {
    const p = lessons[lessonKey(l.week, l.slug)];
    const isDone = p?.status === "completed" || (kind === "boss" && s.bossDone);
    const pct = isDone ? 100 : p?.pct || 0;
    return {
      id: `${l.week}/${l.slug}`,
      code: kind === "boss" ? "B" : l.code,
      label: `${kind === "boss" ? "Boss" : l.kind === "week-preview" ? "Preview" : l.label} · ${l.title}`,
      href: l.href,
      kind,
      status: isDone ? "done" : p && p.status !== "not_started" ? "progress" : "none",
      pct,
      week: l.week,
      slug: l.slug,
    };
  };
  const cells = w.lessons.map((l) => lessonCell(l, "lesson"));
  if (w.boss) cells.push(lessonCell(w.boss, "boss"));
  w.trial?.parts.forEach((p) => {
    const sc = scores[w.key]?.find((x) => x.part === p.n);
    const passed = !!sc?.passed;
    cells.push({
      id: `${w.trial!.week}/${w.trial!.slug}#${p.n}`,
      code: `T${p.n}`,
      label: `Trial part ${p.n} · ${p.title} · ${p.questions} Q`,
      href: p.href,
      kind: "trial",
      status: passed ? "passed" : sc && sc.pct !== null ? (sc.answered && sc.answered < sc.total ? "progress" : "failed") : "none",
      pct: passed ? 100 : sc?.pct ?? 0,
      score: sc?.pct ?? undefined,
      week: w.trial!.week,
      slug: w.trial!.slug,
    });
  });
  return cells;
}

// ---------------------------------------------------------------- time

/** Minutes of a lesson read so far (estimate from completion / % / checkpoints). */
export function minutesRead(l: CourseLesson, p: LessonProgress | undefined): number {
  if (!p) return 0;
  if (p.status === "completed") return l.minutes;
  if (p.pct > 0) return (l.minutes * p.pct) / 100;
  if (p.completedStages.length) return Math.min(l.minutes * 0.9, (p.completedStages.length * l.minutes) / 5);
  return 0;
}

export type DayStat = { events: number; minutes: number };

/**
 * Activity per local day. Events: game done timestamps, review log, server streak days, row
 * timestamps. Minutes: server streak seconds, or an estimate that spreads each lesson's read time
 * over the days it had checkpoints.
 */
export function dailyActivity(input: {
  map: CourseMap;
  lessons: Record<string, LessonProgress>;
  done: Record<string, number>;
  reviewLog: Record<string, number>;
  streaks: { date: string; lessons: number; seconds: number }[];
  rows: { completed_at?: string | null; last_accessed_at?: string | null }[];
}): { days: Record<string, DayStat>; stamps: number[] } {
  const days: Record<string, DayStat> = {};
  const day = (d: string) => (days[d] ||= { events: 0, minutes: 0 });
  const stamps: number[] = [];

  Object.entries(input.reviewLog).forEach(([d, n]) => {
    day(d).events += n || 0;
    day(d).minutes += ((n || 0) * 25) / 60;
  });

  const estimate: Record<string, number> = {};
  const byLesson: Record<string, number[]> = {};
  Object.entries(input.done).forEach(([k, at]) => {
    if (!at || !/^(lesson|stage|trial|boss|world|sidequest):/.test(k)) return;
    stamps.push(at);
    day(localDate(new Date(at))).events += 1;
    let lk = "";
    if (k.startsWith("lesson:")) lk = k.slice(7);
    else if (k.startsWith("stage:")) lk = k.slice(6, k.lastIndexOf("/"));
    if (lk) (byLesson[lk] ||= []).push(at);
  });
  orderedLessons(input.map).forEach((l) => {
    const lk = lessonKey(l.week, l.slug);
    const ts = byLesson[lk];
    if (!ts?.length) return;
    const m = minutesRead(l, input.lessons[lk]);
    ts.forEach((t) => {
      const d = localDate(new Date(t));
      estimate[d] = (estimate[d] || 0) + m / ts.length;
    });
  });

  input.rows.forEach((r) => {
    [r.completed_at, r.last_accessed_at].forEach((s) => {
      const t = s ? Date.parse(s) : NaN;
      if (Number.isFinite(t)) stamps.push(t);
    });
  });
  const server: Record<string, number> = {};
  input.streaks.forEach((s) => {
    const d = day(s.date);
    d.events = Math.max(d.events, Math.max(1, s.lessons));
    // a day holds at most 24 h: rows written by the old trigger carry a lesson's whole
    // wall-clock time (days of it) on its completion day
    server[s.date] = Math.min(86_400, Math.max(0, s.seconds)) / 60;
  });
  Object.keys(days).forEach((d) => {
    days[d].minutes += Math.max(server[d] || 0, estimate[d] || 0);
  });
  Object.entries(estimate).forEach(([d, m]) => {
    if (!days[d]) days[d] = { events: 1, minutes: m };
  });
  Object.values(days).forEach((d) => (d.minutes = Math.round(d.minutes)));
  return { days, stamps: stamps.sort((a, b) => a - b) };
}

/** Monday (local) of the week containing `date` (yyyy-mm-dd). */
export function weekStart(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = (dt.getDay() + 6) % 7;
  return addDays(date, -dow);
}

export function weeklySeries(days: Record<string, DayStat>, weeks = 12, today = localDate()) {
  const start = addDays(weekStart(today), -(weeks - 1) * 7);
  const out: { start: string; minutes: number; activeDays: number }[] = [];
  for (let i = 0; i < weeks; i++) {
    const ws = addDays(start, i * 7);
    let minutes = 0;
    let activeDays = 0;
    for (let k = 0; k < 7; k++) {
      const d = days[addDays(ws, k)];
      if (d) {
        minutes += d.minutes;
        if (d.events > 0 || d.minutes > 0) activeDays++;
      }
    }
    out.push({ start: ws, minutes: Math.round(minutes), activeDays });
  }
  return out;
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function rhythm(stamps: number[], days: Record<string, DayStat>, today = localDate()) {
  // best weekday by active minutes (events as tiebreak)
  const byDow = new Array(7).fill(0);
  Object.entries(days).forEach(([d, s]) => {
    const [y, m, dd] = d.split("-").map(Number);
    byDow[(new Date(y, m - 1, dd).getDay() + 6) % 7] += s.minutes + s.events * 0.01;
  });
  const bestDow = byDow.some((v) => v > 0) ? DOW[byDow.indexOf(Math.max(...byDow))] : null;
  // best time of day from real timestamps
  const slots = [
    { name: "night", from: 0, to: 5 },
    { name: "morning", from: 5, to: 12 },
    { name: "afternoon", from: 12, to: 17 },
    { name: "evening", from: 17, to: 21 },
    { name: "night", from: 21, to: 24 },
  ];
  const bySlot: Record<string, number> = {};
  stamps.forEach((t) => {
    const h = new Date(t).getHours();
    const s = slots.find((x) => h >= x.from && h < x.to)!;
    bySlot[s.name] = (bySlot[s.name] || 0) + 1;
  });
  const bestTime = Object.entries(bySlot).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  // sessions this week: clusters of activity with < 30 min gaps
  const ws = weekStart(today);
  const [y, m, d] = ws.split("-").map(Number);
  const from = new Date(y, m - 1, d).getTime();
  let sessions = 0;
  let prev = 0;
  stamps
    .filter((t) => t >= from)
    .forEach((t) => {
      if (!prev || t - prev > 30 * 60_000) sessions++;
      prev = t;
    });
  const daysThisWeek = Object.entries(days).filter(([dd, s]) => dd >= ws && (s.events > 0 || s.minutes > 0)).length;
  return { bestDow, bestTime, sessions, daysThisWeek };
}

// ---------------------------------------------------------------- pace + projection

export type Pace = { minutesPerWeek: number; lessonsPerWeek: number; weeksMeasured: number };

export function recentPace(series: { minutes: number }[], completions: number[], weeks = 4, now = Date.now()): Pace {
  const recent = series.slice(-weeks);
  const minutes = recent.reduce((a, s) => a + s.minutes, 0);
  const since = now - weeks * 7 * 86_400_000;
  const lessons = completions.filter((t) => t >= since).length;
  return { minutesPerWeek: Math.round(minutes / weeks), lessonsPerWeek: Math.round((lessons / weeks) * 10) / 10, weeksMeasured: weeks };
}

export function remainingWork(map: CourseMap, lessons: Record<string, LessonProgress>) {
  let minutes = 0;
  let count = 0;
  let total = 0;
  map.weeks.forEach((w) =>
    [...w.lessons, ...(w.boss ? [w.boss] : [])].forEach((l) => {
      total++;
      const p = lessons[lessonKey(l.week, l.slug)];
      if (p?.status === "completed") return;
      count++;
      minutes += l.minutes - minutesRead(l, p);
    })
  );
  return { minutes: Math.round(minutes), lessons: count, total };
}

/** Weeks needed at a weekly rate, as a date. null when the rate is 0. */
export function projectDate(remaining: number, perWeek: number, today = localDate()): string | null {
  if (remaining <= 0) return today;
  if (!perWeek || perWeek <= 0) return null;
  const days = Math.ceil((remaining / perWeek) * 7);
  return days > 365 * 20 ? null : addDays(today, days);
}

export function goalProgress(goal: LearningGoal, thisWeek: { minutes: number; lessons: number }) {
  const value = goal.unit === "minutes" ? thisWeek.minutes : thisWeek.lessons;
  return { value, pct: Math.min(100, Math.round((value / Math.max(1, goal.perWeek)) * 100)) };
}

/** Rate per week needed to finish by `target`. */
export function neededPace(remaining: number, target: string, today = localDate()): number | null {
  const [y, m, d] = target.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const days = Math.round((new Date(y, m - 1, d).getTime() - new Date(ty, tm - 1, td).getTime()) / 86_400_000);
  if (days <= 0) return null;
  return remaining / (days / 7);
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDate(d: string | null, withYear = false): string {
  if (!d) return "—";
  const [y, m, dd] = d.split("-").map(Number);
  return `${dd} ${MON[(m || 1) - 1]}${withYear ? ` ${y}` : ""}`;
}

export function fmtMinutes(min: number): string {
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}
