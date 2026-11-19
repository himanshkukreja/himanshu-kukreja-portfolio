import "server-only";
import { isExcludedEmail, isLocalHost } from "./exclude";
import { POSTHOG_UI_HOST } from "./config";
import { DSA_PATH_SQL, STAGING_HOST_SQL, isStagingHost, matchesCourse, type Course, type SessionCourse } from "./courseFilter";
import { isSubstantialRecording, substantialHavingPredicates } from "./recordingFilter";
import type { EmbedRes, LiveRes, PageDetailRes, PathsRes, PeopleRes, PersonInfo, PersonRes, PersonRow, Recording, RecordingsRes, StreamEvent, TimelineEvent } from "./journeys";
import { computePaths, describe, eventPropsSelect, parseElements, propsFrom, type PathRow, type TitleOf } from "./journeysModel";
import { appUrl, cached, uncache, hogql, iso, isUuid, NOISE, INTERNAL, num, phFetch, PhError, softError, str, type Row } from "./posthogServer";
import { titleResolver } from "./titles";
import { sharedCache } from "@/lib/admin/sharedCache";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.himanshukukreja.in").replace(/\/$/, "");

export const whoOf = (email: string | null, name: string | null, distinct: string | null, personId: string | null) =>
  email || name || (distinct ? `anon ${distinct.slice(-6)}` : personId ? `anon ${personId.slice(-6)}` : "anonymous");

/* ───────────────────────────── live ───────────────────────────── */

const STREAM_HEAD = "uuid, event, timestamp, elements_chain, person_id, distinct_id, person.properties.email, person.properties.name";
const STREAM_OFFSET = 8;

function streamEvent(r: Row, titleOf: TitleOf): StreamEvent {
  const p = propsFrom(r, STREAM_OFFSET);
  const event = String(r[1]);
  const d = describe(event, p, str(r[3]), titleOf);
  const email = str(r[6]);
  const name = str(r[7]);
  const path = (p.$pathname as string) || null;
  return {
    id: String(r[0]),
    t: iso(r[2]) || new Date().toISOString(),
    event,
    label: d.label,
    kind: d.kind,
    path,
    title: titleOf(path),
    personId: str(r[4]),
    who: whoOf(email, name, str(r[5]), str(r[4])),
    identified: !!email,
    country: (p.$geoip_country_code as string) || null,
    city: (p.$geoip_city_name as string) || null,
    device: (p.$device_type as string) || null,
    session: (p.$session_id as string) || null,
  };
}

async function computeLive(): Promise<LiveRes> {
  const [titleOf, nowRows, eventRows] = await Promise.all([
    titleResolver(),
    // visitors in the last 5 min + the pages they're on (distinct people per path), one query
    hogql(
      `SELECT count(DISTINCT person_id), groupUniqArrayIf(tuple(properties.$pathname, toString(person_id)), event = '$pageview')
        FROM events WHERE timestamp > now() - INTERVAL 5 MINUTE ${INTERNAL}`,
      { name: "live_now", ttlMs: 10_000 }
    ),
    hogql(`SELECT ${STREAM_HEAD}, ${eventPropsSelect()} FROM events WHERE timestamp > now() - INTERVAL 1 DAY AND event NOT IN ${NOISE} ${INTERNAL} ORDER BY timestamp DESC LIMIT 60`, {
      name: "live_stream",
      ttlMs: 10_000,
    }),
  ]);
  const byPath = new Map<string, number>();
  for (const t of (Array.isArray(nowRows[0]?.[1]) ? nowRows[0][1] : []) as unknown[]) {
    const path = Array.isArray(t) ? str(t[0]) : null;
    if (path) byPath.set(path, (byPath.get(path) ?? 0) + 1);
  }
  return {
    configured: true,
    live: num(nowRows[0]?.[0]),
    pages: [...byPath.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([path, n]) => ({ path, title: titleOf(path), n })),
    events: eventRows.map((r) => streamEvent(r, titleOf)),
  };
}

/** Journeys → Live tab (polled): shared across instances, refreshed in the background every 30 s. */
export const getLive = sharedCache("journeys_live", computeLive, { revalidate: 30, maxAge: 300 });

/* ───────────────────────────── people ───────────────────────────── */

async function computePeople(opts: { q: string; days: number; kind: "all" | "identified" | "anonymous" }): Promise<PeopleRes> {
  const q = opts.q.trim().slice(0, 80);
  const where = q
    ? "AND (person.properties.email ILIKE {q} OR person.properties.name ILIKE {q} OR distinct_id ILIKE {q} OR toString(person_id) ILIKE {q} OR properties.$geoip_country_code ILIKE {q} OR properties.$geoip_city_name ILIKE {q})"
    : "";
  const having = opts.kind === "identified" ? "HAVING email IS NOT NULL AND email != ''" : opts.kind === "anonymous" ? "HAVING email IS NULL OR email = ''" : "";
  const rows = await hogql(
    `SELECT person_id,
        any(distinct_id) AS did,
        any(person.properties.email) AS email,
        any(person.properties.name) AS name,
        any(person.created_at) AS created,
        max(timestamp) AS last_seen,
        count(DISTINCT properties.$session_id) AS sessions,
        countIf(event = '$pageview') AS pageviews,
        count() AS n,
        argMax(properties.$geoip_country_code, timestamp) AS country,
        argMax(properties.$geoip_city_name, timestamp) AS city,
        argMax(properties.$device_type, timestamp) AS device,
        argMax(properties.$browser, timestamp) AS browser,
        argMax(properties.$os, timestamp) AS os,
        argMin(properties.$referring_domain, timestamp) AS referrer,
        topK(3)(if(event = '$pageview', properties.$pathname, NULL)) AS top_pages
      FROM events
      WHERE timestamp > now() - INTERVAL ${opts.days} DAY AND event NOT IN ${NOISE} ${INTERNAL} ${where}
      GROUP BY person_id
      ${having}
      ORDER BY last_seen DESC
      LIMIT 300`,
    { name: "people", values: q ? { q: `%${q}%` } : undefined, ttlMs: 30_000 }
  );
  const people: PersonRow[] = rows
    .filter((r) => r[0])
    .map((r) => {
      const email = str(r[2]);
      const ref = str(r[14]);
      return {
        id: String(r[0]),
        distinctId: String(r[1] ?? ""),
        email,
        name: str(r[3]),
        identified: !!email,
        firstSeen: iso(r[4]),
        lastSeen: iso(r[5]) || "",
        sessions: num(r[6]),
        pageviews: num(r[7]),
        events: num(r[8]),
        country: str(r[9]),
        city: str(r[10]),
        device: str(r[11]),
        browser: str(r[12]),
        os: str(r[13]),
        referrer: ref === "$direct" ? "direct" : ref,
        topPages: Array.isArray(r[15]) ? (r[15] as unknown[]).filter(Boolean).map(String) : [],
      };
    });
  return { configured: true, people, days: opts.days };
}

export const getPeople = sharedCache("journeys_people", computePeople, { revalidate: 120, maxAge: 3600 });

/* ───────────────────────────── recordings ───────────────────────────── */

export type ApiRecording = {
  id: string;
  distinct_id?: string;
  viewed?: boolean;
  recording_duration?: number;
  active_seconds?: number;
  start_time?: string;
  end_time?: string;
  click_count?: number;
  keypress_count?: number;
  console_error_count?: number;
  start_url?: string;
  ongoing?: boolean;
  person?: { uuid?: string; name?: string; distinct_ids?: string[]; properties?: Record<string, unknown> | null } | null;
};

function mapRecording(r: ApiRecording, extra: { pages: string[]; pageviews: number; rage: number; dead: number } | undefined, course: SessionCourse): Recording {
  const props = r.person?.properties || {};
  const email = typeof props.email === "string" ? props.email : null;
  const name = typeof props.name === "string" ? props.name : null;
  let startUrl: string | null = r.start_url || null;
  let host = "";
  try {
    if (startUrl) {
      const u = new URL(startUrl);
      host = u.host;
      startUrl = u.pathname;
    }
  } catch {
    /* keep raw */
  }
  return {
    id: r.id,
    start: r.start_time || "",
    end: r.end_time || null,
    duration: num(r.recording_duration),
    active: num(r.active_seconds),
    clicks: num(r.click_count),
    keys: num(r.keypress_count),
    errors: num(r.console_error_count),
    startUrl,
    personId: r.person?.uuid || null,
    who: whoOf(email, name, r.distinct_id || null, r.person?.uuid || null),
    identified: !!email,
    ongoing: !!r.ongoing,
    viewed: !!r.viewed,
    pages: extra?.pages ?? (startUrl ? [startUrl] : []),
    pageviews: extra?.pageviews ?? 0,
    rage: extra?.rage ?? 0,
    dead: extra?.dead ?? 0,
    course,
    staging: isStagingHost(host),
  };
}

/**
 * Per-session pages + frustration signals for a set of session ids (one HogQL query). `since` = the oldest
 * recording's start: the scan covers those sessions' days, not the last 90.
 */
async function sessionExtras(ids: string[], since: number | null) {
  const safe = ids.filter(isUuid).slice(0, 200);
  const out = new Map<string, { pages: string[]; pageviews: number; rage: number; dead: number }>();
  if (!safe.length) return out;
  const from = new Date(Math.max(since != null && Number.isFinite(since) ? since - 3600_000 : 0, Date.now() - 90 * 86400_000)).toISOString();
  const rows = await hogql(
    `SELECT properties.$session_id AS sid,
        groupUniqArrayIf(properties.$pathname, event = '$pageview') AS pages,
        countIf(event = '$pageview') AS pv,
        countIf(event = '$rageclick') AS rage,
        countIf(event = '$dead_click') AS dead
      FROM events
      WHERE properties.$session_id IN (${safe.map((s) => `'${s}'`).join(", ")}) AND timestamp > toDateTime({from})
      GROUP BY sid`,
    { name: "session_extras", values: { from }, ttlMs: 60_000 }
  ).catch(() => [] as Row[]);
  for (const r of rows) out.set(String(r[0]), { pages: Array.isArray(r[1]) ? (r[1] as unknown[]).filter(Boolean).map(String).slice(0, 6) : [], pageviews: num(r[2]), rage: num(r[3]), dead: num(r[4]) });
  return out;
}

async function listRecordings(params: Record<string, string>): Promise<{ results: ApiRecording[]; hasNext: boolean }> {
  const qs = new URLSearchParams(params).toString();
  const r = await cached(`rec:${qs}`, 30_000, () => phFetch<{ results?: ApiRecording[]; next?: string | null; has_next?: boolean }>(`/session_recordings/?${qs}`));
  return { results: r?.results ?? [], hasNext: !!(r?.has_next ?? r?.next) };
}

const COURSE_IDS_MAX = 250;

/**
 * Sessions that visited /dsa in the last `days` (+1) days, newest first: id → class. Everything not in this map never
 * touched /dsa ("sdm"). `entryDsa` = the session's first pageview was a /dsa page; `staging` = any pageview on a staging host.
 */
async function dsaSessions(days: number): Promise<Map<string, { course: SessionCourse; staging: boolean }>> {
  const rows = await hogql(
    `SELECT properties.$session_id AS sid,
        argMin(${DSA_PATH_SQL}, timestamp) AS entry_dsa,
        max(${STAGING_HOST_SQL}) AS stg
      FROM events
      WHERE event = '$pageview' AND timestamp > now() - INTERVAL ${days + 1} DAY AND notEmpty(coalesce(properties.$session_id, '')) ${INTERNAL}
      GROUP BY sid
      HAVING countIf(${DSA_PATH_SQL}) > 0
      ORDER BY max(timestamp) DESC
      LIMIT 5000`,
    { name: "dsa_sessions", ttlMs: 60_000 }
  );
  const out = new Map<string, { course: SessionCourse; staging: boolean }>();
  for (const r of rows) if (r[0]) out.set(String(r[0]), { course: num(r[1]) ? "dsa" : "sdm-dsa", staging: !!num(r[2]) });
  return out;
}

const hostOf = (r: ApiRecording) => {
  try {
    return r.start_url ? new URL(r.start_url).host : "";
  } catch {
    return "";
  }
};

async function computeRecordings(opts: { person?: string | null; path?: string | null; days: number; offset: number; limit: number; includeIdle?: boolean; course?: Course; includeStaging?: boolean }): Promise<RecordingsRes> {
  const course = opts.course ?? "all";
  const includeStaging = opts.includeStaging !== false;
  const base: Record<string, string> = { date_from: `-${opts.days}d` };
  if (opts.person && isUuid(opts.person)) base.person_uuid = opts.person;
  // only recordings with real activity (server-side, so pages aren't left short or empty); idle ones on request
  if (!opts.includeIdle) base.having_predicates = substantialHavingPredicates();
  // sessions that viewed the page (path filter): asked alongside the replay list, not after it
  const pathSessions = opts.path
    ? hogql(
        `SELECT DISTINCT properties.$session_id FROM events WHERE event = '$pageview' AND properties.$pathname = {path} AND timestamp > now() - INTERVAL ${opts.days} DAY LIMIT 2000`,
        { name: "sessions_on_path", values: { path: opts.path.slice(0, 300) }, ttlMs: 60_000 }
      ).then((rows) => new Set(rows.map((r) => String(r[0]))))
    : Promise.resolve(null);
  pathSessions.catch(() => null);
  // class per session (needed for the filter and the row tag); a failed lookup shows everything as SDM rather than failing the list
  const dsa = await dsaSessions(opts.days).catch(() => new Map<string, { course: SessionCourse; staging: boolean }>());
  const courseOf = (id: string): SessionCourse => dsa.get(id)?.course ?? "sdm";
  // internal traffic: the owner's test accounts and localhost sessions aren't shown; staging unless asked for
  const keep = (r: ApiRecording) => {
    const email = typeof r.person?.properties?.email === "string" ? (r.person.properties.email as string) : null;
    const host = hostOf(r);
    if (isExcludedEmail(email) || isLocalHost(host)) return false;
    if (!includeStaging && (isStagingHost(host) || dsa.get(r.id)?.staging)) return false;
    if (opts.person && r.person?.uuid && r.person.uuid !== opts.person) return false;
    if (!opts.includeIdle && !isSubstantialRecording(r.active_seconds)) return false;
    return matchesCourse(course, courseOf(r.id));
  };
  const onPath = await pathSessions;
  const keepAll = (r: ApiRecording) => keep(r) && (!onPath || onPath.has(r.id));

  let results: ApiRecording[];
  let hasNext: boolean;
  if (course === "dsa" || course === "sdm-dsa") {
    // the recordings API takes the session ids itself, so pages stay full and ordered: ask only for the sessions in the class
    const ids = [...dsa.entries()]
      .filter(([id, v]) => matchesCourse(course, v.course) && (includeStaging || !v.staging))
      .map(([id]) => id)
      .slice(0, COURSE_IDS_MAX);
    if (!ids.length) return { configured: true, recordings: [], hasNext: false };
    const listed = await listRecordings({ ...base, session_ids: JSON.stringify(ids), limit: String(opts.limit), offset: String(opts.offset) });
    results = listed.results.filter(keepAll);
    hasNext = listed.hasNext;
  } else if (course === "all" && includeStaging && !opts.path) {
    const listed = await listRecordings({ ...base, limit: String(opts.limit), offset: String(opts.offset) });
    results = listed.results.filter(keepAll);
    hasNext = listed.hasNext;
  } else {
    // SDM only / staging left out / page filter: keep reading PostHog pages until this page is full (or the history runs out)
    const RAW = 100;
    const MAX_SCANS = 12;
    const want = opts.offset + opts.limit + 1;
    const kept: ApiRecording[] = [];
    let raw = 0;
    let more = true;
    for (let i = 0; i < MAX_SCANS && more && kept.length < want; i++, raw += RAW) {
      const listed = await listRecordings({ ...base, limit: String(RAW), offset: String(raw) });
      kept.push(...listed.results.filter(keepAll));
      more = listed.hasNext;
    }
    results = kept.slice(opts.offset, opts.offset + opts.limit);
    // (if the scan cap is hit first, older matches beyond it aren't offered)
    hasNext = kept.length > opts.offset + opts.limit;
  }
  const starts = results.map((r) => Date.parse(r.start_time || "")).filter(Number.isFinite);
  const extras = await sessionExtras(
    results.map((r) => r.id),
    starts.length ? Math.min(...starts) : null
  );
  return { configured: true, recordings: results.map((r) => mapRecording(r, extras.get(r.id), courseOf(r.id))), hasNext };
}

/** Replay list (Journeys → Recordings, person pages): shared across instances, 60 s. */
export const getRecordings = sharedCache("journeys_recordings", computeRecordings, { revalidate: 60, maxAge: 900 });

/** Turn on sharing for one recording and return PostHog's embeddable player URL. */
export async function shareRecording(id: string, enabled = true): Promise<EmbedRes> {
  if (!isUuid(id)) throw new PhError("Bad recording id", 400);
  // a revoke invalidates the cached token (and vice versa)
  uncache(`share:${id}:${!enabled}`);
  const res = await cached(`share:${id}:${enabled}`, enabled ? 6 * 3600_000 : 1, () =>
    phFetch<{ access_token?: string; enabled?: boolean }>(`/session_recordings/${id}/sharing/`, { method: "PATCH", body: JSON.stringify({ enabled }) })
  ).catch((e: PhError) => {
    if (e?.upstream === 404) return null;
    throw e;
  });
  const token = res?.enabled && res.access_token ? res.access_token : null;
  return { configured: true, id, embedUrl: token ? `${POSTHOG_UI_HOST}/embedded/${token}` : null, appUrl: appUrl(`/replay/${id}`), shared: !!token };
}

/* ───────────────────────────── person ───────────────────────────── */

async function lookupPerson(d: string): Promise<string | null> {
  const rows = await hogql("SELECT person_id FROM events WHERE distinct_id = {d} ORDER BY timestamp DESC LIMIT 1", { name: "resolve_person", values: { d }, ttlMs: 300_000 });
  return str(rows[0]?.[0]);
}
/** distinct id → person: stable, so it's shared for a day */
const personOf = sharedCache("journeys_person_id", lookupPerson, { revalidate: 6 * 3600, maxAge: 86400 });

export async function resolvePersonId(idOrDistinct: string): Promise<string | null> {
  // A PostHog person UUID, or a distinct id (signed-in learners: their Supabase user id, also a UUID).
  // Try it as a distinct id first; fall back to treating a UUID as the person id itself.
  const d = idOrDistinct.slice(0, 200);
  return (await personOf(d)) || (isUuid(d) ? d : null);
}

const EVENT_LIMIT = 1500;

async function computePerson(idOrDistinct: string, days: number): Promise<PersonRes | null> {
  const id = await resolvePersonId(idOrDistinct);
  if (!id || !isUuid(id)) return null;
  const [titleOf, infoRows, eventRows, recs] = await Promise.all([
    titleResolver(),
    hogql(
      `SELECT any(distinct_id), any(person.properties.email), any(person.properties.name), any(person.created_at),
          argMax(properties.$geoip_country_code, timestamp), argMax(properties.$geoip_city_name, timestamp),
          argMax(properties.$device_type, timestamp), argMax(properties.$browser, timestamp), argMax(properties.$os, timestamp),
          argMin(properties.$referring_domain, timestamp), count()
        FROM events WHERE person_id = toUUID('${id}') AND timestamp > now() - INTERVAL 365 DAY`,
      { name: "person_info", ttlMs: 60_000 }
    ),
    hogql(
      `SELECT uuid, event, timestamp, elements_chain, ${eventPropsSelect()}
        FROM events
        WHERE person_id = toUUID('${id}') AND timestamp > now() - INTERVAL ${days} DAY AND event NOT IN ${NOISE} ${INTERNAL}
        ORDER BY timestamp DESC LIMIT ${EVENT_LIMIT}`,
      { name: "person_events", ttlMs: 30_000 }
    ),
    getRecordings({ person: id, days: Math.max(days, 30), offset: 0, limit: 50, includeIdle: true }).then(
      (r) => ({ recordings: r.recordings, error: null }),
      (e) => ({ recordings: [] as Recording[], error: softError(e) })
    ),
  ]);
  const i = infoRows[0] || [];
  if (!eventRows.length && !num(i[10])) return null;
  const email = str(i[1]);
  const ref = str(i[9]);
  const person: PersonInfo = {
    id,
    distinctId: str(i[0]),
    email,
    name: str(i[2]),
    identified: !!email,
    createdAt: iso(i[3]),
    country: str(i[4]),
    city: str(i[5]),
    device: str(i[6]),
    browser: str(i[7]),
    os: str(i[8]),
    referrer: ref === "$direct" ? "direct" : ref,
    appUrl: appUrl(`/person/${encodeURIComponent(str(i[0]) || id)}`),
  };
  const events: TimelineEvent[] = eventRows.map((r) => {
    const p = propsFrom(r, 4);
    const event = String(r[1]);
    const d = describe(event, p, str(r[3]), titleOf);
    return { id: String(r[0]), t: iso(r[2]) || "", event, kind: d.kind, label: d.label, detail: d.detail, path: (p.$pathname as string) || null, session: (p.$session_id as string) || null };
  });
  return { configured: true, person, events, recordings: recs.recordings, recordingsError: recs.error, days, truncated: eventRows.length >= EVENT_LIMIT };
}

/** One person's profile, timeline and replays: shared across instances, 60 s. */
export const getPerson = sharedCache("journeys_person", computePerson, { revalidate: 60, maxAge: 900 });

/* ───────────────────────────── paths & funnel ───────────────────────────── */

async function computePaths_(days: number): Promise<PathsRes> {
  const [titleOf, rows] = await Promise.all([
    titleResolver(),
    hogql(
      `SELECT event, toString(person_id), properties.$session_id, properties.$pathname, timestamp
        FROM events
        WHERE timestamp > now() - INTERVAL ${days} DAY AND event IN ('$pageview', 'lesson_open', 'stage_done', 'lesson_complete') ${INTERNAL}
        ORDER BY timestamp ASC
        LIMIT 50000`,
      { name: "paths", ttlMs: 5 * 60_000 }
    ),
  ]);
  const data: PathRow[] = rows.map((r) => [String(r[0]), String(r[1]), str(r[2]), str(r[3]), iso(r[4]) || ""]);
  return { configured: true, ...computePaths(data, titleOf, days) };
}

/** Entry/exit pages, paths, learn funnel over 7–90 days: shared, 10 min. */
export const getPaths = sharedCache("journeys_paths", computePaths_, { revalidate: 600, maxAge: 6 * 3600 });

/* ───────────────────────────── one page (clicks + read depth) ───────────────────────────── */

async function computePage(path: string, days: number): Promise<PageDetailRes> {
  const clean = path.split(/[?#]/)[0].slice(0, 300) || "/";
  const [titleOf, clickRows, depthRows] = await Promise.all([
    titleResolver(),
    hogql(
      `SELECT coalesce(properties.$el_text, '') AS text, any(elements_chain) AS chain, countIf(event = '$autocapture') AS n, countIf(event = '$rageclick') AS rage
        FROM events
        WHERE event IN ('$autocapture', '$rageclick') AND properties.$pathname = {path} AND timestamp > now() - INTERVAL ${days} DAY ${INTERNAL}
        GROUP BY text ORDER BY n + rage DESC LIMIT 20`,
      { name: "page_clicks", values: { path: clean }, ttlMs: 5 * 60_000 }
    ),
    hogql(
      `SELECT toInt(properties.pct) AS pct, count(DISTINCT person_id) AS readers
        FROM events
        WHERE event = 'read_progress' AND properties.$pathname = {path} AND timestamp > now() - INTERVAL ${days} DAY ${INTERNAL}
        GROUP BY pct ORDER BY pct`,
      { name: "page_depth", values: { path: clean }, ttlMs: 5 * 60_000 }
    ),
  ]);
  const siteUrl = `${SITE}${clean}`;
  return {
    configured: true,
    path: clean,
    title: titleOf(clean),
    clicks: clickRows.map((r) => {
      const el = parseElements(str(r[1]));
      return { text: str(r[0]) || el.text || `(${el.tag || "element"} without text)`, tag: el.tag, n: num(r[2]), rage: num(r[3]) };
    }),
    depth: [25, 50, 75, 100].map((pct) => ({ pct, readers: num(depthRows.find((r) => num(r[0]) === pct)?.[1]) })),
    heatmapUrl: appUrl(`/heatmaps?pageURL=${encodeURIComponent(siteUrl)}`),
    toolbarUrl: appUrl("/toolbar"),
    siteUrl,
  };
}

/** One page's clicks and reading depth: shared, 10 min. */
export const getPage = sharedCache("journeys_page", computePage, { revalidate: 600, maxAge: 6 * 3600 });
