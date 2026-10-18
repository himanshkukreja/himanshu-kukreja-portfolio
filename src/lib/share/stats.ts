import "server-only";
/**
 * A learner's public stats for /u/<handle>, its OG cards and the share text, built on the server
 * from the same sources the progress page and the Arena use:
 *   user_profiles      name, avatar, xp + game_done (level_up migration; read with select * so a
 *                      missing column never errors), streak counters
 *   learning_progress  lesson status / completion time (+ completed_stages when present)
 *   learning_streaks   active days
 *   trial_attempts     passed trial parts (when present), else saved MCQ answers scored per part
 *   analytics_events   daily_result runs (re-checked against that day's question set)
 *   Arena board        league, rank, weekly points, daily streak (src/lib/learn/arena/leaderboard)
 * Only fields the learner made visible are returned; never the email or the user id.
 */
import { unstable_cache } from "next/cache";
import { supabase } from "@/lib/supabase";
import { COURSE_ID, getCourseMap } from "@/lib/learn/course";
import type { CourseMap, CourseWeek } from "@/lib/learn/types";
import { LEARN_XP, lessonKey } from "@/lib/learn/types";
import { BADGES, levelProgress } from "@/game/catalog";
import { scoreMcqParts } from "@/lib/learn/actions";
import { dailyStreak, getBoard } from "@/lib/learn/arena/leaderboard";
import { verifyDaily } from "@/lib/learn/arena/daily";
import { addDays, dailyNumber, istDate, isDay, LEAGUES } from "@/lib/learn/arena/shared";
import { settingsForHandle, shareFixtures } from "./store";
import { fixtureRaw } from "./fixtures";
import { designWeekDone } from "@/lib/design-week/wins";
import type { Milestone, ProfileWeek, PublicProfile, ShareSummary, TreeLesson, Visibility } from "./model";
import { DEFAULT_VISIBILITY } from "./model";

/* ------------------------------------------------------------------ raw data */

export type RawProfile = {
  full_name: string | null;
  avatar_url: string | null;
  created_at: string | null;
  xp?: number | null;
  game_done?: Record<string, number> | null;
  longest_streak?: number | null;
  /** Hall of Fame handle (level_up migration) */
  handle?: string | null;
};
export type RawRow = { week: string; lesson_slug: string; status: string | null; progress_percentage?: number | null; completed_stages?: string[] | null; completed_at?: string | null; started_at?: string | null; created_at?: string | null };
export type RawDaily = { at: number; date: string; picks: number[]; score: number };
export type RawArena = { tier: number; rank: number | null; leaguePlayers: number; weekPoints: number; allTime: number; globalRank: number | null; dailyStreak: number } | null;

export type Raw = {
  profile: RawProfile | null;
  rows: RawRow[];
  streakDays: string[];
  /** `${trialWeek}|${part}` */
  trialsPassed: Set<string>;
  dailies: { date: string; correct: number; total: number; score: number; at: number }[];
  arena: RawArena;
};

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

async function arenaFor(userId: string): Promise<RawArena> {
  const board = await getBoard().catch(() => null);
  const me = board?.players.get(userId);
  if (!board || !me) return null;
  const all = [...board.players.values()];
  const league = all.filter((p) => p.tier === me.tier && p.week > 0).sort((a, b) => b.week - a.week);
  const weekly = all.filter((p) => p.week > 0).sort((a, b) => b.week - a.week);
  return {
    tier: me.tier,
    rank: me.week > 0 ? league.indexOf(me) + 1 : null,
    leaguePlayers: league.length,
    weekPoints: me.week,
    allTime: me.all,
    globalRank: me.week > 0 ? weekly.indexOf(me) + 1 : null,
    dailyStreak: dailyStreak(me.dailyDays, board.today),
  };
}

async function trialsFor(userId: string, map: CourseMap): Promise<Set<string>> {
  const out = new Set<string>();
  const att = await supabase.from("trial_attempts").select("week, part, passed").eq("user_id", userId).eq("course_id", map.courseId).eq("passed", true);
  if (!att.error && (att.data || []).length) {
    (att.data as { week: string; part: number }[]).forEach((a) => out.add(`${a.week}|${a.part}`));
    return out;
  }
  // migration not applied (or no attempts): score saved MCQ answers, like the progress page does
  const trials = map.weeks.filter((w) => w.trial).map((w) => w.trial!);
  if (!trials.length) return out;
  const assess = await supabase.from("mcq_assessments").select("id, week, lesson_slug").eq("course_id", map.courseId);
  const list = ((assess.data || []) as { id: string; week: string; lesson_slug: string }[]).filter((a) => trials.some((t) => t.week === a.week && t.slug === a.lesson_slug));
  if (!list.length) return out;
  const ans = await supabase
    .from("mcq_user_answers")
    .select("assessment_id, question_number, selected_option")
    .eq("user_id", userId)
    .in(
      "assessment_id",
      list.map((a) => a.id)
    )
    .limit(1000);
  const byLesson: Record<string, Record<string, string>> = {};
  ((ans.data || []) as { assessment_id: string; question_number: number; selected_option: string | null }[]).forEach((r) => {
    const a = list.find((x) => x.id === r.assessment_id);
    if (a && r.selected_option) (byLesson[`${a.week}|${a.lesson_slug}`] ||= {})[String(r.question_number)] = r.selected_option;
  });
  const input = Object.entries(byLesson).map(([k, a]) => ({ week: k.split("|")[0], slug: k.split("|")[1], answers: a }));
  if (!input.length) return out;
  const scored = await scoreMcqParts(input).catch(() => ({}) as Awaited<ReturnType<typeof scoreMcqParts>>);
  Object.entries(scored).forEach(([w, parts]) => parts.forEach((p) => p.passed && out.add(`${w}|${p.part}`)));
  return out;
}

async function dailiesFor(userId: string): Promise<Raw["dailies"]> {
  const { data } = await supabase
    .from("analytics_events")
    .select("created_at, metadata")
    .eq("event_type", "event")
    .eq("user_id", userId)
    .eq("metadata->>name", "daily_result")
    .order("created_at", { ascending: false })
    .limit(120);
  const runs: RawDaily[] = [];
  const seen = new Set<string>();
  // oldest first so the first scored run of a day is the one that counts (as on the leaderboard)
  for (const e of ((data || []) as { created_at: string; metadata: Record<string, unknown> | null }[]).reverse()) {
    const m = e.metadata || {};
    const date = str(m.date);
    if (m.practice === true || m.practice === "true" || !isDay(date) || seen.has(date)) continue;
    seen.add(date);
    runs.push({ at: Date.parse(e.created_at), date, picks: str(m.picks).split(",").map((x) => (x === "" ? -1 : Number(x))), score: num(m.score) });
  }
  const out: Raw["dailies"] = [];
  for (const r of runs.slice(-40)) {
    const v = await verifyDaily(r.date, r.picks).catch(() => null);
    if (!v || !v.total) continue;
    // the game score includes client timing; cap it at what the verified answers allow
    const score = Math.max(0, Math.min(Number.isFinite(r.score) ? r.score : 0, v.correct * 200));
    out.push({ date: r.date, correct: v.correct, total: v.total, score, at: r.at });
  }
  return out;
}

export async function loadRaw(userId: string, map: CourseMap): Promise<Raw> {
  // Design of the week wins come from their own tables, so the badge shows before the winner's next visit
  const [raw, dow] = await Promise.all([loadRawBase(userId, map), designWeekDone(userId)]);
  if (!Object.keys(dow).length) return raw;
  const profile: RawProfile = raw.profile ?? { full_name: null, avatar_url: null, created_at: null };
  return { ...raw, profile: { ...profile, game_done: { ...dow, ...(profile.game_done || {}) } } };
}

async function loadRawBase(userId: string, map: CourseMap): Promise<Raw> {
  // dev QA: fixture learners only, never the database
  if (shareFixtures()) return fixtureRaw(userId, map) ?? { profile: null, rows: [], streakDays: [], trialsPassed: new Set(), dailies: [], arena: null };
  const [profile, rows, streaks, trials, dailies, arena] = await Promise.all([
    supabase.from("user_profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("learning_progress").select("*").eq("user_id", userId).eq("course_id", map.courseId).limit(2000),
    supabase.from("learning_streaks").select("activity_date").eq("user_id", userId).order("activity_date", { ascending: false }).limit(800),
    trialsFor(userId, map).catch(() => new Set<string>()),
    dailiesFor(userId).catch(() => []),
    arenaFor(userId).catch(() => null),
  ]);
  return {
    profile: (profile.data as RawProfile | null) ?? null,
    rows: ((rows.data || []) as RawRow[]).filter((r) => r.week && r.lesson_slug),
    streakDays: ((streaks.data || []) as { activity_date: string }[]).map((s) => String(s.activity_date).slice(0, 10)).filter(isDay),
    trialsPassed: trials,
    dailies,
    arena,
  };
}

/* ------------------------------------------------------------------ derived */

type WeekCalc = { week: CourseWeek; lessonsDone: number; bossDone: boolean; partsPassed: number[]; nodesDone: number; nodesTotal: number; cleared: boolean; started: boolean; lastAt: number };

const ms = (s?: string | null) => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? t : 0;
};

function firstLast(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return `${parts[0].slice(0, 18)}${parts.length > 1 ? ` ${parts[parts.length - 1][0].toUpperCase()}.` : ""}`;
}

function runs(days: Set<string>, today: string) {
  let cur = 0;
  let d = days.has(today) ? today : addDays(today, -1);
  while (days.has(d)) {
    cur++;
    d = addDays(d, -1);
  }
  let best = 0;
  let run = 0;
  let prev = "";
  [...days].sort().forEach((x) => {
    run = prev && addDays(prev, 1) === x ? run + 1 : 1;
    best = Math.max(best, run);
    prev = x;
  });
  return { current: cur, best: Math.max(best, cur) };
}

/** Everything, unfiltered (the owner's own view feeds the share text). */
export function derive(raw: Raw, map: CourseMap) {
  const done = (raw.profile?.game_done && typeof raw.profile.game_done === "object" ? raw.profile.game_done : {}) as Record<string, number>;
  const lessons: Record<string, TreeLesson & { at: number }> = {};
  const get = (k: string) => (lessons[k] ||= { status: "not_started", at: 0 });
  let stagesDone = 0;
  raw.rows.forEach((r) => {
    const p = get(lessonKey(r.week, r.lesson_slug));
    if (r.status === "completed") p.status = "completed";
    else if (p.status !== "completed" && ((r.progress_percentage || 0) > 0 || r.status === "in_progress")) p.status = "in_progress";
    p.at = Math.max(p.at, ms(r.completed_at));
    stagesDone += (r.completed_stages || []).length;
  });
  let doneStages = 0;
  Object.entries(done).forEach(([k, at]) => {
    if (k.startsWith("lesson:")) {
      const p = get(k.slice(7));
      p.status = "completed";
      p.at = p.at || Number(at) || 0;
    } else if (k.startsWith("stage:")) {
      doneStages++;
      const rest = k.slice(6);
      const p = get(rest.slice(0, rest.lastIndexOf("/")));
      if (p.status === "not_started") p.status = "in_progress";
    }
  });
  stagesDone = Math.max(stagesDone, doneStages);
  const isDone = (week: string, slug: string) => lessons[lessonKey(week, slug)]?.status === "completed";
  const started = (week: string, slug: string) => (lessons[lessonKey(week, slug)]?.status || "not_started") !== "not_started";

  const weeks: WeekCalc[] = map.weeks.map((w) => {
    const lessonsDone = w.lessons.filter((l) => isDone(l.week, l.slug)).length;
    const bossDone = !!w.boss && (!!done[`boss:${w.key}`] || isDone(w.boss.week, w.boss.slug));
    const partsPassed = (w.trial?.parts || [])
      .filter((p) => !!done[`trial:${w.trial!.week}/part-${p.n}`] || !!done[`trial:${w.key}/part-${p.n}`] || raw.trialsPassed.has(`${w.trial!.week}|${p.n}`) || raw.trialsPassed.has(`${w.key}|${p.n}`))
      .map((p) => p.n);
    const nodesTotal = w.lessons.length + (w.boss ? 1 : 0) + (w.trial?.parts.length || 0);
    const nodesDone = lessonsDone + (bossDone ? 1 : 0) + partsPassed.length;
    const lastAt = Math.max(0, ...[...w.lessons, ...(w.boss ? [w.boss] : [])].map((l) => lessons[lessonKey(l.week, l.slug)]?.at || 0));
    return {
      week: w,
      lessonsDone,
      bossDone,
      partsPassed,
      nodesDone,
      nodesTotal,
      cleared: nodesTotal > 0 && nodesDone === nodesTotal,
      started: nodesDone > 0 || w.lessons.some((l) => started(l.week, l.slug)) || (!!w.boss && started(w.boss.week, w.boss.slug)),
      lastAt,
    };
  });

  const nodesDone = weeks.reduce((a, w) => a + w.nodesDone, 0);
  const nodesTotal = weeks.reduce((a, w) => a + w.nodesTotal, 0);
  const lessonsDone = weeks.reduce((a, w) => a + w.lessonsDone + (w.bossDone ? 1 : 0), 0);
  const lessonsTotal = map.weeks.reduce((a, w) => a + w.lessons.length + (w.boss ? 1 : 0), 0);
  const bossesDone = weeks.filter((w) => w.bossDone).length;
  const partsPassed = weeks.reduce((a, w) => a + w.partsPassed.length, 0);
  const worldsCleared = weeks.filter((w) => w.cleared).length;
  const sideDone = map.sideQuests.filter((l) => isDone(l.week, l.slug)).length;
  const coreDone = weeks.reduce((a, w) => a + w.lessonsDone, 0);

  // XP: the synced game XP when present; never less than what the course progress is worth
  const courseXp =
    (coreDone + sideDone) * LEARN_XP.lesson +
    stagesDone * LEARN_XP.stage +
    partsPassed * LEARN_XP.trial +
    bossesDone * LEARN_XP.boss +
    worldsCleared * LEARN_XP.world +
    sideDone * (LEARN_XP.sideQuest - LEARN_XP.lesson);
  const xp = Math.max(Number(raw.profile?.xp) || 0, courseXp);

  // streak: active days (server streak rows, completions, game timestamps), IST days
  const days = new Set(raw.streakDays);
  Object.entries(done).forEach(([k, at]) => {
    if (/^(lesson|stage|trial|boss|world|sidequest):/.test(k) && Number(at) > 0) days.add(istDate(Number(at)));
  });
  raw.rows.forEach((r) => r.completed_at && days.add(istDate(ms(r.completed_at))));
  const today = istDate();
  const st = runs(days, today);
  const streak = { current: st.current, best: Math.max(st.best, Number(raw.profile?.longest_streak) || 0, st.current) };

  const firstRun = weeks.find((w) => w.started && !w.cleared) || weeks.find((w) => !w.cleared) || null;
  const bestDaily = raw.dailies.reduce<Raw["dailies"][number] | null>((b, d) => (!b || d.correct > b.correct || (d.correct === b.correct && d.score > b.score) ? d : b), null);
  const badges = [
    ...BADGES.filter((b) => b.earned(done)).map((b) => ({ id: b.id, name: b.name, how: b.how, at: Number(done[b.id === "firstblood" ? "quiz:ace" : b.id === "daily7" ? "arena:streak7" : b.id === "top10" ? "arena:top10" : b.id]) || 0 })),
    ...weeks.filter((w) => w.cleared).map((w) => ({ id: `world-${w.week.code}`, name: w.week.badge, how: `Cleared Week ${w.week.code} · ${w.week.title}.`, at: Number(done[`world:${w.week.key}`]) || w.lastAt })),
  ];

  return { done, lessons, weeks, nodesDone, nodesTotal, lessonsDone, lessonsTotal, bossesDone, partsPassed, worldsCleared, xp, streak, currentWeek: firstRun?.week.key ?? null, bestDaily, badges };
}

export type Derived = ReturnType<typeof derive>;

function milestonesOf(d: Derived, raw: Raw, show: { course: boolean; scores: boolean; badges: boolean }): Milestone[] {
  const out: Milestone[] = [];
  if (show.course) d.weeks.forEach((w) => {
    if (w.cleared) out.push({ id: `world:${w.week.key}`, label: `Cleared World ${w.week.code} · ${w.week.title}`, at: Number(d.done[`world:${w.week.key}`]) || w.lastAt, achievement: `world-${w.week.code}` });
    if (w.bossDone && w.week.boss) {
      const at = Number(d.done[`boss:${w.week.key}`]) || d.lessons[lessonKey(w.week.boss.week, w.week.boss.slug)]?.at || 0;
      out.push({ id: `boss:${w.week.key}`, label: `Beat the Week ${w.week.num} boss · ${w.week.boss.title}`, at, achievement: `boss-${w.week.code}` });
    }
    w.partsPassed.forEach((n) => {
      const at = Number(d.done[`trial:${w.week.trial?.week}/part-${n}`]) || Number(d.done[`trial:${w.week.key}/part-${n}`]) || 0;
      if (at) out.push({ id: `trial:${w.week.key}:${n}`, label: `Passed the W${w.week.code} trial · part ${n}`, at });
    });
  });
  if (show.scores) raw.dailies.filter((x) => x.total > 0 && x.correct === x.total).forEach((x) => out.push({ id: `daily:${x.date}`, label: `Perfect ${x.correct}/${x.total} on daily challenge #${dailyNumber(x.date)}`, at: x.at, achievement: "daily" }));
  if (show.badges) d.badges.filter((b) => !b.id.startsWith("world-") && b.at).forEach((b) => out.push({ id: `badge:${b.id}`, label: `Unlocked the ${b.name} badge`, at: b.at, achievement: `badge-${b.id}` }));
  const firstDone = Object.values(d.lessons).filter((l) => l.status === "completed" && l.at).sort((a, b) => a.at - b.at)[0];
  if (firstDone && show.course) out.push({ id: "first-lesson", label: "Cleared their first lesson", at: firstDone.at });
  return out.filter((m) => m.at > 0).sort((a, b) => b.at - a.at).slice(0, 8);
}

/** The public view: only what `v` allows. */
export function toPublic(handle: string, raw: Raw, d: Derived, map: CourseMap, v: Visibility): PublicProfile {
  const fullName = (raw.profile?.full_name || "").trim().slice(0, 60);
  const name = v.name === "none" || !fullName ? null : v.name === "full" ? fullName : firstLast(fullName);
  const avatar = name && v.avatar && /^https:\/\//.test(raw.profile?.avatar_url || "") ? raw.profile!.avatar_url! : null;
  const initials = (name || handle)
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0]!.toUpperCase())
    .join("");
  const lp = levelProgress(d.xp);
  const created = ms(raw.profile?.created_at);
  const weeks: ProfileWeek[] = d.weeks.map((w) => ({
    key: w.week.key,
    code: w.week.code,
    title: w.week.title,
    badge: w.week.badge,
    pct: w.nodesTotal ? Math.round((w.nodesDone / w.nodesTotal) * 100) : 0,
    cleared: w.cleared,
    started: w.started,
    bossDone: w.bossDone,
  }));
  const tierLeague = raw.arena ? LEAGUES[Math.max(0, Math.min(LEAGUES.length - 1, raw.arena.tier))] : null;
  const showCourse = v.progress || v.tree;

  const achievements: string[] = [];
  if (showCourse) d.weeks.forEach((w) => {
    if (w.cleared) achievements.push(`world-${w.week.code}`);
    if (w.bossDone) achievements.push(`boss-${w.week.code}`);
  });
  if (v.progress && lp.index >= 1) achievements.push(`level-${lp.index + 1}`);
  if (v.streak && d.streak.current >= 2) achievements.push("streak");
  if (v.scores && d.bestDaily) achievements.push("daily");
  if (v.scores && raw.arena && raw.arena.weekPoints > 0) achievements.push("league");
  if (v.badges) d.badges.filter((b) => !b.id.startsWith("world-")).forEach((b) => achievements.push(`badge-${b.id}`));

  return {
    handle,
    name,
    avatar,
    initials: initials || handle.slice(0, 2).toUpperCase(),
    since: created && v.progress ? new Date(created).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : null,
    level: v.progress ? { index: lp.index, code: lp.level.code, name: lp.level.name, xp: d.xp, pct: lp.pct, next: lp.next ? { code: lp.next.code, name: lp.next.name, toGo: lp.next.min - d.xp } : null } : null,
    course: showCourse
      ? {
          title: map.title,
          pct: d.nodesTotal ? Math.round((d.nodesDone / d.nodesTotal) * 100) : 0,
          nodesDone: d.nodesDone,
          nodesTotal: d.nodesTotal,
          lessonsDone: d.lessonsDone,
          lessonsTotal: d.lessonsTotal,
          worldsCleared: d.worldsCleared,
          worldsTotal: d.weeks.length,
          bossesDone: d.bossesDone,
          trialPartsPassed: d.partsPassed,
          weeks,
        }
      : null,
    tree: v.tree
      ? {
          lessons: Object.fromEntries(Object.entries(d.lessons).map(([k, l]) => [k, { status: l.status }])),
          boss: d.weeks.filter((w) => w.bossDone).map((w) => w.week.key),
          trials: Object.fromEntries(d.weeks.filter((w) => w.partsPassed.length).map((w) => [w.week.key, w.partsPassed])),
          currentWeek: d.currentWeek,
        }
      : null,
    streak: v.streak ? d.streak : null,
    arena:
      v.scores && (raw.arena || d.bestDaily)
        ? {
            tier: raw.arena?.tier ?? 0,
            leagueCode: tierLeague?.code ?? LEAGUES[0].code,
            leagueName: tierLeague?.name ?? LEAGUES[0].name,
            rank: raw.arena?.rank ?? null,
            leaguePlayers: raw.arena?.leaguePlayers ?? 0,
            weekPoints: raw.arena?.weekPoints ?? 0,
            allTime: raw.arena?.allTime ?? 0,
            globalRank: raw.arena?.globalRank ?? null,
            dailyStreak: raw.arena?.dailyStreak ?? 0,
            bestDaily: d.bestDaily ? { correct: d.bestDaily.correct, total: d.bestDaily.total, score: d.bestDaily.score, date: d.bestDaily.date, number: dailyNumber(d.bestDaily.date) } : null,
          }
        : null,
    badges: v.badges ? d.badges.map((b) => ({ id: b.id, name: b.name, how: b.how })) : null,
    milestones: v.milestones ? milestonesOf(d, raw, { course: showCourse, scores: v.scores, badges: v.badges }) : null,
    achievements,
    updatedAt: Date.now(),
  };
}

export function summaryOf(d: Derived, raw: Raw): ShareSummary {
  const lp = levelProgress(d.xp);
  const lg = raw.arena ? LEAGUES[raw.arena.tier] : null;
  return {
    levelCode: lp.level.code,
    levelName: lp.level.name,
    xp: d.xp,
    pct: d.nodesTotal ? Math.round((d.nodesDone / d.nodesTotal) * 100) : 0,
    streak: d.streak.current,
    lessonsDone: d.lessonsDone,
    worldsCleared: d.worldsCleared,
    leagueCode: lg?.code ?? null,
    leagueName: lg?.name ?? null,
    leagueRank: raw.arena?.rank ?? null,
  };
}

/* ------------------------------------------------------------------ entry points */

export const shareTag = (handle: string) => `share:${handle}`;

async function buildPublic(handle: string): Promise<PublicProfile | null> {
  const owner = await settingsForHandle(handle);
  if (!owner || !owner.settings.enabled) return null;
  const map = await getCourseMap(COURSE_ID);
  if (!map) return null;
  const raw = await loadRaw(owner.userId, map);
  return toPublic(handle, raw, derive(raw, map), map, owner.settings.visibility);
}

/**
 * The public profile of a handle, or null (unknown or unpublished → 404). Cached per handle for
 * 60 s; the settings API revalidates the tag on every change, so unpublishing is immediate.
 */
export async function getPublicProfile(handle: string): Promise<PublicProfile | null> {
  if (shareFixtures()) return buildPublic(handle);
  return unstable_cache(() => buildPublic(handle), ["share-profile-v1", handle], { revalidate: 60, tags: [shareTag(handle), "share"] })();
}

/** The owner's own summary for share text + what a default handle is suggested from (not cached). */
export async function ownerInfo(userId: string): Promise<{ summary: ShareSummary | null; fullName: string | null; hofHandle: string | null }> {
  const map = await getCourseMap(COURSE_ID);
  if (!map) return { summary: null, fullName: null, hofHandle: null };
  const raw = await loadRaw(userId, map);
  return { summary: summaryOf(derive(raw, map), raw), fullName: raw.profile?.full_name || null, hofHandle: typeof raw.profile?.handle === "string" ? raw.profile.handle : null };
}

/** Preview of the public page with given settings (used by the settings panel's "what visitors see"). */
export async function previewProfile(userId: string, handle: string, v: Visibility = DEFAULT_VISIBILITY): Promise<PublicProfile | null> {
  const map = await getCourseMap(COURSE_ID);
  if (!map) return null;
  const raw = await loadRaw(userId, map);
  return toPublic(handle, raw, derive(raw, map), map, v);
}

