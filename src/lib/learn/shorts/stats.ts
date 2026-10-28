import "server-only";
/**
 * Shorts engagement from the first-party events (analytics_events, the owner's test traffic dropped)
 * plus the social tables. One pass, used by /admin/shorts and by the feed's "top" order.
 *
 *   lecture_play { short }              the short started playing
 *   short_watch  { short, sec, pct,     one per view, when it leaves the screen or the page hides
 *                  loops, done }        (sent since 28 Oct 2026)
 *   short_open   { short, to }          "full lecture" / "read it" pressed
 *   short_save / short_comments_open / lecture_share { channel: "short" } / lecture_vote { short }
 *   lecture_votes, bookmarks (course "shorts"), lesson_comments (course "shorts")   all-time counts
 */
import { supabase } from "@/lib/supabase";
import { dropInternal } from "@/lib/analytics/excludeServer";

type Row = { created_at: string; visitor_id: string | null; user_id: string | null; metadata: Record<string, unknown> | null };

export type ShortStat = {
  id: string;
  plays: number;
  viewers: number;
  /** short_watch views */
  views: number;
  /** seconds watched, all views */
  sec: number;
  /** mean furthest point reached (0–1) */
  reach: number;
  /** views that finished (or looped) */
  done: number;
  /** views under 3 s */
  skips: number;
  toLecture: number;
  toArticle: number;
  shares: number;
  votes: number;
  saves: number;
  comments: number;
  last: string | null;
};

export type ShortsStats = {
  days: number;
  totals: { plays: number; viewers: number; views: number; minutes: number; done: number; skips: number; toLecture: number; toArticle: number; votes: number; saves: number; comments: number };
  daily: { day: string; viewers: number; minutes: number; views: number }[];
  shorts: ShortStat[];
};

const NAMES = "(lecture_play,short_watch,short_open,short_save,short_comments_open,lecture_share,lecture_vote)";

async function events(since: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; from < 200_000; from += 1000) {
    const { data, error } = await supabase
      .from("analytics_events")
      .select("created_at, visitor_id, user_id, metadata")
      .eq("event_type", "event")
      .filter("metadata->>name", "in", NAMES)
      .not("metadata->>short", "is", null)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`analytics_events: ${error.message}`);
    rows.push(...((data || []) as Row[]));
    if (!data || data.length < 1000) break;
  }
  return dropInternal(rows);
}

/** Rows per short id in a table (all time); `course` narrows to course_id = "shorts". */
async function countBy(table: string, col: string, course?: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const base = supabase.from(table).select(col).limit(50_000);
  const { data } = await (course ? base.eq("course_id", course) : base);
  for (const r of (data || []) as unknown as Record<string, string>[]) {
    const k = r[col];
    if (k && k.startsWith("shorts--")) out.set(k, (out.get(k) || 0) + 1);
  }
  return out;
}

export async function shortsStats(days = 30): Promise<ShortsStats> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [rows, votes, saves, comments] = await Promise.all([
    events(since),
    countBy("lecture_votes", "lecture_id"),
    countBy("bookmarks", "lesson_slug", "shorts"),
    countBy("lesson_comments", "lesson_slug", "shorts"),
  ]);

  const per = new Map<string, ShortStat & { who: Set<string>; reachSum: number }>();
  const daily = new Map<string, { who: Set<string>; sec: number; views: number }>();
  const viewers = new Set<string>();
  const get = (id: string) => {
    let p = per.get(id);
    if (!p) per.set(id, (p = { id, plays: 0, viewers: 0, views: 0, sec: 0, reach: 0, done: 0, skips: 0, toLecture: 0, toArticle: 0, shares: 0, votes: 0, saves: 0, comments: 0, last: null, who: new Set(), reachSum: 0 }));
    return p;
  };
  for (const r of rows) {
    const m = r.metadata || {};
    const id = String(m.short || "");
    if (!id) continue;
    const name = String(m.name || "");
    const who = r.user_id || r.visitor_id || "anon";
    const p = get(id);
    p.last = r.created_at;
    const day = r.created_at.slice(0, 10);
    const d = daily.get(day) || { who: new Set<string>(), sec: 0, views: 0 };
    if (name === "lecture_play") {
      p.plays++;
      p.who.add(who);
      viewers.add(who);
      d.who.add(who);
    } else if (name === "short_watch") {
      const sec = Math.max(0, Math.min(900, Number(m.sec) || 0));
      p.views++;
      p.sec += sec;
      p.reachSum += Math.max(0, Math.min(1, Number(m.pct) || 0));
      if (m.done === true || m.done === "true") p.done++;
      if (sec < 3) p.skips++;
      p.who.add(who);
      viewers.add(who);
      d.who.add(who);
      d.sec += sec;
      d.views++;
    } else if (name === "short_open") {
      if (m.to === "article") p.toArticle++;
      else p.toLecture++;
    } else if (name === "lecture_share") p.shares++;
    daily.set(day, d);
  }
  for (const [id, n] of votes) get(id).votes = n;
  for (const [id, n] of saves) get(id).saves = n;
  for (const [id, n] of comments) get(id).comments = n;

  const shorts: ShortStat[] = [...per.values()].map(({ who, reachSum, ...p }) => ({ ...p, viewers: who.size, reach: p.views ? Math.round((reachSum / p.views) * 100) / 100 : 0, sec: Math.round(p.sec) }));
  const series: ShortsStats["daily"] = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const d = daily.get(k);
    series.push({ day: k, viewers: d?.who.size || 0, minutes: Math.round(((d?.sec || 0) / 60) * 10) / 10, views: d?.views || 0 });
  }
  const sum = (f: (s: ShortStat) => number) => shorts.reduce((a, s) => a + f(s), 0);
  return {
    days,
    totals: {
      plays: sum((s) => s.plays),
      viewers: viewers.size,
      views: sum((s) => s.views),
      minutes: Math.round(sum((s) => s.sec) / 60),
      done: sum((s) => s.done),
      skips: sum((s) => s.skips),
      toLecture: sum((s) => s.toLecture),
      toArticle: sum((s) => s.toArticle),
      votes: sum((s) => s.votes),
      saves: sum((s) => s.saves),
      comments: sum((s) => s.comments),
    },
    daily: series,
    shorts,
  };
}

/**
 * Engagement score for the feed's "top" order: upvotes, saves, discussion and finished views count,
 * smoothed by viewers so a short seen twice with one upvote doesn't beat one seen by hundreds.
 */
export const shortScore = (s: ShortStat) => (5 * s.votes + 4 * s.saves + 3 * s.comments + 2 * (s.toLecture + s.shares) + s.done + 1) / (s.viewers + 4);

/** Ids of the best shorts (only ones somebody engaged with), best first. */
export async function topShortIds(limit = 60, days = 30): Promise<string[]> {
  const st = await shortsStats(days);
  return st.shorts
    .filter((s) => s.votes + s.saves + s.comments + s.done + s.toLecture > 0)
    .sort((a, b) => shortScore(b) - shortScore(a) || b.viewers - a.viewers)
    .slice(0, limit)
    .map((s) => s.id);
}
