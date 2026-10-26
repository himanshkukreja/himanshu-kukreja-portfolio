"use client";

/**
 * /admin/learners/[id] — one learner: identity, current position + resume point, course map,
 * 12-week activity calendar, timeline, MCQ results, notes/bookmarks, devices, and admin actions
 * (reset with parts, export JSON/CSV).
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Badge,
  BarList,
  Card,
  ConfirmButton,
  Drawer,
  EmptyState,
  ErrorState,
  Kpi,
  LABEL,
  Skeleton,
  Tabs,
  fmtDate,
  fmtNum,
  timeAgo,
  useAdminClient,
  useAdminData,
} from "@/components/admin/ui";
import type { LearnerDetail, MapCell, McqResult, TimelineItem } from "@/lib/admin/learners/types";
import { Avatar, DotStrip, FreqBadge, LastSeen, PositionCell, SegmentBadges, Stat, WeekBar, browserTz, cx, fmtHours, fmtMinutes } from "./bits";

export default function LearnerDetailPage({ id }: { id: string }) {
  const tz = browserTz();
  const { data, error, refresh } = useAdminData<LearnerDetail>(`/api/admin/learners/${encodeURIComponent(id)}?tz=${encodeURIComponent(tz)}`);
  const [resetOpen, setResetOpen] = useState(false);

  if (error)
    return (
      <div>
        <BackLink />
        <ErrorState error={error} onRetry={refresh} title={error.status === 404 ? "No learner with this id" : "Couldn't load this learner"} />
      </div>
    );
  if (!data)
    return (
      <div className="flex flex-col gap-3">
        <BackLink />
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );

  const r = data.learner;
  return (
    <div>
      <BackLink />
      {/* identity */}
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3.5">
          <Avatar name={r.name} src={r.avatar} size={56} />
          <div className="min-w-0">
            <div className="font-mono text-xs text-fg-3">
              <span className="text-signal-text">$</span> finger {r.email.split("@")[0]}
            </div>
            <h1 className="mt-0.5 break-words font-display text-[28px] font-extrabold leading-[1.05] tracking-tightest text-fg sm:text-[36px]">{r.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="break-all font-mono text-xs text-fg-2">{r.email}</span>
              {r.provider && <Badge tone="muted">{r.provider}</Badge>}
              <FreqBadge f={r.frequency} />
              <SegmentBadges r={r} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-fg-3">
              <span>joined {fmtDate(r.signedUpAt)}</span>
              <span>
                last seen <LastSeen at={r.lastSeenAt} />
              </span>
              <span>last sign-in {timeAgo(r.lastSignInAt)}</span>
              {r.device && <span>{r.device}</span>}
              {(r.city || r.country) && <span>{[r.city, r.country].filter(Boolean).join(", ")}</span>}
            </div>
          </div>
        </div>
        <Actions id={id} email={r.email} onReset={() => setResetOpen(true)} />
      </header>

      {/* position + resume */}
      <div className="mb-3 grid gap-3 lg:grid-cols-2">
        <Card label="current position" title={r.position ? timeAgo(r.position.at) : "Not started"}>
          {r.position ? (
            <>
              <PositionCell p={r.position} />
              <div className="mt-3 h-1.5 w-full bg-surface-2">
                <div className="h-full bg-signal" style={{ width: `${r.position.status === "completed" ? 100 : r.position.pct}%` }} />
              </div>
              <p className="mt-2 font-mono text-[11px] text-fg-4">
                via {r.position.source === "event" ? "learn event" : r.position.source === "progress" ? "progress row" : "page view"}
                {r.position.stageSource === "estimate" && " · stage estimated from scroll %"} ·{" "}
                <a href={r.position.href} target="_blank" rel="noreferrer" className="underline-offset-4 hover:text-fg hover:underline">
                  open lesson ↗
                </a>
              </p>
            </>
          ) : (
            <EmptyState title="Hasn't opened a lesson" hint="Signed up but no lesson views or progress rows yet." />
          )}
        </Card>
        <Card label="resume point" title={data.resume ? data.resume.title : "Nothing left to resume"}>
          {data.resume ? (
            <div>
              <div className="font-mono text-[11px] text-signal-text">{data.resume.tag}</div>
              {data.resume.stageLabel && <div className="mt-0.5 font-mono text-xs text-fg-2">▸ {data.resume.stageLabel}</div>}
              <p className="mt-2 text-sm text-fg-3">{data.resume.reason}.</p>
              <a href={data.resume.href} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-10 items-center font-mono text-xs text-fg-3 underline-offset-4 hover:text-fg hover:underline">
                {data.resume.href.replace(/^\/learn\/[^/]+\//, "…/")} ↗
              </a>
            </div>
          ) : (
            <p className="text-sm text-fg-3">Every core lesson is complete.</p>
          )}
        </Card>
      </div>

      {/* stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Course" value={`${r.coursePct}%`} hint={`${r.completed} done · ${r.inProgress} open · ${r.sideQuestsDone} SQ`} />
        <Kpi label="Time" value={fmtHours(r.timeSec)} hint="capped per lesson" />
        <Kpi label="Active · 30d" value={`${r.activeDays30}d`} hint={`${r.sessions30} sessions · ${r.activeDaysTotal}d all-time`} />
        <Kpi label="Streak" value={r.streak} hint={`best ${r.longestStreak} days`} />
        <Kpi label="MCQ" value={r.mcq.pct == null ? "—" : `${r.mcq.pct}%`} hint={r.mcq.answered ? `${r.mcq.correct}/${r.mcq.answered} correct` : "no answers yet"} />
        <Kpi label="Notes · bm" value={`${r.notes} · ${r.bookmarks}`} hint={`${r.comments} comment${r.comments === 1 ? "" : "s"}`} />
      </div>

      <CourseMapCard data={data} />

      <div className="mb-6 grid gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <CalendarCard data={data} />
        <Card label="last 30 days" title="Visit rhythm">
          <DotStrip days={r.strip30} className="mb-3" />
          <div className="grid grid-cols-2 gap-3">
            <Stat label="active days">{r.activeDays30} / 30</Stat>
            <Stat label="sessions">{r.sessions30}</Stat>
            <Stat label="frequency">{r.frequency}</Stat>
            <Stat label="streak · best">
              {r.streak} · {r.longestStreak}
            </Stat>
          </div>
          {data.streakDays.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <div className={cx(LABEL, "mb-2")}>completion days (learning_streaks)</div>
              <ul className="flex flex-wrap gap-1.5">
                {data.streakDays.slice(0, 24).map((s) => (
                  <li key={s.d} title={`${s.lessons} lesson(s) · ${fmtMinutes(s.timeSec)}`}>
                    <Badge tone="neutral">
                      {new Date(`${s.d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {s.lessons}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <div className="mb-6 grid gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <TimelineCard items={data.timeline} />
        <div className="flex min-w-0 flex-col gap-3">
          <Card label="devices">
            <BarList items={data.devices.map((d) => ({ key: d.label, label: d.label, value: d.n }))} empty="No tracked visits" valueLabel="events · share" />
          </Card>
          <Card label="locations">
            <BarList items={data.locations.map((d) => ({ key: d.label, label: d.label, value: d.n }))} empty="No location data" valueLabel="events · share" />
          </Card>
          <Card label="first visit">
            {data.firstVisit ? (
              <div className="grid grid-cols-2 gap-3">
                <Stat label="when">{fmtDate(data.firstVisit.at, true)}</Stat>
                <Stat label="landing">
                  <span className="font-mono text-xs" title={data.firstVisit.path}>
                    {data.firstVisit.path}
                  </span>
                </Stat>
                <Stat label="referrer">{data.firstVisit.referrer || "direct / none"}</Stat>
                <Stat label="utm">{data.firstVisit.utm || "—"}</Stat>
                <Stat label="device">{data.firstVisit.device || "—"}</Stat>
                <Stat label="place">{[data.firstVisit.city, data.firstVisit.country].filter(Boolean).join(", ") || "—"}</Stat>
              </div>
            ) : (
              <p className="text-sm text-fg-3">No tracked visit for this learner&apos;s browsers.</p>
            )}
          </Card>
        </div>
      </div>

      <McqCard mcq={data.mcq} trials={data.trials} />

      <NotesCard data={data} />

      <ResetDrawer open={resetOpen} onClose={() => setResetOpen(false)} data={data} onDone={refresh} />
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/admin/learners" className="mb-3 inline-flex min-h-10 items-center font-mono text-xs text-fg-3 hover:text-fg">
      ← learners
    </Link>
  );
}

// ------------------------------------------------------------------ actions

function Actions({ id, email, onReset }: { id: string; email: string; onReset: () => void }) {
  const client = useAdminClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const download = async (format: "json" | "csv") => {
    setBusy(format);
    setErr(null);
    try {
      const body = await client.text(`/api/admin/learners/${encodeURIComponent(id)}/export?format=${format}`);
      const blob = new Blob([body], { type: format === "csv" ? "text/csv" : "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `learner-${email.replace(/[^a-z0-9._-]+/gi, "_")}.${format}`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => download("json")} disabled={!!busy} className="min-h-10 border border-line-strong px-3 font-mono text-xs text-fg-2 hover:bg-surface-2 hover:text-fg disabled:opacity-50">
          {busy === "json" ? "…" : "↓ json"}
        </button>
        <button type="button" onClick={() => download("csv")} disabled={!!busy} className="min-h-10 border border-line-strong px-3 font-mono text-xs text-fg-2 hover:bg-surface-2 hover:text-fg disabled:opacity-50">
          {busy === "csv" ? "…" : "↓ csv"}
        </button>
        <Link href={`/admin/journeys/person/${encodeURIComponent(id)}`} className="inline-flex min-h-10 items-center border border-line-strong px-3 font-mono text-xs text-fg-2 hover:bg-surface-2 hover:text-fg">
          journey + replays →
        </Link>
        <button type="button" onClick={onReset} className="min-h-10 border border-line-strong px-3 font-mono text-xs text-fg-2 hover:border-bad hover:text-bad-text">
          reset…
        </button>
      </div>
      {err && <span className="font-mono text-[11px] text-bad-text">{err}</span>}
    </div>
  );
}

// ------------------------------------------------------------------ course map

const cellStyle = (c: MapCell) => {
  if (c.status === "completed") return { background: "var(--c-signal)", color: "var(--c-on-signal)" };
  if (c.status === "in_progress") return { background: `color-mix(in srgb, var(--c-signal) ${Math.round(14 + c.pct * 0.5)}%, var(--c-surface))`, color: "var(--c-fg)" };
  if (c.visits > 0 || c.startedAt) return { background: "var(--c-surface-2)", color: "var(--c-fg-2)" };
  return undefined;
};

function cellTitle(c: MapCell) {
  const lines = [
    c.title,
    c.status === "completed" ? `completed ${fmtDate(c.completedAt, true)}` : c.status === "in_progress" ? `in progress · ${c.pct}%` : c.startedAt || c.visits ? "opened, no progress" : "not started",
  ];
  if (c.startedAt) lines.push(`started ${fmtDate(c.startedAt, true)}`);
  if (c.lastAt) lines.push(`last ${fmtDate(c.lastAt, true)}`);
  if (c.timeSec) lines.push(`time ${fmtMinutes(c.timeSec)}`);
  if (c.visits) lines.push(`${c.visits} page view${c.visits === 1 ? "" : "s"}`);
  return lines.join("\n");
}

function MapCellButton({ c, on, onPick }: { c: MapCell; on: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      title={cellTitle(c)}
      aria-pressed={on}
      aria-label={`${c.code} ${c.title}: ${c.status.replace("_", " ")}${c.status === "in_progress" ? ` ${c.pct}%` : ""}`}
      className={cx(
        "grid h-10 min-w-10 place-items-center border px-1 font-mono text-[11px] font-semibold",
        on ? "border-fg outline outline-1 outline-fg" : "border-line",
        !cellStyle(c) && "border-dashed text-fg-4"
      )}
      style={cellStyle(c)}
    >
      {c.code}
    </button>
  );
}

function CourseMapCard({ data }: { data: LearnerDetail }) {
  const [pick, setPick] = useState<string | null>(null);
  const all = useMemo(() => [...data.map.flatMap((w) => w.cells), ...data.sideQuests], [data]);
  const sel = all.find((c) => `${c.week}/${c.slug}` === pick) || null;
  return (
    <Card
      label="course map"
      title="Every lesson, coloured by status"
      className="mb-6"
      action={
        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-fg-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 bg-signal" /> done
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3" style={{ background: "color-mix(in srgb, var(--c-signal) 35%, var(--c-surface))" }} /> in progress
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 bg-surface-2" /> opened
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 border border-dashed border-line-strong" /> not started
          </span>
        </div>
      }
    >
      <div className="flex flex-col gap-2.5 sm:gap-1.5">
        {data.map.map((w) => {
          const seg = data.learner.weeks.find((s) => s.key === w.key);
          return (
            <div key={w.key} className="grid grid-cols-1 items-center gap-1 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] sm:gap-2">
              <div className="flex min-w-0 items-baseline gap-2 sm:block">
                <div className="shrink-0 font-mono text-[11px] text-fg-2">
                  W{w.code}
                  {seg && (
                    <span className="text-fg-4">
                      {" "}
                      {seg.done}/{seg.total}
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-fg-3">{w.title}</div>
              </div>
              <div className="flex flex-wrap gap-1">
                {w.cells.map((c) => (
                  <MapCellButton key={c.slug} c={c} on={pick === `${c.week}/${c.slug}`} onPick={() => setPick(pick === `${c.week}/${c.slug}` ? null : `${c.week}/${c.slug}`)} />
                ))}
              </div>
            </div>
          );
        })}
        {data.sideQuests.length > 0 && (
          <div className="mt-1 grid grid-cols-1 items-center gap-1 border-t border-line pt-2.5 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] sm:gap-2">
            <div className="font-mono text-[11px] text-fg-2">
              SQ<span className="text-fg-4"> side quests</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {data.sideQuests.map((c) => (
                <MapCellButton key={c.slug} c={c} on={pick === `${c.week}/${c.slug}`} onPick={() => setPick(pick === `${c.week}/${c.slug}` ? null : `${c.week}/${c.slug}`)} />
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="mt-3 border-t border-line pt-3" aria-live="polite">
        {sel ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label={sel.code} className="col-span-2">
              <a href={sel.href} target="_blank" rel="noreferrer" className="hover:underline">
                {sel.title} ↗
              </a>
            </Stat>
            <Stat label="status">{sel.status === "completed" ? "completed" : sel.status === "in_progress" ? `${sel.pct}% read` : sel.startedAt || sel.visits ? "opened" : "not started"}</Stat>
            <Stat label="time">{sel.timeSec ? fmtMinutes(sel.timeSec) : "—"}</Stat>
            <Stat label="started">{fmtDate(sel.startedAt, true)}</Stat>
            <Stat label={sel.completedAt ? "completed" : "last"}>{fmtDate(sel.completedAt || sel.lastAt, true)}</Stat>
          </div>
        ) : (
          <p className="font-mono text-[11px] text-fg-4">Tap or hover a cell for dates and time spent.</p>
        )}
      </div>
      <div className="mt-3">
        <WeekBar weeks={data.learner.weeks} height={6} />
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ calendar

function CalendarCard({ data }: { data: LearnerDetail }) {
  const cal = data.calendar;
  const max = Math.max(1, ...cal.map((c) => c.n));
  // columns = weeks (Mon-first), rows = weekdays
  const first = cal[0] ? new Date(`${cal[0].d}T00:00:00`) : new Date();
  const lead = (first.getDay() + 6) % 7;
  const cells: ({ d: string; n: number } | null)[] = [...Array.from({ length: lead }, () => null), ...cal];
  const cols = Math.ceil(cells.length / 7);
  const active = cal.filter((c) => c.n > 0).length;
  return (
    <Card label="activity calendar" title={`${active} active day${active === 1 ? "" : "s"} in 12 weeks`}>
      <div className="flex gap-2 overflow-x-auto">
        <div className="grid shrink-0 grid-rows-7 gap-[3px] pt-5 font-mono text-[10px] leading-[18px] text-fg-4">
          {["M", "", "W", "", "F", "", "S"].map((d, i) => (
            <span key={i} className="h-[18px]">
              {d}
            </span>
          ))}
        </div>
        <div>
          <div className="mb-1 flex h-4 gap-[3px] font-mono text-[10px] text-fg-4">
            {Array.from({ length: cols }, (_, ci) => {
              const c = cells[ci * 7] || cells[ci * 7 + 6];
              const dd = c ? new Date(`${c.d}T00:00:00`) : null;
              return (
                <span key={ci} className="w-[18px] overflow-visible whitespace-nowrap">
                  {dd && dd.getDate() <= 7 ? dd.toLocaleDateString("en-IN", { month: "short" }) : ""}
                </span>
              );
            })}
          </div>
          <div className="grid grid-flow-col grid-rows-7 gap-[3px]">
            {cells.map((c, i) =>
              c ? (
                <span
                  key={c.d}
                  title={`${new Date(`${c.d}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}: ${c.n} activit${c.n === 1 ? "y" : "ies"}`}
                  className={cx("h-[18px] w-[18px]", !c.n && "bg-surface-2")}
                  style={c.n ? { background: `color-mix(in srgb, var(--c-signal) ${Math.round(35 + (c.n / max) * 65)}%, var(--c-surface))` } : undefined}
                />
              ) : (
                <span key={`pad-${i}`} className="h-[18px] w-[18px]" />
              )
            )}
          </div>
        </div>
      </div>
      <p className="mt-3 font-mono text-[11px] text-fg-4">Lesson views, progress writes, MCQ answers, notes and bookmarks per day ({data.tz}).</p>
    </Card>
  );
}

// ------------------------------------------------------------------ timeline

const KIND_GLYPH: Record<TimelineItem["kind"], string> = {
  session: "▶",
  started: "+",
  completed: "✓",
  mcq: "?",
  note: "✎",
  bookmark: "★",
  comment: "❝",
  event: "•",
};

function TimelineCard({ items }: { items: TimelineItem[] }) {
  const [filter, setFilter] = useState<"all" | "sessions" | "progress" | "notes">("all");
  const [limit, setLimit] = useState(40);
  const shown = items.filter((t) =>
    filter === "all" ? true : filter === "sessions" ? t.kind === "session" : filter === "progress" ? ["started", "completed", "mcq", "event"].includes(t.kind) : ["note", "bookmark", "comment"].includes(t.kind)
  );
  const groups: { day: string; items: TimelineItem[] }[] = [];
  shown.slice(0, limit).forEach((t) => {
    const day = new Date(t.at).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(t);
    else groups.push({ day, items: [t] });
  });
  return (
    <Card label="timeline" title="Sessions, lesson visits and milestones" pad={false}>
      <Tabs
        className="px-2"
        value={filter}
        onChange={(v) => {
          setFilter(v);
          setLimit(40);
        }}
        tabs={[
          { id: "all", label: "all", count: items.length },
          { id: "sessions", label: "sessions", count: items.filter((t) => t.kind === "session").length },
          { id: "progress", label: "progress", count: items.filter((t) => ["started", "completed", "mcq", "event"].includes(t.kind)).length },
          { id: "notes", label: "notes", count: items.filter((t) => ["note", "bookmark", "comment"].includes(t.kind)).length },
        ]}
      />
      <div className="max-h-[640px] overflow-y-auto px-4 py-3">
        {!groups.length ? (
          <EmptyState title="Nothing recorded" />
        ) : (
          groups.map((g) => (
            <section key={g.day} className="mb-4 last:mb-0">
              <h3 className={cx(LABEL, "sticky top-0 z-[1] mb-1.5 bg-surface py-1")}>{g.day}</h3>
              <ol className="flex flex-col border-l border-line">
                {g.items.map((t, i) => (
                  <TimelineRow key={`${t.kind}-${t.at}-${i}`} t={t} />
                ))}
              </ol>
            </section>
          ))
        )}
        {shown.length > limit && (
          <button type="button" onClick={() => setLimit((l) => l + 60)} className="mt-2 min-h-10 w-full border border-line-strong font-mono text-xs text-fg-2 hover:bg-surface-2">
            show more ({shown.length - limit})
          </button>
        )}
      </div>
    </Card>
  );
}

type SessionPage = Extract<TimelineItem, { kind: "session" }>["pages"][number];

const fmtSecs = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`);

/** The session's pages in order: time open, scroll depth and what happened there. */
function SessionPages({ pages }: { pages: SessionPage[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? pages : pages.slice(0, 6);
  return (
    <ol className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
      {shown.map((p, i) => (
        <li key={i} className="min-w-0 text-xs text-fg-2">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 font-mono text-[10px] text-fg-4">{new Date(p.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
            <span className="min-w-0 truncate" title={p.path}>
              {p.title}
            </span>
            {(p.secs != null || p.depth != null) && (
              <span className="ml-auto shrink-0 font-mono text-[10px] text-fg-3">
                {p.secs != null ? fmtSecs(p.secs) : ""}
                {p.depth != null ? ` · ${p.depth}%` : ""}
              </span>
            )}
          </div>
          {p.actions && p.actions.length > 0 && (
            <div className="mt-0.5 flex flex-wrap gap-1 pl-10">
              {p.actions.map((a, k) => (
                <span key={k} className="border border-line px-1 font-mono text-[10px] text-fg-3">
                  {a}
                </span>
              ))}
            </div>
          )}
        </li>
      ))}
      {pages.length > 6 && (
        <li>
          <button type="button" onClick={() => setAll((x) => !x)} className="min-h-8 font-mono text-[11px] text-signal-text underline underline-offset-4">
            {all ? "show fewer" : `show all ${pages.length} pages`}
          </button>
        </li>
      )}
    </ol>
  );
}

function TimelineRow({ t }: { t: TimelineItem }) {
  const time = new Date(t.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  const glyph = (
    <span aria-hidden className={cx("absolute -left-[9px] top-2 grid h-[17px] w-[17px] place-items-center border bg-surface font-mono text-[10px]", t.kind === "completed" ? "border-signal text-signal-text" : "border-line-strong text-fg-3")}>
      {KIND_GLYPH[t.kind]}
    </span>
  );
  let body: React.ReactNode;
  if (t.kind === "session") {
    body = (
      <>
        <div className="text-[13px] text-fg">
          Session · {t.minutes < 1 ? "<1" : Math.round(t.minutes)} min · {t.pages.length} page{t.pages.length === 1 ? "" : "s"}
        </div>
        <div className="font-mono text-[11px] text-fg-3">{[t.device, [t.city, t.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</div>
        {t.pages.length > 0 && <SessionPages pages={t.pages} />}
      </>
    );
  } else if (t.kind === "started" || t.kind === "completed") {
    body = (
      <div className="text-[13px] text-fg">
        {t.kind === "completed" ? <span className="text-signal-text">Completed</span> : "Started"} · {t.title}
      </div>
    );
  } else if (t.kind === "mcq") {
    body = (
      <div className="text-[13px] text-fg">
        Answered {t.answered} question{t.answered === 1 ? "" : "s"} · <span className="text-fg-3">{t.title}</span>
      </div>
    );
  } else if (t.kind === "event") {
    body = (
      <div className="text-[13px] text-fg">
        <span className="font-mono text-xs text-signal-text">{t.name}</span> {t.title} <span className="text-fg-3">{t.detail}</span>
      </div>
    );
  } else if (t.kind === "note" || t.kind === "bookmark" || t.kind === "comment") {
    body = (
      <>
        <div className="text-[13px] text-fg">
          {t.kind === "note" ? "Note" : t.kind === "bookmark" ? "Bookmark" : "Comment"} · <span className="text-fg-3">{t.title}</span>
        </div>
        {t.text && <div className="line-clamp-2 text-xs text-fg-3">{t.text}</div>}
      </>
    );
  }
  return (
    <li className="relative min-w-0 py-1.5 pl-5">
      {glyph}
      <div className="flex min-w-0 gap-2">
        <span className="w-10 shrink-0 pt-0.5 font-mono text-[11px] text-fg-4">{time}</span>
        <div className="min-w-0 flex-1">{body}</div>
      </div>
    </li>
  );
}

// ------------------------------------------------------------------ MCQ

function McqCard({ mcq, trials }: { mcq: McqResult[]; trials: LearnerDetail["trials"] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState<{ a: string; n: number } | null>(null);
  return (
    <Card label="mcq" title="Assessment results" className="mb-6">
      {!mcq.length && !trials.length ? (
        <EmptyState title="No MCQ answers yet" hint="Scores appear once the learner answers trial questions." />
      ) : (
        <div className="flex flex-col gap-4">
          {mcq.map((m) => {
            const pct = m.answered ? Math.round((m.correct / m.answered) * 100) : 0;
            const isOpen = open === m.assessmentId;
            const sel = q && q.a === m.assessmentId ? m.questions.find((x) => x.n === q.n) : null;
            return (
              <div key={m.assessmentId} className="border border-line">
                <button type="button" onClick={() => setOpen(isOpen ? null : m.assessmentId)} aria-expanded={isOpen} className="flex min-h-12 w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-fg">{m.title}</span>
                    <span className="font-mono text-[11px] text-fg-3">
                      {m.answered}/{m.total} answered · {m.correct} correct · last {timeAgo(m.lastAt)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-display text-2xl font-extrabold tracking-tight text-fg">{pct}%</span>
                    <span className="font-mono text-xs text-fg-3">{isOpen ? "▲" : "▼"}</span>
                  </span>
                </button>
                <div className="grid gap-1.5 border-t border-line px-3 py-2.5 sm:grid-cols-2 xl:grid-cols-3">
                  {m.parts.map((p) => (
                    <div key={p.n} className="min-w-0">
                      <div className="flex items-baseline justify-between gap-2 font-mono text-[11px]">
                        <span className="truncate text-fg-2" title={p.title}>
                          P{p.n} · {p.title}
                        </span>
                        <span className={cx("shrink-0", p.passed ? "text-ok" : "text-fg-3")}>
                          {p.correct}/{p.total}
                          {p.passed && " ✓"}
                        </span>
                      </div>
                      <div className="mt-1 flex h-1.5 gap-[2px]">
                        <span className="bg-signal" style={{ flex: `${p.correct} 1 0` }} />
                        <span className="bg-fg-4/60" style={{ flex: `${p.answered - p.correct} 1 0` }} />
                        <span className="bg-surface-2" style={{ flex: `${Math.max(0, p.total - p.answered)} 1 0` }} />
                      </div>
                    </div>
                  ))}
                </div>
                {isOpen && (
                  <div className="border-t border-line px-3 py-3">
                    <div className={cx(LABEL, "mb-2 flex flex-wrap gap-3")}>
                      <span>
                        <span className="text-ok">✓</span> correct
                      </span>
                      <span>
                        <span className="text-bad-text">✗</span> wrong
                      </span>
                      <span>tap a question for its text</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {m.questions.map((x) => (
                        <button
                          key={x.n}
                          type="button"
                          onClick={() => setQ(sel?.n === x.n ? null : { a: m.assessmentId, n: x.n })}
                          title={`Q${x.n}: picked ${x.picked}${x.correct ? `, answer ${x.correct}` : ""}`}
                          className={cx(
                            "grid h-10 w-10 place-items-center border font-mono text-[11px]",
                            x.ok === true ? "border-ok/60 text-ok" : x.ok === false ? "border-bad/60 bg-bad/10 text-bad-text" : "border-line text-fg-4",
                            sel?.n === x.n && "outline outline-1 outline-fg"
                          )}
                        >
                          {x.ok === false ? "✗" : ""}
                          {x.n}
                        </button>
                      ))}
                    </div>
                    {sel && (
                      <div className="mt-3 border-l-2 border-signal pl-3">
                        <div className="font-mono text-[11px] text-fg-3">
                          Q{sel.n} · part {sel.part} · picked <span className={sel.ok ? "text-ok" : "text-bad-text"}>{sel.picked}</span>
                          {sel.correct && <> · answer {sel.correct}</>}
                        </div>
                        <p className="mt-1 text-sm text-fg">{sel.text}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {trials.length > 0 && (
            <div>
              <div className={cx(LABEL, "mb-2")}>trial attempts</div>
              <ul className="flex flex-col divide-y divide-line border border-line">
                {trials.slice(0, 20).map((t, i) => (
                  <li key={i} className="flex min-h-10 items-center justify-between gap-2 px-3 py-1.5 font-mono text-xs">
                    <span className="truncate text-fg-2">
                      {t.week} · part {t.part}
                    </span>
                    <span className={t.passed ? "text-ok" : "text-fg-3"}>
                      {t.score}/{t.total}
                      {t.passed ? " passed" : ""} · {timeAgo(t.at)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ notes / bookmarks

function NotesCard({ data }: { data: LearnerDetail }) {
  const [tab, setTab] = useState<"notes" | "bookmarks" | "comments">("notes");
  const list = tab === "notes" ? data.notes : tab === "bookmarks" ? data.bookmarks : data.comments;
  return (
    <Card label="notebook" title="Notes, bookmarks and comments" className="mb-6" pad={false}>
      <Tabs
        className="px-2"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "notes", label: "notes", count: data.notes.length },
          { id: "bookmarks", label: "bookmarks", count: data.bookmarks.length },
          { id: "comments", label: "comments", count: data.comments.length },
        ]}
      />
      <div className="p-4">
        {!list.length ? (
          <EmptyState title={`No ${tab} yet`} />
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {list.map((n) => (
              <li key={n.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="truncate font-mono text-[11px] text-signal-text">{n.title}</span>
                  <span className="font-mono text-[11px] text-fg-4">{fmtDate(n.createdAt, true)}</span>
                </div>
                <p className="mt-1 line-clamp-4 whitespace-pre-line break-words text-sm text-fg-2">{n.text || <span className="text-fg-4">(no text)</span>}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ reset drawer

type Scope = "lesson" | "week" | "course" | "all";
const PART_LABELS: { id: "progress" | "mcq" | "notes" | "bookmarks" | "streaks" | "game"; label: string; hint: string }[] = [
  { id: "progress", label: "Lesson progress", hint: "learning_progress rows (+ review cards / trial attempts when present)" },
  { id: "mcq", label: "MCQ answers", hint: "mcq_user_answers for assessments in scope" },
  { id: "notes", label: "Notes", hint: "content_notes" },
  { id: "bookmarks", label: "Bookmarks", hint: "bookmarks" },
  { id: "streaks", label: "Streaks", hint: "learning_streaks days (course / everything only) + profile counters" },
  { id: "game", label: "Game XP", hint: "XP and quest flags in scope (when the game columns exist)" },
];

function ResetDrawer({ open, onClose, data, onDone }: { open: boolean; onClose: () => void; data: LearnerDetail; onDone: () => void }) {
  const client = useAdminClient();
  const course = data.learner.position?.href.split("/")[2] || "system-design-mastery";
  const weeks = [...data.map.map((w) => ({ key: w.key, label: `W${w.code} · ${w.title}`, cells: w.cells })), { key: "bonus-problems", label: "Side quests", cells: data.sideQuests }];
  const [scope, setScope] = useState<Scope>("lesson");
  const [week, setWeek] = useState(data.learner.position?.week || weeks[0]?.key || "");
  const wk = weeks.find((w) => w.key === week) || weeks[0];
  const [lesson, setLesson] = useState(data.learner.position?.lesson || wk?.cells[0]?.slug || "");
  const [parts, setParts] = useState<Record<string, boolean>>({ progress: true });
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const lessonValid = wk?.cells.some((c) => c.slug === lesson);
  const anyPart = Object.values(parts).some(Boolean);

  const body =
    scope === "lesson"
      ? { kind: "lesson", course, week: wk?.key, lesson: lessonValid ? lesson : wk?.cells[0]?.slug }
      : scope === "week"
        ? { kind: "week", course, week: wk?.key }
        : scope === "course"
          ? { kind: "course", course }
          : { kind: "all" };

  const run = async () => {
    setErr(null);
    setResult(null);
    try {
      const res = await client.json<{ deleted?: Record<string, number> }>(`/api/admin/learners/${encodeURIComponent(data.learner.id)}/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: body, parts }),
      });
      setResult(res.deleted || {});
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Reset failed");
    }
  };

  const scopeText =
    scope === "lesson"
      ? `${wk?.cells.find((c) => c.slug === (lessonValid ? lesson : wk?.cells[0]?.slug))?.title || "lesson"}`
      : scope === "week"
        ? wk?.label
        : scope === "course"
          ? "the whole course"
          : "everything (all courses)";

  return (
    <Drawer
      open={open}
      onClose={onClose}
      label={`reset · ${data.learner.email}`}
      title="Reset learner data"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 font-mono text-[11px] text-fg-3">
            {anyPart ? (
              <>
                deletes {PART_LABELS.filter((p) => parts[p.id]).map((p) => p.label.toLowerCase()).join(", ")} for {scopeText}
              </>
            ) : (
              "pick at least one part"
            )}
          </span>
          <ConfirmButton onConfirm={run} disabled={!anyPart} confirmLabel="yes, delete">
            reset
          </ConfirmButton>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <fieldset>
          <legend className={cx(LABEL, "mb-2")}>scope</legend>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {(["lesson", "week", "course", "all"] as Scope[]).map((s) => (
              <label key={s} className={cx("flex min-h-10 cursor-pointer items-center justify-center border font-mono text-xs", scope === s ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg-2 hover:text-fg")}>
                <input type="radio" name="scope" value={s} checked={scope === s} onChange={() => setScope(s)} className="sr-only" />
                {s === "all" ? "everything" : s}
              </label>
            ))}
          </div>
        </fieldset>
        {(scope === "lesson" || scope === "week") && (
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>week</span>
            <select
              value={wk?.key}
              onChange={(e) => {
                setWeek(e.target.value);
                setLesson(weeks.find((w) => w.key === e.target.value)?.cells[0]?.slug || "");
              }}
              className="h-10 border border-line-strong bg-surface px-2 text-sm text-fg focus:border-signal focus:outline-none"
            >
              {weeks.map((w) => (
                <option key={w.key} value={w.key}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {scope === "lesson" && (
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>lesson</span>
            <select value={lessonValid ? lesson : wk?.cells[0]?.slug} onChange={(e) => setLesson(e.target.value)} className="h-10 border border-line-strong bg-surface px-2 text-sm text-fg focus:border-signal focus:outline-none">
              {wk?.cells.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.code} · {c.title}
                  {c.status === "completed" ? " (done)" : c.status === "in_progress" ? ` (${c.pct}%)` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <fieldset>
          <legend className={cx(LABEL, "mb-2")}>parts</legend>
          <div className="flex flex-col gap-1">
            {PART_LABELS.map((p) => (
              <label key={p.id} className="flex min-h-11 cursor-pointer items-start gap-3 border border-line px-3 py-2 hover:bg-surface-2">
                <input type="checkbox" checked={!!parts[p.id]} onChange={(e) => setParts((x) => ({ ...x, [p.id]: e.target.checked }))} className="mt-0.5 h-4 w-4 accent-[var(--c-signal)]" />
                <span className="min-w-0">
                  <span className="block text-sm text-fg">{p.label}</span>
                  <span className="block font-mono text-[11px] text-fg-3">{p.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="text-xs text-fg-3">
          Deletes rows in the database for this learner only. Their browser may still hold local game progress until they reset from their own profile.
        </p>
        {err && <ErrorState error={err} title="Reset failed" />}
        {result && (
          <div className="border border-ok/50 px-3 py-2.5">
            <div className="font-mono text-xs text-ok">done · rows removed</div>
            <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[11px] text-fg-2">
              {Object.entries(result).map(([k, v]) => (
                <li key={k} className="flex justify-between gap-2">
                  <span className="truncate">{k}</span>
                  <span>{fmtNum(v)}</span>
                </li>
              ))}
              {!Object.keys(result).length && <li>(simulated in preview)</li>}
            </ul>
          </div>
        )}
      </div>
    </Drawer>
  );
}
