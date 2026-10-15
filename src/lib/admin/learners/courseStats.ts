import "server-only";
import { getStages, lessonTitle } from "./course";
import { buildModel, cappedTime, dowHour, eventLesson, eventName, RANGE_MS } from "./compute";
import type { AdminRange, CourseAnalytics, CourseLessonStat, StageDropoff } from "./types";

const ms = (s: string | null | undefined) => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? t : 0;
};

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Course analytics. Funnel / per-lesson numbers are all-time over signed-in learners (admins
 * excluded), because learning_progress keeps only the latest state per lesson. Guest readers,
 * page views and the activity heatmap use the selected range.
 */
export async function getCourseAnalytics(range: AdminRange, tz: string): Promise<CourseAnalytics> {
  const model = await buildModel(tz);
  const { ds, idx, now } = model;
  const since = now - RANGE_MS[range];
  const learners = model.users.filter((u) => !u.row.isAdmin);
  const learnerIds = new Set(learners.map((u) => u.row.id));
  const adminIds = new Set(model.users.filter((u) => u.row.isAdmin).map((u) => u.row.id));
  const knownVisitors = new Set(ds.events.filter((e) => e.user_id && e.visitor_id).map((e) => e.visitor_id as string));

  type Acc = { opened: Set<string>; r50: Set<string>; done: Set<string>; times: number[]; pcts: number[]; guests: Set<string>; views: number };
  const acc = new Map<string, Acc>();
  const get = (k: string) => {
    let a = acc.get(k);
    if (!a) {
      a = { opened: new Set(), r50: new Set(), done: new Set(), times: [], pcts: [], guests: new Set(), views: 0 };
      acc.set(k, a);
    }
    return a;
  };

  learners.forEach((u) => {
    u.lessonState.forEach((s, k) => {
      const a = get(k);
      a.opened.add(u.row.id);
      if (s.status === "completed" || s.pct >= 50) a.r50.add(u.row.id);
      if (s.status === "completed") a.done.add(u.row.id);
      const t = cappedTime(idx, s.row);
      if (t > 0) a.times.push(t);
      a.pcts.push(s.pct);
    });
  });
  ds.events.forEach((e) => {
    const l = eventLesson(e);
    if (!l) return;
    const k = `${l.week}/${l.slug}`;
    if (e.user_id) {
      if (learnerIds.has(e.user_id)) get(k).opened.add(e.user_id);
      return;
    }
    if (ms(e.created_at) < since) return;
    const a = get(k);
    if (e.event_type === "page_view") a.views++;
    if (e.visitor_id && !knownVisitors.has(e.visitor_id)) a.guests.add(e.visitor_id);
  });
  // signed-in views in range too
  ds.events.forEach((e) => {
    if (!e.user_id || !learnerIds.has(e.user_id) || e.event_type !== "page_view" || ms(e.created_at) < since) return;
    const l = eventLesson(e);
    if (l) get(`${l.week}/${l.slug}`).views++;
  });

  const count = (rows: { user_id: string; week: string; lesson_slug: string }[]) => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      if (adminIds.has(r.user_id)) return;
      const k = `${r.week}/${r.lesson_slug}`;
      m.set(k, (m.get(k) || 0) + 1);
    });
    return m;
  };
  const notes = count(ds.notes);
  const comments = count(ds.comments);
  const bookmarks = count(ds.bookmarks);

  const lessons: CourseLessonStat[] = idx.ordered.map((l) => {
    const k = `${l.week}/${l.slug}`;
    const a = acc.get(k);
    const opened = a?.opened.size || 0;
    const completed = a?.done.size || 0;
    return {
      week: l.week,
      slug: l.slug,
      title: l.title,
      tag: l.tag,
      weekCode: l.weekCode,
      order: l.order,
      core: l.core,
      href: l.href,
      opened,
      reached50: a?.r50.size || 0,
      completed,
      completionRate: opened ? Math.round((completed / opened) * 1000) / 10 : 0,
      medianTimeSec: Math.round(median(a?.times || [])),
      avgPct: a?.pcts.length ? Math.round(a.pcts.reduce((x, y) => x + y, 0) / a.pcts.length) : 0,
      guests: a?.guests.size || 0,
      views: a?.views || 0,
      notes: notes.get(k) || 0,
      comments: comments.get(k) || 0,
      bookmarks: bookmarks.get(k) || 0,
    };
  });

  const weeks = idx.weeks.map((w) => {
    let started = 0;
    let cleared = 0;
    let pctSum = 0;
    learners.forEach((u) => {
      const seg = u.row.weeks.find((s) => s.key === w.key);
      if (!seg) return;
      const touched = w.nodes.some((n) => u.lessonState.has(`${n.week}/${n.slug}`));
      if (!touched) return;
      started++;
      if (seg.total && seg.done === seg.total) cleared++;
      pctSum += seg.total ? (seg.done + seg.partial) / seg.total : 0;
    });
    return { key: w.key, code: w.code, title: w.title, nodes: w.nodes.length, started, cleared, avgPct: started ? Math.round((pctSum / started) * 1000) / 10 : 0 };
  });

  // hardest MCQ questions (all-time, admins excluded)
  type Q = { answered: number; correct: number; wrong: Map<string, number> };
  const qs = new Map<string, Q>();
  ds.answers.forEach((a) => {
    if (adminIds.has(a.user_id)) return;
    const key = model.keys.get(a.assessment_id)?.questions.get(a.question_number);
    if (!key) return;
    const k = `${a.assessment_id}|${a.question_number}`;
    let q = qs.get(k);
    if (!q) {
      q = { answered: 0, correct: 0, wrong: new Map() };
      qs.set(k, q);
    }
    q.answered++;
    if (key.correct === a.selected_option) q.correct++;
    else q.wrong.set(a.selected_option, (q.wrong.get(a.selected_option) || 0) + 1);
  });
  const hardest = Array.from(qs.entries())
    .map(([k, q]) => {
      const [aid, n] = k.split("|");
      const as = ds.assessments.find((a) => a.id === aid)!;
      const key = model.keys.get(aid)!;
      const qq = key.questions.get(Number(n))!;
      let topWrong: string | null = null;
      let best = 0;
      q.wrong.forEach((v, opt) => {
        if (v > best) {
          best = v;
          topWrong = `${opt}) ${qq.options[opt] || ""}`.trim();
        }
      });
      return {
        week: as.week,
        title: key.title || as.title,
        n: Number(n),
        text: qq.text,
        answered: q.answered,
        correct: q.correct,
        pct: Math.round((q.correct / q.answered) * 1000) / 10,
        topWrong,
      };
    })
    .sort((a, b) => a.pct - b.pct || b.answered - a.answered)
    .slice(0, 15);

  // when people learn: lesson views + learn events (everyone, range) + progress writes
  const heatmap = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  const mark = (t: number) => {
    if (!t || t < since) return;
    const [d, h] = dowHour(t, model.tz);
    heatmap[d][h]++;
  };
  ds.events.forEach((e) => {
    if (e.user_id && adminIds.has(e.user_id)) return;
    if (eventLesson(e) && (e.event_type === "page_view" || eventName(e))) mark(ms(e.created_at));
  });
  ds.progress.forEach((r) => {
    if (adminIds.has(r.user_id)) return;
    mark(ms(r.completed_at));
  });

  return {
    generatedAt: new Date(now).toISOString(),
    tz: model.tz,
    range,
    lessons,
    weeks,
    hardest,
    heatmap,
    stageEvents: ds.features.learnEvents,
    learners: learners.length,
  };
}

/** Stage drop-off for one lesson: stage_reach / stage_done events, else learning_progress.completed_stages. */
export async function getStageDropoff(week: string, lesson: string, tz: string): Promise<StageDropoff> {
  const model = await buildModel(tz);
  const { ds, idx } = model;
  const stages = await getStages(week, lesson);
  const adminIds = new Set(model.users.filter((u) => u.row.isAdmin).map((u) => u.row.id));
  const reach = new Map<string, Set<string>>();
  const done = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, stage: string, who: string) => {
    const s = m.get(stage) || new Set<string>();
    s.add(who);
    m.set(stage, s);
  };
  let source: StageDropoff["source"] = "none";
  ds.events.forEach((e) => {
    const name = eventName(e);
    if (name !== "stage_reach" && name !== "stage_done") return;
    if (e.user_id && adminIds.has(e.user_id)) return;
    const m = e.metadata || {};
    if (String(m.week) !== week || String(m.lesson) !== lesson || !m.stage) return;
    const who = e.user_id || e.visitor_id || e.session_id || e.id;
    source = "events";
    add(name === "stage_reach" ? reach : done, String(m.stage), who);
    if (name === "stage_done") add(reach, String(m.stage), who);
  });
  if (source === "none" && ds.features.stageColumns) {
    ds.progress.forEach((r) => {
      if (r.week !== week || r.lesson_slug !== lesson || adminIds.has(r.user_id)) return;
      (r.completed_stages || []).forEach((s) => {
        add(done, s, r.user_id);
        add(reach, s, r.user_id);
      });
      if (r.last_stage) add(reach, r.last_stage, r.user_id);
      source = "columns";
    });
  }
  return {
    week,
    lesson,
    title: lessonTitle(idx, week, lesson),
    source,
    stages: stages.map((s) => ({ id: s.id, label: s.label, title: s.title, minutes: s.minutes, reached: reach.get(s.id)?.size || 0, done: done.get(s.id)?.size || 0 })),
  };
}
