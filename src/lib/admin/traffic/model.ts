/**
 * Normalised analytics rows + bot / internal detection for the traffic report.
 * Pure (no Supabase, no server-only) so it can be unit-tested against exported data.
 */
import { channelFor, cleanHost, isOwnHost, type Channel } from "@/lib/analytics/channels";
import { isBotUA, parseUA } from "@/lib/analytics/ua";

/** Columns selected from analytics_events (keep in sync with load.ts). */
export const COLUMNS =
  "event_type,page_path,page_title,visitor_id,session_id,referrer_domain,utm_source,utm_medium,utm_campaign,user_agent,device_type,browser,os,screen_width,screen_height,country,city,ip_address,created_at,duration,metadata,user_id";

export type RawRow = {
  event_type: string;
  page_path: string;
  page_title?: string | null;
  visitor_id: string;
  session_id: string;
  referrer_domain?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  user_agent?: string | null;
  device_type?: string | null;
  browser?: string | null;
  os?: string | null;
  screen_width?: number | null;
  screen_height?: number | null;
  country?: string | null;
  city?: string | null;
  ip_address?: string | null;
  created_at: string;
  duration?: number | null;
  metadata?: Record<string, unknown> | null;
  user_id?: string | null;
};

export type Kind = "pv" | "pl" | "ev" | "other";

export type Ev = {
  t: number;
  kind: Kind;
  path: string;
  title: string | null;
  vid: string;
  sid: string;
  uid: string | null;
  /** cleaned external referrer host, null for none / own host */
  ref: string | null;
  utmS: string | null;
  utmM: string | null;
  utmC: string | null;
  device: string;
  browser: string;
  os: string;
  country: string | null;
  city: string | null;
  /** page_leave: engaged ms */
  dur: number | null;
  /** page_leave: max scroll % */
  depth: number | null;
  /** client view id (page_view / page_leave / event) */
  pv: string | null;
  /** event name for kind "ev" */
  name: string | null;
  props: Record<string, unknown> | null;
  entry: boolean;
  /** row-level bot reason, or null */
  bot: string | null;
  /** device fingerprint for crawler clusters: UA | screen | city */
  fp: string;
  internal: boolean;
};

const DC_CITIES = /^(Ashburn|Boydton|Council Bluffs|The Dalles|Manassas|Quincy|Moncks Corner|Lenoir|Prineville|Forest City|Boardman)$/i;

/**
 * Row-level bot rules, tuned on the real data (Jan–Oct 2026):
 * - UA regex (contract list + vercel-screenshot, GoogleOther, NotebookLM, Bytespider…): ~45% of rows;
 * - Bytespider's stealth twin: CN + 375×812 viewport with rotating desktop/Android UAs, one view per
 *   visitor (the "CN burst" pattern) — and any 375×812 screen whose UA is not an iPhone;
 * - DevTools device emulation UA (`iPhone OS 13_2_3`), headless default screens 800×600 / 1280×1200
 *   (the SG / US data-centre crawlers).
 */
type BotFields = Pick<RawRow, "user_agent" | "screen_width" | "screen_height" | "country"> & { page_path?: string | null };

export function isLikelyBot(row: BotFields): boolean {
  return botReason(row) !== null;
}

const PROBE_PATH = /\.(txt|xml|php|env|ini|ya?ml|bak|sql|asp|aspx|cgi)$|\/wp-|\/\.git|\/\.well-known/i;

export function botReason(row: BotFields): string | null {
  const ua = row.user_agent || "";
  if (isBotUA(ua)) return "ua";
  if (row.page_path && PROBE_PATH.test(row.page_path)) return "probe";
  const w = row.screen_width ?? 0;
  const h = row.screen_height ?? 0;
  if (w === 375 && h === 812) {
    if (row.country === "CN") return "fingerprint";
    if (!/iPhone/i.test(ua)) return "fingerprint";
  }
  if (/iPhone OS 13_2_3/.test(ua)) return "emulator";
  if ((w === 800 && h === 600) || (w === 1280 && h === 1200)) return "headless";
  return null;
}

function kindOf(t: string): Kind {
  if (t === "page_view") return "pv";
  if (t === "page_leave") return "pl";
  if (t === "event" || t === "custom") return "ev";
  return "other";
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

export function normalise(r: RawRow): Ev {
  const meta = (r.metadata && typeof r.metadata === "object" ? r.metadata : {}) as Record<string, unknown>;
  const ua = parseUA(r.user_agent);
  const known = !!r.user_agent;
  const refRaw = cleanHost(r.referrer_domain);
  const ip = r.ip_address || "";
  const kind = kindOf(r.event_type);
  return {
    t: Date.parse(r.created_at),
    kind,
    path: r.page_path || "/",
    title: r.page_title ?? null,
    vid: r.visitor_id,
    sid: r.session_id,
    uid: r.user_id ?? null,
    ref: refRaw && !isOwnHost(refRaw) && !isOwnHost(r.referrer_domain) ? refRaw : null,
    utmS: str(r.utm_source),
    utmM: str(r.utm_medium),
    utmC: str(r.utm_campaign),
    // re-derive from the UA so legacy rows (old client parser: Android → "Linux") read the same
    device: known ? ua.device : r.device_type || "desktop",
    browser: known ? ua.browser : r.browser || "Unknown",
    os: known ? ua.os : r.os || "Unknown",
    country: str(r.country)?.toUpperCase() ?? null,
    city: str(r.city),
    dur: kind === "pl" && typeof r.duration === "number" ? r.duration : null,
    depth: typeof meta.depth === "number" ? meta.depth : null,
    pv: str(meta.pv),
    name: kind === "ev" ? str(meta.name) ?? r.event_type : null,
    props: kind === "ev" ? meta : null,
    entry: meta.entry === true,
    bot: botReason(r),
    fp: `${r.user_agent ?? ""}|${r.screen_width ?? 0}x${r.screen_height ?? 0}|${r.city ?? ""}`,
    internal: meta.dev === true || ip === "::1" || ip === "127.0.0.1" || ip.startsWith("::ffff:127."),
  };
}

// ---------------------------------------------------------------------------------------------
// sessions

export type Session = {
  sid: string;
  vid: string;
  uid: string | null;
  start: number;
  end: number;
  entry: string;
  exit: string;
  views: number;
  events: number;
  /** sum over views of max engaged ms per view; null when no view in the session has timing */
  engaged: number | null;
  channel: Channel;
  ref: string | null;
  utmS: string | null;
  utmM: string | null;
  utmC: string | null;
  country: string | null;
  city: string | null;
  device: string;
  browser: string;
  os: string;
  rows: Ev[];
  pvs: Ev[];
};

export type ViewTiming = { dur: number; depth: number };

/** max duration / depth per view id — heartbeats and the final beacon never add up. */
export function viewTimings(rows: Ev[]): Map<string, ViewTiming> {
  const m = new Map<string, ViewTiming>();
  for (const r of rows) {
    if (r.kind !== "pl" || !r.pv) continue;
    const key = `${r.vid}:${r.pv}`;
    const cur = m.get(key);
    const dur = Math.max(0, r.dur ?? 0);
    const depth = Math.max(0, Math.min(100, r.depth ?? 0));
    if (!cur) m.set(key, { dur, depth });
    else {
      cur.dur = Math.max(cur.dur, dur);
      cur.depth = Math.max(cur.depth, depth);
    }
  }
  return m;
}

export function buildSessions(rows: Ev[], timings: Map<string, ViewTiming>): Session[] {
  const by = new Map<string, Ev[]>();
  for (const r of rows) {
    if (r.kind === "other") continue;
    const k = `${r.vid}|${r.sid}`;
    let a = by.get(k);
    if (!a) by.set(k, (a = []));
    a.push(r);
  }
  const out: Session[] = [];
  for (const list of by.values()) {
    list.sort((a, b) => a.t - b.t);
    const pvs = list.filter((r) => r.kind === "pv");
    if (!pvs.length) continue; // leaves/events whose view started before the window
    const first = pvs.find((p) => p.entry) ?? pvs[0];
    let engaged: number | null = null;
    for (const p of pvs) {
      const tm = p.pv ? timings.get(`${p.vid}:${p.pv}`) : undefined;
      if (tm) engaged = (engaged ?? 0) + tm.dur;
    }
    const uid = list.find((r) => r.uid)?.uid ?? null;
    out.push({
      sid: first.sid,
      vid: first.vid,
      uid,
      start: list[0].t,
      end: list[list.length - 1].t,
      entry: pvs[0].path,
      exit: pvs[pvs.length - 1].path,
      views: pvs.length,
      events: list.filter((r) => r.kind === "ev").length,
      engaged,
      channel: channelFor(first.ref, { source: first.utmS, medium: first.utmM, campaign: first.utmC }),
      ref: first.ref,
      utmS: first.utmS,
      utmM: first.utmM,
      utmC: first.utmC,
      country: first.country,
      city: first.city,
      device: first.device,
      browser: first.browser,
      os: first.os,
      rows: list,
      pvs,
    });
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

export const isBounce = (s: Session) => s.views === 1 && s.events === 0 && (s.engaged === null || s.engaged < 10_000);

/**
 * Session-level bot heuristics on top of the row rules: page-view bursts (≥ 8 views at < 1.5 s
 * median gap, or ≥ 30 views in a minute) and one-view, no-referrer landings from cloud data-centre
 * cities (Ashburn, Boydton, Council Bluffs…).
 */
/**
 * Crawler clusters: one device fingerprint (UA + screen + city) behind ≥ 5 visitor ids whose
 * sessions are ALL single-view, no referrer, no events and no engagement timing — a fleet of
 * fresh headless browsers (e.g. the San Jose 1440×900 Linux crawler). Real v2 visitors send
 * engagement beacons, so they never match.
 */
export function clusterBots(sessions: Session[]): Set<Session> {
  const by = new Map<string, Session[]>();
  for (const s of sessions) {
    const fp = s.pvs[0].fp;
    let a = by.get(fp);
    if (!a) by.set(fp, (a = []));
    a.push(s);
  }
  const out = new Set<Session>();
  for (const list of by.values()) {
    if (new Set(list.map((s) => s.vid)).size < 5) continue;
    if (list.every((s) => s.views === 1 && !s.ref && !s.utmS && s.events === 0 && s.engaged === null)) for (const s of list) out.add(s);
  }
  return out;
}

export function sessionBotReason(s: Session): string | null {
  if (s.views >= 8) {
    const gaps: number[] = [];
    for (let i = 1; i < s.pvs.length; i++) gaps.push(s.pvs[i].t - s.pvs[i - 1].t);
    gaps.sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)] ?? 0;
    if (median < 1500) return "burst";
  }
  if (s.views >= 30 && s.end - s.start < 60_000) return "burst";
  if (s.views === 1 && !s.ref && !s.utmS && s.engaged === null && s.city && DC_CITIES.test(s.city)) return "datacenter";
  return null;
}
