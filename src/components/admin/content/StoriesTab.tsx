"use client";

/** Case-file (story) readership from story_views + story_unique_visitors. */
import Link from "next/link";
import { useState } from "react";
import { BarList, Card, ErrorState, Kpi, Table, fmtDate, fmtNum, timeAgo, useAdminData, type Column } from "../ui";
import type { StoryStat } from "../shell/types";
import { Segmented } from "./common";

type Res = { stories: StoryStat[]; totals: { views: number; unique: number; new30d: number } };

export default function StoriesTab() {
  const res = useAdminData<Res>("/api/admin/stories");
  const [metric, setMetric] = useState<"uniqueVisitors" | "totalViews" | "newVisitors30d">("uniqueVisitors");
  const d = res.data;
  const loading = res.loading && !d;

  const columns: Column<StoryStat>[] = [
    {
      key: "title",
      header: "story",
      sort: (s) => s.title.toLowerCase(),
      render: (s) => (
        <Link href={`/stories/${encodeURIComponent(s.slug)}`} target="_blank" className="block max-w-[320px] truncate text-fg hover:text-signal-text">
          {s.title}
        </Link>
      ),
    },
    { key: "unique", header: "unique", align: "right", sort: (s) => s.uniqueVisitors, render: (s) => <span className="font-mono text-xs tabular-nums text-fg">{fmtNum(s.uniqueVisitors)}</span> },
    { key: "views", header: "views", align: "right", sort: (s) => s.totalViews, render: (s) => <span className="font-mono text-xs tabular-nums">{fmtNum(s.totalViews)}</span> },
    { key: "new", header: "new · 30d", align: "right", sort: (s) => s.newVisitors30d, render: (s) => <span className="font-mono text-xs tabular-nums">{fmtNum(s.newVisitors30d)}</span> },
    { key: "last", header: "last view", hideOnPhone: true, sort: (s) => s.lastViewedAt || "", render: (s) => <span className="whitespace-nowrap font-mono text-xs">{timeAgo(s.lastViewedAt)}</span> },
    { key: "date", header: "published", hideOnPhone: true, sort: (s) => s.date || "", render: (s) => <span className="whitespace-nowrap font-mono text-xs">{s.date ? fmtDate(s.date) : "—"}</span> },
  ];

  if (res.error && !d) return <ErrorState error={res.error} onRetry={res.refresh} title="Couldn't load story stats" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Unique readers" value={fmtNum(d?.totals.unique)} loading={loading} />
        <Kpi label="Total views" value={fmtNum(d?.totals.views)} loading={loading} />
        <Kpi label="New · 30d" value={fmtNum(d?.totals.new30d)} loading={loading} />
      </div>
      <Card
        label="story_unique_visitors"
        title="Readers per story"
        action={
          <Segmented
            label="Metric"
            value={metric}
            onChange={setMetric}
            options={[
              { id: "uniqueVisitors", label: "unique" },
              { id: "totalViews", label: "views" },
              { id: "newVisitors30d", label: "new 30d" },
            ]}
          />
        }
      >
        <BarList
          loading={loading}
          limit={10}
          items={[...(d?.stories ?? [])].sort((a, b) => b[metric] - a[metric]).map((s) => ({ key: s.slug, label: s.title, value: s[metric], href: `/stories/${encodeURIComponent(s.slug)}` }))}
          empty="No story views yet"
        />
      </Card>
      <Card label="all stories" title="Every case file">
        <Table columns={columns} rows={d?.stories ?? []} rowKey={(s) => s.slug} loading={loading} minWidth={560} initialSort={{ key: "unique", dir: "desc" }} empty="No stories" dense />
      </Card>
    </div>
  );
}
