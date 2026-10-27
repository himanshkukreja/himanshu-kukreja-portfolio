"use client";

/**
 * /admin/lectures: who watches the video lectures and how much. Every viewer (signed in or not),
 * from the player's lecture_play / lecture_watch / lecture_complete events.
 */
import Link from "next/link";
import { useState } from "react";
import { Card, EmptyState, ErrorState, fmtNum, Kpi, PageHead, Table, timeAgo, TrendChart, useAdminData } from "@/components/admin/ui";

type Resp = {
  days: number;
  totals: { minutes: number; minutes7: number; minutesToday: number; viewers: number; viewers7: number; plays: number; completes: number; lectures: number };
  daily: { day: string; minutes: number; viewers: number }[];
  lectures: { id: string; title: string; group: string; href: string; length: number | null; plays: number; viewers: number; minutes: number; completes: number; votes: number; last: string }[];
  learners: { id: string; userId: string | null; email: string | null; minutes: number; lectures: number; completes: number; last: string }[];
};

const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)} min` : `${Math.round(m)} min`);

export default function LecturesDashboard() {
  const [days, setDays] = useState(30);
  const { data, error, loading } = useAdminData<Resp>(`/api/admin/lectures?days=${days}`, { refreshMs: 60_000 });
  const t = data?.totals;
  return (
    <main className="flex flex-col gap-6">
      <PageHead
        path="admin / lectures"
        title="Video lectures"
        sub="Watch time and completions across every viewer, from the player's own events (tracked from 26 Oct 2026)."
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
      {error && <ErrorState error={error} title="Couldn't load lecture analytics" />}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi loading={loading && !data} label="watch time today" value={t ? fmtMin(t.minutesToday) : "–"} />
        <Kpi loading={loading && !data} label="watch time, 7 days" value={t ? fmtMin(t.minutes7) : "–"} hint={t ? `${fmtNum(t.viewers7)} viewers` : ""} />
        <Kpi loading={loading && !data} label={`watch time, ${days} days`} value={t ? fmtMin(t.minutes) : "–"} hint={t ? `${fmtNum(t.viewers)} viewers · ${fmtNum(t.plays)} plays` : ""} />
        <Kpi loading={loading && !data} label="lectures finished" value={t ? fmtNum(t.completes) : "–"} hint={t ? `of ${fmtNum(t.lectures)} lectures` : ""} />
      </div>
      <Card label="per day" title="Minutes watched and viewers">
        <TrendChart
          loading={loading && !data}
          data={(data?.daily ?? []).map((d) => ({ t: d.day, minutes: d.minutes, viewers: d.viewers }))}
          series={[
            { key: "minutes", label: "minutes", format: (n) => `${Math.round(n)} min` },
            { key: "viewers", label: "viewers", format: (n) => fmtNum(n) },
          ]}
          empty="No lecture watching in this range yet"
        />
      </Card>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card label="lectures" title="What gets watched" pad={false}>
          <Table<Resp["lectures"][number]>
            rowKey={(r) => r.id}
            rows={data?.lectures ?? []}
            loading={loading && !data}
            minWidth={720}
            initialSort={{ key: "minutes", dir: "desc" }}
            empty={<EmptyState title="Nothing watched yet" />}
            columns={[
              {
                key: "title",
                header: "Lecture",
                sort: (r) => r.title,
                render: (r) => (
                  <a href={r.href} target="_blank" rel="noreferrer" className="flex min-w-0 flex-col hover:underline">
                    <span className="truncate text-[13px] text-fg">{r.title}</span>
                    <span className="font-mono text-[10px] text-fg-4">{r.group}</span>
                  </a>
                ),
              },
              { key: "viewers", header: "Viewers", align: "right", sort: (r) => r.viewers, render: (r) => fmtNum(r.viewers) },
              { key: "plays", header: "Plays", align: "right", hideOnPhone: true, sort: (r) => r.plays, render: (r) => fmtNum(r.plays) },
              { key: "minutes", header: "Minutes", align: "right", sort: (r) => r.minutes, render: (r) => fmtNum(Math.round(r.minutes)) },
              {
                key: "avg",
                header: "Avg / viewer",
                align: "right",
                hideOnPhone: true,
                sort: (r) => r.minutes / Math.max(1, r.viewers),
                render: (r) => `${(r.minutes / Math.max(1, r.viewers)).toFixed(1)}${r.length ? ` / ${r.length}` : ""} min`,
              },
              { key: "completes", header: "Finished", align: "right", sort: (r) => r.completes, render: (r) => fmtNum(r.completes) },
              { key: "votes", header: "Upvotes", align: "right", sort: (r) => r.votes, render: (r) => fmtNum(r.votes) },
              { key: "last", header: "Last", hideOnPhone: true, sort: (r) => r.last, render: (r) => timeAgo(r.last) },
            ]}
          />
        </Card>
        <Card label="learners" title="Who watches most" pad={false}>
          <Table<Resp["learners"][number]>
            rowKey={(r) => r.id}
            rows={data?.learners ?? []}
            loading={loading && !data}
            minWidth={420}
            initialSort={{ key: "minutes", dir: "desc" }}
            empty={<EmptyState title="No viewers yet" />}
            columns={[
              {
                key: "who",
                header: "Learner",
                render: (r) =>
                  r.userId ? (
                    <Link href={`/admin/learners/${r.userId}`} className="truncate text-[13px] underline decoration-line-strong underline-offset-2">
                      {r.email || r.userId.slice(0, 8)}
                    </Link>
                  ) : (
                    <span className="font-mono text-[11px] text-fg-3">guest {r.id.slice(0, 6)}</span>
                  ),
              },
              { key: "minutes", header: "Minutes", align: "right", sort: (r) => r.minutes, render: (r) => fmtNum(Math.round(r.minutes)) },
              { key: "lectures", header: "Lectures", align: "right", sort: (r) => r.lectures, render: (r) => fmtNum(r.lectures) },
              { key: "completes", header: "Finished", align: "right", hideOnPhone: true, sort: (r) => r.completes, render: (r) => fmtNum(r.completes) },
              { key: "last", header: "Last", hideOnPhone: true, sort: (r) => r.last, render: (r) => timeAgo(r.last) },
            ]}
          />
        </Card>
      </div>
    </main>
  );
}
