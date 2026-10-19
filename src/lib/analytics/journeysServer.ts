import "server-only";
import { POSTHOG_UI_HOST } from "./config";
import type { EmbedRes, LiveRes, PageDetailRes, PathsRes, PeopleRes, PersonInfo, PersonRes, PersonRow, Recording, RecordingsRes, StreamEvent, TimelineEvent } from "./journeys";
import { computePaths, describe, eventPropsSelect, parseElements, propsFrom, type PathRow, type TitleOf } from "./journeysModel";
import { appUrl, cached, uncache, hogql, iso, isUuid, NOISE, num, phFetch, PhError, softError, str, type Row } from "./posthogServer";
import { titleResolver } from "./titles";

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

export async function getLive(): Promise<LiveRes> {
  const [titleOf, liveRows, pageRows, eventRows] = await Promise.all([
    titleResolver(),
    hogql("SELECT count(DISTINCT person_id) FROM events WHERE timestamp > now() - INTERVAL 5 MINUTE", { name: "live_count", ttlMs: 25_000 }),
    hogql(
      "SELECT properties.$pathname AS path, count(DISTINCT person_id) AS n FROM events WHERE event = '$pageview' AND timestamp > now() - INTERVAL 5 MINUTE GROUP BY path ORDER BY n DESC LIMIT 10",
      { name: "live_pages", ttlMs: 25_000 }
    ),
    hogql(`SELECT ${STREAM_HEAD}, ${eventPropsSelect()} FROM events WHERE timestamp > now() - INTERVAL 1 DAY AND event NOT IN ${NOISE} ORDER BY timestamp DESC LIMIT 60`, {
      name: "live_stream",
      ttlMs: 25_000,
    }),
  ]);
  return {
    configured: true,
    live: num(liveRows[0]?.[0]),
    pages: pageRows.filter((r) => r[0]).map((r) => ({ path: String(r[0]), title: titleOf(String(r[0])), n: num(r[1]) })),
    events: eventRows.map((r) => streamEvent(r, titleOf)),
  };
}

/* ───────────────────────────── people ───────────────────────────── */

export async function getPeople(opts: { q: string; days: number; kind: "all" | "identified" | "anonymous" }): Promise<PeopleRes> {
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
      WHERE timestamp > now() - INTERVAL ${opts.days} DAY AND event NOT IN ${NOISE} ${where}
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

function mapRecording(r: ApiRecording, extra?: { pages: string[]; pageviews: number; rage: number; dead: number }): Recording {
  const props = r.person?.properties || {};
  const email = typeof props.email === "string" ? props.email : null;
  const name = typeof props.name === "string" ? props.name : null;
  let startUrl: string | null = r.start_url || null;
  try {
    if (startUrl) startUrl = new URL(startUrl).pathname;
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
  };
}

/** Per-session pages + frustration signals for a set of session ids (one HogQL query). */
async function sessionExtras(ids: string[]) {
  const safe = ids.filter(isUuid).slice(0, 200);
  const out = new Map<string, { pages: string[]; pageviews: number; rage: number; dead: number }>();
  if (!safe.length) return out;
  const rows = await hogql(
    `SELECT properties.$session_id AS sid,
        groupUniqArrayIf(properties.$pathname, event = '$pageview') AS pages,
        countIf(event = '$pageview') AS pv,
        countIf(event = '$rageclick') AS rage,
        countIf(event = '$dead_click') AS dead
      FROM events
      WHERE properties.$session_id IN (${safe.map((s) => `'${s}'`).join(", ")}) AND timestamp > now() - INTERVAL 90 DAY
      GROUP BY sid`,
    { name: "session_extras", ttlMs: 60_000 }
  ).catch(() => [] as Row[]);
  for (const r of rows) out.set(String(r[0]), { pages: Array.isArray(r[1]) ? (r[1] as unknown[]).filter(Boolean).map(String).slice(0, 6) : [], pageviews: num(r[2]), rage: num(r[3]), dead: num(r[4]) });
  return out;
}

async function listRecordings(params: Record<string, string>): Promise<{ results: ApiRecording[]; hasNext: boolean }> {
  const qs = new URLSearchParams(params).toString();
  const r = await cached(`rec:${qs}`, 30_000, () => phFetch<{ results?: ApiRecording[]; next?: string | null; has_next?: boolean }>(`/session_recordings/?${qs}`));
  return { results: r?.results ?? [], hasNext: !!(r?.has_next ?? r?.next) };
}

export async function getRecordings(opts: { person?: string | null; path?: string | null; days: number; offset: number; limit: number }): Promise<RecordingsRes> {
  const params: Record<string, string> = { limit: String(opts.limit), offset: String(opts.offset), date_from: `-${opts.days}d` };
  if (opts.person && isUuid(opts.person)) params.person_uuid = opts.person;
  const listed = await listRecordings(params);
  let results = listed.results;
  const hasNext = listed.hasNext;
  // belt and braces: keep only this person's recordings even if the filter param is ignored
  if (opts.person) results = results.filter((r) => !r.person?.uuid || r.person.uuid === opts.person);
  if (opts.path) {
    const path = opts.path.slice(0, 300);
    const rows = await hogql(
      `SELECT DISTINCT properties.$session_id FROM events WHERE event = '$pageview' AND properties.$pathname = {path} AND timestamp > now() - INTERVAL ${opts.days} DAY LIMIT 2000`,
      { name: "sessions_on_path", values: { path }, ttlMs: 60_000 }
    );
    const ids = new Set(rows.map((r) => String(r[0])));
    results = results.filter((r) => ids.has(r.id));
  }
  const extras = await sessionExtras(results.map((r) => r.id));
  return { configured: true, recordings: results.map((r) => mapRecording(r, extras.get(r.id))), hasNext };
}

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

export async function resolvePersonId(idOrDistinct: string): Promise<string | null> {
  // A PostHog person UUID, or a distinct id (signed-in learners: their Supabase user id, also a UUID).
  // Try it as a distinct id first; fall back to treating a UUID as the person id itself.
  const d = idOrDistinct.slice(0, 200);
  const rows = await hogql("SELECT person_id FROM events WHERE distinct_id = {d} ORDER BY timestamp DESC LIMIT 1", { name: "resolve_person", values: { d }, ttlMs: 300_000 });
  return str(rows[0]?.[0]) || (isUuid(d) ? d : null);
}

const EVENT_LIMIT = 1500;

export async function getPerson(idOrDistinct: string, days: number): Promise<PersonRes | null> {
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
        WHERE person_id = toUUID('${id}') AND timestamp > now() - INTERVAL ${days} DAY AND event NOT IN ${NOISE}
        ORDER BY timestamp DESC LIMIT ${EVENT_LIMIT}`,
      { name: "person_events", ttlMs: 30_000 }
    ),
    getRecordings({ person: id, days: Math.max(days, 30), offset: 0, limit: 50 }).then(
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

/* ───────────────────────────── paths & funnel ───────────────────────────── */

export async function getPaths(days: number): Promise<PathsRes> {
  const [titleOf, rows] = await Promise.all([
    titleResolver(),
    hogql(
      `SELECT event, toString(person_id), properties.$session_id, properties.$pathname, timestamp
        FROM events
        WHERE timestamp > now() - INTERVAL ${days} DAY AND event IN ('$pageview', 'lesson_open', 'stage_done', 'lesson_complete')
        ORDER BY timestamp ASC
        LIMIT 50000`,
      { name: "paths", ttlMs: 5 * 60_000 }
    ),
  ]);
  const data: PathRow[] = rows.map((r) => [String(r[0]), String(r[1]), str(r[2]), str(r[3]), iso(r[4]) || ""]);
  return { configured: true, ...computePaths(data, titleOf, days) };
}

/* ───────────────────────────── one page (clicks + read depth) ───────────────────────────── */

export async function getPage(path: string, days: number): Promise<PageDetailRes> {
  const clean = path.split(/[?#]/)[0].slice(0, 300) || "/";
  const [titleOf, clickRows, depthRows] = await Promise.all([
    titleResolver(),
    hogql(
      `SELECT coalesce(properties.$el_text, '') AS text, any(elements_chain) AS chain, countIf(event = '$autocapture') AS n, countIf(event = '$rageclick') AS rage
        FROM events
        WHERE event IN ('$autocapture', '$rageclick') AND properties.$pathname = {path} AND timestamp > now() - INTERVAL ${days} DAY
        GROUP BY text ORDER BY n + rage DESC LIMIT 20`,
      { name: "page_clicks", values: { path: clean }, ttlMs: 5 * 60_000 }
    ),
    hogql(
      `SELECT toInt(properties.pct) AS pct, count(DISTINCT person_id) AS readers
        FROM events
        WHERE event = 'read_progress' AND properties.$pathname = {path} AND timestamp > now() - INTERVAL ${days} DAY
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
