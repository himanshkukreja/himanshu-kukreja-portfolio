"use client";

/**
 * /admin/journeys/person/[id] — one person's journey: profile, then a vertical timeline grouped by
 * day and session (pages with lesson/story titles, clicks with element text, reading depth, quiz
 * answers, Ask AI, shares, sign-in), a "watch" button per session that plays its replay inline,
 * and the list of their recordings.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Card, Kpi, Skeleton, fmtDate, fmtNum, timeAgo, useAdminData, useNow } from "@/components/admin/ui";
import type { NotConfigured, PersonRes, Recording, TimelineEvent, TimelineKind } from "@/lib/analytics/journeys";
import { DaysPicker, ExtLink, Field, KindMark, clock, cx, dayKey, dayLabel, hhmm, place, useDays, PhErrorState } from "./bits";
import RecordingList from "./RecordingList";
import ReplayPlayer from "./ReplayPlayer";
import SetupCard from "./SetupCard";

const FILTERS = [
  { id: "all", label: "everything", kinds: null },
  { id: "key", label: "key moments", kinds: ["pageview", "read", "quiz", "lesson", "ai", "share", "signin", "search", "play", "error", "rage"] },
  { id: "learn", label: "learning", kinds: ["read", "quiz", "lesson", "ai"] },
] as const satisfies readonly { id: string; label: string; kinds: readonly TimelineKind[] | null }[];
type FilterId = (typeof FILTERS)[number]["id"];

type SessionBlock = { id: string; start: string; end: string; events: TimelineEvent[]; recording: Recording | null };
type DayBlock = { key: string; first: string; sessions: SessionBlock[] };

/** events newest-first → days (newest first) → sessions (newest first), events oldest-first inside a session */
function group(events: TimelineEvent[], recs: Map<string, Recording>): DayBlock[] {
  const days: DayBlock[] = [];
  let curDay: DayBlock | null = null;
  let curSession: SessionBlock | null = null;
  for (const e of events) {
    const dk = dayKey(e.t);
    if (!curDay || curDay.key !== dk) {
      curDay = { key: dk, first: e.t, sessions: [] };
      days.push(curDay);
      curSession = null;
    }
    const sid = e.session || "no-session";
    if (!curSession || curSession.id !== sid) {
      curSession = { id: sid, start: e.t, end: e.t, events: [], recording: recs.get(sid) ?? null };
      curDay.sessions.push(curSession);
    }
    curSession.events.push(e);
    curSession.start = e.t; // descending input: the last seen is the earliest
  }
  for (const d of days) for (const s of d.sessions) s.events.reverse();
  return days;
}

export default function PersonTimeline({ id }: { id: string }) {
  const days = useDays("30d");
  const now = useNow();
  const [filter, setFilter] = useState<FilterId>("key");
  const [watching, setWatching] = useState<string | null>(null);
  const { data, error, refresh } = useAdminData<PersonRes | NotConfigured>(`/api/admin/posthog/person?id=${encodeURIComponent(id)}&days=${days}`);
  const res = data && data.configured !== false ? (data as PersonRes) : undefined;

  const recs = useMemo(() => new Map((res?.recordings || []).map((r) => [r.id, r])), [res]);
  const blocks = useMemo(() => {
    if (!res) return [];
    const kinds = FILTERS.find((f) => f.id === filter)?.kinds as readonly TimelineKind[] | null;
    return group(kinds ? res.events.filter((e) => kinds.includes(e.kind)) : res.events, recs);
  }, [res, filter, recs]);

  if (data && data.configured === false) return <SetupCard status={data.status} />;
  if (error)
    return (
      <div>
        <BackLink />
        <PhErrorState error={error} onRetry={refresh} title={error.status === 404 ? "No PostHog events for this person" : "Couldn't load this journey"} />
      </div>
    );
  if (!res)
    return (
      <div className="flex flex-col gap-3">
        <BackLink />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );

  const p = res.person;
  const sessions = new Set(res.events.map((e) => e.session).filter(Boolean)).size;
  const pageviews = res.events.filter((e) => e.kind === "pageview").length;

  return (
    <div className="flex flex-col gap-4">
      <BackLink />
      <section className="border border-line bg-surface">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {p.identified ? <Badge tone="solid">signed in</Badge> : <Badge tone="muted">anonymous</Badge>}
              <span className="font-mono text-[11px] text-fg-4">#{p.id.slice(-12)}</span>
            </div>
            <h1 data-ph-mask className="mt-1.5 break-words font-display text-[26px] font-extrabold leading-tight tracking-[-0.03em] text-fg sm:text-[34px]">
              {p.name || p.email || `Visitor ${(p.distinctId || p.id).slice(-6)}`}
            </h1>
            {p.name && p.email && <div className="font-mono text-xs text-fg-3">{p.email}</div>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DaysPicker fallback="30d" />
            <ExtLink href={p.appUrl}>PostHog person</ExtLink>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="first seen">{p.createdAt ? `${fmtDate(p.createdAt)} · ${timeAgo(p.createdAt, now)}` : "—"}</Field>
          <Field label="last seen">{res.events[0] ? timeAgo(res.events[0].t, now) : "—"}</Field>
          <Field label="where">{place(p.city, p.country)}</Field>
          <Field label="device">{[p.device, p.os].filter(Boolean).join(" · ") || "—"}</Field>
          <Field label="browser">{p.browser || "—"}</Field>
          <Field label="first referrer">{p.referrer || "—"}</Field>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="sessions" value={fmtNum(sessions)} hint={`last ${days === 1 ? "24 h" : `${days}d`}`} />
        <Kpi label="pages viewed" value={fmtNum(pageviews)} />
        <Kpi label="events" value={`${fmtNum(res.events.length)}${res.truncated ? "+" : ""}`} />
        <Kpi label="recordings" value={fmtNum(res.recordings.length)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card
          label="timeline"
          title="What they did"
          pad={false}
          action={
            <div role="radiogroup" aria-label="Show" className="inline-flex border border-line-strong">
              {FILTERS.map((f, i) => (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={cx("min-h-10 px-2.5 font-mono text-xs", i > 0 && "border-l border-line-strong", filter === f.id ? "bg-signal font-semibold text-on-signal" : "text-fg-2 hover:bg-surface-2")}
                >
                  {f.label}
                </button>
              ))}
            </div>
          }
        >
          {blocks.length ? (
            <div className="flex flex-col">
              {blocks.map((d) => (
                <section key={d.key} aria-label={dayLabel(d.first, now)} className="border-b border-line last:border-0">
                  <h3 className="sticky top-[calc(var(--hk-header-h,57px)+48px)] z-10 border-b border-line bg-surface/95 px-4 py-2 font-mono text-[11px] uppercase tracking-label text-fg-3 backdrop-blur lg:top-[var(--hk-header-h,57px)]">
                    {dayLabel(d.first, now)}
                    {["today", "yesterday"].includes(dayLabel(d.first, now)) ? ` · ${fmtDate(d.first)}` : ""}
                  </h3>
                  <div className="flex flex-col gap-3 px-3 py-3 sm:px-4">
                    {d.sessions.map((s, si) => (
                      <SessionCard key={`${s.id}:${si}`} s={s} watching={watching === `${d.key}:${s.id}`} onWatch={(on) => setWatching(on ? `${d.key}:${s.id}` : null)} />
                    ))}
                  </div>
                </section>
              ))}
              {res.truncated && <p className="px-4 py-3 font-mono text-[11px] text-fg-4">showing the latest 1,500 events · narrow the range to see older ones</p>}
            </div>
          ) : (
            <p className="px-4 py-8 font-mono text-xs text-fg-4">Nothing in this window{filter !== "all" ? " for this filter" : ""}.</p>
          )}
        </Card>

        <Card label="session replays" title={`Recordings (${res.recordings.length})`} className="self-start">
          {res.recordingsError ? (
            <PhErrorState error={res.recordingsError.error} scope={res.recordingsError.scope} onRetry={refresh} />
          ) : (
            <RecordingList recordings={res.recordings} showWho={false} empty="No recordings for this person" />
          )}
        </Card>
      </div>
    </div>
  );
}

function SessionCard({ s, watching, onWatch }: { s: SessionBlock; watching: boolean; onWatch: (on: boolean) => void }) {
  const dur = (new Date(s.end).getTime() - new Date(s.start).getTime()) / 1000;
  return (
    <div className={cx("border bg-bg", watching ? "border-signal" : "border-line")}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0 font-mono text-[11px] text-fg-3">
          <span className="text-fg">session</span> · {hhmm(s.start)} → {hhmm(s.end)} · {clock(dur)} · {s.events.length} event{s.events.length === 1 ? "" : "s"}
        </div>
        {s.recording ? (
          <button
            type="button"
            onClick={() => onWatch(!watching)}
            aria-expanded={watching}
            className={cx(
              "inline-flex min-h-10 items-center gap-1.5 border px-3 font-mono text-xs",
              watching ? "border-signal bg-signal font-semibold text-on-signal" : "border-signal text-signal-text hover:bg-signal/10"
            )}
          >
            {watching ? "■ close" : `▶ watch · ${clock(s.recording.duration)}`}
          </button>
        ) : (
          <span className="font-mono text-[10px] text-fg-4">{s.id === "no-session" ? "no session id" : "no replay"}</span>
        )}
      </div>
      {watching && s.recording && (
        <div className="border-b border-line p-2">
          <ReplayPlayer id={s.recording.id} title={s.recording.startUrl || undefined} onClose={() => onWatch(false)} />
        </div>
      )}
      <ol className="relative flex flex-col py-1.5">
        <span aria-hidden className="absolute bottom-3 left-[calc(12px+44px+11px)] top-3 w-px bg-line sm:left-[calc(16px+44px+11px)]" />
        {s.events.map((e) => (
          <li key={e.id} className="relative flex min-h-9 items-start gap-2 px-3 py-1 sm:px-4">
            <time dateTime={e.t} className="w-11 shrink-0 pt-1 font-mono text-[11px] tabular-nums text-fg-4">
              {hhmm(e.t)}
            </time>
            <KindMark kind={e.kind} className="relative z-[1]" />
            <div className="min-w-0 flex-1 pt-0.5">
              <div className={cx("break-words text-[13px] leading-snug", e.kind === "pageview" ? "text-fg" : e.kind === "click" || e.kind === "form" ? "text-fg-2" : "font-medium text-fg")}>{e.label}</div>
              {e.detail && <div className="truncate font-mono text-[10px] text-fg-4">{e.detail}</div>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/admin/journeys?tab=people" className="inline-flex min-h-10 items-center font-mono text-xs text-fg-3 hover:text-fg">
      ← journeys / people
    </Link>
  );
}
