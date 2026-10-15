"use client";

/**
 * /admin/traffic — first-party analytics over analytics_events (tracking contract v2).
 * Range + filters + "exclude my visits" live in the URL (see state.ts); every card calls a
 * /api/admin/traffic/* endpoint with the same query, and the server shares one row scan.
 */
import { useMemo } from "react";
import {
  Badge,
  Card,
  ErrorState,
  FilterChips,
  Heatmap,
  Kpi,
  LABEL,
  LiveDot,
  PageHead,
  RangePicker,
  Table,
  TrendChart,
  fmtDate,
  fmtDuration,
  fmtNum,
  fmtPct,
  timeAgo,
  useAdminData,
  useNow,
  type Column,
} from "@/components/admin/ui";
import type { FilterKey } from "@/lib/admin/traffic/report";
import { BreakdownCard, Num, type BreakdownTab } from "./Breakdowns";
import { FunnelCard } from "./Funnel";
import { LivePanel } from "./LivePanel";
import { axisLabel } from "./format";
import { FILTER_LABEL, useTrafficState } from "./state";
import type { BreakdownsRes, EventSummary, EventsRes, LiveRes, OverviewRes, PageEngagement, PagesRes, RetentionRes, SeriesPoint } from "./types";

const RANGE_LABEL: Record<string, string> = { "24h": "last 24 hours", "7d": "last 7 days", "30d": "last 30 days", "90d": "last 90 days", "12m": "last 12 months" };

type MetricKey = "visitors" | "pageviews" | "sessions" | "engagedSec" | "bounceRate";
const METRICS: { key: MetricKey; label: string; format: (n: number) => string }[] = [
  { key: "visitors", label: "visitors", format: (n) => fmtNum(n) },
  { key: "pageviews", label: "page views", format: (n) => fmtNum(n) },
  { key: "sessions", label: "sessions", format: (n) => fmtNum(n) },
  { key: "engagedSec", label: "engaged time", format: (n) => fmtDuration(n) },
  { key: "bounceRate", label: "bounce rate", format: (n) => fmtPct(n, 0) },
];

const SOURCES: BreakdownTab[] = [
  { id: "channels", label: "channels", filter: "channel", extra: { header: "share", format: (n) => fmtPct(n, 0) } },
  { id: "referrers", label: "referrers", filter: "ref", mono: true },
  { id: "utmSource", label: "utm source", filter: "utm_source", mono: true },
  { id: "utmMedium", label: "medium", filter: "utm_medium", mono: true },
  { id: "utmCampaign", label: "campaign", filter: "utm_campaign", mono: true },
];
const PAGES: BreakdownTab[] = [
  { id: "pages", label: "top pages", filter: "page", metric: "pageviews", mono: true },
  { id: "entries", label: "entry", filter: "entry", metric: "sessions", mono: true },
  { id: "exits", label: "exit", filter: "exit", metric: "sessions", mono: true, extra: { header: "exits", format: (n) => fmtNum(n) } },
];
const PLACES: BreakdownTab[] = [
  { id: "countries", label: "countries", filter: "country" },
  { id: "cities", label: "cities", filter: "city", value: (r) => r.key.split("|")[0] },
];
const TECH: BreakdownTab[] = [
  { id: "devices", label: "device", filter: "device" },
  { id: "browsers", label: "browser", filter: "browser" },
  { id: "os", label: "os", filter: "os" },
];

let regionNames: Intl.DisplayNames | null = null;
const countryName = (cc: string) => {
  try {
    regionNames ??= new Intl.DisplayNames(["en"], { type: "region" });
    return regionNames.of(cc) ?? cc;
  } catch {
    return cc;
  }
};

export default function TrafficDashboard() {
  const st = useTrafficState();
  const { query, range, filters } = st;
  const overview = useAdminData<OverviewRes>(`/api/admin/traffic/overview?${query}`);
  const bd = useAdminData<BreakdownsRes>(`/api/admin/traffic/breakdowns?${query}`);
  const pages = useAdminData<PagesRes>(`/api/admin/traffic/pages?${query}`);
  const events = useAdminData<EventsRes>(`/api/admin/traffic/events?${query}`);
  const retention = useAdminData<RetentionRes>(`/api/admin/traffic/retention?${query}`);
  const live = useAdminData<LiveRes>(`/api/admin/traffic/live?${query}`, { refreshMs: 15_000 });

  const o = overview.data;
  const k = o?.kpis;
  const series = useMemo(() => o?.series ?? [], [o]);
  const spark = (key: keyof SeriesPoint) => series.map((p) => Number(p[key]) || 0);
  const metric = METRICS.find((m) => m.key === st.metric) ?? METRICS[0];
  const kLoading = overview.loading && !k;

  const chips = Object.entries(filters).map(([key, value]) => ({
    key,
    label: FILTER_LABEL[key as FilterKey] ?? key,
    value: key === "country" && value ? `${countryName(value)}` : value,
  }));

  const ex = o?.excluded;
  const exReasons = ex ? Object.entries(ex.reasons).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div className="min-w-0">
      <PageHead
        path="sudo ~/admin/traffic"
        title="Traffic"
        sub={
          <>
            Who comes, from where, what they read and how long — {RANGE_LABEL[range] ?? range}
            {o ? <span className="font-mono text-[11px] text-fg-4"> · {o.window?.tz}</span> : null}
          </>
        }
        actions={<RangePicker fallback="30d" />}
      />

      {/* ── controls ── */}
      <div className="mb-4 flex flex-col gap-3 border border-line bg-surface px-3 py-2.5 sm:px-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <LiveBadge n={live.data?.live} />
          <Segment
            label="visitors"
            value={filters.visitor ?? ""}
            options={[
              ["", "all"],
              ["new", "new"],
              ["returning", "returning"],
            ]}
            onChange={(v) => (v ? st.addFilter("visitor", v) : st.removeFilter("visitor"))}
          />
          <Segment
            label="signed in"
            value={filters.signed_in ?? ""}
            options={[
              ["", "any"],
              ["yes", "yes"],
              ["no", "no"],
            ]}
            onChange={(v) => (v ? st.addFilter("signed_in", v) : st.removeFilter("signed_in"))}
          />
          <Switch on={st.excludeMe} onChange={(on) => st.set({ me: on ? null : "include" })} label="exclude my visits" hint="your account + its devices" />
        </div>
        {chips.length > 0 ? (
          <FilterChips chips={chips} onRemove={st.removeFilter} onClear={() => st.setFilters({})} />
        ) : (
          <p className="font-mono text-[11px] text-fg-4">tip · tap any row below to filter the whole report by it</p>
        )}
      </div>

      {/* ── KPIs ── */}
      {overview.error ? (
        <ErrorState error={overview.error} onRetry={overview.refresh} title="Traffic overview unavailable" className="mb-4" />
      ) : (
        <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-5">
          <Kpi label="Visitors" loading={kLoading} value={fmtNum(k?.visitors)} current={k?.visitors} previous={k?.prev.visitors} spark={spark("visitors")} />
          <Kpi label="Page views" loading={kLoading} value={fmtNum(k?.pageviews)} current={k?.pageviews} previous={k?.prev.pageviews} spark={spark("pageviews")} />
          <Kpi label="Sessions" loading={kLoading} value={fmtNum(k?.sessions)} current={k?.sessions} previous={k?.prev.sessions} spark={spark("sessions")} />
          <Kpi label="Views / session" loading={kLoading} value={fmtNum(k?.viewsPerSession, 1)} current={k?.viewsPerSession} previous={k?.prev.viewsPerSession} />
          <Kpi label="Bounce rate" loading={kLoading} value={fmtPct(k?.bounceRate, 0)} current={k?.bounceRate} previous={k?.prev.bounceRate} invert spark={spark("bounceRate")} />
          <Kpi
            label="Avg engaged"
            loading={kLoading}
            value={k?.timedSessions ? fmtDuration(k.avgEngagedSec) : "—"}
            current={k?.timedSessions ? k.avgEngagedSec : null}
            previous={k?.prev.timedSessions ? k.prev.avgEngagedSec : null}
            hint={k ? `${fmtNum(k.timedSessions)} timed sessions` : undefined}
            spark={k?.timedSessions ? spark("engagedSec") : undefined}
          />
          <Kpi label="New visitors" loading={kLoading} value={fmtPct(k?.newPct, 0)} current={k?.newPct} previous={k?.prev.newPct} hint="first seen this range" />
          <Kpi label="Signed in" loading={kLoading} value={fmtNum(k?.signedIn)} current={k?.signedIn} previous={k?.prev.signedIn} hint="unique accounts" />
          <Kpi
            label={
              <span className="inline-flex items-center gap-1.5">
                <LiveDot on={!!live.data?.live} /> live · 5 min
              </span>
            }
            loading={live.loading && !live.data}
            value={fmtNum(live.data?.live)}
            hint="polling every 15s"
            className="col-span-2 sm:col-span-1"
          />
        </div>
      )}

      {/* ── exclusion note ── */}
      {ex && (
        <p className="mb-5 font-mono text-[11px] leading-5 text-fg-4">
          excluded {fmtNum(ex.bots)} bot events
          {exReasons.length ? ` (${exReasons.map(([r, n]) => `${r} ${fmtNum(n)}`).join(" · ")})` : ""} · {fmtNum(ex.internal)} dev/internal
          {o?.excludeMe ? ` · ${fmtNum(ex.me)} yours` : ""} · scanned {fmtNum(o?.scanned)} rows{o?.capped ? " (capped at 200k)" : ""}
        </p>
      )}

      {/* ── trend + live ── */}
      <div className="mb-3 grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card
          label="trend"
          title={`${metric.label[0].toUpperCase()}${metric.label.slice(1)} · ${range}`}
        >
          <div role="radiogroup" aria-label="Trend metric" className="mb-3 flex max-w-full flex-wrap gap-1">
            {METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={m.key === metric.key}
                onClick={() => st.set({ m: m.key === "visitors" ? null : m.key })}
                className={`min-h-9 border px-2 font-mono text-[11px] ${m.key === metric.key ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg-3 hover:text-fg"}`}
              >
                {m.label}
              </button>
            ))}
          </div>
          {overview.error ? (
            <ErrorState error={overview.error} onRetry={overview.refresh} />
          ) : (
            <TrendChart
              loading={kLoading}
              data={series}
              series={[{ key: metric.key, label: metric.label, format: metric.format }]}
              formatX={axisLabel(o?.window?.unit)}
              formatY={metric.key === "bounceRate" ? (n) => fmtPct(n, 0) : metric.key === "engagedSec" ? (n) => fmtDuration(n) : undefined}
              ariaLabel={`${metric.label} over time`}
            />
          )}
        </Card>
        <LivePanel data={live.data} error={live.error} loading={live.loading} onRetry={live.refresh} />
      </div>

      {/* ── breakdowns ── */}
      <div className="mb-3 grid gap-3 lg:grid-cols-2">
        <BreakdownCard label="acquisition" title="Sources" tabs={SOURCES} data={bd.data} loading={bd.loading} error={bd.error} onRetry={bd.refresh} filters={filters} onFilter={st.addFilter} />
        <BreakdownCard label="content" title="Pages" tabs={PAGES} data={bd.data} loading={bd.loading} error={bd.error} onRetry={bd.refresh} filters={filters} onFilter={st.addFilter} />
        <BreakdownCard label="geo" title="Locations" tabs={PLACES} data={bd.data} loading={bd.loading} error={bd.error} onRetry={bd.refresh} filters={filters} onFilter={st.addFilter} />
        <BreakdownCard label="tech" title="Devices" tabs={TECH} data={bd.data} loading={bd.loading} error={bd.error} onRetry={bd.refresh} filters={filters} onFilter={st.addFilter} />
      </div>

      {/* ── engagement ── */}
      <EngagementCard data={pages.data} loading={pages.loading} error={pages.error} onRetry={pages.refresh} onPage={(p) => st.addFilter("page", p)} />

      {/* ── retention + events ── */}
      <div className="mb-3 grid gap-3 lg:grid-cols-2">
        <Card label="retention" title="Weekly cohorts · W0–W7" action={<span className="font-mono text-[11px] text-fg-4">by first visit · ignores range</span>}>
          {retention.error ? (
            <ErrorState error={retention.error} onRetry={retention.refresh} />
          ) : retention.loading && !retention.data ? (
            <div className="h-48 animate-pulse bg-surface-2" />
          ) : (
            <Heatmap
              columns={Array.from({ length: 8 }, (_, i) => `W${i}`)}
              rows={(retention.data?.cohorts ?? []).map((c) => ({ label: fmtDate(c.week).replace(/ \d{4}$/, ""), size: c.size, cells: c.cells }))}
              cellTitle={(ri, ci, v) => {
                const c = retention.data?.cohorts[ri];
                return c ? `week of ${fmtDate(c.week)} · ${c.size} visitors · W${ci}: ${v == null ? "not yet" : fmtPct(v, 1)}` : "";
              }}
              minWidth={460}
            />
          )}
        </Card>
        <EventsCard data={events.data} loading={events.loading} error={events.error} onRetry={events.refresh} />
      </div>

      {/* ── funnel ── */}
      <FunnelCard query={query} steps={st.steps} onSteps={(s) => st.set({ steps: s })} />
    </div>
  );
}

/* ───────────────────────────── pieces ───────────────────────────── */

function LiveBadge({ n }: { n?: number }) {
  return (
    <span className="inline-flex min-h-9 items-center gap-2 border border-line-strong px-2.5 font-mono text-xs text-fg">
      <LiveDot on={!!n} />
      {n == null ? "…" : fmtNum(n)} live
    </span>
  );
}

function Segment({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className={LABEL}>{label}</span>
      <div role="radiogroup" aria-label={label} className="inline-flex border border-line-strong">
        {options.map(([v, l], i) => (
          <button
            key={v || "all"}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={`min-h-9 px-2 font-mono text-[11px] ${i ? "border-l border-line-strong" : ""} ${value === v ? "bg-fg text-bg" : "text-fg-3 hover:text-fg"}`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Switch({ on, onChange, label, hint }: { on: boolean; onChange: (on: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="inline-flex min-h-10 items-center gap-2.5 text-left" title={hint}>
      <span aria-hidden className={`relative h-5 w-9 shrink-0 border ${on ? "border-signal bg-signal" : "border-line-strong bg-surface-2"}`}>
        <span className={`absolute top-0.5 h-3.5 w-3.5 transition-[left] ${on ? "left-[18px] bg-on-signal" : "left-0.5 bg-fg-3"}`} />
      </span>
      <span>
        <span className="block font-mono text-xs text-fg">{label}</span>
        {hint && <span className="block font-mono text-[10px] text-fg-4">{hint}</span>}
      </span>
    </button>
  );
}

function EngagementCard({ data, loading, error, onRetry, onPage }: { data?: PagesRes; loading: boolean; error?: Error; onRetry: () => void; onPage: (p: string) => void }) {
  const rows = data?.pages ?? [];
  const timed = rows.reduce((a, r) => a + r.timed, 0);
  const t = (r: PageEngagement, s: string) => (r.timed ? s : <span className="text-fg-4">—</span>);
  const columns: Column<PageEngagement>[] = [
    {
      key: "path",
      header: "page",
      render: (r) => (
        <span className="block max-w-[52vw] sm:max-w-[420px]">
          <span className="block truncate font-mono text-xs text-fg" title={r.path}>
            {r.path}
          </span>
          {r.title && <span className="block truncate text-[11px] text-fg-4">{r.title}</span>}
        </span>
      ),
      sort: (r) => r.path,
    },
    { key: "views", header: "views", align: "right", render: (r) => <Num n={r.views} />, sort: (r) => r.views },
    { key: "visitors", header: "visitors", align: "right", render: (r) => <Num n={r.visitors} />, sort: (r) => r.visitors, hideOnPhone: true },
    { key: "eng", header: "avg engaged", align: "right", render: (r) => <span className="font-mono text-xs tabular-nums">{t(r, fmtDuration(r.avgEngagedSec))}</span>, sort: (r) => (r.timed ? r.avgEngagedSec : null) },
    {
      key: "depth",
      header: "depth",
      align: "right",
      render: (r) =>
        r.timed ? (
          <span className="inline-flex items-center justify-end gap-1.5">
            <span aria-hidden className="relative hidden h-1.5 w-12 bg-surface-2 sm:inline-block">
              <span className="absolute inset-y-0 left-0 bg-signal" style={{ width: `${r.avgDepth}%` }} />
            </span>
            <span className="font-mono text-xs tabular-nums">{r.avgDepth}%</span>
          </span>
        ) : (
          <span className="text-fg-4">—</span>
        ),
      sort: (r) => (r.timed ? r.avgDepth : null),
    },
    { key: "fin", header: "finished", align: "right", render: (r) => <span className="font-mono text-xs tabular-nums">{t(r, fmtPct(r.finishedPct, 0))}</span>, sort: (r) => (r.timed ? r.finishedPct : null) },
    { key: "entries", header: "entries", align: "right", render: (r) => <Num n={r.entries} />, sort: (r) => r.entries, hideOnPhone: true },
    { key: "exits", header: "exits", align: "right", render: (r) => <Num n={r.exits} />, sort: (r) => r.exits, hideOnPhone: true },
    { key: "bounce", header: "bounce", align: "right", render: (r) => <span className="font-mono text-xs tabular-nums">{r.entries ? fmtPct(r.bounceRate, 0) : "—"}</span>, sort: (r) => (r.entries ? r.bounceRate : null), hideOnPhone: true },
  ];
  return (
    <Card
      label="engagement"
      title="Per page"
      className="mb-3"
      action={<span className="font-mono text-[11px] text-fg-4">{data ? `${fmtNum(timed)} timed views · finished = ≥ 90% scrolled` : ""}</span>}
    >
      {error ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : (
        <>
          {data && rows.length > 0 && timed === 0 && (
            <p className="mb-3 border-l-2 border-signal bg-signal/5 px-3 py-2 text-[13px] text-fg-2">
              No engagement timing in this range yet — engaged time and scroll depth start with tracking v2. Older rows only count views.
            </p>
          )}
          <Table
            dense
            minWidth={520}
            loading={loading && !data}
            rows={rows.slice(0, 50)}
            rowKey={(r) => r.path}
            columns={columns}
            initialSort={{ key: "views", dir: "desc" }}
            onRowClick={(r) => onPage(r.path)}
            empty="No page views in this range"
            className="max-h-[560px] overflow-y-auto"
          />
          {rows.length > 50 && <p className="mt-2 font-mono text-[11px] text-fg-4">top 50 of {fmtNum(rows.length)} pages by views · filter to drill in</p>}
        </>
      )}
    </Card>
  );
}

function EventsCard({ data, loading, error, onRetry }: { data?: EventsRes; loading: boolean; error?: Error; onRetry: () => void }) {
  const now = useNow(60_000);
  const columns: Column<EventSummary>[] = [
    {
      key: "name",
      header: "event",
      render: (r) => (
        <span className="block min-w-0">
          <span className="font-mono text-xs text-fg">{r.name}</span>
          {r.top.length > 0 && (
            <span className="mt-0.5 flex flex-wrap gap-1">
              {r.top.slice(0, 3).map((t) => (
                <Badge key={t.value} tone="muted" className="max-w-[160px] truncate">
                  {t.value} · {t.n}
                </Badge>
              ))}
            </span>
          )}
        </span>
      ),
      sort: (r) => r.name,
    },
    { key: "count", header: "count", align: "right", render: (r) => <Num n={r.count} />, sort: (r) => r.count },
    { key: "visitors", header: "people", align: "right", render: (r) => <Num n={r.visitors} />, sort: (r) => r.visitors },
    { key: "users", header: "signed in", align: "right", render: (r) => <Num n={r.users} />, sort: (r) => r.users, hideOnPhone: true },
    { key: "last", header: "last", align: "right", render: (r) => <span className="font-mono text-[11px] text-fg-3">{timeAgo(r.last, now)}</span>, sort: (r) => r.last, hideOnPhone: true },
  ];
  return (
    <Card label="product" title="Learn events">
      {error ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : (
        <Table
          dense
          minWidth={360}
          loading={loading && !data}
          rows={data?.events ?? []}
          rowKey={(r) => r.name}
          columns={columns}
          initialSort={{ key: "count", dir: "desc" }}
          empty="No product events in this range yet (lesson_open, stage_done, trial_result…)"
        />
      )}
    </Card>
  );
}
