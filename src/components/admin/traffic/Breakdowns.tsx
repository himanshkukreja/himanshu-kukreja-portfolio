"use client";

import { useState } from "react";
import { BarList, Card, Drawer, ErrorState, Table, Tabs, fmtNum, fmtPct, type AdminError, type Column } from "@/components/admin/ui";
import type { FilterKey, Filters } from "@/lib/admin/traffic/report";
import type { BreakdownRow, Breakdowns } from "./types";

type Metric = "visitors" | "pageviews" | "sessions";

export type BreakdownTab = {
  id: keyof Breakdowns;
  label: string;
  filter: FilterKey;
  metric?: Metric;
  /** column header for `extra` in the "show all" table */
  extra?: { header: string; format: (n: number) => string };
  /** value used for the filter (cities carry "city|CC") */
  value?: (r: BreakdownRow) => string;
  mono?: boolean;
};

const METRIC_LABEL: Record<Metric, string> = { visitors: "visitors", pageviews: "views", sessions: "sessions" };

export function BreakdownCard({
  label,
  title,
  tabs,
  data,
  loading,
  error,
  onRetry,
  filters,
  onFilter,
}: {
  label: string;
  title: string;
  tabs: BreakdownTab[];
  data?: Breakdowns;
  loading: boolean;
  error?: AdminError;
  onRetry: () => void;
  filters: Filters;
  onFilter: (k: FilterKey, v: string) => void;
}) {
  const [tab, setTab] = useState<keyof Breakdowns>(tabs[0].id);
  const [all, setAll] = useState(false);
  const t = tabs.find((x) => x.id === tab) ?? tabs[0];
  const rows = data?.[t.id] ?? [];
  const metric: Metric = t.metric ?? "visitors";
  const valueOf = t.value ?? ((r: BreakdownRow) => r.key);
  const pick = (r: BreakdownRow) => onFilter(t.filter, valueOf(r));
  const items = rows.map((r) => ({
    key: r.key,
    label: t.mono ? <span className="font-mono text-xs">{r.label}</span> : r.label,
    value: r[metric],
    onClick: () => pick(r),
    active: filters[t.filter] === valueOf(r),
  }));

  const columns: Column<BreakdownRow>[] = [
    {
      key: "label",
      header: t.label,
      render: (r) => <span className={t.mono ? "break-all font-mono text-xs text-fg" : "text-fg"}>{r.label}</span>,
      sort: (r) => r.label,
    },
    { key: "visitors", header: "visitors", align: "right", render: (r) => <Num n={r.visitors} />, sort: (r) => r.visitors },
    { key: "sessions", header: "sessions", align: "right", render: (r) => <Num n={r.sessions} />, sort: (r) => r.sessions, hideOnPhone: true },
    { key: "pageviews", header: "views", align: "right", render: (r) => <Num n={r.pageviews} />, sort: (r) => r.pageviews },
    ...(t.id === "pages"
      ? []
      : [{ key: "bounce", header: "bounce", align: "right" as const, render: (r: BreakdownRow) => <span className="font-mono text-xs tabular-nums">{fmtPct(r.bounceRate, 0)}</span>, sort: (r: BreakdownRow) => r.bounceRate }]),
    ...(t.extra
      ? [{ key: "extra", header: t.extra.header, align: "right" as const, render: (r: BreakdownRow) => <span className="font-mono text-xs tabular-nums">{r.extra == null ? "—" : t.extra!.format(r.extra)}</span>, sort: (r: BreakdownRow) => r.extra ?? 0 }]
      : []),
  ];

  return (
    <Card
      label={label}
      title={title}
      pad={false}
      action={
        rows.length > 8 ? (
          <button type="button" onClick={() => setAll(true)} className="min-h-9 px-2 font-mono text-[11px] text-fg-3 hover:text-fg">
            show all {rows.length} →
          </button>
        ) : null
      }
    >
      <Tabs tabs={tabs.map((x) => ({ id: x.id, label: x.label, count: data ? data[x.id].length : null }))} value={tab} onChange={setTab} label={`${title} breakdown`} className="px-2" />
      <div className="p-3 sm:p-4">
        {error ? (
          <ErrorState error={error} onRetry={onRetry} />
        ) : (
          <BarList items={items} limit={8} loading={loading && !data} valueLabel={METRIC_LABEL[metric]} empty="Nothing for this range" />
        )}
      </div>
      <Drawer open={all} onClose={() => setAll(false)} label={label} title={`${title} · ${t.label}`} width={640}>
        <p className="mb-3 font-mono text-[11px] text-fg-3">tap a row to filter the whole report by it</p>
        <Table
          dense
          minWidth={420}
          rows={rows}
          rowKey={(r) => r.key}
          columns={columns}
          initialSort={{ key: metric === "pageviews" ? "pageviews" : "visitors", dir: "desc" }}
          onRowClick={(r) => {
            pick(r);
            setAll(false);
          }}
        />
      </Drawer>
    </Card>
  );
}

export function Num({ n }: { n: number | null | undefined }) {
  return <span className="font-mono text-xs tabular-nums text-fg">{fmtNum(n)}</span>;
}
