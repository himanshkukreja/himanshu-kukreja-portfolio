/**
 * Traffic report: pure aggregation over normalised analytics rows (see model.ts).
 * Everything is computed in Node from one row load per window (load.ts caches it), so all cards
 * share the same bot rules, filters and "exclude my visits" switch.
 *
 * Durations: page_leave rows carry engaged ms; heartbeats upsert one row per view, and we still
 * take max(duration) per (visitor, view id) — never a sum — so duplicates cannot inflate time.
 * Legacy rows (before tracking v2) have no timing: sessions without any timed view are left out of
 * averages (`timedSessions` says how many fed the number) and count as bounces when single-view.
 */
import type { Channel } from "@/lib/analytics/channels";
import { buildSessions, clusterBots, isBounce, sessionBotReason, viewTimings, type Ev, type Session, type ViewTiming } from "./model";
import { buckets, startOf, type Unit } from "./time";

// ---------------------------------------------------------------------------------------------
// filters

export const FILTER_KEYS = [
  "page",
  "entry",
  "exit",
  "channel",
  "ref",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "country",
  "city",
  "device",
  "browser",
  "os",
  "visitor",
  "signed_in",
] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export type Filters = Partial<Record<FilterKey, string>>;

export function parseFilters(raw: string | null | undefined): Filters {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    const out: Filters = {};
    if (obj && typeof obj === "object") {
      for (const k of FILTER_KEYS) {
        const v = obj[k];
        if (typeof v === "string" && v.length <= 300) out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function pathMatch(path: string, pattern: string): boolean {
  if (pattern.endsWith("*")) return path.startsWith(pattern.slice(0, -1));
  return path === pattern;
}

const NONE = "(none)";
const eqi = (a: string | null | undefined, b: string) => (a ?? NONE).toLowerCase() === b.toLowerCase();

function sessionMatches(s: Session, f: Filters, isNew: (vid: string) => boolean): boolean {
  if (f.page && !s.pvs.some((p) => pathMatch(p.path, f.page!))) return false;
  if (f.entry && !pathMatch(s.entry, f.entry)) return false;
  if (f.exit && !pathMatch(s.exit, f.exit)) return false;
  if (f.channel && s.channel !== f.channel) return false;
  if (f.ref && !eqi(s.ref, f.ref)) return false;
  if (f.utm_source && !eqi(s.utmS, f.utm_source)) return false;
  if (f.utm_medium && !eqi(s.utmM, f.utm_medium)) return false;
  if (f.utm_campaign && !eqi(s.utmC, f.utm_campaign)) return false;
  if (f.country && !eqi(s.country, f.country)) return false;
  if (f.city && !eqi(s.city, f.city)) return false;
  if (f.device && !eqi(s.device, f.device)) return false;
  if (f.browser && !eqi(s.browser, f.browser)) return false;
  if (f.os && !eqi(s.os, f.os)) return false;
  if (f.visitor === "new" && !isNew(s.vid)) return false;
  if (f.visitor === "returning" && isNew(s.vid)) return false;
  if (f.signed_in === "yes" && !s.uid) return false;
  if (f.signed_in === "no" && s.uid) return false;
  return true;
}

// ---------------------------------------------------------------------------------------------
// dataset

export type Excluded = { bots: number; botSessions: number; internal: number; me: number; reasons: Record<string, number> };

type Dropped = { t: number; why: string; session?: boolean };

export type Dataset = {
  /** clean rows (no bots / internal / me), all loaded windows */
  rows: Ev[];
  sessions: Session[];
  timings: Map<string, ViewTiming>;
  /** what was left out and why (row time + reason) */
  dropped: Dropped[];
  /** first time each visitor was seen in the loaded rows */
  firstSeen: Map<string, number>;
  /** visitors seen before the loaded range began (from a separate lookup) */
  prior: Set<string>;
};

export type PrepareOpts = { meVisitors?: Set<string>; meUser?: string | null; prior?: Set<string> };

export function prepare(all: Ev[], opts: PrepareOpts = {}): Dataset {
  const dropped: Dropped[] = [];
  const keep: Ev[] = [];
  const botVisitors = new Set<string>();
  for (const r of all) {
    if (r.bot) {
      dropped.push({ t: r.t, why: r.bot });
      botVisitors.add(r.vid);
    } else if (r.internal) dropped.push({ t: r.t, why: "internal" });
    else if ((opts.meUser && r.uid === opts.meUser) || opts.meVisitors?.has(r.vid)) dropped.push({ t: r.t, why: "me" });
    else keep.push(r);
  }
  // a visitor id that ever looked like a bot is a bot for all its rows
  const clean: Ev[] = [];
  for (const r of keep) {
    if (botVisitors.has(r.vid)) dropped.push({ t: r.t, why: "visitor" });
    else clean.push(r);
  }
  const timings = viewTimings(clean);
  const sessions0 = buildSessions(clean, timings);
  const badSessions = new Set<string>();
  const sessions: Session[] = [];
  const cluster = clusterBots(sessions0);
  for (const s of sessions0) {
    const why = cluster.has(s) ? "cluster" : sessionBotReason(s);
    if (why) {
      badSessions.add(`${s.vid}|${s.sid}`);
      s.rows.forEach((r, i) => dropped.push({ t: r.t, why, session: i === 0 }));
    } else sessions.push(s);
  }
  const rows = badSessions.size ? clean.filter((r) => !badSessions.has(`${r.vid}|${r.sid}`)) : clean;
  const firstSeen = new Map<string, number>();
  for (const r of rows) {
    const cur = firstSeen.get(r.vid);
    if (cur === undefined || r.t < cur) firstSeen.set(r.vid, r.t);
  }
  return { rows, sessions, timings, dropped, firstSeen, prior: opts.prior ?? new Set() };
}

/** Exclusion note for [start, end): bot rows (UA + fingerprints + session heuristics), dev/internal, the admin's own. */
export function excludedIn(ds: Dataset, start: number, end: number): Excluded {
  const out: Excluded = { bots: 0, botSessions: 0, internal: 0, me: 0, reasons: {} };
  for (const d of ds.dropped) {
    if (d.t < start || d.t >= end) continue;
    if (d.why === "internal") out.internal++;
    else if (d.why === "me") out.me++;
    else {
      out.bots++;
      out.reasons[d.why] = (out.reasons[d.why] ?? 0) + 1;
      if (d.session) out.botSessions++;
    }
  }
  return out;
}

/** Sessions that started in [start, end) and pass the filters, plus their (page-filtered) views. */
export type Slice = {
  sessions: Session[];
  pvs: Ev[];
  isNew: (vid: string) => boolean;
  start: number;
  end: number;
};

export function slice(ds: Dataset, start: number, end: number, f: Filters): Slice {
  const isNew = (vid: string) => !ds.prior.has(vid) && (ds.firstSeen.get(vid) ?? 0) >= start;
  const sessions = ds.sessions.filter((s) => s.start >= start && s.start < end && sessionMatches(s, f, isNew));
  const pvs: Ev[] = [];
  for (const s of sessions) for (const p of s.pvs) if (p.t >= start && p.t < end && (!f.page || pathMatch(p.path, f.page))) pvs.push(p);
  return { sessions, pvs, isNew, start, end };
}

// ---------------------------------------------------------------------------------------------
// KPIs + series

export type Kpis = {
  visitors: number;
  pageviews: number;
  sessions: number;
  viewsPerSession: number;
  /** fraction 0–1 */
  bounceRate: number;
  avgEngagedSec: number;
  /** sessions that had timing data (tracking v2); avgEngagedSec is over these */
  timedSessions: number;
  /** fraction (0–1) of visitors first seen in this window */
  newPct: number;
  signedIn: number;
};

const r1 = (n: number) => Math.round(n * 10) / 10;
/** share as a fraction 0–1 (3 dp) — the admin kit's fmtPct formats fractions */
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 1000 : 0);

export function kpis(sl: Slice): Kpis {
  const visitors = new Set<string>();
  const users = new Set<string>();
  let bounces = 0;
  let timed = 0;
  let engaged = 0;
  for (const s of sl.sessions) {
    visitors.add(s.vid);
    if (s.uid) users.add(s.uid);
    if (isBounce(s)) bounces++;
    if (s.engaged !== null) {
      timed++;
      engaged += s.engaged;
    }
  }
  let fresh = 0;
  for (const v of visitors) if (sl.isNew(v)) fresh++;
  const n = sl.sessions.length;
  return {
    visitors: visitors.size,
    pageviews: sl.pvs.length,
    sessions: n,
    viewsPerSession: n ? r1(sl.pvs.length / n) : 0,
    bounceRate: pct(bounces, n),
    avgEngagedSec: timed ? Math.round(engaged / timed / 1000) : 0,
    timedSessions: timed,
    newPct: pct(fresh, visitors.size),
    signedIn: users.size,
  };
}

export type SeriesPoint = { t: string; visitors: number; pageviews: number; sessions: number; bounceRate: number; engagedSec: number };

export function series(sl: Slice, unit: Unit, tz: string): SeriesPoint[] {
  const bs = buckets(sl.start, sl.end, unit, tz);
  const idx = new Map<number, number>();
  bs.forEach((b, i) => idx.set(b, i));
  const acc = bs.map(() => ({ v: new Set<string>(), pv: 0, s: 0, b: 0, timed: 0, eng: 0 }));
  const at = (t: number) => idx.get(startOf(t, unit, tz));
  for (const p of sl.pvs) {
    const i = at(p.t);
    if (i === undefined) continue;
    acc[i].pv++;
    acc[i].v.add(p.vid);
  }
  for (const s of sl.sessions) {
    const i = at(s.start);
    if (i === undefined) continue;
    acc[i].s++;
    if (isBounce(s)) acc[i].b++;
    if (s.engaged !== null) {
      acc[i].timed++;
      acc[i].eng += s.engaged;
    }
  }
  return bs.map((b, i) => ({
    t: new Date(b).toISOString(),
    visitors: acc[i].v.size,
    pageviews: acc[i].pv,
    sessions: acc[i].s,
    bounceRate: pct(acc[i].b, acc[i].s),
    engagedSec: acc[i].timed ? Math.round(acc[i].eng / acc[i].timed / 1000) : 0,
  }));
}

// ---------------------------------------------------------------------------------------------
// breakdowns

export type BreakdownRow = {
  key: string;
  label: string;
  visitors: number;
  sessions: number;
  pageviews: number;
  /** fraction 0–1 */
  bounceRate: number;
  /** extra metric for some cards: exits (exit pages), share 0–1 (channels) */
  extra?: number;
};

let regionNames: Intl.DisplayNames | null = null;
export function countryName(code: string | null): string {
  if (!code || code === NONE) return "Unknown";
  try {
    regionNames ??= new Intl.DisplayNames(["en"], { type: "region" });
    return regionNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

function bySession(sl: Slice, keyOf: (s: Session) => string | null, label: (k: string) => string = (k) => k, skipNull = false): BreakdownRow[] {
  const m = new Map<string, { v: Set<string>; s: number; pv: number; b: number }>();
  for (const s of sl.sessions) {
    const k0 = keyOf(s);
    if (k0 === null && skipNull) continue;
    const k = k0 ?? NONE;
    let a = m.get(k);
    if (!a) m.set(k, (a = { v: new Set(), s: 0, pv: 0, b: 0 }));
    a.v.add(s.vid);
    a.s++;
    a.pv += s.views;
    if (isBounce(s)) a.b++;
  }
  return [...m.entries()]
    .map(([key, a]) => ({ key, label: key === NONE ? "(none)" : label(key), visitors: a.v.size, sessions: a.s, pageviews: a.pv, bounceRate: pct(a.b, a.s) }))
    .sort((a, b) => b.visitors - a.visitors || b.sessions - a.sessions)
    .slice(0, 300);
}

export type Breakdowns = {
  channels: BreakdownRow[];
  referrers: BreakdownRow[];
  utmSource: BreakdownRow[];
  utmMedium: BreakdownRow[];
  utmCampaign: BreakdownRow[];
  pages: BreakdownRow[];
  entries: BreakdownRow[];
  exits: BreakdownRow[];
  countries: BreakdownRow[];
  cities: BreakdownRow[];
  devices: BreakdownRow[];
  browsers: BreakdownRow[];
  os: BreakdownRow[];
};

export function breakdowns(sl: Slice): Breakdowns {
  // pages: per view
  const pm = new Map<string, { v: Set<string>; pv: number; s: Set<string> }>();
  for (const p of sl.pvs) {
    let a = pm.get(p.path);
    if (!a) pm.set(p.path, (a = { v: new Set(), pv: 0, s: new Set() }));
    a.v.add(p.vid);
    a.s.add(p.sid);
    a.pv++;
  }
  const pages = [...pm.entries()]
    .map(([key, a]) => ({ key, label: key, visitors: a.v.size, sessions: a.s.size, pageviews: a.pv, bounceRate: 0 }))
    .sort((a, b) => b.pageviews - a.pageviews)
    .slice(0, 300);

  const channels = bySession(sl, (s) => s.channel);
  const total = sl.sessions.length;
  for (const c of channels) c.extra = pct(c.sessions, total);

  const exits = bySession(sl, (s) => s.exit);
  for (const e of exits) {
    e.extra = e.sessions;
    const views = pm.get(e.key)?.pv ?? 0;
    e.pageviews = views; // views of that page → exit rate = sessions / pageviews
  }
  const loc = (s: Session) => (s.city ? `${s.city}|${s.country ?? ""}` : null);

  return {
    channels,
    referrers: bySession(sl, (s) => s.ref, (k) => k, true),
    utmSource: bySession(sl, (s) => s.utmS, (k) => k, true),
    utmMedium: bySession(sl, (s) => s.utmM, (k) => k, true),
    utmCampaign: bySession(sl, (s) => s.utmC, (k) => k, true),
    pages,
    entries: bySession(sl, (s) => s.entry),
    exits,
    countries: bySession(sl, (s) => s.country, countryName),
    cities: bySession(sl, loc, (k) => {
      const [city, cc] = k.split("|");
      return cc ? `${city}, ${cc}` : city;
    }, true),
    devices: bySession(sl, (s) => s.device),
    browsers: bySession(sl, (s) => s.browser),
    os: bySession(sl, (s) => s.os),
  };
}

// ---------------------------------------------------------------------------------------------
// engagement per page

export type PageEngagement = {
  path: string;
  title: string | null;
  views: number;
  visitors: number;
  /** views with timing data (tracking v2) — the averages below are over these */
  timed: number;
  avgEngagedSec: number;
  /** max scroll depth, 0–100 */
  avgDepth: number;
  /** fraction (0–1) of timed views that reached ≥ 90% depth */
  finishedPct: number;
  entries: number;
  exits: number;
  /** fraction (0–1) of sessions entering here that bounced */
  bounceRate: number;
};

export function pageEngagement(sl: Slice, timings: Map<string, ViewTiming>): PageEngagement[] {
  const m = new Map<string, { title: string | null; v: Set<string>; n: number; timed: number; dur: number; depth: number; fin: number; ent: number; ex: number; bounce: number }>();
  const get = (path: string) => {
    let a = m.get(path);
    if (!a) m.set(path, (a = { title: null, v: new Set(), n: 0, timed: 0, dur: 0, depth: 0, fin: 0, ent: 0, ex: 0, bounce: 0 }));
    return a;
  };
  for (const p of sl.pvs) {
    const a = get(p.path);
    a.n++;
    a.v.add(p.vid);
    if (p.title && !a.title) a.title = p.title;
    const tm = p.pv ? timings.get(`${p.vid}:${p.pv}`) : undefined;
    if (tm) {
      a.timed++;
      a.dur += tm.dur;
      a.depth += tm.depth;
      if (tm.depth >= 90) a.fin++;
    }
  }
  for (const s of sl.sessions) {
    const e = m.get(s.entry);
    if (e) {
      e.ent++;
      if (isBounce(s)) e.bounce++;
    }
    const x = m.get(s.exit);
    if (x) x.ex++;
  }
  return [...m.entries()]
    .map(([path, a]) => ({
      path,
      title: a.title,
      views: a.n,
      visitors: a.v.size,
      timed: a.timed,
      avgEngagedSec: a.timed ? Math.round(a.dur / a.timed / 1000) : 0,
      avgDepth: a.timed ? Math.round(a.depth / a.timed) : 0,
      finishedPct: pct(a.fin, a.timed),
      entries: a.ent,
      exits: a.ex,
      bounceRate: pct(a.bounce, a.ent),
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 300);
}

// ---------------------------------------------------------------------------------------------
// product events

export type EventSummary = { name: string; count: number; visitors: number; users: number; last: string | null; top: { value: string; n: number }[] };

const TOP_PROP: Record<string, string> = {
  lesson_open: "lesson",
  stage_reach: "stage",
  stage_done: "stage",
  lesson_complete: "lesson",
  trial_result: "week",
  play: "game",
  reset: "scope",
};

export function eventSummary(sl: Slice): EventSummary[] {
  const m = new Map<string, { n: number; v: Set<string>; u: Set<string>; last: number; top: Map<string, number> }>();
  for (const s of sl.sessions) {
    for (const r of s.rows) {
      if (r.kind !== "ev" || !r.name || r.t < sl.start || r.t >= sl.end) continue;
      let a = m.get(r.name);
      if (!a) m.set(r.name, (a = { n: 0, v: new Set(), u: new Set(), last: 0, top: new Map() }));
      a.n++;
      a.v.add(r.vid);
      if (r.uid) a.u.add(r.uid);
      a.last = Math.max(a.last, r.t);
      const pk = TOP_PROP[r.name];
      const pv = pk ? r.props?.[pk] : undefined;
      if (pv !== undefined && pv !== null) a.top.set(String(pv), (a.top.get(String(pv)) ?? 0) + 1);
    }
  }
  return [...m.entries()]
    .map(([name, a]) => ({
      name,
      count: a.n,
      visitors: a.v.size,
      users: a.u.size,
      last: a.last ? new Date(a.last).toISOString() : null,
      top: [...a.top.entries()]
        .sort((x, y) => y[1] - x[1])
        .slice(0, 5)
        .map(([value, n]) => ({ value, n })),
    }))
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------------------------
// funnel

export type FunnelStep = { kind: "page" | "event"; value: string };
export type FunnelResult = { step: string; label: string; visitors: number; pctOfFirst: number; pctOfPrev: number }[];

export function parseSteps(raw: string | null | undefined): FunnelStep[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((s) => {
      const i = s.indexOf(":");
      const kind = s.slice(0, i) === "event" ? "event" : "page";
      return { kind, value: s.slice(i + 1).trim() } as FunnelStep;
    })
    .filter((s) => s.value);
}

export function funnel(sl: Slice, steps: FunnelStep[]): FunnelResult {
  if (steps.length < 1) return [];
  const byVisitor = new Map<string, Ev[]>();
  for (const s of sl.sessions) {
    let a = byVisitor.get(s.vid);
    if (!a) byVisitor.set(s.vid, (a = []));
    for (const r of s.rows) if (r.t >= sl.start && r.t < sl.end && (r.kind === "pv" || r.kind === "ev")) a.push(r);
  }
  const reached = steps.map(() => 0);
  const hit = (r: Ev, st: FunnelStep) => (st.kind === "page" ? r.kind === "pv" && pathMatch(r.path, st.value) : r.kind === "ev" && r.name === st.value);
  for (const list of byVisitor.values()) {
    list.sort((a, b) => a.t - b.t);
    let i = 0;
    for (const r of list) {
      if (i < steps.length && hit(r, steps[i])) {
        reached[i]++;
        i++;
        // the same row can't satisfy two steps; consecutive identical steps need two rows
      }
      if (i >= steps.length) break;
    }
  }
  return steps.map((st, i) => ({
    step: `${st.kind}:${st.value}`,
    label: st.kind === "page" ? st.value : st.value.replace(/_/g, " "),
    visitors: reached[i],
    pctOfFirst: pct(reached[i], reached[0]),
    pctOfPrev: i === 0 ? 1 : pct(reached[i], reached[i - 1]),
  }));
}

// ---------------------------------------------------------------------------------------------
// retention: weekly cohorts by first visit (admin tz), W0–W7

export type Cohort = { week: string; size: number; cells: (number | null)[] };

export function retention(ds: Dataset, f: Filters, tz: string, now: number, weeks = 8): Cohort[] {
  const thisWeek = startOf(now, "week", tz);
  const starts: number[] = [];
  let w = thisWeek;
  for (let i = 0; i < weeks; i++) {
    starts.unshift(w);
    w = startOf(w - 3 * 24 * 3_600_000, "week", tz);
  }
  const weekIdx = (t: number) => starts.indexOf(startOf(t, "week", tz));
  const isNew = (vid: string) => !ds.prior.has(vid);
  const active = new Map<string, Set<number>>();
  for (const s of ds.sessions) {
    if (!sessionMatches(s, f, isNew)) continue;
    const i = weekIdx(s.start);
    if (i < 0) continue;
    let a = active.get(s.vid);
    if (!a) active.set(s.vid, (a = new Set()));
    a.add(i);
  }
  const cohorts = starts.map(() => ({ members: [] as string[] }));
  for (const [vid, set] of active) {
    if (ds.prior.has(vid)) continue; // seen before the first cohort week
    const first = Math.min(...set);
    cohorts[first].members.push(vid);
  }
  return starts.map((st, ci) => {
    const members = cohorts[ci].members;
    const cells: (number | null)[] = [];
    for (let k = 0; k < weeks; k++) {
      const wi = ci + k;
      if (wi >= weeks) cells.push(null);
      else if (!members.length) cells.push(0);
      else cells.push(pct(members.filter((v) => active.get(v)!.has(wi)).length, members.length));
    }
    return { week: new Date(st).toISOString(), size: members.length, cells };
  });
}

// ---------------------------------------------------------------------------------------------
// live

export type LiveRecent = { at: string; path: string; country: string | null; city: string | null; device: string; channel: Channel };
export type Live = { live: number; pages: { path: string; n: number }[]; recent: LiveRecent[] };

/** `rows`: clean rows of roughly the last 24 h (bots / internal / me removed). */
export function live(ds: Dataset, f: Filters, now: number): Live {
  const since = now - 5 * 60_000;
  const isNew = (vid: string) => !ds.prior.has(vid) && (ds.firstSeen.get(vid) ?? 0) >= now - 24 * 3_600_000;
  const sessions = ds.sessions.filter((s) => sessionMatches(s, f, isNew));
  const current = new Map<string, Ev>();
  const pvs: { r: Ev; s: Session }[] = [];
  for (const s of sessions) {
    for (const r of s.rows) {
      if (r.t >= since) {
        const cur = current.get(r.vid);
        if (!cur || r.t >= cur.t) current.set(r.vid, r);
      }
      if (r.kind === "pv") pvs.push({ r, s });
    }
  }
  const pages = new Map<string, number>();
  for (const r of current.values()) pages.set(r.path, (pages.get(r.path) ?? 0) + 1);
  pvs.sort((a, b) => b.r.t - a.r.t);
  return {
    live: current.size,
    pages: [...pages.entries()].map(([path, n]) => ({ path, n })).sort((a, b) => b.n - a.n).slice(0, 20),
    recent: pvs.slice(0, 20).map(({ r, s }) => ({
      at: new Date(r.t).toISOString(),
      path: r.path,
      country: r.country,
      city: r.city,
      device: r.device,
      channel: s.channel,
    })),
  };
}
