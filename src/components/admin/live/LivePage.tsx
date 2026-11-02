"use client";

/**
 * /admin/live — the live ops feed: who's online now, today's sessions, events in the last hour and
 * the pages people are on, then every recent session (events grouped by $session_id, newest /
 * ongoing first) with a compact event timeline and its replay inline.
 *
 * Loads in three parts so it paints progressively (each answered from the server's shared cache):
 * the header strip (?part=head), the session list (?part=sessions) and, once the list is on screen,
 * which rows have a replay (?part=replays, only for ids it hasn't looked up in the last 90 s).
 * Header and list poll every 60 s while the tab is visible; a poll never starts while the previous one
 * is in flight, backs off after errors, and when the server answered from a cache it's refreshing
 * the page asks again a few seconds later. While the admin is reading (scrolled into the feed, a row
 * expanded or a replay playing) the list freezes and a "new activity" pill offers the update instead
 * of jumping the list; the stats strip always stays live.
 */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Card, EmptyState, Kpi, LABEL, LiveDot, PageHead, Skeleton, fmtNum, timeAgo, useAdminClient, useAdminData, useNow, type AdminError } from "@/components/admin/ui";
import type { LiveFilter, LiveHeadRes, LiveRec, LiveReplaysRes, LiveSession, LiveSessionsRes, LiveWindow, NotConfigured, PhStatus } from "@/lib/analytics/journeys";
import { ExtLink, PhErrorState, cx, useSetParams } from "@/components/admin/journeys/bits";
import SetupCard from "@/components/admin/journeys/SetupCard";
import SessionRow, { ReplaySheet } from "./SessionRow";

const POLL_MS = 60_000;
/** server cache refreshes every 30 s: an answer older than this was served stale while it refreshes → ask again soon */
const STALE_MS = 45_000;
const REPLAY_TTL_MS = 90_000;
const REPLAY_CHUNK = 40;
const FEED = "/api/admin/posthog/feed";

const followUp = (d: { generatedAt?: string } | NotConfigured) =>
  "generatedAt" in d && d.generatedAt && Date.now() - new Date(d.generatedAt).getTime() > STALE_MS ? 5_000 : null;

const WINDOWS: { id: LiveWindow; label: string }[] = [
  { id: "30m", label: "live · 30 min" },
  { id: "24h", label: "24 h" },
  { id: "7d", label: "7 d" },
];
const FILTERS: { id: LiveFilter; label: string }[] = [
  { id: "all", label: "all" },
  { id: "signed", label: "signed in" },
  { id: "learn", label: "learn" },
  { id: "recorded", label: "has replay" },
];
const isWindow = (v: string | null): v is LiveWindow => WINDOWS.some((w) => w.id === v);
const isFilter = (v: string | null): v is LiveFilter => FILTERS.some((f) => f.id === v);

export default function LivePage() {
  const params = useSearchParams();
  const setParams = useSetParams();
  const rawW = params.get("window");
  const rawF = params.get("filter");
  const win: LiveWindow = isWindow(rawW) ? rawW : "24h";
  const filter: LiveFilter = isFilter(rawF) ? rawF : "all";
  const [paused, setPaused] = useState(false);
  const { data: status } = useAdminData<PhStatus>("/api/admin/posthog/status");
  // don't wait for the status check: the feed answers { configured: false } itself when PostHog isn't set up
  const on = status ? status.configured : true;
  const poll = { refreshMs: paused ? undefined : POLL_MS, followUpMs: followUp };
  const headQ = useAdminData<LiveHeadRes | NotConfigured>(on ? `${FEED}?part=head` : null, poll);
  const listQ = useAdminData<LiveSessionsRes | NotConfigured>(on ? `${FEED}?part=sessions&window=${win}&filter=${filter}` : null, poll);
  const now = useNow(10_000);

  const head = headQ.data && headQ.data.configured !== false ? (headQ.data as LiveHeadRes) : undefined;
  const list = listQ.data && listQ.data.configured !== false ? (listQ.data as LiveSessionsRes) : undefined;
  const notConfigured = [headQ.data, listQ.data].find((d): d is NotConfigured => !!d && d.configured === false);

  return (
    <div>
      <PageHead
        path="admin/live"
        title={
          <span className="inline-flex items-center gap-3">
            Live <LiveDot on={!!head?.stats.online && !paused} />
          </span>
        }
        sub="Everything happening on the site: sessions as they happen, what each person did, and their replay."
        actions={
          status?.configured ? (
            <>
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                aria-pressed={paused}
                className={cx(
                  "inline-flex min-h-10 items-center gap-2 border px-3 font-mono text-xs",
                  paused ? "border-line-strong text-fg-3 hover:bg-surface-2" : "border-signal text-signal-text hover:bg-signal/10"
                )}
              >
                {paused ? "❚❚ paused · resume" : "● live · ↻ 60s"}
              </button>
              <Link href="/admin/journeys" className="inline-flex min-h-10 items-center border border-line-strong px-3 font-mono text-xs text-fg-2 hover:border-signal hover:text-signal-text">
                journeys →
              </Link>
              <ExtLink href={`${status.uiHost}/project/${status.projectId}/activity/explore`}>PostHog</ExtLink>
            </>
          ) : null
        }
      />
      {status && !status.configured ? (
        <SetupCard status={status} />
      ) : notConfigured ? (
        <SetupCard status={notConfigured.status} />
      ) : (
        <>
          <StatsStrip head={head} error={headQ.error} />
          <Feed
            key={`${win}:${filter}`}
            feed={list}
            error={listQ.error}
            loading={listQ.loading}
            refresh={listQ.refresh}
            win={win}
            filter={filter}
            now={now}
            paused={paused}
            onWindow={(w) => setParams({ window: w === "24h" ? null : w })}
            onFilter={(f) => setParams({ filter: f === "all" ? null : f })}
          />
        </>
      )}
    </div>
  );
}

/* ───────────────────────────── header strip ───────────────────────────── */

function StatsStrip({ head: feed, error }: { head?: LiveHeadRes; error?: AdminError }) {
  const loading = !feed && !error;
  const pages = feed?.pages ?? [];
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.5fr)]">
      <Kpi
        label={
          <span className="inline-flex items-center gap-1.5">
            <LiveDot on={!!feed?.stats.online} /> online now
          </span>
        }
        value={fmtNum(feed?.stats.online)}
        hint="people · last 5 min"
        loading={loading}
      />
      <Kpi label="sessions today" value={fmtNum(feed?.stats.sessionsToday)} hint={feed ? `${fmtNum(feed.stats.peopleToday)} people` : undefined} loading={loading} />
      <Kpi className="col-span-2 lg:col-span-1" label="events · last hour" value={fmtNum(feed?.stats.eventsHour)} hint="per minute, last 30 min" spark={feed?.perMinute} loading={loading} />
      <section className="col-span-2 min-w-0 border border-line bg-surface px-4 py-3.5 lg:col-span-1">
        <div className={LABEL}>on page now</div>
        {loading ? (
          <Skeleton className="mt-2 h-16 w-full" />
        ) : pages.length ? (
          <ul className="mt-2 flex flex-col gap-1">
            {pages.slice(0, 4).map((p) => (
              <li key={p.path} className="flex items-center justify-between gap-3 border-l-2 border-signal bg-surface-2/60 px-2.5 py-1">
                <span className="min-w-0 truncate text-[13px] text-fg" title={p.path}>
                  {p.title || p.path}
                </span>
                <span className="shrink-0 font-mono text-xs text-fg-2">{p.n}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 font-mono text-xs text-fg-4">nobody on a page right now</p>
        )}
      </section>
    </div>
  );
}

/* ───────────────────────────── feed ───────────────────────────── */

function Feed({
  feed,
  error,
  loading,
  refresh,
  win,
  filter,
  now,
  paused,
  onWindow,
  onFilter,
}: {
  feed?: LiveSessionsRes;
  error?: AdminError;
  loading: boolean;
  refresh: () => void;
  win: LiveWindow;
  filter: LiveFilter;
  now: number;
  paused: boolean;
  onWindow: (w: LiveWindow) => void;
  onFilter: (f: LiveFilter) => void;
}) {
  const client = useAdminClient();
  const listRef = useRef<HTMLDivElement>(null);
  const [frozen, setFrozen] = useState<LiveSessionsRes | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [watching, setWatching] = useState<string | null>(null);
  const [sheet, setSheet] = useState<LiveSession | null>(null);
  const [older, setOlder] = useState<{ sessions: LiveSession[]; hasMore: boolean; loading: boolean; error: string | null }>({ sessions: [], hasMore: true, loading: false, error: null });

  const reading = scrolled || expanded.size > 0 || !!watching || !!sheet;
  // stopped reading (back at the top, nothing open) → drop the frozen copy so the list goes live again
  const [wasReading, setWasReading] = useState(reading);
  if (wasReading !== reading) {
    setWasReading(reading);
    if (!reading) setFrozen(null);
  }
  const shown = (reading ? frozen : null) ?? feed;
  const shownRef = useRef(shown);
  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);

  // Freeze what's on screen the moment the admin starts reading; unfreeze when they stop.
  const freeze = useCallback(() => setFrozen((f) => f ?? shownRef.current ?? null), []);
  useEffect(() => {
    const onScroll = () => {
      const el = listRef.current;
      const past = !!el && el.getBoundingClientRect().top < 40;
      setScrolled(past);
      if (past) setFrozen((f) => f ?? shownRef.current ?? null);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const pending = useMemo(() => {
    if (!reading || !frozen || !feed || frozen.generatedAt === feed.generatedAt) return null;
    const before = new Map(frozen.sessions.map((s) => [s.id, s]));
    let fresh = 0;
    let updated = 0;
    for (const s of feed.sessions) {
      const b = before.get(s.id);
      if (!b) fresh++;
      else if (b.last !== s.last || b.events !== s.events) updated++;
    }
    return fresh || updated ? { fresh, updated } : null;
  }, [reading, frozen, feed]);

  const applyPending = () => {
    setFrozen(null);
    setExpanded(new Set());
    setWatching(null);
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const listed = useMemo(() => {
    const head = shown?.sessions ?? [];
    const seen = new Set(head.map((s) => s.id));
    return [...head, ...older.sessions.filter((s) => !seen.has(s.id))];
  }, [shown, older.sessions]);
  // replays load after the list (never hold it up) and are merged in at render, frozen list or not
  const replays = useReplays(
    listed.map((s) => s.id),
    feed?.generatedAt
  );
  const sessions = useMemo(
    () => listed.map((s) => ({ ...s, recording: replays.recs[s.id] ?? null, replayPending: !replays.seen[s.id] })),
    [listed, replays]
  );

  const loadOlder = async () => {
    const last = sessions[sessions.length - 1];
    if (!last) return;
    freeze();
    setOlder((o) => ({ ...o, loading: true, error: null }));
    try {
      const res = await client.json<LiveSessionsRes>(`${FEED}?part=sessions&window=${win}&filter=${filter}&before=${encodeURIComponent(last.last)}`);
      setOlder((o) => ({ sessions: [...o.sessions, ...res.sessions], hasMore: res.hasMore, loading: false, error: null }));
    } catch (e) {
      setOlder((o) => ({ ...o, loading: false, error: (e as Error)?.message || "failed" }));
    }
  };

  const toggleExpand = (id: string) => {
    freeze();
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const watch = (s: LiveSession) => {
    freeze();
    const phone = typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;
    if (phone) setSheet(s);
    else setWatching((cur) => (cur === s.id ? null : s.id));
  };

  const closeSheet = useCallback(() => setSheet(null), []);
  const hasMore = older.sessions.length ? older.hasMore : !!shown?.hasMore;
  const updatedAgo = feed ? timeAgo(feed.generatedAt, now) : null;

  return (
    <div ref={listRef} className="scroll-mt-[calc(var(--hk-header-h,57px)+56px)] lg:scroll-mt-[calc(var(--hk-header-h,57px)+12px)]">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented label="Show" options={FILTERS} value={filter} onChange={onFilter} />
        <Segmented label="Time window" options={WINDOWS} value={win} onChange={onWindow} />
        <span className="ml-auto font-mono text-[11px] text-fg-4">
          {loading && feed ? "updating…" : paused ? "paused" : updatedAgo ? `updated ${updatedAgo}` : ""}
        </span>
      </div>

      {pending && (
        <div className="sticky top-[calc(var(--hk-header-h,57px)+56px)] z-30 mb-2 flex justify-center lg:top-[calc(var(--hk-header-h,57px)+12px)]">
          <button
            type="button"
            onClick={applyPending}
            className="inline-flex min-h-10 items-center gap-2 border border-signal bg-signal px-4 font-mono text-xs font-semibold text-on-signal shadow-lg"
          >
            ↑ new activity · {[pending.fresh ? `${pending.fresh} new session${pending.fresh === 1 ? "" : "s"}` : null, pending.updated ? `${pending.updated} updated` : null].filter(Boolean).join(" · ")}
          </button>
        </div>
      )}

      {replays.error && <PhErrorState className="mb-3" error={replays.error.error} scope={replays.error.scope} title="Replays couldn't be looked up (sessions still show)" />}

      <Card
        label={win === "30m" ? "last 30 minutes" : win === "24h" ? "last 24 hours" : "last 7 days"}
        title="Sessions"
        pad={false}
        action={shown ? <span className="font-mono text-[11px] text-fg-4">{sessions.length}{hasMore ? "+" : ""} sessions</span> : null}
      >
        {error && !shown ? (
          <PhErrorState className="m-4" error={error} onRetry={refresh} />
        ) : !shown ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-[92px] w-full" />
            ))}
          </div>
        ) : sessions.length ? (
          <>
            <ul className="flex flex-col">
              {sessions.map((s) => (
                <SessionRow
                  key={s.id}
                  s={s}
                  now={now}
                  expanded={expanded.has(s.id)}
                  watching={watching === s.id}
                  onExpand={() => toggleExpand(s.id)}
                  onWatch={() => watch(s)}
                  onCloseWatch={() => setWatching(null)}
                />
              ))}
            </ul>
            {(hasMore || older.error) && (
              <div className="flex items-center justify-center gap-3 border-t border-line px-4 py-3">
                {older.error && <span className="font-mono text-[11px] text-bad-text">{older.error}</span>}
                <button
                  type="button"
                  disabled={older.loading}
                  onClick={loadOlder}
                  className="min-h-10 border border-line-strong px-4 font-mono text-xs text-fg-2 hover:bg-surface-2 disabled:opacity-50"
                >
                  {older.loading ? "loading…" : "older sessions ↓"}
                </button>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            className="m-4"
            title={`No sessions${filter !== "all" ? ` matching “${FILTERS.find((f) => f.id === filter)?.label}”` : ""} in the ${win === "30m" ? "last 30 minutes" : win === "24h" ? "last 24 hours" : "last 7 days"}`}
            hint={win === "30m" ? "Quiet right now. Widen the window to 24 h to see today's visitors." : "Once the site sends events they show up here within a few seconds."}
            action={
              win === "30m" ? (
                <button type="button" onClick={() => onWindow("24h")} className="mt-1 min-h-10 border border-line-strong px-3 font-mono text-xs text-fg hover:bg-surface-2">
                  show last 24 h
                </button>
              ) : undefined
            }
          />
        )}
      </Card>
      {error && shown && (
        <p className="mt-2 font-mono text-[11px] text-bad-text">
          last refresh failed: {error.message} ·{" "}
          <button type="button" onClick={refresh} className="underline underline-offset-4">
            retry
          </button>
        </p>
      )}
      <p className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[11px] text-fg-4">
        <Badge tone="muted">tip</Badge> replays play here with 0.5×–8× speed and skip-idle · space play/pause, ←/→ seek, f fullscreen
      </p>

      {sheet && <ReplaySheet s={sheet} onClose={closeSheet} now={now} />}
    </div>
  );
}

/**
 * Replay status for the sessions on screen: looks up only ids it hasn't checked in the last 90 s (40 per request),
 * re-checking when the list refreshes (`refreshKey`), so a new or ongoing replay shows up without blocking the list.
 */
function useReplays(ids: string[], refreshKey: string | undefined) {
  const client = useAdminClient();
  const [state, setState] = useState<{ recs: Record<string, LiveRec>; seen: Record<string, number>; error: LiveReplaysRes["error"] }>({ recs: {}, seen: {}, error: null });
  const checked = useRef<Record<string, number>>({});
  const idsKey = ids.join(",");

  useEffect(() => {
    const t = Date.now();
    const want = idsKey.split(",").filter((id) => id && !(t - (checked.current[id] ?? 0) < REPLAY_TTL_MS));
    if (!want.length) return;
    const ctrl = new AbortController();
    for (let i = 0; i < want.length; i += REPLAY_CHUNK) {
      const chunk = want.slice(i, i + REPLAY_CHUNK);
      client
        .json<LiveReplaysRes | NotConfigured>(`${FEED}?part=replays&ids=${chunk.join(",")}`, { signal: ctrl.signal })
        .then((r) => {
          if (ctrl.signal.aborted || r.configured === false) return;
          const at = Date.now();
          for (const id of chunk) checked.current[id] = at;
          setState((s) => {
            const recs = { ...s.recs };
            const seen = { ...s.seen };
            for (const id of chunk) {
              seen[id] = at;
              if (r.recordings[id]) recs[id] = r.recordings[id];
              else delete recs[id];
            }
            return { recs, seen, error: r.error };
          });
        })
        .catch(() => {
          // aborted or failed: these ids stay unchecked and are asked again on the next refresh
        });
    }
    return () => ctrl.abort();
  }, [idsKey, refreshKey, client]);

  return state;
}

function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full overflow-x-auto border border-line-strong [scrollbar-width:none]">
      {options.map((o, i) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className={cx("min-h-10 shrink-0 whitespace-nowrap px-2.5 font-mono text-xs", i > 0 && "border-l border-line-strong", on ? "bg-signal font-semibold text-on-signal" : "text-fg-2 hover:bg-surface-2 hover:text-fg")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
