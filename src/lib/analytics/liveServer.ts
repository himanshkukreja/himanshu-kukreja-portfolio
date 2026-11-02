import "server-only";
import { sharedCache } from "@/lib/admin/sharedCache";
import type { LiveEvent, LiveFeedRes, LiveFilter, LiveHeadRes, LiveRec, LiveReplaysRes, LiveSession, LiveSessionsRes, LiveWindow } from "./journeys";
import { describe, EVENT_PROPS, propsFrom } from "./journeysModel";
import { whoOf } from "./journeysServer";
import { hogql, iso, isUuid, NOISE, INTERNAL, num, softError, str, type Row } from "./posthogServer";
import { titleResolver } from "./titles";

/**
 * /admin/live — one feed of recent sessions (events grouped by $session_id) with their replays, served in three parts
 * so the slow bits never hold up the rest (GET /api/admin/posthog/feed?part=…):
 *
 * - head: online now, sessions/people today, events in the last hour, events per minute (30 min) and the pages
 *   people are on: ONE HogQL query (was three).
 * - sessions: the session list with each session's latest events: ONE HogQL query (the per-session timeline is an
 *   array aggregated in the same GROUP BY; was a second, sequential query).
 * - replays: which of those sessions have a replay, from HogQL's raw_session_replay_events (~1 s) instead of the
 *   session_recordings REST list (2–7 s), bounded by the sessions' own start (UUIDv7 ids carry it).
 *
 * Each part sits in the shared data cache (lib/admin/sharedCache.ts): every Vercel instance serves the last result at
 * once and refreshes it in the background, so a poll costs a cache read, not a PostHog round trip.
 */

export const LIVE_WINDOWS: Record<LiveWindow, { sql: string; ms: number }> = {
  "30m": { sql: "INTERVAL 30 MINUTE", ms: 30 * 60_000 },
  "24h": { sql: "INTERVAL 1 DAY", ms: 24 * 3600_000 },
  "7d": { sql: "INTERVAL 7 DAY", ms: 7 * 86400_000 },
};
export const isLiveWindow = (v: string | null): v is LiveWindow => !!v && v in LIVE_WINDOWS;
export const isLiveFilter = (v: string | null): v is LiveFilter => v === "all" || v === "signed" || v === "learn" || v === "recorded";

const PAGE = 40;
const TIMELINE = 40;
const ACTIVE_MS = 5 * 60_000;
/** most session ids one replays lookup takes */
export const REPLAY_IDS_MAX = 120;

/* ───────────────────────────── head ───────────────────────────── */

const ago = "dateDiff('minute', toStartOfMinute(timestamp), toStartOfMinute(now()))";
const perMinuteCols = Array.from({ length: 30 }, (_, i) => `countIf(${ago} = ${i} AND timestamp > now() - INTERVAL 30 MINUTE AND event NOT IN ${NOISE} ${INTERNAL})`).join(",\n      ");

async function computeHead(): Promise<LiveHeadRes> {
  const [titleOf, rows] = await Promise.all([
    titleResolver(),
    hogql(
      `SELECT uniqIf(person_id, timestamp > now() - INTERVAL 5 MINUTE),
        uniqIf(properties.$session_id, timestamp >= toStartOfDay(now())),
        uniqIf(person_id, timestamp >= toStartOfDay(now())),
        countIf(timestamp > now() - INTERVAL 1 HOUR AND event NOT IN ${NOISE} ${INTERNAL}),
        groupUniqArrayIf(tuple(properties.$pathname, toString(person_id)), event = '$pageview' AND timestamp > now() - INTERVAL 5 MINUTE ${INTERNAL}),
        ${perMinuteCols}
      FROM events WHERE timestamp > now() - INTERVAL 1 DAY`,
      { name: "live_head", ttlMs: 10_000 }
    ),
  ]);
  const r = rows[0] || [];
  // ago 0 = this minute → last slot (oldest first)
  const perMinute = Array.from({ length: 30 }, (_, i) => num(r[5 + 29 - i]));
  // pages people are on: distinct people per path (last 5 min), top 8
  const byPath = new Map<string, number>();
  for (const t of (Array.isArray(r[4]) ? r[4] : []) as unknown[]) {
    const path = Array.isArray(t) ? str(t[0]) : null;
    if (path) byPath.set(path, (byPath.get(path) ?? 0) + 1);
  }
  const pages = [...byPath.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([path, n]) => ({ path, title: titleOf(path), n }));
  return {
    configured: true,
    generatedAt: new Date().toISOString(),
    stats: { online: num(r[0]), sessionsToday: num(r[1]), peopleToday: num(r[2]), eventsHour: num(r[3]) },
    perMinute,
    pages,
  };
}

/**
 * Any age is served at once (the page shows "updated N ago" from generatedAt and asks again a few seconds later,
 * by which time the background refresh has landed): the first paint never waits for PostHog.
 */
export const getLiveHead = sharedCache("live_head", computeHead, { revalidate: 30, maxAge: 86400 });

/* ───────────────────────────── sessions ───────────────────────────── */

/** latest TIMELINE events of the session, oldest first: (uuid, event, timestamp, elements_chain, …EVENT_PROPS) */
const TIMELINE_COL = `arraySlice(arraySort(x -> x.3, groupArray(tuple(uuid, event, timestamp, elements_chain, ${EVENT_PROPS.map((p) => `properties.${p}`).join(", ")}))), -${TIMELINE}) AS tl`;

const SESSION_COLS = `properties.$session_id AS sid,
    argMax(person_id, timestamp) AS pid,
    argMax(distinct_id, timestamp) AS did,
    argMax(person.properties.email, timestamp) AS email,
    argMax(person.properties.name, timestamp) AS name,
    min(timestamp) AS start,
    max(timestamp) AS last,
    count() AS n,
    countIf(event = '$pageview') AS pv,
    argMinIf(properties.$pathname, timestamp, event = '$pageview') AS entry,
    argMaxIf(properties.$pathname, timestamp, event = '$pageview') AS cur,
    argMax(properties.$geoip_country_code, timestamp) AS cc,
    argMax(properties.$geoip_city_name, timestamp) AS city,
    argMax(properties.$device_type, timestamp) AS dev,
    argMax(properties.$browser, timestamp) AS br,
    argMax(properties.$os, timestamp) AS os,
    argMin(properties.$referring_domain, timestamp) AS ref,
    countIf(startsWith(coalesce(properties.$pathname, ''), '/learn') OR endsWith(coalesce(properties.$host, ''), 'systemdesignmastery.dev')) AS learn,
    ${TIMELINE_COL}`;

async function computeSessions(window: LiveWindow, filter: LiveFilter, before: string | null): Promise<LiveSessionsRes> {
  const w = LIVE_WINDOWS[window].sql;
  const having = [
    `max(timestamp) > now() - ${w}`,
    before ? "max(timestamp) < toDateTime({before})" : null,
    filter === "signed" ? "email IS NOT NULL AND email != ''" : null,
    filter === "learn" ? "learn > 0" : null,
  ].filter(Boolean);
  // "has replay": sessions PostHog holds a replay for (same table the replays part reads)
  const recorded =
    filter === "recorded" ? `AND properties.$session_id IN (SELECT session_id FROM raw_session_replay_events WHERE min_first_timestamp > now() - ${w} - INTERVAL 1 DAY)` : "";

  const [titleOf, rows] = await Promise.all([
    titleResolver(),
    hogql(
      `SELECT ${SESSION_COLS}
        FROM events
        WHERE timestamp > now() - ${w} - INTERVAL 1 DAY
          AND event NOT IN ${NOISE} ${INTERNAL}
          AND notEmpty(coalesce(properties.$session_id, ''))
          ${recorded}
        GROUP BY sid
        HAVING ${having.join(" AND ")}
        ORDER BY last DESC
        LIMIT ${PAGE + 1}`,
      { name: `live_sessions_${window}_${filter}`, values: before ? { before } : undefined, ttlMs: 10_000 }
    ),
  ]);

  const now = Date.now();
  const sessions: LiveSession[] = rows
    .filter((r) => r[0])
    .slice(0, PAGE)
    .map((r: Row) => {
      const id = String(r[0]);
      const email = str(r[3]);
      const start = iso(r[5]) || "";
      const last = iso(r[6]) || "";
      const entry = str(r[9]);
      const cur = str(r[10]);
      const ref = str(r[16]);
      const timeline: LiveEvent[] = ((Array.isArray(r[18]) ? r[18] : []) as unknown[][])
        .map((e) => {
          const p = propsFrom(e, 4);
          const event = String(e[1]);
          const d = describe(event, p, str(e[3]), titleOf);
          return { id: String(e[0]), t: iso(e[2]) || "", event, kind: d.kind, label: d.label, detail: d.detail, path: (p.$pathname as string) || null };
        });
      return {
        id,
        personId: str(r[1]),
        who: whoOf(email, str(r[4]), str(r[2]), str(r[1])),
        identified: !!email,
        start,
        last,
        duration: Math.max(0, Math.round((new Date(last).getTime() - new Date(start).getTime()) / 1000)),
        events: num(r[7]),
        pageviews: num(r[8]),
        entry: entry ? { path: entry, title: titleOf(entry) } : null,
        current: cur ? { path: cur, title: titleOf(cur) } : null,
        country: str(r[11]),
        city: str(r[12]),
        device: str(r[13]),
        browser: str(r[14]),
        os: str(r[15]),
        referrer: ref === "$direct" ? "direct" : ref,
        active: now - new Date(last).getTime() < ACTIVE_MS,
        recording: null,
        timeline,
      };
    });

  return { configured: true, window, filter, generatedAt: new Date().toISOString(), sessions, hasMore: rows.length > PAGE };
}

/** the newest page refreshes every 30 s; older pages (`before`) barely change */
const latestSessions = sharedCache("live_sessions", (window: LiveWindow, filter: LiveFilter) => computeSessions(window, filter, null), { revalidate: 30, maxAge: 86400 });
const olderSessions = sharedCache("live_sessions_before", computeSessions, { revalidate: 120, maxAge: 1800 });

export function getLiveSessions(opts: { window: LiveWindow; filter: LiveFilter; before?: string | null }): Promise<LiveSessionsRes> {
  const t = opts.before ? new Date(opts.before).getTime() : NaN;
  return Number.isNaN(t) ? latestSessions(opts.window, opts.filter) : olderSessions(opts.window, opts.filter, new Date(t).toISOString());
}

/* ───────────────────────────── replays ───────────────────────────── */

/** ms timestamp in a UUIDv7 (PostHog session ids), else null */
function v7Time(id: string): number | null {
  const hex = id.replace(/-/g, "");
  if (hex[12] !== "7") return null;
  const t = parseInt(hex.slice(0, 12), 16);
  return Number.isFinite(t) && t > 1.6e12 && t < Date.now() + 86400_000 ? t : null;
}

async function computeReplays(ids: string[]): Promise<LiveReplaysRes> {
  const recordings: Record<string, LiveRec> = {};
  if (!ids.length) return { configured: true, generatedAt: new Date().toISOString(), recordings, error: null };
  // replay rows start with the session: bound the scan by the oldest session's start (less a day of slack)
  const starts = ids.map(v7Time);
  const oldest = starts.every((t) => t != null) ? Math.min(...(starts as number[])) : Date.now() - 8 * 86400_000;
  const since = new Date(Math.max(oldest - 86400_000, Date.now() - 30 * 86400_000)).toISOString();
  try {
    const rows = await hogql(
      `SELECT session_id,
          dateDiff('second', min(min_first_timestamp), max(max_last_timestamp)),
          sum(active_milliseconds),
          max(_timestamp) >= now() - INTERVAL 5 MINUTE
        FROM raw_session_replay_events
        WHERE session_id IN (${ids.map((s) => `'${s}'`).join(", ")}) AND min_first_timestamp > toDateTime({since})
        GROUP BY session_id`,
      { name: "live_replays", values: { since }, ttlMs: 10_000 }
    );
    for (const r of rows) {
      const id = String(r[0]);
      recordings[id] = { id, duration: num(r[1]), active: Math.floor(num(r[2]) / 1000), ongoing: !!num(r[3]) };
    }
    return { configured: true, generatedAt: new Date().toISOString(), recordings, error: null };
  } catch (e) {
    return { configured: true, generatedAt: new Date().toISOString(), recordings, error: softError(e) };
  }
}

const replaysCached = sharedCache("live_replays", computeReplays, { revalidate: 60, maxAge: 300 });

/** Which of these sessions have a replay (ids sorted + deduped so the same set shares a cache entry). */
export function getLiveReplays(ids: string[]): Promise<LiveReplaysRes> {
  const safe = [...new Set(ids.filter(isUuid).map((s) => s.toLowerCase()))].sort().slice(0, REPLAY_IDS_MAX);
  return replaysCached(safe);
}

/* ───────────────────────────── all in one (older clients) ───────────────────────────── */

export async function getLiveFeed(opts: { window: LiveWindow; filter: LiveFilter; before?: string | null }): Promise<LiveFeedRes> {
  const [head, list] = await Promise.all([getLiveHead(), getLiveSessions(opts)]);
  const recs = await getLiveReplays(list.sessions.map((s) => s.id));
  return {
    ...list,
    stats: head.stats,
    perMinute: head.perMinute,
    pages: head.pages,
    sessions: list.sessions.map((s) => ({ ...s, recording: recs.recordings[s.id] ?? null })),
    recordingsError: recs.error,
  };
}
