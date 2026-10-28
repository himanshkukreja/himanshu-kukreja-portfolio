"use client";

/**
 * /admin/shorts: how the vertical shorts do. Every viewer (signed in or not), from the feed's own
 * events: plays, short_watch (seconds, how far, finished), opens of the full lecture / article, shares,
 * plus all-time upvotes, saves and comments. Watch time is tracked from 28 Oct 2026.
 */
import { useState } from "react";
import { Card, EmptyState, ErrorState, fmtNum, Kpi, PageHead, Table, timeAgo, TrendChart, useAdminData } from "@/components/admin/ui";

type Row = {
  id: string;
  title: string;
  group: string;
  href: string;
  length: number | null;
  plays: number;
  viewers: number;
  views: number;
  sec: number;
  reach: number;
  done: number;
  skips: number;
  toLecture: number;
  toArticle: number;
  shares: number;
  votes: number;
  saves: number;
  comments: number;
  score: number;
  last: string | null;
};
type Resp = {
  days: number;
  live: number;
  totals: { plays: number; viewers: number; views: number; minutes: number; done: number; skips: number; toLecture: number; toArticle: number; votes: number; saves: number; comments: number };
  daily: { day: string; viewers: number; minutes: number; views: number }[];
  shorts: Row[];
};

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");

export default function ShortsDashboard() {
  const [days, setDays] = useState(30);
  const { data, error, loading } = useAdminData<Resp>(`/api/admin/shorts?days=${days}`, { refreshMs: 60_000 });
  const t = data?.totals;
  const busy = loading && !data;
  return (
    <main className="flex flex-col gap-6">
      <PageHead
        path="admin / shorts"
        title="Shorts"
        sub="Who watches the shorts, how far they get and what they do next. Plays from 27 Oct 2026; watch time, finishes and opens from 28 Oct 2026."
        actions={
          <span className="flex gap-1">
            {[7, 30, 90].map((d) => (
              <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d} className={`min-h-9 border px-2.5 font-mono text-xs ${days === d ? "border-signal text-fg" : "border-line-strong text-fg-3 hover:text-fg"}`}>
                {d} days
              </button>
            ))}
          </span>
        }
      />
      {error && <ErrorState error={error} title="Couldn't load shorts analytics" />}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi loading={busy} label={`viewers, ${days} days`} value={t ? fmtNum(t.viewers) : "–"} hint={t ? `${fmtNum(t.plays)} plays · ${data?.live ?? "–"} shorts live` : ""} />
        <Kpi loading={busy} label="watch time" value={t ? `${fmtNum(t.minutes)} min` : "–"} hint={t ? `${fmtNum(t.views)} tracked views` : ""} />
        <Kpi loading={busy} label="finished" value={t ? pct(t.done, t.views) : "–"} hint={t ? `skipped under 3 s: ${pct(t.skips, t.views)}` : ""} />
        <Kpi loading={busy} label="went deeper" value={t ? fmtNum(t.toLecture + t.toArticle) : "–"} hint={t ? `${fmtNum(t.toLecture)} to the lecture · ${fmtNum(t.toArticle)} to the article` : ""} />
      </div>
      <Card label="per day" title="Viewers and minutes watched">
        <TrendChart
          loading={busy}
          data={(data?.daily ?? []).map((d) => ({ t: d.day, viewers: d.viewers, minutes: d.minutes }))}
          series={[
            { key: "viewers", label: "viewers", format: (n) => fmtNum(n) },
            { key: "minutes", label: "minutes", format: (n) => `${Math.round(n)} min` },
          ]}
          empty="No short watching in this range yet"
        />
      </Card>
      <Card label="shorts" title={`Every short watched (all-time upvotes ${t ? fmtNum(t.votes) : "–"} · saves ${t ? fmtNum(t.saves) : "–"} · comments ${t ? fmtNum(t.comments) : "–"})`} pad={false}>
        <Table<Row>
          rowKey={(r) => r.id}
          rows={data?.shorts ?? []}
          loading={busy}
          minWidth={980}
          initialSort={{ key: "viewers", dir: "desc" }}
          empty={<EmptyState title="Nothing watched yet" />}
          columns={[
            {
              key: "title",
              header: "Short",
              sort: (r) => r.title,
              render: (r) => (
                <a href={r.href} target="_blank" rel="noreferrer" className="flex min-w-0 flex-col hover:underline">
                  <span className="truncate text-[13px] text-fg">{r.title}</span>
                  <span className="truncate font-mono text-[10px] text-fg-4">{r.group}</span>
                </a>
              ),
            },
            { key: "viewers", header: "Viewers", align: "right", sort: (r) => r.viewers, render: (r) => fmtNum(r.viewers) },
            { key: "plays", header: "Plays", align: "right", hideOnPhone: true, sort: (r) => r.plays, render: (r) => fmtNum(r.plays) },
            { key: "avg", header: "Avg watch", align: "right", sort: (r) => (r.views ? r.sec / r.views : 0), render: (r) => (r.views ? `${Math.round(r.sec / r.views)}${r.length ? ` / ${r.length}` : ""} s` : "–") },
            { key: "reach", header: "Reach", align: "right", hideOnPhone: true, sort: (r) => r.reach, render: (r) => (r.views ? `${Math.round(r.reach * 100)}%` : "–") },
            { key: "done", header: "Finished", align: "right", sort: (r) => (r.views ? r.done / r.views : 0), render: (r) => pct(r.done, r.views) },
            { key: "skips", header: "Skipped", align: "right", hideOnPhone: true, sort: (r) => (r.views ? r.skips / r.views : 0), render: (r) => pct(r.skips, r.views) },
            { key: "deeper", header: "→ Lecture / article", align: "right", hideOnPhone: true, sort: (r) => r.toLecture + r.toArticle, render: (r) => `${fmtNum(r.toLecture)} / ${fmtNum(r.toArticle)}` },
            { key: "votes", header: "Upvotes", align: "right", sort: (r) => r.votes, render: (r) => fmtNum(r.votes) },
            { key: "saves", header: "Saves", align: "right", hideOnPhone: true, sort: (r) => r.saves, render: (r) => fmtNum(r.saves) },
            { key: "comments", header: "Comments", align: "right", hideOnPhone: true, sort: (r) => r.comments, render: (r) => fmtNum(r.comments) },
            { key: "score", header: "Top score", align: "right", hideOnPhone: true, sort: (r) => r.score, render: (r) => r.score.toFixed(2) },
            { key: "last", header: "Last", hideOnPhone: true, sort: (r) => r.last || "", render: (r) => (r.last ? timeAgo(r.last) : "–") },
          ]}
        />
      </Card>
    </main>
  );
}
