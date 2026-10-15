/** Response shapes of /api/admin/traffic/* (types only — erased at build, no server code ships). */
import type { BreakdownRow, Breakdowns, Cohort, EventSummary, Excluded, FunnelResult, Kpis, Live, PageEngagement, SeriesPoint } from "@/lib/admin/traffic/report";

export type Meta = {
  window: { range: string; start: string; end: string; prevStart: string; unit: "hour" | "day" | "week"; tz: string };
  excludeMe: boolean;
  scanned: number;
  capped: boolean;
};

export type OverviewRes = Meta & {
  kpis: Kpis & { live: number; prev: Kpis & { live: number } };
  series: SeriesPoint[];
  excluded: Excluded;
};
export type BreakdownsRes = Meta & Breakdowns;
export type PagesRes = Meta & { pages: PageEngagement[] };
export type EventsRes = Meta & { events: EventSummary[] };
export type FunnelRes = Meta & { steps: FunnelResult };
export type RetentionRes = Meta & { cohorts: Cohort[] };
export type LiveRes = Live;

export type { BreakdownRow, Breakdowns, PageEngagement, EventSummary, SeriesPoint };
