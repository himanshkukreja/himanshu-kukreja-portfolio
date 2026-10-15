"use client";

/**
 * /admin/learners — who is learning, where they are, how often they come back.
 * KPIs + activity trend + a searchable, segment-filtered learner table (cards on phones).
 * Sorting/filtering/paging run on the server (GET /api/admin/learners); the URL holds the state.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Kpi,
  LABEL,
  PageHead,
  RangePicker,
  Skeleton,
  Table,
  TrendChart,
  fmtDate,
  fmtNum,
  useAdminData,
  useRange,
  type Column,
  type Range,
} from "@/components/admin/ui";
import type { LearnerRow, LearnersResponse, LearnersSort, Segment } from "@/lib/admin/learners/types";
import { Avatar, DotStrip, FreqBadge, LastSeen, PositionCell, SEGMENTS, SegmentBadges, WeekBar, browserTz, cx, fmtMinutes } from "./bits";

const RANGE_LABEL: Record<Range, string> = { "24h": "24 h", "7d": "7 days", "30d": "30 days", "90d": "90 days", "12m": "12 months" };

const SORT_OPTIONS: { id: LearnersSort; label: string }[] = [
  { id: "lastSeen", label: "last seen" },
  { id: "progress", label: "progress" },
  { id: "frequency", label: "frequency" },
  { id: "completed", label: "lessons done" },
  { id: "time", label: "time spent" },
  { id: "streak", label: "streak" },
  { id: "mcq", label: "MCQ score" },
  { id: "notes", label: "notes" },
  { id: "signedUp", label: "signed up" },
  { id: "name", label: "name" },
];

const xFormat = (range: Range) => (t: string | number) => {
  const d = new Date(range === "24h" ? t : `${t}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(t);
  if (range === "24h") return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (range === "12m") return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

function useParamState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(patch).forEach(([k, v]) => (v == null || v === "" ? next.delete(k) : next.set(k, v)));
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return { params, set };
}

export default function LearnersPage() {
  const range = useRange("30d");
  const { params, set } = useParamState();
  const q = params.get("q") || "";
  const segment = (params.get("segment") || "all") as Segment | "all";
  const sort = (params.get("sort") || "lastSeen") as LearnersSort;
  const dir = params.get("dir") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [draft, setDraft] = useState(q);

  // debounce search into the URL
  useEffect(() => {
    if (draft === q) return;
    const id = window.setTimeout(() => set({ q: draft || null, page: null }), 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const url = `/api/admin/learners?range=${range}&tz=${encodeURIComponent(browserTz())}&q=${encodeURIComponent(q)}&segment=${segment}&sort=${sort}&dir=${dir}&page=${page}&pageSize=50`;
  const { data, error, loading, refresh } = useAdminData<LearnersResponse>(url);
  const k = data?.kpis;
  const router = useRouter();

  const columns = useMemo<Column<LearnerRow>[]>(
    () => [
      {
        key: "name",
        header: "learner · last seen",
        sort: (r) => r.name.toLowerCase(),
        render: (r) => (
          <div className="flex w-[230px] items-start gap-2.5">
            <Avatar name={r.name} src={r.avatar} />
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <Link href={`/admin/learners/${r.id}`} onClick={(e) => e.stopPropagation()} className="truncate font-semibold text-fg hover:underline">
                  {r.name}
                </Link>
                <SegmentBadges r={r} />
              </div>
              <div className="truncate font-mono text-[11px] text-fg-3" title={r.email}>
                {r.email}
              </div>
              <div className="flex min-w-0 items-center gap-1 whitespace-nowrap font-mono text-[11px] text-fg-4" title={`joined ${fmtDate(r.signedUpAt)} · ${[r.device, r.city, r.country].filter(Boolean).join(" · ")}`}>
                <LastSeen at={r.lastSeenAt} />
                <span className="truncate">· {[r.device?.split(" · ")[0], r.country].filter(Boolean).join(" · ") || "no device data"}</span>
              </div>
            </div>
          </div>
        ),
      },
      { key: "position", header: "current position", sort: (r) => r.position?.at || "", render: (r) => <div className="w-[200px]"><PositionCell p={r.position} compact /></div> },
      {
        key: "progress",
        header: "course",
        sort: (r) => r.coursePct * 1000 + r.completed,
        render: (r) => (
          <div className="w-[136px]">
            <div className="mb-1 flex items-baseline justify-between font-mono text-[11px]">
              <span className="text-fg">{r.coursePct}%</span>
              <span className="text-fg-3" title="lessons completed · in progress">
                {r.completed}✓ · {r.inProgress}
              </span>
            </div>
            <WeekBar weeks={r.weeks} />
            <div className="mt-1 font-mono text-[11px] text-fg-3" title="time in lessons (capped per lesson)">
              {fmtMinutes(r.timeSec)}
            </div>
          </div>
        ),
      },
      {
        key: "frequency",
        header: "visits · 30d",
        sort: (r) => r.activeDays30 * 1000 + r.sessions30,
        render: (r) => (
          <div className="w-[140px]">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="whitespace-nowrap font-mono text-[11px] text-fg" title={`${r.activeDays30} active days, ${r.sessions30} sessions`}>
                {r.activeDays30}d · {r.sessions30}s
              </span>
              <FreqBadge f={r.frequency} />
            </div>
            <DotStrip days={r.strip30} />
          </div>
        ),
      },
      {
        key: "engagement",
        header: "streak · mcq · notes",
        sort: (r) => r.streak * 1000 + r.longestStreak,
        render: (r) => (
          <div className="w-[100px] font-mono text-[11px] leading-[18px] text-fg-3">
            <div title={`current streak ${r.streak} · best ${r.longestStreak}`}>
              streak <span className={r.streak ? "text-signal-text" : "text-fg-2"}>{r.streak}</span>/{r.longestStreak}
            </div>
            <div title={r.mcq.answered ? `${r.mcq.correct}/${r.mcq.answered} correct` : "no MCQ answers"}>
              mcq <span className="text-fg-2">{r.mcq.pct == null ? "—" : `${r.mcq.pct}%`}</span>
            </div>
            <div title={`${r.notes} notes · ${r.bookmarks} bookmarks`}>
              notes <span className="text-fg-2">{r.notes}</span>·{r.bookmarks}
            </div>
          </div>
        ),
      },
    ],
    []
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div>
      <PageHead
        path="sudo ~/admin/learners"
        title="Learners"
        sub={<>Who is learning, where they are in the course and how often they come back. Activity windows use the last {RANGE_LABEL[range]}.</>}
        actions={<RangePicker fallback="30d" />}
      />

      {error ? (
        <ErrorState error={error} onRetry={refresh} title="Learner data unavailable" className="mb-6" />
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-7">
          <Kpi label="Learners" loading={!k} value={fmtNum(k?.learners)} hint={k ? `+${fmtNum(k.newInRange)} new · ${RANGE_LABEL[range]}` : undefined} />
          <Kpi label="Active today" loading={!k} value={fmtNum(k?.activeToday)} hint="any learning activity" />
          <Kpi label="Active 7d · 30d" loading={!k} value={k ? `${k.active7d} · ${k.active30d}` : "—"} hint={k ? `${fmtNum(k.activeInRange)} in ${RANGE_LABEL[range]}` : undefined} />
          <Kpi label="Lessons / learner" loading={!k} value={fmtNum(k?.avgLessonsPerLearner, 1)} hint="completed, of those who started" />
          <Kpi label="Completion rate" loading={!k} value={k ? `${k.completionRate}%` : "—"} hint="started lessons finished" />
          <Kpi label="Min / active learner" loading={!k} value={fmtNum(k?.avgMinutesPerActive, 0)} hint={`est. from sessions · ${RANGE_LABEL[range]}`} />
          <Kpi
            label="At-risk"
            loading={!data}
            value={fmtNum(data?.segments["at-risk"])}
            hint="silent 7d+ after starting"
            className="col-span-2 md:col-span-2 2xl:col-span-1"
          />
        </div>
      )}

      <Card label="activity" title={`Active learners per ${range === "24h" ? "hour" : "day"}`} className="mb-6">
        <TrendChart
          loading={!data && !error}
          data={data?.trend ?? []}
          series={[
            { key: "active", label: "Active learners" },
            { key: "completions", label: "Lessons completed" },
          ]}
          height={200}
          formatX={xFormat(range)}
          ariaLabel="Active learners per day"
        />
      </Card>

      {/* filters */}
      <div className="mb-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1 basis-[260px]">
            <span className="sr-only">Search learners</span>
            <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-signal-text">
              $ grep
            </span>
            <input
              type="search"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="name, email or lesson"
              className="h-10 w-full border border-line-strong bg-surface pl-[66px] pr-3 text-sm text-fg placeholder:text-fg-4 focus:border-signal focus:outline-none"
            />
          </label>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2">
              <span className={LABEL}>sort</span>
              <select
                value={sort}
                onChange={(e) => set({ sort: e.target.value, page: null })}
                className="h-10 border border-line-strong bg-surface px-2 font-mono text-xs text-fg focus:border-signal focus:outline-none"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => set({ dir: dir === "desc" ? "asc" : "desc", page: null })}
              aria-label={`Sort ${dir === "desc" ? "ascending" : "descending"}`}
              className="h-10 w-10 border border-line-strong font-mono text-xs text-fg hover:bg-surface-2"
            >
              {dir === "desc" ? "↓" : "↑"}
            </button>
          </div>
        </div>
        <div role="radiogroup" aria-label="Segments" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {SEGMENTS.map((s) => {
            const on = s.id === segment;
            const n = data?.segments[s.id];
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={on}
                title={s.hint}
                onClick={() => set({ segment: s.id === "all" ? null : s.id, page: null })}
                className={cx(
                  "inline-flex min-h-10 shrink-0 items-center gap-2 border px-3 font-mono text-xs",
                  on ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg-2 hover:border-fg-3 hover:text-fg"
                )}
              >
                {s.label}
                {n != null && <span className={cx("tabular-nums", on ? "text-on-signal" : "text-fg-4")}>{n}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* desktop table */}
      <div className="hidden md:block">
        <Table
          columns={columns}
          rows={data?.rows ?? []}
          rowKey={(r) => r.id}
          loading={!data && !error}
          onRowClick={(r) => router.push(`/admin/learners/${r.id}`)}
          minWidth={930}
          empty={<EmptyState title="No learners match" hint="Clear the search or pick another segment." />}
        />
      </div>

      {/* phone cards */}
      <div className="md:hidden">
        {!data && !error ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        ) : data && !data.rows.length ? (
          <EmptyState title="No learners match" hint="Clear the search or pick another segment." />
        ) : (
          <ul className="flex flex-col gap-2">
            {data?.rows.map((r) => (
              <li key={r.id}>
                <LearnerCard r={r} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {data && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-fg-3">
          <span>
            {fmtNum(data.total)} learner{data.total === 1 ? "" : "s"}
            {loading && " · refreshing…"}
            {data.features && !data.features.learnEvents && <span className="text-fg-4"> · stages estimated from scroll % until learn events arrive</span>}
          </span>
          {totalPages > 1 && (
            <span className="flex items-center gap-1">
              <button type="button" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })} className="min-h-10 border border-line-strong px-3 disabled:opacity-40">
                ← prev
              </button>
              <span className="px-2">
                {page} / {totalPages}
              </span>
              <button type="button" disabled={page >= totalPages} onClick={() => set({ page: String(page + 1) })} className="min-h-10 border border-line-strong px-3 disabled:opacity-40">
                next →
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function LearnerCard({ r }: { r: LearnerRow }) {
  return (
    <Link href={`/admin/learners/${r.id}`} className="block border border-line bg-surface p-3.5 active:bg-surface-2">
      <div className="flex items-start gap-3">
        <Avatar name={r.name} src={r.avatar} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-semibold text-fg">{r.name}</span>
            <SegmentBadges r={r} />
          </div>
          <div className="truncate font-mono text-[11px] text-fg-3">{r.email}</div>
        </div>
        <LastSeen at={r.lastSeenAt} />
      </div>
      <div className="mt-3 border-t border-line pt-3">
        <PositionCell p={r.position} compact />
      </div>
      <div className="mt-3">
        <div className="mb-1 flex items-baseline justify-between font-mono text-[11px]">
          <span className="text-fg">{r.coursePct}% course</span>
          <span className="text-fg-3">
            {r.completed} done · {r.inProgress} open · {fmtMinutes(r.timeSec)}
          </span>
        </div>
        <WeekBar weeks={r.weeks} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <DotStrip days={r.strip30} />
        <FreqBadge f={r.frequency} />
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-fg-3">
        <span>
          {r.activeDays30}d active · {r.sessions30} sess
        </span>
        <span>streak {r.streak}/{r.longestStreak}</span>
        {r.mcq.pct != null && <span>mcq {r.mcq.pct}%</span>}
        <span>
          {r.notes} notes · {r.bookmarks} bm
        </span>
        {r.country && <Badge tone="muted">{r.country}</Badge>}
      </div>
    </Link>
  );
}
