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
