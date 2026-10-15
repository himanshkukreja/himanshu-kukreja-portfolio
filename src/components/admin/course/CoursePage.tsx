"use client";

/**
 * /admin/course — course analytics: lesson funnel in reading order (opened → ≥50% → completed,
 * drop-off between consecutive lessons), week completion, per-lesson table, stage drop-off for one
 * lesson, hardest MCQ questions, and when people learn (day × hour).
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
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
  fmtNum,
  useAdminData,
  useRange,
  type Column,
  type Range,
} from "@/components/admin/ui";
import type { CourseAnalytics, CourseLessonStat, StageDropoff } from "@/lib/admin/learners/types";
import { browserTz, cx, fmtMinutes } from "@/components/admin/learners/bits";

const RANGE_LABEL: Record<Range, string> = { "24h": "24 h", "7d": "7 days", "30d": "30 days", "90d": "90 days", "12m": "12 months" };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CoursePage() {
  const range = useRange("30d");
  const tz = browserTz();
  const { data, error, refresh } = useAdminData<CourseAnalytics>(`/api/admin/course?range=${range}&tz=${encodeURIComponent(tz)}`);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // ?lesson=<course>/<week>/<slug> (from Overview) or <week>/<slug>
  const lessonParam = params.get("lesson") || "";
  const parts = lessonParam.split("/").filter(Boolean);
  const selKey = parts.length >= 2 ? parts.slice(-2).join("/") : "";
  const pickLesson = (key: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("lesson", key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    window.requestAnimationFrame(() => document.getElementById("stages")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const totals = useMemo(() => {
    if (!data) return null;
    const core = data.lessons.filter((l) => l.core);
    const completions = data.lessons.reduce((a, l) => a + l.completed, 0);
    const started = data.weeks.reduce((a, w) => Math.max(a, w.started), 0);
    const times = data.lessons.filter((l) => l.medianTimeSec > 0).map((l) => l.medianTimeSec);
    const guests = data.lessons.reduce((a, l) => a + l.guests, 0);
    const views = data.lessons.reduce((a, l) => a + l.views, 0);
    return { core, completions, started, medTime: times.length ? times.sort((a, b) => a - b)[Math.floor(times.length / 2)] : 0, guests, views };
  }, [data]);

  return (
    <div>
      <PageHead
        path="sudo ~/admin/course"
        title="Course"
        sub={<>How learners move through System Design Mastery. Funnel and lesson numbers are all-time for signed-in learners; guest readers, views and the activity heatmap use the last {RANGE_LABEL[range]}.</>}
        actions={<RangePicker fallback="30d" />}
      />
      {error ? (
        <ErrorState error={error} onRetry={refresh} title="Course analytics unavailable" />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Learners" loading={!data} value={fmtNum(data?.learners)} hint={totals ? `${totals.started} started W00` : undefined} />
            <Kpi label="Lesson completions" loading={!data} value={fmtNum(totals?.completions)} hint="all-time, signed in" />
            <Kpi label="Median lesson time" loading={!data} value={totals ? fmtMinutes(totals.medTime) : "—"} hint="median of per-lesson medians" />
            <Kpi label="Lesson views" loading={!data} value={fmtNum(totals?.views)} hint={totals ? `${fmtNum(totals.guests)} guest readers · ${RANGE_LABEL[range]}` : undefined} />
          </div>

          <div className="mb-6 grid gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <FunnelCard data={data} onPick={pickLesson} selKey={selKey} />
            <div className="flex min-w-0 flex-col gap-3">
              <WeeksCard data={data} />
              <HeatmapCard data={data} range={range} />
            </div>
          </div>

          <Card label="lessons" title="Per-lesson numbers" className="mb-6" pad={false}>
            <div className="p-3">
              <LessonTable data={data} onPick={pickLesson} />
            </div>
          </Card>

          <div className="mb-6 grid gap-3 xl:grid-cols-2">
            <StagesCard data={data} selKey={selKey} onPick={pickLesson} tz={tz} />
            <HardestCard data={data} />
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ funnel

function FunnelCard({ data, onPick, selKey }: { data?: CourseAnalytics; onPick: (k: string) => void; selKey: string }) {
  const [week, setWeek] = useState<string>("all");
  const [showSq, setShowSq] = useState(false);
  if (!data)
    return (
      <Card label="funnel" title="Lesson funnel">
        <Skeleton className="h-96 w-full" />
      </Card>
    );
  const rows = data.lessons.filter((l) => (showSq ? !l.core : l.core) && (week === "all" || l.weekCode === week));
  const max = Math.max(1, ...data.lessons.map((l) => l.opened));
  const weekCodes = Array.from(new Set(data.lessons.filter((l) => l.core).map((l) => l.weekCode)));
  return (
    <Card
      label="funnel"
      title="Opened → read half → completed, in course order"
      pad={false}
      action={
        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-fg-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 bg-signal/25" /> opened
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 bg-signal/60" /> ≥50%
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 bg-signal" /> completed
          </span>
        </div>
      }
    >
      <div className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2 [scrollbar-width:none]">
        {["all", ...weekCodes].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              setWeek(c);
              setShowSq(false);
            }}
            aria-pressed={!showSq && week === c}
            className={cx("min-h-9 shrink-0 border px-2.5 font-mono text-[11px]", !showSq && week === c ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg-2 hover:text-fg")}
          >
            {c === "all" ? "all weeks" : `W${c}`}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowSq((s) => !s)}
          aria-pressed={showSq}
          className={cx("min-h-9 shrink-0 border px-2.5 font-mono text-[11px]", showSq ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg-2 hover:text-fg")}
        >
          side quests
        </button>
      </div>
      <ol className="max-h-[720px] overflow-y-auto px-3 py-2">
        {rows.map((l, i) => {
          const prev = i > 0 ? rows[i - 1] : null;
          const drop = prev && prev.opened > 0 ? (l.opened - prev.opened) / prev.opened : null;
          const big = drop != null && drop <= -0.3 && prev!.opened >= 2;
          const key = `${l.week}/${l.slug}`;
          return (
            <li key={key}>
              {prev && prev.weekCode !== l.weekCode && <div className="mx-0 my-1.5 border-t border-dashed border-line" />}
              <button
                type="button"
                onClick={() => onPick(key)}
                className={cx("group grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-1.5 py-1 text-left hover:bg-surface-2", selKey === key && "bg-surface-2 outline outline-1 outline-signal")}
                title={`${l.title}\nopened ${l.opened} · ≥50% ${l.reached50} · completed ${l.completed}${drop != null ? `\n${Math.round(drop * 100)}% vs previous lesson` : ""}`}
              >
                <span className="min-w-0">
                  <span className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-2">
                    <span className="shrink-0 font-mono text-[10px] text-fg-3 sm:w-[86px]">{l.tag}</span>
                    <span className="truncate text-[13px] text-fg">{l.title}</span>
                  </span>
                  <span className="relative mt-1 block h-2.5 bg-surface-2/50">
                    <span className="absolute inset-y-0 left-0 bg-signal/25" style={{ width: `${(l.opened / max) * 100}%` }} />
                    <span className="absolute inset-y-0 left-0 bg-signal/60" style={{ width: `${(l.reached50 / max) * 100}%` }} />
                    <span className="absolute inset-y-0 left-0 bg-signal" style={{ width: `${(l.completed / max) * 100}%` }} />
                  </span>
                </span>
                <span className="flex w-[118px] items-center justify-end gap-1.5 font-mono text-[11px] tabular-nums">
                  <span className="text-fg">{l.opened}</span>
                  <span className="text-fg-4">·</span>
                  <span className="text-fg-2">{l.reached50}</span>
                  <span className="text-fg-4">·</span>
                  <span className="text-signal-text">{l.completed}</span>
                  {big ? (
                    <Badge tone="bad" className="ml-1" title="Big drop in readers vs the previous lesson">
                      {Math.round(drop! * 100)}%
                    </Badge>
                  ) : (
                    <span className="ml-1 inline-block w-[38px]" />
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="border-t border-line px-4 py-2 font-mono text-[11px] text-fg-4">Red badges: readers fell 30%+ from the previous lesson. Tap a lesson for its stage drop-off.</p>
    </Card>
  );
}

// ------------------------------------------------------------------ weeks

function WeeksCard({ data }: { data?: CourseAnalytics }) {
  return (
    <Card label="weeks" title="Week completion">
      {!data ? (
        <Skeleton className="h-60 w-full" />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {data.weeks.map((w) => (
            <li key={w.key} title={`${w.title}\n${w.started} started · ${w.cleared} cleared · avg ${w.avgPct}% of ${w.nodes} lessons`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-[13px] text-fg">
                  <span className="font-mono text-[11px] text-fg-3">W{w.code}</span> {w.title}
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-fg-3">
                  <span className="text-fg">{w.avgPct}%</span> · {w.started}
                  <span className="text-fg-4">/{w.cleared}</span>
                </span>
              </div>
              <span className="relative mt-1 block h-1.5 bg-surface-2">
                <span className="absolute inset-y-0 left-0 bg-signal" style={{ width: `${w.avgPct}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 font-mono text-[11px] text-fg-4">Bar = average completion among learners who started the week · started / cleared.</p>
    </Card>
  );
}

// ------------------------------------------------------------------ heatmap

function HeatmapCard({ data, range }: { data?: CourseAnalytics; range: Range }) {
  const max = data ? Math.max(1, ...data.heatmap.flat()) : 1;
  const total = data ? data.heatmap.flat().reduce((a, b) => a + b, 0) : 0;
  return (
    <Card label="when" title={`When people learn · ${RANGE_LABEL[range]}`}>
      {!data ? (
        <Skeleton className="h-40 w-full" />
      ) : !total ? (
        <EmptyState title="No lesson activity in this range" />
      ) : (
        <div>
          <div className="grid grid-cols-[30px_repeat(24,minmax(0,1fr))] gap-[2px]">
            <span />
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="text-center font-mono text-[9px] text-fg-4">
                {h % 6 === 0 ? h : ""}
              </span>
            ))}
            {data.heatmap.map((row, d) => (
              <Row key={d} label={DAYS[d]} row={row} max={max} />
            ))}
          </div>
          <p className="mt-3 font-mono text-[11px] text-fg-4">
            Lesson views, learn events and completions by local hour ({data.tz}) · {fmtNum(total)} total
          </p>
        </div>
      )}
    </Card>
  );
}

function Row({ label, row, max }: { label: string; row: number[]; max: number }) {
  return (
    <>
      <span className="font-mono text-[10px] leading-4 text-fg-3">{label}</span>
      {row.map((v, h) => (
        <span
          key={h}
          title={`${label} ${String(h).padStart(2, "0")}:00 · ${v}`}
          className={cx("aspect-square min-h-[10px]", !v && "bg-surface-2")}
          style={v ? { background: `color-mix(in srgb, var(--c-signal) ${Math.round(25 + (v / max) * 75)}%, var(--c-surface))` } : undefined}
        />
      ))}
    </>
  );
}

// ------------------------------------------------------------------ table

function LessonTable({ data, onPick }: { data?: CourseAnalytics; onPick: (k: string) => void }) {
  const cols: Column<CourseLessonStat>[] = [
    { key: "order", header: "#", sort: (l) => l.order, render: (l) => <span className="font-mono text-[11px] text-fg-4">{l.order + 1}</span> },
    {
      key: "title",
      header: "lesson",
      sort: (l) => l.title,
      render: (l) => (
        <div className="min-w-[220px]">
          <div className="font-mono text-[10px] text-fg-3">{l.tag}</div>
          <div className="truncate text-[13px] text-fg">{l.title}</div>
        </div>
      ),
    },
    { key: "opened", header: "readers", align: "right", sort: (l) => l.opened, render: (l) => <Num v={l.opened} /> },
    { key: "completed", header: "done", align: "right", sort: (l) => l.completed, render: (l) => <Num v={l.completed} /> },
    {
      key: "rate",
      header: "rate",
      align: "right",
      sort: (l) => (l.opened ? l.completionRate : -1),
      render: (l) => (l.opened ? <span className={cx("font-mono text-xs tabular-nums", l.completionRate >= 50 ? "text-signal-text" : "text-fg-2")}>{l.completionRate}%</span> : <span className="text-fg-4">—</span>),
    },
    { key: "time", header: "median time", align: "right", sort: (l) => l.medianTimeSec, render: (l) => <span className="font-mono text-xs tabular-nums text-fg-2">{l.medianTimeSec ? fmtMinutes(l.medianTimeSec) : "—"}</span> },
    {
      key: "pct",
      header: "avg progress",
      sort: (l) => l.avgPct,
      render: (l) => (
        <span className="flex items-center gap-2">
          <span className="relative h-1.5 w-16 bg-surface-2">
            <span className="absolute inset-y-0 left-0 bg-signal" style={{ width: `${l.avgPct}%` }} />
          </span>
          <span className="font-mono text-[11px] tabular-nums text-fg-3">{l.opened ? `${l.avgPct}%` : "—"}</span>
        </span>
      ),
    },
    { key: "guests", header: "guests", align: "right", sort: (l) => l.guests, render: (l) => <Num v={l.guests} muted /> },
    { key: "views", header: "views", align: "right", sort: (l) => l.views, render: (l) => <Num v={l.views} muted /> },
    { key: "notes", header: "notes", align: "right", sort: (l) => l.notes, render: (l) => <Num v={l.notes} muted /> },
    { key: "comments", header: "comments", align: "right", sort: (l) => l.comments, render: (l) => <Num v={l.comments} muted /> },
  ];
  return (
    <Table
      columns={cols}
      rows={data?.lessons ?? []}
      rowKey={(l) => `${l.week}/${l.slug}`}
      loading={!data}
      onRowClick={(l) => onPick(`${l.week}/${l.slug}`)}
      initialSort={{ key: "order", dir: "asc" }}
      minWidth={900}
      className="max-h-[620px] overflow-y-auto"
      dense
    />
  );
}

const Num = ({ v, muted }: { v: number; muted?: boolean }) => <span className={cx("font-mono text-xs tabular-nums", v ? (muted ? "text-fg-2" : "text-fg") : "text-fg-4")}>{v || "·"}</span>;

// ------------------------------------------------------------------ stages

function StagesCard({ data, selKey, onPick, tz }: { data?: CourseAnalytics; selKey: string; onPick: (k: string) => void; tz: string }) {
  const fallback = useMemo(() => {
    if (!data) return "";
    const top = [...data.lessons].sort((a, b) => b.opened - a.opened)[0];
    return top ? `${top.week}/${top.slug}` : "";
  }, [data]);
  const key = selKey || fallback;
  const [week, slug] = key.split("/");
  const { data: st, error, refresh } = useAdminData<StageDropoff>(key ? `/api/admin/course/stages?week=${encodeURIComponent(week)}&lesson=${encodeURIComponent(slug)}&tz=${encodeURIComponent(tz)}` : null);
  const max = st ? Math.max(1, ...st.stages.map((s) => s.reached)) : 1;
  return (
    <Card id="stages" label="stages" title={st?.title ? `Stage drop-off · ${st.title}` : "Stage drop-off"}>
      {data && (
        <label className="mb-3 flex flex-col gap-1.5">
          <span className={LABEL}>lesson</span>
          <select value={key} onChange={(e) => onPick(e.target.value)} className="h-10 w-full border border-line-strong bg-surface px-2 text-sm text-fg focus:border-signal focus:outline-none">
            {data.lessons.map((l) => (
              <option key={`${l.week}/${l.slug}`} value={`${l.week}/${l.slug}`}>
                {l.tag} · {l.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {error ? (
        <ErrorState error={error} onRetry={refresh} />
      ) : !st ? (
        <Skeleton className="h-48 w-full" />
      ) : !st.stages.length ? (
        <EmptyState title="No stages" hint="This lesson renders as a single page." />
      ) : (
        <>
          {st.source === "none" && (
            <p className="mb-3 border border-dashed border-line-strong px-3 py-2 text-xs text-fg-3">
              No stage data yet. Counts fill in from <span className="font-mono">stage_reach / stage_done</span> events (tracking v2) or the <span className="font-mono">completed_stages</span> column once
              the migration is applied. The stage list below comes from the lesson itself.
            </p>
          )}
          <ol className="flex flex-col gap-1.5">
            {st.stages.map((s, i) => {
              const prev = i ? st.stages[i - 1] : null;
              const drop = prev && prev.reached ? (s.reached - prev.reached) / prev.reached : null;
              return (
                <li key={s.id} className="grid grid-cols-[minmax(0,1fr)_96px] items-center gap-2" title={`${s.label} · ${s.title}\nreached ${s.reached} · done ${s.done} · ~${s.minutes} min`}>
                  <span className="min-w-0">
                    <span className="flex items-baseline gap-2 text-[13px]">
                      <span className="shrink-0 font-mono text-[11px] text-fg-3">{s.label}</span>
                      <span className="truncate text-fg">{s.title !== s.label ? s.title : ""}</span>
                      <span className="shrink-0 font-mono text-[10px] text-fg-4">{s.minutes}m</span>
                    </span>
                    <span className="relative mt-1 block h-2 bg-surface-2">
                      <span className="absolute inset-y-0 left-0 bg-signal/35" style={{ width: `${(s.reached / max) * 100}%` }} />
                      <span className="absolute inset-y-0 left-0 bg-signal" style={{ width: `${(s.done / max) * 100}%` }} />
                    </span>
                  </span>
                  <span className="text-right font-mono text-[11px] tabular-nums text-fg-2">
                    {s.reached} · <span className="text-signal-text">{s.done}</span>
                    {drop != null && drop <= -0.3 && <span className="ml-1 text-bad-text">{Math.round(drop * 100)}%</span>}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 font-mono text-[11px] text-fg-4">reached · done (distinct readers) · source: {st.source}</p>
        </>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ hardest MCQ

function HardestCard({ data }: { data?: CourseAnalytics }) {
  return (
    <Card label="mcq" title="Hardest questions">
      {!data ? (
        <Skeleton className="h-48 w-full" />
      ) : !data.hardest.length ? (
        <EmptyState title="Not enough answers yet" hint="Questions rank here once learners (admins excluded) answer trial MCQs." />
      ) : (
        <ol className="flex flex-col divide-y divide-line">
          {data.hardest.map((q) => (
            <li key={`${q.week}-${q.n}`} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-2 font-mono text-[11px]">
                <span className="truncate text-fg-3">
                  {q.title} · Q{q.n}
                </span>
                <span className={cx("shrink-0 tabular-nums", q.pct < 50 ? "text-bad-text" : "text-fg-2")}>
                  {q.pct}% · {q.correct}/{q.answered}
                </span>
              </div>
              <p className="mt-1 line-clamp-3 text-sm text-fg">{q.text}</p>
              {q.topWrong && <p className="mt-0.5 truncate font-mono text-[11px] text-fg-4">most picked wrong: {q.topWrong}</p>}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
