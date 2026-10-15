import "server-only";
/**
 * Arena leaderboard (server only), scored from data that already exists — no new tables:
 *   learning_progress   completed lessons (server-written)
 *   analytics_events    learn events with a verified user_id (the beat endpoint sets user_id only from
 *                       a verified access token): stage_done, lesson_complete, quiz_answer, daily_result,
 *                       trial_result, review_session
 *   learning_streaks    active days
 *
 * Anti-cheat basics: only rows with a user_id count; every source is de-duplicated by its natural key
 * (lesson, stage, question, day…); quick-check answers and daily runs are re-checked against the
 * question bank (the client's `correct` flag is not trusted); per-lesson caps; a per-day cap.
 *
 * Leagues are replayed from history, week by week (Monday 00:00 IST): everyone starts in L1 Intern; at
 * the end of a week the top 20 % of each league's active players (at least one, with 60+ points) move
 * up a league, and a week with zero points drops you one.
 */
import { createHash } from "crypto";
import { supabase } from "@/lib/supabase";
import { COURSE_ID } from "@/lib/learn/course";
import { getQuestionBank } from "./bank";
import { verifyDaily } from "./daily";
import {
  addDays,
  DAILY_N,
  DAILY_SECONDS,
  istDate,
  isDay,
  LEAGUE_RULES,
  LEAGUES,
  POINTS,
  weekStartOf,
  type Breakdown,
} from "./shared";

type Kind = keyof Breakdown;
type Item = { at: number; day: string; kind: Kind; key: string; pts: number };

export type Player = {
  id: string;
  name: string;
  tier: number;
  week: number;
  all: number;
  breakdownWeek: Breakdown;
  breakdownAll: Breakdown;
  dailyDays: Set<string>;
};

export type Board = { at: number; today: string; weekStart: string; weekEnd: string; players: Map<string, Player> };

const EVENT_NAMES = ["stage_done", "lesson_complete", "quiz_answer", "daily_result", "trial_result", "review_session"];
const PAGE = 1000;
const MAX_ROWS = 50_000;
const TTL = 60_000;

const g = globalThis as typeof globalThis & { __sdArenaBoard?: { at: number; p: Promise<Board> }; __sdArenaBoardOk?: Board; __sdArenaBoardBuilding?: boolean };

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

async function pageAll<T>(query: (from: number, to: number) => Page<T>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

type EventRow = { user_id: string; created_at: string; metadata: Record<string, unknown> | null };
type ProgressRow = { user_id: string; week: string; lesson_slug: string; completed_at: string | null; updated_at: string | null };
type StreakRow = { user_id: string; activity_date: string };
type ProfileRow = { id: string; full_name: string | null; profile_visibility: string | null };

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
const yes = (v: unknown) => v === true || v === "true" || v === 1;

/** "Himanshu Kukreja" → "Himanshu K."; private profiles and missing names → engineer-xxxx. */
export function displayName(id: string, fullName: string | null | undefined, visibility: string | null | undefined): string {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  if (visibility === "public" && parts.length) {
    const first = parts[0].slice(0, 18);
    const last = parts.length > 1 ? ` ${parts[parts.length - 1][0].toUpperCase()}.` : "";
    return `${first}${last}`;
  }
  return `engineer-${createHash("sha256").update(id).digest("hex").slice(0, 4)}`;
}

async function collect(): Promise<Map<string, Item[]>> {
  const [events, progress, streaks, bank] = await Promise.all([
    pageAll<EventRow>((a, b) =>
      supabase
        .from("analytics_events")
        .select("user_id, created_at, metadata")
        .eq("event_type", "event")
        .not("user_id", "is", null)
        .in("metadata->>name", EVENT_NAMES)
        .order("created_at", { ascending: true })
        .range(a, b),
    ),
    pageAll<ProgressRow>((a, b) =>
      supabase
        .from("learning_progress")
        .select("user_id, week, lesson_slug, completed_at, updated_at")
        .eq("course_id", COURSE_ID)
        .eq("status", "completed")
        .order("id", { ascending: true })
        .range(a, b),
    ),
    pageAll<StreakRow>((a, b) => supabase.from("learning_streaks").select("user_id, activity_date").order("id", { ascending: true }).range(a, b)),
    getQuestionBank().catch(() => null),
  ]);

  const items = new Map<string, Item[]>();
  const seen = new Set<string>();
  const perLesson = new Map<string, number>();
  const add = (user: string, it: Item) => {
    const k = `${user}|${it.key}`;
    if (seen.has(k)) return;
    seen.add(k);
    const list = items.get(user);
    if (list) list.push(it);
    else items.set(user, [it]);
  };
  const capped = (user: string, bucket: string, cap: number) => {
    const k = `${user}|${bucket}`;
    const n = perLesson.get(k) || 0;
    if (n >= cap) return true;
    perLesson.set(k, n + 1);
    return false;
  };

  // lessons (progress table first: the server-written source of truth)
  for (const r of progress) {
    const when = r.completed_at || r.updated_at;
    if (!r.user_id || !when) continue;
    const at = Date.parse(when);
    add(r.user_id, { at, day: istDate(at), kind: "lesson", key: `lesson:${r.week}/${r.lesson_slug}`, pts: POINTS.lesson });
  }
  for (const r of streaks) {
    if (!r.user_id || !isDay(r.activity_date)) continue;
    add(r.user_id, { at: Date.parse(`${r.activity_date}T12:00:00+05:30`), day: r.activity_date, kind: "active", key: `active:${r.activity_date}`, pts: POINTS.activeDay });
  }

  const dailyRuns: { user: string; at: number; date: string; picks: number[]; ms: number }[] = [];
  for (const e of events) {
    const m = e.metadata || {};
    const user = e.user_id;
    const at = Date.parse(e.created_at);
    if (!user || !Number.isFinite(at)) continue;
    const day = istDate(at);
    const course = str(m.course) || COURSE_ID;
    switch (m.name) {
      case "lesson_complete": {
        if (course !== COURSE_ID || !m.week || !m.lesson) break;
        add(user, { at, day, kind: "lesson", key: `lesson:${str(m.week)}/${str(m.lesson)}`, pts: POINTS.lesson });
        break;
      }
      case "stage_done": {
        if (course !== COURSE_ID || !m.week || !m.lesson || !m.stage) break;
        const key = `stage:${str(m.week)}/${str(m.lesson)}/${str(m.stage)}`;
        if (seen.has(`${user}|${key}`) || capped(user, `stage:${str(m.week)}/${str(m.lesson)}`, POINTS.stageCapPerLesson)) break;
        add(user, { at, day, kind: "stage", key, pts: POINTS.stage });
        break;
      }
      case "quiz_answer": {
        if (course !== COURSE_ID || !yes(m.correct) || !yes(m.first)) break;
        const id = `quiz:${COURSE_ID}/${str(m.week)}/${str(m.lesson)}:${str(m.block)}:${str(m.q)}`;
        const q = bank?.byId.get(id);
        // re-check the pick against the course source; unknown questions don't count
        if (!q || num(m.pick) !== q.answer) break;
        if (seen.has(`${user}|${id}`) || capped(user, `quiz:${str(m.week)}/${str(m.lesson)}`, POINTS.quizCapPerLesson)) break;
        add(user, { at, day, kind: "quiz", key: id, pts: POINTS.quiz });
        break;
      }
      case "daily_result": {
        if (yes(m.practice)) break;
        const date = str(m.date);
        // the run must be reported on its own IST day (a minute of grace past midnight)
        if (!isDay(date) || (date !== day && date !== istDate(at - 120_000))) break;
        const picks = str(m.picks)
          .split(",")
          .slice(0, DAILY_N)
          .map((x) => (x === "" ? -1 : Number(x)));
        dailyRuns.push({ user, at, date, picks, ms: num(m.ms) });
        break;
      }
      case "trial_result": {
        if (!yes(m.passed) || !m.week || !m.part) break;
        add(user, { at, day, kind: "trial", key: `trial:${str(m.week)}:${str(m.part)}`, pts: POINTS.trialPart });
        break;
      }
      case "review_session": {
        if (!(num(m.reviewed) >= 1)) break;
        add(user, { at, day, kind: "review", key: `review:${day}`, pts: POINTS.review });
        break;
      }
    }
  }

  // daily runs: first scored run per user per day, re-checked against that day's set
  const verified = new Map<string, Promise<{ correct: number; total: number } | null>>();
  for (const run of dailyRuns) {
    const key = `daily:${run.date}`;
    if (seen.has(`${run.user}|${key}`)) continue;
    const vk = `${run.date}|${run.picks.join(",")}`;
    if (!verified.has(vk)) verified.set(vk, verifyDaily(run.date, run.picks).catch(() => null));
    const v = await verified.get(vk);
    if (!v || !v.total) continue;
    const limit = v.total * DAILY_SECONDS * 1000;
    const speed = Number.isFinite(run.ms) && run.ms > 0 ? Math.max(0, 1 - run.ms / limit) : 0;
    const pts =
      v.correct * POINTS.dailyCorrect + (v.correct === v.total ? POINTS.dailyPerfect : 0) + Math.round(POINTS.dailySpeedMax * speed * (v.correct / v.total));
    add(run.user, { at: run.at, day: run.date, kind: "daily", key, pts });
  }
  return items;
}

function dailyStreak(days: Set<string>, today: string): number {
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export { dailyStreak };

async function build(): Promise<Board> {
  const now = Date.now();
  const today = istDate(now);
  const weekStart = weekStartOf(today);
  const weekEnd = addDays(weekStart, 6);
  const items = await collect();

  // per-day cap, then weekly totals per user
  const weekly = new Map<string, Map<string, number>>(); // user -> weekStart -> pts
  const players = new Map<string, Player>();
  for (const [user, list] of items) {
    list.sort((a, b) => a.at - b.at);
    const perDay = new Map<string, number>();
    const p: Player = { id: user, name: "", tier: 0, week: 0, all: 0, breakdownWeek: {}, breakdownAll: {}, dailyDays: new Set() };
    const wk = new Map<string, number>();
    for (const it of list) {
      const used = perDay.get(it.day) || 0;
      const pts = Math.max(0, Math.min(it.pts, POINTS.dayCap - used));
      perDay.set(it.day, used + pts);
      if (it.kind === "daily") p.dailyDays.add(it.day);
      if (!pts) continue;
      p.all += pts;
      p.breakdownAll[it.kind] = (p.breakdownAll[it.kind] || 0) + pts;
      const ws = weekStartOf(it.day);
      wk.set(ws, (wk.get(ws) || 0) + pts);
      if (ws === weekStart) {
        p.week += pts;
        p.breakdownWeek[it.kind] = (p.breakdownWeek[it.kind] || 0) + pts;
      }
    }
    weekly.set(user, wk);
    players.set(user, p);
  }

  // league replay over completed weeks
  const firstWeek = new Map<string, string>();
  let earliest = weekStart;
  for (const [user, wk] of weekly) {
    const weeks = [...wk.keys()].sort();
    if (weeks[0]) {
      firstWeek.set(user, weeks[0]);
      if (weeks[0] < earliest) earliest = weeks[0];
    }
  }
  const tier = new Map<string, number>();
  for (let w = earliest; w < weekStart; w = addDays(w, 7)) {
    const present = [...firstWeek.entries()].filter(([, f]) => f <= w).map(([u]) => u);
    const byTier = new Map<number, { u: string; pts: number }[]>();
    for (const u of present) {
      const t = tier.get(u) ?? 0;
      const pts = weekly.get(u)?.get(w) || 0;
      if (!byTier.has(t)) byTier.set(t, []);
      byTier.get(t)!.push({ u, pts });
    }
    for (const [t, list] of byTier) {
      const active = list.filter((x) => x.pts > 0).sort((a, b) => b.pts - a.pts);
      const n = Math.max(1, Math.ceil(active.length * LEAGUE_RULES.promoteShare));
      const up = new Set(active.slice(0, n).filter((x) => x.pts >= LEAGUE_RULES.promoteMin).map((x) => x.u));
      for (const x of list) {
        if (up.has(x.u)) tier.set(x.u, Math.min(LEAGUES.length - 1, t + 1));
        else if (x.pts === 0) tier.set(x.u, Math.max(0, t - 1));
        else tier.set(x.u, t);
      }
    }
  }
  for (const [u, p] of players) p.tier = tier.get(u) ?? 0;

  // names (never emails)
  const ids = [...players.keys()];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from("user_profiles").select("id, full_name, profile_visibility").in("id", ids.slice(i, i + 200));
    for (const r of (data || []) as ProfileRow[]) {
      const p = players.get(r.id);
      if (p) p.name = displayName(r.id, r.full_name, r.profile_visibility);
    }
  }
  for (const p of players.values()) if (!p.name) p.name = displayName(p.id, null, null);

  return { at: now, today, weekStart, weekEnd, players };
}

/**
 * Memoized for TTL; after that the last good board is served while a fresh one builds in the
 * background (stale-while-revalidate), so only the very first request waits for a full scoring pass.
 */
export async function getBoard(): Promise<Board> {
  const hit = g.__sdArenaBoard;
  const fresh = () => {
    const p = build();
    const entry = { at: Date.now(), p, ok: undefined as Board | undefined };
    p.then((b) => {
      entry.ok = b;
      g.__sdArenaBoard = entry;
      g.__sdArenaBoardOk = b;
    }).catch(() => {
      if (g.__sdArenaBoard === entry) g.__sdArenaBoard = undefined;
    });
    return entry;
  };
  if (hit && Date.now() - hit.at < TTL) return hit.p;
  const stale = g.__sdArenaBoardOk;
  if (stale) {
    if (!g.__sdArenaBoardBuilding) {
      g.__sdArenaBoardBuilding = true;
      fresh().p.finally(() => (g.__sdArenaBoardBuilding = false)).catch(() => {});
    }
    return stale;
  }
  const entry = fresh();
  g.__sdArenaBoard = entry;
  return entry.p;
}
