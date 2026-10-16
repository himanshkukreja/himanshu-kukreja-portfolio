import "server-only";
import type { LiveEvent, LiveFeedRes, LiveFilter, LiveSession, LiveWindow } from "./journeys";
import { describe, eventPropsSelect, propsFrom, type TitleOf } from "./journeysModel";
import { whoOf, type ApiRecording } from "./journeysServer";
import { cached, hogql, iso, isUuid, NOISE, num, phFetch, softError, str, type Row } from "./posthogServer";
import { titleResolver } from "./titles";

/**
 * /admin/live — one feed of recent sessions (events grouped by $session_id) with their replays.
 *
 * Per poll: stats + per-minute + live pages (3 small queries, 10 s cache), the session list (one
 * GROUP BY $session_id query), the latest events of those sessions (one query, LIMIT n BY session)
 * and one session_recordings list call filtered to those session ids (which ones have a replay and
 * whether it is still ongoing). All cached for ~10 s so several admin tabs share them.
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
    countIf(startsWith(coalesce(properties.$pathname, ''), '/learn')) AS learn`;

async function stats() {
  const [s, m, p] = await Promise.all([
    hogql(
      `SELECT uniqIf(person_id, timestamp > now() - INTERVAL 5 MINUTE),
          uniqIf(properties.$session_id, timestamp >= toStartOfDay(now())),
          uniqIf(person_id, timestamp >= toStartOfDay(now())),
          countIf(timestamp > now() - INTERVAL 1 HOUR AND event NOT IN ${NOISE})
        FROM events WHERE timestamp > now() - INTERVAL 1 DAY`,
      { name: "live_stats", ttlMs: 10_000 }
    ),
    hogql(
      `SELECT dateDiff('minute', toStartOfMinute(timestamp), toStartOfMinute(now())) AS ago, count()
        FROM events WHERE timestamp > now() - INTERVAL 30 MINUTE AND event NOT IN ${NOISE}
        GROUP BY ago`,
      { name: "live_per_minute", ttlMs: 10_000 }
    ),
    hogql(
      "SELECT properties.$pathname AS path, count(DISTINCT person_id) AS n FROM events WHERE event = '$pageview' AND timestamp > now() - INTERVAL 5 MINUTE GROUP BY path ORDER BY n DESC LIMIT 8",
      { name: "live_pages", ttlMs: 10_000 }
    ),
  ]);
  const perMinute = Array.from({ length: 30 }, () => 0);
  for (const r of m) {
    const ago = num(r[0]);
    if (ago >= 0 && ago < 30) perMinute[29 - ago] = num(r[1]);
  }
  const row = s[0] || [];
  return {
    stats: { online: num(row[0]), sessionsToday: num(row[1]), peopleToday: num(row[2]), eventsHour: num(row[3]) },
    perMinute,
    pages: p.filter((r) => r[0]).map((r) => ({ path: String(r[0]), n: num(r[1]) })),
  };
}

type Rec = { id: string; duration: number; active: number; ongoing: boolean };

/** Which of these sessions have a replay (session_recordings list filtered by session id). */
async function recordingsFor(ids: string[], days: number): Promise<Map<string, Rec>> {
  const safe = ids.filter(isUuid);
  const out = new Map<string, Rec>();
  if (!safe.length) return out;
  const qs = new URLSearchParams({ limit: String(safe.length), date_from: `-${days}d`, session_ids: JSON.stringify(safe) }).toString();
  const r = await cached(`live_rec:${qs}`, 10_000, () => phFetch<{ results?: ApiRecording[] }>(`/session_recordings/?${qs}`));
  for (const x of r?.results ?? []) out.set(x.id, { id: x.id, duration: num(x.recording_duration), active: num(x.active_seconds), ongoing: !!x.ongoing });
  return out;
}

async function timelines(ids: string[], window: LiveWindow, titleOf: TitleOf): Promise<Map<string, LiveEvent[]>> {
  const out = new Map<string, LiveEvent[]>();
  const safe = ids.filter(isUuid);
  if (!safe.length) return out;
  const rows = await hogql(
    `SELECT properties.$session_id AS sid, uuid, event, timestamp, elements_chain, ${eventPropsSelect()}
      FROM events
      WHERE properties.$session_id IN (${safe.map((s) => `'${s}'`).join(", ")})
        AND timestamp > now() - ${LIVE_WINDOWS[window].sql} - INTERVAL 1 DAY AND event NOT IN ${NOISE}
      ORDER BY timestamp DESC
      LIMIT ${TIMELINE} BY sid`,
    { name: "live_timelines", ttlMs: 10_000 }
  );
  for (const r of rows) {
    const sid = String(r[0]);
    const p = propsFrom(r, 5);
    const event = String(r[2]);
    const d = describe(event, p, str(r[4]), titleOf);
    const list = out.get(sid) || [];
    list.push({ id: String(r[1]), t: iso(r[3]) || "", event, kind: d.kind, label: d.label, detail: d.detail, path: (p.$pathname as string) || null });
    out.set(sid, list);
  }
  for (const list of out.values()) list.reverse();
  return out;
}

export async function getLiveFeed(opts: { window: LiveWindow; filter: LiveFilter; before?: string | null }): Promise<LiveFeedRes> {
  const { window, filter } = opts;
  const before = opts.before && !Number.isNaN(new Date(opts.before).getTime()) ? new Date(opts.before).toISOString() : null;
  const having = [
    `max(timestamp) > now() - ${LIVE_WINDOWS[window].sql}`,
    before ? "max(timestamp) < toDateTime({before})" : null,
    filter === "signed" ? "email IS NOT NULL AND email != ''" : null,
    filter === "learn" ? "learn > 0" : null,
  ].filter(Boolean);
  // "has replay" is known only after the recordings lookup: over-fetch, then filter.
  const limit = filter === "recorded" ? 120 : PAGE;

  const [titleOf, head, sessionRows] = await Promise.all([
    titleResolver(),
    stats(),
    hogql(
      `SELECT ${SESSION_COLS}
        FROM events
        WHERE timestamp > now() - ${LIVE_WINDOWS[window].sql} - INTERVAL 1 DAY
          AND event NOT IN ${NOISE}
          AND notEmpty(coalesce(properties.$session_id, ''))
        GROUP BY sid
        HAVING ${having.join(" AND ")}
        ORDER BY last DESC
        LIMIT ${limit + 1}`,
      { name: `live_sessions_${window}_${filter}`, values: before ? { before } : undefined, ttlMs: 10_000 }
    ),
  ]);

  const rows = sessionRows.filter((r) => r[0]).slice(0, limit);
  let hasMore = sessionRows.length > limit;
  const ids = rows.map((r) => String(r[0]));
  const days = Math.ceil(LIVE_WINDOWS[window].ms / 86400_000) + 1;

  const [recs, lines] = await Promise.all([
    recordingsFor(ids, days).then(
      (m) => ({ m, error: null }),
      (e) => ({ m: new Map<string, Rec>(), error: softError(e) })
    ),
    timelines(ids, window, titleOf),
  ]);

  const now = Date.now();
  let sessions: LiveSession[] = rows.map((r: Row) => {
    const id = String(r[0]);
    const email = str(r[3]);
    const start = iso(r[5]) || "";
    const last = iso(r[6]) || "";
    const entry = str(r[9]);
    const cur = str(r[10]);
    const ref = str(r[16]);
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
      recording: recs.m.get(id) ?? null,
      timeline: lines.get(id) ?? [],
    };
  });
  if (filter === "recorded") {
    sessions = sessions.filter((s) => s.recording);
    hasMore = hasMore || sessions.length > PAGE;
    sessions = sessions.slice(0, PAGE);
  }

  return {
    configured: true,
    window,
    filter,
    generatedAt: new Date().toISOString(),
    stats: head.stats,
    perMinute: head.perMinute,
    pages: head.pages.map((p) => ({ ...p, title: titleOf(p.path) })),
    sessions,
    hasMore,
    recordingsError: recs.error,
  };
}
