import "server-only";
import type { OfflinePerson, OfflineRes } from "./journeys";
import { hogql, iso, num, softError, str, type Row } from "./posthogServer";
import { whoOf } from "./journeysServer";

/**
 * /admin Overview → "Offline reading": who saves the course for offline reading, what, how much,
 * installs of the app, and reading that happened with no connection. Read-only HogQL over the
 * events the site sends (src/lib/offline/analytics.ts has the vocabulary):
 *   offline_save / offline_update / offline_remove / offline_open / pwa_install_prompt / pwa_installed,
 *   learning events flagged `offline: true`, the display_mode super property on $pageview, and the
 *   offline_saved_count / offline_saved_bytes person properties.
 */

/** Learning events that count as "reading offline" when flagged offline. */
const READS = "('lesson_open', 'stage_reach', 'stage_done', 'lesson_complete', 'quiz_answer', 'read_progress', 'trial_result', 'case_checkpoint', 'case_closed', 'case_activity', 'review_session', 'daily_result')";
const OFFLINE = "toString(properties.offline) = 'true'";
const OFFLINE_EVENTS = "('offline_save', 'offline_update', 'offline_remove', 'offline_open', 'pwa_install_prompt', 'pwa_installed')";

export const OFFLINE_DAYS = [1, 7, 30, 90, 365];
export const clampOfflineDays = (v: string | null) => {
  const n = Number(v);
  return OFFLINE_DAYS.includes(n) ? n : 30;
};

const TTL = 60_000;

async function section<T>(errors: Record<string, string>, name: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    errors[name] = softError(e).error;
    return fallback;
  }
}

export async function getOffline(days: number): Promise<OfflineRes> {
  const d = Math.round(days);
  const since = `timestamp > now() - INTERVAL ${d} DAY`;
  const errors: Record<string, string> = {};

  const [savers, stored, totals, byScope, topArticles, topWorlds, installs, prompts, modes, series, recent] = await Promise.all([
    section(errors, "savers", { d7: 0, d30: 0, all: 0, bytesAll: 0 }, async () => {
      const r = (
        await hogql(
          `SELECT uniqIf(person_id, timestamp > now() - INTERVAL 7 DAY), uniqIf(person_id, timestamp > now() - INTERVAL 30 DAY), uniq(person_id), sum(toFloat(properties.bytes))
           FROM events WHERE event = 'offline_save' AND toFloat(properties.items) > 0`,
          { name: "offline_savers", ttlMs: TTL }
        )
      )[0] as Row | undefined;
      return { d7: num(r?.[0]), d30: num(r?.[1]), all: num(r?.[2]), bytesAll: num(r?.[3]) };
    }),
    section(errors, "stored", null as OfflineRes["stored"], async () => {
      const r = (
        await hogql("SELECT count(), sum(toFloat(properties.offline_saved_bytes)) FROM persons WHERE toFloat(properties.offline_saved_count) > 0", {
          name: "offline_stored",
          ttlMs: TTL,
        })
      )[0] as Row | undefined;
      return { people: num(r?.[0]), bytes: num(r?.[1]) };
    }),
    section(errors, "totals", { saves: 0, bytes: 0, updates: 0, removes: 0, opens: 0, reads: 0, offlinePeople: 0, installs: 0 }, async () => {
      const r = (
        await hogql(
          `SELECT
             countIf(event = 'offline_save'),
             sumIf(toFloat(properties.bytes), event = 'offline_save' OR event = 'offline_update'),
             countIf(event = 'offline_update'),
             countIf(event = 'offline_remove'),
             countIf(event = 'offline_open'),
             countIf(event IN ${READS}),
             uniqIf(person_id, event = 'offline_open' OR event IN ${READS}),
             uniqIf(person_id, event = 'pwa_installed')
           FROM events
           WHERE ${since} AND (event IN ${OFFLINE_EVENTS} OR (event IN ${READS} AND ${OFFLINE}))`,
          { name: "offline_totals", ttlMs: TTL }
        )
      )[0] as Row | undefined;
      return { saves: num(r?.[0]), bytes: num(r?.[1]), updates: num(r?.[2]), removes: num(r?.[3]), opens: num(r?.[4]), reads: num(r?.[5]), offlinePeople: num(r?.[6]), installs: num(r?.[7]) };
    }),
    section(errors, "scope", [] as OfflineRes["byScope"], async () =>
      (
        await hogql(
          `SELECT properties.scope AS scope, count() AS n, uniq(person_id), sum(toFloat(properties.bytes))
           FROM events WHERE event = 'offline_save' AND ${since} GROUP BY scope ORDER BY n DESC`,
          { name: "offline_scope", ttlMs: TTL }
        )
      ).map((r) => ({ scope: str(r[0]) ?? "unknown", saves: num(r[1]), people: num(r[2]), bytes: num(r[3]) }))
    ),
    section(errors, "articles", [] as OfflineRes["topArticles"], async () =>
      (
        await hogql(
          `SELECT properties.slug AS slug, any(properties.week), any(properties.kind), argMax(properties.title, timestamp), uniq(person_id) AS people, count() AS n
           FROM events WHERE event = 'offline_save' AND properties.scope = 'article' AND toFloat(properties.items) > 0 AND ${since}
           GROUP BY slug ORDER BY people DESC, n DESC LIMIT 10`,
          { name: "offline_articles", ttlMs: TTL }
        )
      )
        .filter((r) => r[0])
        .map((r) => ({ slug: String(r[0]), week: str(r[1]), kind: str(r[2]), title: str(r[3]), people: num(r[4]), saves: num(r[5]) }))
    ),
    section(errors, "worlds", [] as OfflineRes["topWorlds"], async () =>
      (
        await hogql(
          `SELECT properties.group AS grp, argMax(properties.title, timestamp), uniq(person_id) AS people, count() AS n
           FROM events WHERE event = 'offline_save' AND properties.scope IN ('world', 'collection') AND toFloat(properties.items) > 0 AND ${since}
           GROUP BY grp ORDER BY people DESC, n DESC LIMIT 10`,
          { name: "offline_worlds", ttlMs: TTL }
        )
      )
        .filter((r) => r[0])
        .map((r) => ({ group: String(r[0]), title: str(r[1]), people: num(r[2]), saves: num(r[3]) }))
    ),
    section(errors, "installs", [] as OfflineRes["installs"], async () =>
      (
        await hogql(
          `SELECT properties.platform AS platform, properties.via AS via, uniq(person_id) AS people
           FROM events WHERE event = 'pwa_installed' AND ${since} GROUP BY platform, via ORDER BY people DESC`,
          { name: "offline_installs", ttlMs: TTL }
        )
      ).map((r) => ({ platform: str(r[0]) ?? "unknown", via: str(r[1]) ?? "unknown", people: num(r[2]) }))
    ),
    section(errors, "prompts", [] as OfflineRes["prompts"], async () =>
      (
        await hogql(`SELECT properties.outcome AS outcome, count() AS n FROM events WHERE event = 'pwa_install_prompt' AND ${since} GROUP BY outcome ORDER BY n DESC`, {
          name: "offline_prompts",
          ttlMs: TTL,
        })
      ).map((r) => ({ outcome: str(r[0]) ?? "unknown", n: num(r[1]) }))
    ),
    section(errors, "modes", [] as OfflineRes["modes"], async () =>
      (
        await hogql(
          `SELECT properties.display_mode AS mode, uniq(person_id) AS people
           FROM events WHERE event = '$pageview' AND ${since} AND properties.display_mode IS NOT NULL AND properties.display_mode != ''
           GROUP BY mode ORDER BY people DESC`,
          { name: "offline_modes", ttlMs: TTL }
        )
      ).map((r) => ({ mode: String(r[0]), people: num(r[1]) }))
    ),
    section(errors, "series", [] as OfflineRes["series"], async () => {
      const bucket = d <= 1 ? "toStartOfHour(timestamp)" : d > 90 ? "toStartOfWeek(timestamp)" : "toStartOfDay(timestamp)";
      const rows = await hogql(
        `SELECT ${bucket} AS t, countIf(event = 'offline_open'), countIf(event IN ${READS}), countIf(event = 'offline_save')
         FROM events WHERE ${since} AND (event IN ('offline_open', 'offline_save') OR (event IN ${READS} AND ${OFFLINE}))
         GROUP BY t ORDER BY t`,
        { name: "offline_series", ttlMs: TTL }
      );
      return fillSeries(
        rows.map((r) => ({ t: iso(r[0]) || "", opens: num(r[1]), reads: num(r[2]), saves: num(r[3]) })).filter((p) => p.t),
        d
      );
    }),
    section(errors, "recent", [] as OfflinePerson[], async () =>
      (
        await hogql(
          `SELECT person_id, any(person.properties.email), any(person.properties.name), any(distinct_id), max(timestamp) AS last,
             countIf(event = 'offline_open'), countIf(event IN ${READS}), countIf(event = 'offline_save'),
             argMax(properties.display_mode, timestamp), argMax(properties.$device_type, timestamp), argMax(properties.$geoip_country_code, timestamp)
           FROM events
           WHERE ${since} AND (event IN ('offline_open', 'offline_save', 'offline_update', 'offline_remove', 'pwa_installed') OR (event IN ${READS} AND ${OFFLINE}))
           GROUP BY person_id ORDER BY last DESC LIMIT 12`,
          { name: "offline_recent", ttlMs: TTL }
        )
      )
        .filter((r) => r[0])
        .map((r) => {
          const email = str(r[1]);
          return {
            personId: String(r[0]),
            who: whoOf(email, str(r[2]), str(r[3]), String(r[0])),
            identified: !!email,
            lastAt: iso(r[4]) || "",
            opens: num(r[5]),
            reads: num(r[6]),
            saves: num(r[7]),
            mode: str(r[8]),
            device: str(r[9]),
            country: str(r[10]),
          };
        })
    ),
  ]);

  return { configured: true, days: d, savers, stored, totals, byScope, topArticles, topWorlds, installs, prompts, modes, series, recent, errors };
}

/** Zero-filled buckets for the chart (hours for 24h, weeks past 90 days, days otherwise). */
function fillSeries(points: OfflineRes["series"], days: number): OfflineRes["series"] {
  const step = days <= 1 ? 3600_000 : days > 90 ? 7 * 86400_000 : 86400_000;
  const n = days <= 1 ? 24 : days > 90 ? Math.ceil(days / 7) : days;
  if (!points.length) {
    const now = Date.now();
    const start = now - (n - 1) * step;
    return Array.from({ length: n }, (_, i) => ({ t: new Date(Math.floor((start + i * step) / step) * step).toISOString(), opens: 0, reads: 0, saves: 0 }));
  }
  // keep PostHog's own bucket boundaries (project timezone), fill the gaps between them
  const byT = new Map(points.map((p) => [Date.parse(p.t), p]));
  let last = Math.max(...byT.keys());
  while (last + step <= Date.now()) last += step; // the chart ends now, not at the last event
  const out: OfflineRes["series"] = [];
  for (let i = n - 1; i >= 0; i--) {
    const t = last - i * step;
    const hit = [...byT.entries()].find(([k]) => Math.abs(k - t) < step / 2)?.[1];
    out.push(hit ?? { t: new Date(t).toISOString(), opens: 0, reads: 0, saves: 0 });
  }
  return out;
}
