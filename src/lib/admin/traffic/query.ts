/**
 * Request → report glue for /api/admin/traffic/*. Every range endpoint loads the same dataset
 * (previous period + current window, cached 60 s), so one page load scans analytics_events once.
 *
 * Query params: range=24h|7d|30d|90d|12m (or from/to ISO), tz=<IANA>, f=<json filters>,
 * me=include (default: the signed-in admin's own visits and devices are excluded).
 */
import { getDataset } from "./load";
import {
  breakdowns,
  eventSummary,
  excludedIn,
  funnel,
  kpis,
  live,
  pageEngagement,
  parseFilters,
  parseSteps,
  retention,
  series,
  slice,
  type Filters,
} from "./report";
import { resolveWindow, startOf, validTz, type Window } from "./time";
import { sharedCache } from "@/lib/admin/sharedCache";

export type Params = { win: Window; filters: Filters; meUser: string | null; tz: string; now: number };

export function readParams(url: URL, adminId: string | null): Params {
  const sp = url.searchParams;
  const tz = validTz(sp.get("tz"));
  const now = Date.now();
  const win = resolveWindow(sp.get("range"), tz, now, sp.get("from"), sp.get("to"));
  return { win, filters: parseFilters(sp.get("f")), meUser: sp.get("me") === "include" ? null : adminId, tz, now };
}

const meta = (p: Params, ds: { total: number; capped: boolean }) => ({
  window: {
    range: p.win.key,
    start: new Date(p.win.start).toISOString(),
    end: new Date(p.win.end).toISOString(),
    prevStart: new Date(p.win.prevStart).toISOString(),
    unit: p.win.unit,
    tz: p.tz,
  },
  filters: p.filters,
  excludeMe: !!p.meUser,
  scanned: ds.total,
  capped: ds.capped,
});

const main = (p: Params) => getDataset(p.win.prevStart, p.win.end, p.meUser);

export async function liveReport(p: Pick<Params, "filters" | "meUser" | "now">) {
  const from = startOf(p.now - 24 * 3_600_000, "hour", "UTC");
  const ds = await getDataset(from, p.now, p.meUser, 10_000);
  return live(ds, p.filters, p.now);
}

export async function overviewReport(p: Params) {
  const [ds, lv] = await Promise.all([main(p), liveReport(p)]);
  const cur = slice(ds, p.win.start, p.win.end, p.filters);
  const prev = slice(ds, p.win.prevStart, p.win.prevEnd, p.filters);
  return {
    kpis: { ...kpis(cur), live: lv.live, prev: { ...kpis(prev), live: 0 } },
    series: series(cur, p.win.unit, p.tz),
    excluded: excludedIn(ds, p.win.start, p.win.end),
    ...meta(p, ds),
  };
}

export async function breakdownsReport(p: Params) {
  const ds = await main(p);
  const cur = slice(ds, p.win.start, p.win.end, p.filters);
  return { ...breakdowns(cur), ...meta(p, ds) };
}

export async function pagesReport(p: Params) {
  const ds = await main(p);
  const cur = slice(ds, p.win.start, p.win.end, p.filters);
  return { pages: pageEngagement(cur, ds.timings), ...meta(p, ds) };
}

export async function eventsReport(p: Params) {
  const ds = await main(p);
  const cur = slice(ds, p.win.start, p.win.end, p.filters);
  return { events: eventSummary(cur), ...meta(p, ds) };
}

export async function funnelReport(p: Params, stepsRaw: string | null) {
  const steps = parseSteps(stepsRaw);
  const ds = await main(p);
  const cur = slice(ds, p.win.start, p.win.end, p.filters);
  return { steps: funnel(cur, steps), ...meta(p, ds) };
}

export async function retentionReport(p: Params) {
  let first = startOf(p.now, "week", p.tz);
  for (let i = 0; i < 7; i++) first = startOf(first - 3 * 86_400_000, "week", p.tz);
  const ds = await getDataset(first, p.now, p.meUser);
  return { cohorts: retention(ds, p.filters, p.tz, p.now), ...meta(p, ds) };
}

/* ───────────────────────────── shared cache ───────────────────────────── */

/**
 * What a report depends on, normalised (no `now`): the key of the shared data cache. Every Vercel instance answers
 * from the same entry and refreshes it in the background, so the six cards of a Traffic page load don't each re-scan
 * analytics_events on whichever cold instance they land on.
 */
export type ReportArgs = { range: string | null; from: string | null; to: string | null; tz: string; f: string | null; me: string | null };

export function reportArgs(url: URL, adminId: string | null): ReportArgs {
  const sp = url.searchParams;
  const filters = parseFilters(sp.get("f"));
  return {
    range: sp.get("range"),
    from: sp.get("from"),
    to: sp.get("to"),
    tz: validTz(sp.get("tz")),
    f: Object.keys(filters).length ? JSON.stringify(filters) : null,
    me: sp.get("me") === "include" ? null : adminId,
  };
}

function paramsOf(a: ReportArgs): Params {
  const now = Date.now();
  return { win: resolveWindow(a.range, a.tz, now, a.from, a.to), filters: parseFilters(a.f), meUser: a.me, tz: a.tz, now };
}

/** 24 h (or shorter / custom) windows refresh every minute; 7 d every 5; longer ones every 10. */
const windowMs = (a: ReportArgs) => {
  const w = paramsOf(a).win;
  return w.end - w.start;
};
const revalidateFor = (a: ReportArgs) => (windowMs(a) <= 2 * 86_400_000 ? 60 : windowMs(a) <= 8 * 86_400_000 ? 300 : 600);
const maxAgeFor = (a: ReportArgs) => (windowMs(a) <= 2 * 86_400_000 ? 900 : windowMs(a) <= 8 * 86_400_000 ? 3600 : 6 * 3600);
const opts = { revalidate: revalidateFor, maxAge: maxAgeFor };

export const cachedOverview = sharedCache("traffic_overview", (a: ReportArgs) => overviewReport(paramsOf(a)), opts);
export const cachedBreakdowns = sharedCache("traffic_breakdowns", (a: ReportArgs) => breakdownsReport(paramsOf(a)), opts);
export const cachedPages = sharedCache("traffic_pages", (a: ReportArgs) => pagesReport(paramsOf(a)), opts);
export const cachedEvents = sharedCache("traffic_events", (a: ReportArgs) => eventsReport(paramsOf(a)), opts);
export const cachedFunnel = sharedCache("traffic_funnel", (a: ReportArgs, steps: string | null) => funnelReport(paramsOf(a), steps), opts);
/** last 8 weeks whatever the range (the range only shows in its window meta) */
export const cachedRetention = sharedCache("traffic_retention", (a: ReportArgs) => retentionReport(paramsOf(a)), { revalidate: 600, maxAge: 6 * 3600 });
/** visitors on the site now (admin rail badge on every page + Traffic's live card): 20 s */
export const cachedLive = sharedCache("traffic_live", (f: string | null, me: string | null) => liveReport({ filters: parseFilters(f), meUser: me, now: Date.now() }), {
  revalidate: 20,
  maxAge: 120,
});
