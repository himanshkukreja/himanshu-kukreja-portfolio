import "server-only";
import { supabase } from "@/lib/supabase";
import { parseUA } from "@/lib/analytics/ua";
import { lessonTitle, lessonTag } from "./course";
import { buildModel, cappedTime, dayKey, eventLesson, eventName, lastDays, sessionMinutes, sessionsOf, type Model, type UserModel } from "./compute";
import type { LearnerDetail, MapCell, McqResult, TimelineItem } from "./types";

const ms = (s: string | null | undefined) => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? t : 0;
};

function cellFor(model: Model, u: UserModel, l: { week: string; slug: string; code: string; title: string; kind: string; href: string }, visits: Map<string, number>): MapCell {
  const key = `${l.week}/${l.slug}`;
  const s = u.lessonState.get(key);
  const r = s?.row;
  return {
    week: l.week,
    slug: l.slug,
    code: l.code,
    title: l.title,
    kind: l.kind,
    href: l.href,
    status: s?.status ?? "not_started",
    pct: s?.pct ?? 0,
    timeSec: r ? cappedTime(model.idx, r) : 0,
    startedAt: r?.started_at ?? null,
    completedAt: r?.completed_at ?? null,
    lastAt: r?.last_accessed_at ?? null,
    lastStage: r?.last_stage ?? null,
    visits: visits.get(key) || 0,
  };
}

function grade(model: Model, u: UserModel): McqResult[] {
  const { ds, keys } = model;
  const mine = ds.answers.filter((a) => a.user_id === u.row.id);
  const byAssessment = new Map<string, typeof mine>();
  mine.forEach((a) => {
    const l = byAssessment.get(a.assessment_id);
    if (l) l.push(a);
    else byAssessment.set(a.assessment_id, [a]);
  });
  const out: McqResult[] = [];
  byAssessment.forEach((answers, id) => {
    const as = ds.assessments.find((a) => a.id === id);
    if (!as) return;
    const key = keys.get(id) || null;
    const questions = answers
      .map((a) => {
        const q = key?.questions.get(a.question_number);
        return {
          n: a.question_number,
          part: q?.part ?? 0,
          text: q?.text ?? `Question ${a.question_number}`,
          picked: a.selected_option,
          correct: q?.correct ?? null,
          ok: q ? q.correct === a.selected_option : null,
        };
      })
      .sort((a, b) => a.n - b.n);
    const parts = (key?.parts || []).map((p) => {
      const qs = questions.filter((q) => q.part === p.n);
      const correct = qs.filter((q) => q.ok).length;
      return { n: p.n, title: p.title, total: p.numbers.length, answered: qs.length, correct, passed: p.numbers.length > 0 && correct / p.numbers.length >= 0.8 };
    });
    out.push({
      assessmentId: id,
      week: as.week,
      slug: as.lesson_slug,
      title: key?.title || as.title,
      total: key?.questions.size || as.total_questions || 0,
      answered: questions.length,
      correct: questions.filter((q) => q.ok).length,
      lastAt: answers.reduce<string | null>((a, x) => (!a || (x.updated_at || x.created_at) > a ? x.updated_at || x.created_at : a), null),
      parts,
      questions,
    });
  });
  return out.sort((a, b) => a.week.localeCompare(b.week));
}

export async function getLearnerDetail(userId: string, tz: string): Promise<LearnerDetail | null> {
  const model = await buildModel(tz);
  const u = model.byId.get(userId);
  if (!u) return null;
  const { idx, now, ds } = model;

  // lesson visits from events
  const visits = new Map<string, number>();
  u.events.forEach((e) => {
    if (e.event_type !== "page_view") return;
    const l = eventLesson(e);
    if (l) visits.set(`${l.week}/${l.slug}`, (visits.get(`${l.week}/${l.slug}`) || 0) + 1);
  });

  const map = idx.weeks.map((w) => ({ key: w.key, code: w.code, title: w.title, cells: w.nodes.map((n) => cellFor(model, u, n, visits)) }));
  const sideQuests = idx.ordered.filter((l) => !l.core).map((n) => cellFor(model, u, n, visits));

  // resume point: current lesson if unfinished, else the first unfinished core lesson after the last completed one
  let resume: LearnerDetail["resume"] = null;
  const pos = u.row.position;
  if (pos && pos.status !== "completed") {
    resume = { week: pos.week, lesson: pos.lesson, title: pos.title, tag: pos.tag, href: pos.href, stageLabel: pos.stageLabel, reason: "Unfinished lesson they were last in" };
  } else {
    const core = idx.ordered.filter((l) => l.core);
    let lastDone = -1;
    core.forEach((l, i) => {
      if (u.lessonState.get(`${l.week}/${l.slug}`)?.status === "completed") lastDone = i;
    });
    if (pos && pos.status === "completed") {
      const i = core.findIndex((l) => l.week === pos.week && l.slug === pos.lesson);
      if (i >= 0) lastDone = Math.max(lastDone, i);
    }
    const next = core.slice(lastDone + 1).find((l) => u.lessonState.get(`${l.week}/${l.slug}`)?.status !== "completed");
    if (next)
      resume = {
        week: next.week,
        lesson: next.slug,
        title: next.title,
        tag: next.tag,
        href: next.href,
        stageLabel: null,
        reason: lastDone >= 0 ? "Next lesson after their furthest completed one" : "Start of the course",
      };
  }

  const calendar = lastDays(84, model.tz, now).map((d) => ({ d, n: u.dayCounts.get(d) || 0 }));

  // timeline
  const timeline: TimelineItem[] = [];
  sessionsOf(u.events).forEach((s) => {
    const first = s[0];
    const last = s[s.length - 1];
    const pages: { path: string; title: string; at: string; secs?: number; depth?: number; actions?: string[] }[] = [];
    // page_leave rows (time open, scroll depth) and in-page events point at their view by metadata.pv
    const byView = new Map<string, (typeof pages)[number]>();
    s.forEach((e) => {
      if (e.event_type !== "page_view" || !e.page_path) return;
      const l = eventLesson(e);
      const title = l ? `${lessonTag(idx, l.week, l.slug)} · ${lessonTitle(idx, l.week, l.slug)}` : e.page_title?.replace(/\s*\|.*$/, "") || e.page_path;
      const pv = String(e.metadata?.pv || "");
      const prev = pages[pages.length - 1];
      if (prev && prev.path === e.page_path) {
        if (pv) byView.set(pv, prev);
        return;
      }
      const page = { path: e.page_path, title, at: e.created_at };
      pages.push(page);
      if (pv) byView.set(pv, page);
    });
    s.forEach((e) => {
      const page = byView.get(String(e.metadata?.pv || ""));
      if (!page) return;
      if (e.event_type === "page_leave") {
        page.secs = Math.max(page.secs || 0, Math.round((Number(e.duration) || 0) / 1000));
        const d = Number(e.metadata?.depth);
        if (Number.isFinite(d)) page.depth = Math.max(page.depth || 0, d);
        return;
      }
      const name = eventName(e);
      if (!name || name === "lesson_open") return;
      const m = e.metadata || {};
      const label =
        name === "quiz_answer"
          ? `quiz Q${Number(m.q ?? 0) + 1}${m.correct === true ? " ✓" : m.correct === false ? " ✗" : ""}${m.first === false ? " (retry)" : ""}`
          : name === "stage_done"
            ? `finished ${m.stage}`
            : name === "stage_reach"
              ? `reached ${m.stage}`
              : name === "play"
                ? `${String(m.game || "game").replace(/^arena:/, "")} ${m.result || ""}${m.score != null ? ` · ${m.score}` : ""}`.trim()
                : name;
      page.actions = [...(page.actions || []), label].slice(-12);
    });
    const ua = parseUA(first.user_agent);
    timeline.push({
      kind: "session",
      at: first.created_at,
      end: last.created_at,
      minutes: Math.round(sessionMinutes(s) * 10) / 10,
      device: `${ua.device}${ua.os !== "Unknown" ? ` · ${ua.os}` : ""}${ua.browser && ua.browser !== "Unknown" ? ` · ${ua.browser}` : ""}`,
      country: first.country,
      city: first.city,
      pages,
    });
  });
  u.events.forEach((e) => {
    const name = eventName(e);
    if (!name || name === "lesson_open" || name === "stage_reach") return;
    const l = eventLesson(e);
    const m = e.metadata || {};
    const detail =
      name === "trial_result"
        ? `Part ${m.part} · ${m.score}/${m.total}${m.passed ? " · passed" : ""}`
        : name === "stage_done"
          ? `Stage ${m.stage}${m.index != null ? ` (${Number(m.index) + 1}/${m.total})` : ""}`
          : name === "lesson_complete"
            ? `${m.minutes ?? "?"} min`
            : name === "reset"
              ? `scope ${m.scope}`
              : "";
    timeline.push({ kind: "event", at: e.created_at, name, title: l ? lessonTitle(idx, l.week, l.slug) : String(m.week || ""), detail });
  });
  u.progress.forEach((r) => {
    const title = lessonTitle(idx, r.week, r.lesson_slug);
    if (r.started_at) timeline.push({ kind: "started", at: r.started_at, week: r.week, lesson: r.lesson_slug, title });
    if (r.status === "completed" && r.completed_at) timeline.push({ kind: "completed", at: r.completed_at, week: r.week, lesson: r.lesson_slug, title });
  });

  const mcq = grade(model, u);
  // one timeline item per assessment per day
  const mcqDays = new Map<string, { at: string; title: string; answered: number }>();
  ds.answers
    .filter((a) => a.user_id === userId)
    .forEach((a) => {
      const t = a.updated_at || a.created_at;
      const as = mcq.find((m) => m.assessmentId === a.assessment_id);
      const k = `${a.assessment_id}|${dayKey(ms(t), model.tz)}`;
      const cur = mcqDays.get(k);
      if (cur) {
        cur.answered++;
        if (t > cur.at) cur.at = t;
      } else mcqDays.set(k, { at: t, title: as?.title || "MCQ", answered: 1 });
    });
  mcqDays.forEach((v) => timeline.push({ kind: "mcq", ...v }));

  // notes / bookmarks / comments with text
  const [notesQ, bmQ, cmQ, firstQ] = await Promise.all([
    supabase.from("content_notes").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(200),
    supabase.from("bookmarks").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(200),
    supabase.from("lesson_comments").select("id,week,lesson_slug,content,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(200),
    (async () => {
      const vids = Array.from(new Set(u.events.map((e) => e.visitor_id).filter(Boolean))) as string[];
      if (!vids.length) return null;
      const { data } = await supabase
        .from("analytics_events")
        .select("created_at,page_path,referrer,referrer_domain,utm_source,utm_medium,utm_campaign,user_agent,device_type,country,city")
        .in("visitor_id", vids.slice(0, 50))
        .order("created_at", { ascending: true })
        .limit(1);
      return data?.[0] || null;
    })(),
  ]);
  type Txt = Record<string, unknown>;
  const text = (r: Txt, ...keys: string[]) => {
    for (const k of keys) if (typeof r[k] === "string" && r[k]) return String(r[k]);
    return "";
  };
  const notes = ((notesQ.data || []) as Txt[]).map((r) => ({
    id: String(r.id),
    week: String(r.week),
    lesson: String(r.lesson_slug),
    title: lessonTitle(idx, String(r.week), String(r.lesson_slug)),
    text: text(r, "note_text", "highlighted_text", "selected_text", "content"),
    createdAt: String(r.created_at),
  }));
  const bookmarks = ((bmQ.data || []) as Txt[]).map((r) => ({
    id: String(r.id),
    week: String(r.week),
    lesson: String(r.lesson_slug),
    title: lessonTitle(idx, String(r.week), String(r.lesson_slug)),
    text: text(r, "custom_title", "bookmark_text", "note"),
    createdAt: String(r.created_at),
  }));
  const comments = ((cmQ.data || []) as Txt[]).map((r) => ({
    id: String(r.id),
    week: String(r.week),
    lesson: String(r.lesson_slug),
    title: lessonTitle(idx, String(r.week), String(r.lesson_slug)),
    text: text(r, "content"),
    createdAt: String(r.created_at),
  }));
  notes.forEach((n) => timeline.push({ kind: "note", at: n.createdAt, week: n.week, lesson: n.lesson, title: n.title, text: n.text.slice(0, 140) }));
  bookmarks.forEach((n) => timeline.push({ kind: "bookmark", at: n.createdAt, week: n.week, lesson: n.lesson, title: n.title, text: n.text.slice(0, 140) }));
  comments.forEach((n) => timeline.push({ kind: "comment", at: n.createdAt, week: n.week, lesson: n.lesson, title: n.title, text: n.text.slice(0, 140) }));
  timeline.sort((a, b) => b.at.localeCompare(a.at));

  // devices / locations
  const devs = new Map<string, number>();
  const locs = new Map<string, number>();
  u.events.forEach((e) => {
    const ua = parseUA(e.user_agent);
    const d = `${ua.device} · ${ua.os} · ${ua.browser}${ua.inApp ? ` (${ua.inApp})` : ""}`;
    devs.set(d, (devs.get(d) || 0) + 1);
    const loc = [e.city, e.country].filter(Boolean).join(", ");
    if (loc) locs.set(loc, (locs.get(loc) || 0) + 1);
  });
  const toList = (m: Map<string, number>) =>
    Array.from(m.entries())
      .map(([label, n]) => ({ label, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 8);

  const f = firstQ as null | Record<string, string | null>;
  const firstVisit = f
    ? {
        at: String(f.created_at),
        path: String(f.page_path || ""),
        referrer: f.referrer_domain || f.referrer || null,
        utm: [f.utm_source, f.utm_medium, f.utm_campaign].filter(Boolean).join(" / ") || null,
        device: (() => {
          const ua = parseUA(f.user_agent);
          return `${ua.device} · ${ua.os}`;
        })(),
        country: f.country,
        city: f.city,
      }
    : null;

  const streakDays = ds.streaks
    .filter((s) => s.user_id === userId)
    .map((s) => ({ d: String(s.activity_date).slice(0, 10), lessons: Number(s.lessons_completed) || 0, timeSec: Number(s.time_spent) || 0 }))
    .sort((a, b) => b.d.localeCompare(a.d));

  const prof = ds.profiles.get(userId);
  const game = ds.features.gameColumns && prof ? { xp: Number(prof.xp) || 0, quests: Object.keys(prof.game_done || {}).length } : null;

  const trials = [
    ...ds.trials
      .filter((t) => t.user_id === userId)
      .map((t) => ({ at: t.finished_at || t.started_at, week: t.week, part: t.part, score: t.score, total: t.total, passed: t.passed })),
    ...u.events
      .filter((e) => eventName(e) === "trial_result")
      .map((e) => {
        const m = e.metadata || {};
        return { at: e.created_at, week: String(m.week || ""), part: Number(m.part) || 0, score: Number(m.score) || 0, total: Number(m.total) || 0, passed: !!m.passed };
      }),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return {
    generatedAt: new Date(now).toISOString(),
    tz: model.tz,
    learner: u.row,
    resume,
    map,
    sideQuests,
    calendar,
    timeline: timeline.slice(0, 300),
    mcq,
    trials,
    notes,
    bookmarks,
    comments,
    devices: toList(devs),
    locations: toList(locs),
    firstVisit,
    streakDays,
    game,
    features: ds.features,
  };
}
