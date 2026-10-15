import "server-only";
import { parseUA } from "@/lib/analytics/ua";
import { getCourseIndex, getMcqKey, getStages, lessonTag, lessonTitle, stageAtPct, type CourseIndex, type McqKey } from "./course";
import { getDataset, type Dataset, type EventRow, type ProgressRow } from "./dataset";
import type {
  AdminRange,
  Frequency,
  LearnerRow,
  LearnersKpis,
  LearnersResponse,
  LearnersSort,
  LearnersSummary,
  LessonStatus,
  Position,
  Segment,
  WeekSegment,
} from "./types";

/**
 * Learner analytics computed in memory from the shared dataset.
 *
 * Definitions (also shown in the admin UI):
 * - activity: any learning signal of a signed-in learner — a /learn page view or learn event, a
 *   learning_progress start/access/completion, a streak day, an MCQ answer, a note, bookmark or comment.
 * - active day: a calendar day (admin tz) with at least one activity.
 * - current position: the latest lesson-level activity (learn event > progress row > lesson page view,
 *   whichever is newest); stage from the event, else learning_progress.last_stage (migration), else
 *   estimated from progress % over the lesson's stages weighted by reading minutes.
 * - frequency: active days in the last 30 → daily (≥15) · several/wk (≥6) · weekly (≥3) · occasional (≥1) · dormant.
 * - time: learning_progress.time_spent (seconds) capped per lesson at 2× its reading time (10 min–3 h; legacy rows carry
 *   multi-day values from tabs left open).
 */

export const TIME_CAP_SEC = 3 * 3600;

/**
 * Seconds credited for one progress row: time_spent capped at twice the lesson's reading time
 * (min 10 min, max 3 h). Legacy rows carry hours or days from tabs left open.
 */
export function cappedTime(idx: CourseIndex, r: ProgressRow): number {
  const minutes = idx.byKey.get(`${r.week}/${r.lesson_slug}`)?.minutes || 30;
  const cap = Math.min(TIME_CAP_SEC, Math.max(600, minutes * 2 * 60));
  return Math.min(cap, Math.max(0, Number(r.time_spent) || 0));
}

const stageText = (s: { label: string; title: string }) => (s.title && s.title !== s.label ? `${s.label} · ${s.title}` : s.label);
const DAY = 86_400_000;
export const DEFAULT_TZ = "Asia/Kolkata";

export const RANGE_MS: Record<AdminRange, number> = {
  "24h": DAY,
  "7d": 7 * DAY,
  "30d": 30 * DAY,
  "90d": 90 * DAY,
  "12m": 365 * DAY,
};

export function parseRange(v: string | null | undefined, fallback: AdminRange = "30d"): AdminRange {
  return v && v in RANGE_MS ? (v as AdminRange) : fallback;
}

export function safeTz(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

// ------------------------------------------------------------------ time helpers

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function dayFmt(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    fmtCache.set(tz, f);
  }
  return f;
}
const partsCache = new Map<string, Intl.DateTimeFormat>();
function partsFmt(tz: string) {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", hourCycle: "h23" });
    partsCache.set(tz, f);
  }
  return f;
}

export const dayKey = (t: number | string, tz: string) => dayFmt(tz).format(new Date(t));

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function dowHour(t: number, tz: string): [number, number] {
  const parts = partsFmt(tz).formatToParts(new Date(t));
  const wd = parts.find((p) => p.type === "weekday")?.value || "Mon";
  const h = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10) % 24;
  return [Math.max(0, DOW.indexOf(wd)), h];
}

/** Day keys of the last n days ending today (oldest first). */
export function lastDays(n: number, tz: string, now = Date.now()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const k = dayKey(now - i * DAY, tz);
    if (out[out.length - 1] !== k) out.push(k);
  }
  return out;
}

const ms = (s: string | null | undefined) => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? t : 0;
};

// ------------------------------------------------------------------ paths & events

export type LessonPath = { course: string; week: string; slug: string };
const NON_COURSE = new Set(["notes", "bookmarks", "dashboard", "review", "profile", "notebook", "search"]);

export function parseLessonPath(path: string | null | undefined): LessonPath | null {
  if (!path) return null;
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, "");
  const m = clean.match(/^\/learn\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (!m || NON_COURSE.has(m[1])) return null;
  return { course: decodeURIComponent(m[1]), week: decodeURIComponent(m[2]), slug: decodeURIComponent(m[3]) };
}

export const isLearnPath = (p: string | null | undefined) => !!p && (p === "/learn" || p.startsWith("/learn/") || p.startsWith("/learn?"));

const LEARN_EVENTS = new Set(["lesson_open", "stage_reach", "stage_done", "lesson_complete", "trial_result", "review_session"]);

export function eventName(e: EventRow): string | null {
  if (e.event_type !== "event") return null;
  const n = e.metadata?.name;
  return typeof n === "string" ? n : null;
}

const metaStr = (e: EventRow, k: string) => {
  const v = e.metadata?.[k];
  return v == null ? null : String(v);
};

/** Lesson an event is about (learn event props, else the page path). */
export function eventLesson(e: EventRow): LessonPath | null {
  const name = eventName(e);
  if (name && LEARN_EVENTS.has(name)) {
    const week = metaStr(e, "week");
    const lesson = metaStr(e, "lesson");
    if (week && lesson) return { course: metaStr(e, "course") || "system-design-mastery", week, slug: lesson };
  }
  if (e.event_type === "page_view" || e.event_type === "page_leave" || name) return parseLessonPath(e.page_path);
  return null;
}

/** Is this event a learning signal (vs. browsing the portfolio)? */
const isLearningEvent = (e: EventRow) => {
  const name = eventName(e);
  if (name) return LEARN_EVENTS.has(name) || isLearnPath(e.page_path);
  return isLearnPath(e.page_path);
};

// ------------------------------------------------------------------ per-user model

export type UserModel = {
  row: LearnerRow;
  /** activity timestamps (ms), unsorted */
  acts: number[];
  dayCounts: Map<string, number>;
  events: EventRow[];
  progress: ProgressRow[];
  lessonState: Map<string, { status: LessonStatus; pct: number; row: ProgressRow }>;
  /** key of the position lesson + how we got there (stage filled later) */
  pos: { key: string; at: number; source: Position["source"]; stage: string | null; stageSource: Position["stageSource"] } | null;
};

export function lessonStatusOf(r: ProgressRow): { status: LessonStatus; pct: number } {
  const pct = Math.max(Number(r.progress_percentage) || 0, Number(r.max_progress) || 0);
  if (r.status === "completed") return { status: "completed", pct: 100 };
  if (pct > 0 || r.status === "in_progress") return { status: "in_progress", pct: Math.min(99, pct) };
  return { status: "not_started", pct: 0 };
}

function topOf(counts: Map<string, number>): string | null {
  let best: string | null = null;
  let n = 0;
  counts.forEach((v, k) => {
    if (v > n) {
      best = k;
      n = v;
    }
  });
  return best;
}
const bump = (m: Map<string, number>, k: string | null | undefined, by = 1) => {
  if (!k) return;
  m.set(k, (m.get(k) || 0) + by);
};

function frequencyOf(activeDays30: number, signedUpAt: string | null, now: number): Frequency {
  if (activeDays30 >= 15) return "daily";
  if (activeDays30 >= 6) return "several/wk";
  if (activeDays30 >= 3) return "weekly";
  if (activeDays30 >= 1) return "occasional";
  if (signedUpAt && now - ms(signedUpAt) < 7 * DAY) return "new";
  return "dormant";
}

function streaksOf(days: Set<string>, tz: string, now: number): { current: number; longest: number } {
  const sorted = Array.from(days).sort();
  let longest = 0;
  let run = 0;
  let prev = 0;
  for (const d of sorted) {
    const t = Date.parse(`${d}T00:00:00Z`);
    run = prev && Math.round((t - prev) / DAY) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = t;
  }
  let current = 0;
  const today = dayKey(now, tz);
  const yesterday = dayKey(now - DAY, tz);
  let cursor = days.has(today) ? Date.parse(`${today}T00:00:00Z`) : days.has(yesterday) ? Date.parse(`${yesterday}T00:00:00Z`) : 0;
  while (cursor && days.has(new Date(cursor).toISOString().slice(0, 10))) {
    current++;
    cursor -= DAY;
  }
  return { current, longest };
}

export type Model = {
  ds: Dataset;
  idx: CourseIndex;
  tz: string;
  now: number;
  users: UserModel[];
  byId: Map<string, UserModel>;
  keys: Map<string, McqKey | null>;
};

/** Build every learner's model. Stages for estimated positions are resolved here (cached per lesson). */
export async function buildModel(tz: string, opts: { fresh?: boolean } = {}): Promise<Model> {
  const [ds, idx] = await Promise.all([getDataset(opts), getCourseIndex()]);
  const now = Date.now();
  const days30 = lastDays(30, tz, now);
  const day30Set = new Set(days30);

  // MCQ keys for every assessment that has answers
  const keys = new Map<string, McqKey | null>();
  const answered = new Set(ds.answers.map((a) => a.assessment_id));
  await Promise.all(
    ds.assessments
      .filter((a) => answered.has(a.id))
      .map(async (a) => keys.set(a.id, await getMcqKey(a.week, a.lesson_slug)))
  );
  const assessById = new Map(ds.assessments.map((a) => [a.id, a]));

  const group = <T extends { user_id: string | null }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    rows.forEach((r) => {
      if (!r.user_id) return;
      const l = m.get(r.user_id);
      if (l) l.push(r);
      else m.set(r.user_id, [r]);
    });
    return m;
  };
  const evBy = group(ds.events);
  const lpBy = group(ds.progress);
  const stBy = group(ds.streaks);
  const ansBy = group(ds.answers);
  const noteBy = group(ds.notes);
  const bmBy = group(ds.bookmarks);
  const cmBy = group(ds.comments);

  const users: UserModel[] = ds.users.map((u) => {
    const prof = ds.profiles.get(u.id);
    const events = evBy.get(u.id) || [];
    const progress = lpBy.get(u.id) || [];
    const streaks = stBy.get(u.id) || [];
    const answers = ansBy.get(u.id) || [];
    const notes = noteBy.get(u.id) || [];
    const bookmarks = bmBy.get(u.id) || [];
    const comments = cmBy.get(u.id) || [];

    const acts: number[] = [];
    const dayCounts = new Map<string, number>();
    const add = (t: number) => {
      if (!t) return;
      acts.push(t);
      bump(dayCounts, dayKey(t, tz));
    };
    events.filter(isLearningEvent).forEach((e) => add(ms(e.created_at)));
    progress.forEach((r) => {
      add(ms(r.started_at));
      if (r.last_accessed_at !== r.started_at) add(ms(r.last_accessed_at));
      add(ms(r.completed_at));
    });
    streaks.forEach((s) => bump(dayCounts, String(s.activity_date).slice(0, 10)));
    answers.forEach((a) => add(ms(a.updated_at || a.created_at)));
    [...notes, ...bookmarks, ...comments].forEach((n) => add(ms(n.created_at)));

    // lesson states
    const lessonState: UserModel["lessonState"] = new Map();
    progress.forEach((r) => {
      const k = `${r.week}/${r.lesson_slug}`;
      const s = lessonStatusOf(r);
      const prev = lessonState.get(k);
      if (!prev || s.pct > prev.pct || s.status === "completed") lessonState.set(k, { ...s, row: r });
    });
    const visited = new Set<string>();
    events.forEach((e) => {
      const l = eventLesson(e);
      if (l) visited.add(`${l.week}/${l.slug}`);
    });

    // position: newest lesson-level signal
    let pos: UserModel["pos"] = null;
    const consider = (key: string, at: number, source: Position["source"], stage: string | null = null) => {
      if (!at) return;
      if (!pos || at > pos.at || (at === pos.at && source === "event")) pos = { key, at, source, stage, stageSource: stage ? "event" : null };
    };
    progress.forEach((r) => consider(`${r.week}/${r.lesson_slug}`, Math.max(ms(r.last_accessed_at), ms(r.completed_at), ms(r.started_at)), "progress"));
    events.forEach((e) => {
      const l = eventLesson(e);
      if (!l) return;
      const name = eventName(e);
      const isLearn = !!name && LEARN_EVENTS.has(name);
      consider(`${l.week}/${l.slug}`, ms(e.created_at), isLearn ? "event" : "pageview", isLearn ? metaStr(e, "stage") : null);
    });
    // a page view right after a progress write of the same lesson is the same visit: prefer progress data
    const p0 = pos as UserModel["pos"];
    if (p0 && p0.source === "pageview" && lessonState.has(p0.key)) {
      const r = lessonState.get(p0.key)!.row;
      if (Math.abs(ms(r.last_accessed_at) - p0.at) < 6 * 3600_000) p0.source = "progress";
    }
    // the newest stage event for that lesson (even if a later page view picked the lesson)
    if (p0 && !p0.stage) {
      for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i];
        const n = eventName(e);
        if (!n || !LEARN_EVENTS.has(n)) continue;
        const l = eventLesson(e);
        if (l && `${l.week}/${l.slug}` === p0.key && metaStr(e, "stage")) {
          p0.stage = metaStr(e, "stage");
          p0.stageSource = "event";
          break;
        }
      }
    }
    if (p0 && !p0.stage) {
      const r = lessonState.get(p0.key)?.row;
      if (r?.last_stage) {
        p0.stage = r.last_stage;
        p0.stageSource = "column";
      }
    }

    // course progress
    const weeks: WeekSegment[] = idx.weeks.map((w) => {
      let done = 0;
      let partial = 0;
      w.nodes.forEach((n) => {
        const s = lessonState.get(`${n.week}/${n.slug}`);
        if (s?.status === "completed") done++;
        else if (s?.status === "in_progress") partial += s.pct / 100;
      });
      return { key: w.key, code: w.code, done, partial: Math.round(partial * 100) / 100, total: w.nodes.length };
    });
    const coreDone = weeks.reduce((a, w) => a + w.done, 0);
    let completed = 0;
    let inProgress = 0;
    let timeSec = 0;
    lessonState.forEach((s) => {
      if (s.status === "completed") completed++;
      else if (s.status === "in_progress") inProgress++;
    });
    progress.forEach((r) => (timeSec += cappedTime(idx, r)));
    const sideQuestsDone = idx.ordered.filter((l) => !l.core && lessonState.get(`${l.week}/${l.slug}`)?.status === "completed").length;
    const touched = new Set([...lessonState.keys(), ...visited]).size;

    // MCQ
    let mAnswered = 0;
    let mCorrect = 0;
    answers.forEach((a) => {
      const key = keys.get(a.assessment_id);
      const q = key?.questions.get(a.question_number);
      if (!q || !assessById.has(a.assessment_id)) return;
      mAnswered++;
      if (q.correct === a.selected_option) mCorrect++;
    });

    // device / place
    const devs = new Map<string, number>();
    const countries = new Map<string, number>();
    const cities = new Map<string, number>();
    events.forEach((e) => {
      const ua = parseUA(e.user_agent);
      bump(devs, `${ua.device}${ua.os && ua.os !== "Unknown" ? ` · ${ua.os}` : ""}`);
      bump(countries, e.country);
      bump(cities, e.city);
    });

    // frequency
    let activeDays30 = 0;
    const strip30 = days30.map((d) => dayCounts.get(d) || 0);
    strip30.forEach((n) => n > 0 && activeDays30++);
    const sessions = new Set<string>();
    events.forEach((e) => {
      if (isLearningEvent(e) && now - ms(e.created_at) < 30 * DAY) sessions.add(e.session_id || dayKey(ms(e.created_at), tz));
    });
    void day30Set;
    const allDays = new Set(dayCounts.keys());
    const { current, longest } = streaksOf(allDays, tz, now);

    const lastAct = acts.length ? Math.max(...acts) : 0;
    const lastEvent = events.length ? ms(events[events.length - 1].created_at) : 0;
    const lastSeen = Math.max(lastAct, lastEvent, ms(u.lastSignInAt));

    const row: LearnerRow = {
      id: u.id,
      name: prof?.full_name || u.name || u.email.split("@")[0] || "Unknown",
      email: u.email,
      avatar: prof?.avatar_url || u.avatar,
      provider: u.provider,
      isAdmin: ds.admins.has(u.email.toLowerCase()),
      signedUpAt: u.createdAt || prof?.created_at || null,
      lastSignInAt: u.lastSignInAt,
      lastSeenAt: lastSeen ? new Date(lastSeen).toISOString() : null,
      position: null,
      coursePct: idx.coreTotal ? Math.round((coreDone / idx.coreTotal) * 1000) / 10 : 0,
      completed,
      inProgress,
      touched,
      sideQuestsDone,
      weeks,
      timeSec,
      activeDays30,
      activeDaysTotal: allDays.size,
      strip30,
      sessions30: sessions.size,
      frequency: frequencyOf(activeDays30, u.createdAt, now),
      streak: current,
      longestStreak: longest,
      mcq: { answered: mAnswered, correct: mCorrect, pct: mAnswered ? Math.round((mCorrect / mAnswered) * 1000) / 10 : null },
      notes: notes.length,
      bookmarks: bookmarks.length,
      comments: comments.length,
      device: topOf(devs),
      country: topOf(countries),
      city: topOf(cities),
      segments: [],
    };

    const silentFor = lastAct ? now - lastAct : Infinity;
    const seg: Segment[] = [];
    if (lastAct && now - lastAct < 30 * 60_000) seg.push("active-now");
    if (touched > 0 && allDays.size >= 2 && silentFor >= 7 * DAY && silentFor < 60 * DAY && row.coursePct < 100) seg.push("at-risk");
    if (weeks.some((w) => w.total > 0 && w.done === w.total)) seg.push("week-done");
    if (touched === 0) seg.push("never-started");
    if (activeDays30 >= 4 || completed >= 5) seg.push("power");
    row.segments = seg;

    return { row, acts, dayCounts, events, progress, lessonState, pos };
  });

  // resolve positions (stage estimates need the lesson's stage list)
  const needStages = new Set<string>();
  users.forEach((m) => {
    if (m.pos && !m.pos.stage && !/mcq/i.test(m.pos.key)) needStages.add(m.pos.key);
  });
  const stageLists = new Map<string, Awaited<ReturnType<typeof getStages>>>();
  await Promise.all(
    Array.from(needStages).map(async (k) => {
      const [w, s] = k.split("/");
      stageLists.set(k, await getStages(w, s));
    })
  );
  // stage labels for event/column stages too
  const labelFor = async (k: string, stageId: string) => {
    if (!stageLists.has(k)) {
      const [w, s] = k.split("/");
      stageLists.set(k, await getStages(w, s));
    }
    const st = stageLists.get(k)!.find((s) => s.id === stageId);
    return st ? stageText(st) : stageId;
  };
  for (const m of users) {
    if (!m.pos) continue;
    const [week, slug] = m.pos.key.split("/");
    const ls = m.lessonState.get(m.pos.key);
    const ref = idx.byKey.get(m.pos.key);
    let stage = m.pos.stage;
    let stageSource = m.pos.stageSource;
    let stageLabel: string | null = null;
    if (stage) stageLabel = await labelFor(m.pos.key, stage);
    else if (ls && ls.status !== "completed" && stageLists.get(m.pos.key)?.length) {
      const est = stageAtPct(stageLists.get(m.pos.key)!, ls.pct);
      if (est) {
        stage = est.id;
        stageSource = "estimate";
        stageLabel = stageText(est);
      }
    }
    m.row.position = {
      week,
      lesson: slug,
      title: lessonTitle(idx, week, slug),
      tag: lessonTag(idx, week, slug),
      weekCode: ref?.weekCode || (week.match(/week-(\d+)/)?.[1]?.padStart(2, "0") ?? week),
      href: ref?.href || `/learn/${idx.map.courseId}/${week}/${slug}`,
      stage,
      stageLabel,
      stageSource,
      pct: ls?.pct ?? 0,
      status: ls?.status ?? "not_started",
      at: new Date(m.pos.at).toISOString(),
      source: m.pos.source,
    };
  }

  return { ds, idx, tz, now, users, byId: new Map(users.map((u) => [u.row.id, u])), keys };
}

// ------------------------------------------------------------------ guests & time estimates

/** Engaged minutes per session: page_leave durations when tracked, else span of the session's views + 1 min. */
export function sessionMinutes(events: EventRow[]): number {
  const leave = events.filter((e) => e.event_type === "page_leave" && e.duration);
  if (leave.length) return leave.reduce((a, e) => a + (Number(e.duration) || 0), 0) / 60_000;
  const ts = events.map((e) => ms(e.created_at)).filter(Boolean);
  if (!ts.length) return 0;
  const span = (Math.max(...ts) - Math.min(...ts)) / 60_000;
  return Math.min(120, span + 1);
}

/** Group a user's learning events into sessions (session_id, else 30-min idle gaps). */
export function sessionsOf(events: EventRow[]): EventRow[][] {
  const learn = events.filter(isLearningEvent);
  const byId = new Map<string, EventRow[]>();
  let gapKey = "";
  let lastT = 0;
  learn.forEach((e) => {
    const t = ms(e.created_at);
    let k = e.session_id;
    if (!k) {
      if (!gapKey || t - lastT > 30 * 60_000) gapKey = `gap-${t}`;
      k = gapKey;
    }
    lastT = t;
    const l = byId.get(k);
    if (l) l.push(e);
    else byId.set(k, [e]);
  });
  return Array.from(byId.values());
}

function minutesInRange(m: UserModel, since: number): number {
  return sessionsOf(m.events)
    .filter((s) => ms(s[0].created_at) >= since)
    .reduce((a, s) => a + sessionMinutes(s), 0);
}

// ------------------------------------------------------------------ learners list

export type LearnersQuery = {
  range: AdminRange;
  tz: string;
  q?: string;
  segment?: Segment | "all";
  sort?: LearnersSort;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  includeAdmins?: boolean;
};

function kpisOf(model: Model, range: AdminRange): LearnersKpis {
  const { now, tz } = model;
  const learners = model.users.filter((u) => !u.row.isAdmin);
  const since = now - RANGE_MS[range];
  const today = dayKey(now, tz);
  const d7 = new Set(lastDays(7, tz, now));
  const d30 = new Set(lastDays(30, tz, now));
  const activeIn = (u: UserModel, set: Set<string>) => Array.from(u.dayCounts.keys()).some((d) => set.has(d));
  const activeRange = learners.filter((u) => u.acts.some((t) => t >= since));
  const started = learners.filter((u) => u.row.touched > 0);
  let rowsStarted = 0;
  let rowsDone = 0;
  learners.forEach((u) =>
    u.lessonState.forEach((s) => {
      if (s.status !== "not_started") rowsStarted++;
      if (s.status === "completed") rowsDone++;
    })
  );
  const minutes = activeRange.reduce((a, u) => a + minutesInRange(u, since), 0);
  return {
    learners: learners.length,
    activeToday: learners.filter((u) => u.dayCounts.has(today)).length,
    active7d: learners.filter((u) => activeIn(u, d7)).length,
    active30d: learners.filter((u) => activeIn(u, d30)).length,
    activeInRange: activeRange.length,
    avgLessonsPerLearner: started.length ? Math.round((learners.reduce((a, u) => a + u.row.completed, 0) / started.length) * 10) / 10 : 0,
    completionRate: rowsStarted ? Math.round((rowsDone / rowsStarted) * 1000) / 10 : 0,
    avgMinutesPerActive: activeRange.length ? Math.round((minutes / activeRange.length) * 10) / 10 : 0,
    newInRange: learners.filter((u) => ms(u.row.signedUpAt) >= since).length,
  };
}

function trendOf(model: Model, range: AdminRange): LearnersResponse["trend"] {
  const { now, tz } = model;
  const learners = model.users.filter((u) => !u.row.isAdmin);
  if (range === "24h") {
    const out: LearnersResponse["trend"] = [];
    const startHour = Math.floor(now / 3600_000) - 23;
    for (let h = 0; h < 24; h++) {
      const a = (startHour + h) * 3600_000;
      const b = a + 3600_000;
      out.push({
        t: new Date(a).toISOString(),
        active: learners.filter((u) => u.acts.some((t) => t >= a && t < b)).length,
        completions: learners.reduce((n, u) => n + u.progress.filter((r) => r.status === "completed" && ms(r.completed_at) >= a && ms(r.completed_at) < b).length, 0),
      });
    }
    return out;
  }
  const n = Math.round(RANGE_MS[range] / DAY);
  const days = lastDays(n, tz, now);
  const completions = new Map<string, number>();
  learners.forEach((u) => u.progress.forEach((r) => r.status === "completed" && r.completed_at && bump(completions, dayKey(ms(r.completed_at), tz))));
  return days.map((d) => ({
    t: d,
    active: learners.filter((u) => u.dayCounts.has(d)).length,
    completions: completions.get(d) || 0,
  }));
}

const SORTS: Record<LearnersSort, (r: LearnerRow) => number | string> = {
  lastSeen: (r) => ms(r.lastSeenAt),
  name: (r) => r.name.toLowerCase(),
  signedUp: (r) => ms(r.signedUpAt),
  progress: (r) => r.coursePct * 1000 + r.completed,
  completed: (r) => r.completed,
  time: (r) => r.timeSec,
  frequency: (r) => r.activeDays30 * 1000 + r.sessions30,
  streak: (r) => r.streak * 1000 + r.longestStreak,
  mcq: (r) => (r.mcq.pct == null ? -1 : r.mcq.pct),
  notes: (r) => r.notes + r.bookmarks,
};

export async function getLearners(query: LearnersQuery): Promise<LearnersResponse> {
  const model = await buildModel(query.tz);
  const all = model.users.map((u) => u.row);
  const segCount = (s: Segment) => all.filter((r) => r.segments.includes(s)).length;
  let rows = all;
  const q = (query.q || "").trim().toLowerCase();
  if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || (r.position?.title || "").toLowerCase().includes(q));
  if (query.segment && query.segment !== "all") rows = rows.filter((r) => r.segments.includes(query.segment as Segment));
  const sort = query.sort && SORTS[query.sort] ? query.sort : "lastSeen";
  const dir = query.dir === "asc" ? 1 : -1;
  const key = SORTS[sort];
  rows = [...rows].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (x < y) return -1 * dir;
    if (x > y) return 1 * dir;
    return a.name.localeCompare(b.name);
  });
  const pageSize = Math.max(1, Math.min(200, query.pageSize || 50));
  const page = Math.max(1, query.page || 1);
  return {
    generatedAt: new Date(model.now).toISOString(),
    tz: model.tz,
    range: query.range,
    kpis: kpisOf(model, query.range),
    trend: trendOf(model, query.range),
    segments: {
      all: all.length,
      "active-now": segCount("active-now"),
      "at-risk": segCount("at-risk"),
      "week-done": segCount("week-done"),
      "never-started": segCount("never-started"),
      power: segCount("power"),
    },
    weeks: model.idx.weeks.map((w) => ({ key: w.key, code: w.code, title: w.title, total: w.nodes.length })),
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
    total: rows.length,
    page,
    pageSize,
    features: model.ds.features,
  };
}

// ------------------------------------------------------------------ summary (Overview page)

export async function getLearnersSummary(range: AdminRange, tz: string): Promise<LearnersSummary> {
  const model = await buildModel(tz);
  const { ds, idx, now } = model;
  const since = now - RANGE_MS[range];
  const k = kpisOf(model, range);
  const learnerIds = new Set(model.users.filter((u) => !u.row.isAdmin).map((u) => u.row.id));
  const adminIds = new Set(model.users.filter((u) => u.row.isAdmin).map((u) => u.row.id));
  // visitors that ever signed in are not guests
  const knownVisitors = new Set(ds.events.filter((e) => e.user_id && e.visitor_id).map((e) => e.visitor_id as string));

  const guests = new Set<string>();
  const readers = new Map<string, Set<string>>();
  const completions = new Map<string, number>();
  let stagesDone = 0;
  let guestCompletions = 0;
  ds.events.forEach((e) => {
    const t = ms(e.created_at);
    if (t < since) return;
    if (e.user_id && adminIds.has(e.user_id)) return;
    const name = eventName(e);
    if (name === "stage_done") stagesDone++;
    if (name === "lesson_complete" && !e.user_id) guestCompletions++;
    const l = eventLesson(e);
    if (!l) return;
    const who = e.user_id || (e.visitor_id ? `v:${e.visitor_id}` : null);
    if (!who) return;
    if (!e.user_id && e.visitor_id && !knownVisitors.has(e.visitor_id)) guests.add(e.visitor_id);
    const key = `${l.course}|${l.week}/${l.slug}`;
    const s = readers.get(key) || new Set<string>();
    s.add(who);
    readers.set(key, s);
  });
  let lessonsCompleted = guestCompletions;
  ds.progress.forEach((r) => {
    if (!learnerIds.has(r.user_id)) return;
    const key = `${r.course_id}|${r.week}/${r.lesson_slug}`;
    if (ms(r.last_accessed_at) >= since || ms(r.started_at) >= since) {
      const s = readers.get(key) || new Set<string>();
      s.add(r.user_id);
      readers.set(key, s);
    }
    if (r.status === "completed" && ms(r.completed_at) >= since) {
      lessonsCompleted++;
      bump(completions, key);
    }
  });

  const topLessons = Array.from(readers.entries())
    .map(([key, set]) => {
      const [course, wl] = key.split("|");
      const [week, lesson] = wl.split("/");
      return { course, week, lesson, title: lessonTitle(idx, week, lesson), readers: set.size, completions: completions.get(key) || 0 };
    })
    .sort((a, b) => b.readers - a.readers || b.completions - a.completions)
    .slice(0, 8);

  // recent lesson activity of signed-in learners
  type Item = { userId: string; lesson: string; week: string; stage: string | null; at: number };
  const items: Item[] = [];
  model.users.forEach((u) => {
    if (u.row.isAdmin) return;
    u.events.forEach((e) => {
      const l = eventLesson(e);
      if (l) items.push({ userId: u.row.id, week: l.week, lesson: l.slug, stage: metaStr(e, "stage"), at: ms(e.created_at) });
    });
    u.progress.forEach((r) => items.push({ userId: u.row.id, week: r.week, lesson: r.lesson_slug, stage: r.last_stage || null, at: Math.max(ms(r.last_accessed_at), ms(r.completed_at)) }));
  });
  items.sort((a, b) => b.at - a.at);
  const seen = new Set<string>();
  const recent: LearnersSummary["recent"] = [];
  for (const it of items) {
    if (!it.at || recent.length >= 12) break;
    const key = `${it.userId}|${it.week}/${it.lesson}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const u = model.byId.get(it.userId)!;
    const stage = it.stage || (u.row.position && u.row.position.week === it.week && u.row.position.lesson === it.lesson ? u.row.position.stageLabel : null);
    recent.push({ userId: it.userId, name: u.row.name, email: u.row.email, lesson: it.lesson, title: lessonTitle(idx, it.week, it.lesson), stage, at: new Date(it.at).toISOString() });
  }

  const minutes = model.users
    .filter((u) => !u.row.isAdmin && u.acts.some((t) => t >= since))
    .reduce((a, u) => a + minutesInRange(u, since), 0);

  return {
    learners: k.learners,
    guests: guests.size,
    activeToday: k.activeToday,
    active7d: k.active7d,
    lessonsCompleted,
    stagesDone,
    avgMinutesPerLearner: k.activeInRange ? Math.round((minutes / k.activeInRange) * 10) / 10 : 0,
    topLessons,
    recent,
  };
}
