"use client";

/** One session in /admin/live: who/where/device, entry → current page, compact event strip, replay. */
import { useEffect } from "react";
import { Badge, LiveDot, timeAgo } from "@/components/admin/ui";
import type { LiveEvent, LiveSession } from "@/lib/analytics/journeys";
import { KIND_META, KindMark, Who, clock, countryFlag, cx, hhmm, personHref } from "@/components/admin/journeys/bits";
import ReplayPlayer from "@/components/admin/journeys/ReplayPlayer";

const STRIP = 16;

const deviceLine = (s: LiveSession) => [s.device, s.browser, s.os].filter(Boolean).map((v) => String(v).toLowerCase()).join(" · ");
const placeLine = (s: LiveSession) => [countryFlag(s.country), s.city || s.country].filter(Boolean).join(" ");
const pageName = (p: LiveSession["entry"]) => (p ? p.title || p.path : null);

/** The most telling recent thing they did (learning, quiz, share, sign-in… over plain clicks). */
function headline(events: LiveEvent[]): LiveEvent | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const k = events[i].kind;
    if (k !== "click" && k !== "pageview" && k !== "form" && k !== "event") return events[i];
  }
  return events[events.length - 1] ?? null;
}

export default function SessionRow({
  s,
  now,
  expanded,
  watching,
  onExpand,
  onWatch,
  onCloseWatch,
}: {
  s: LiveSession;
  now: number;
  expanded: boolean;
  watching: boolean;
  onExpand: () => void;
  onWatch: () => void;
  onCloseWatch: () => void;
}) {
  const strip = s.timeline.slice(-STRIP);
  const hidden = Math.max(0, s.events - strip.length);
  const top = headline(s.timeline);
  const entry = pageName(s.entry);
  const current = pageName(s.current);

  return (
    <li className={cx("border-b border-line last:border-b-0", (watching || expanded) && "bg-surface-2/40")}>
      <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-x-3 gap-y-2 px-3 py-3 sm:grid-cols-[60px_minmax(0,1fr)_auto] sm:px-4">
        {/* status */}
        <div className="pt-0.5 font-mono text-[11px] leading-4">
          {s.active ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-signal-text">
              <LiveDot /> live
            </span>
          ) : (
            <span className="text-fg-4">{timeAgo(s.last, now)}</span>
          )}
          <div className="mt-1 text-[10px] text-fg-4">{hhmm(s.start)}</div>
        </div>

        {/* who / where / what */}
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            {s.personId ? <Who who={s.who} identified={s.identified} href={personHref(s.personId)} className="!text-[13px]" /> : <Who who={s.who} identified={s.identified} className="!text-[13px]" />}
            {s.identified && <Badge tone="signal">signed in</Badge>}
            {s.recording?.ongoing && <Badge tone="solid">recording</Badge>}
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] text-fg-3">
            {placeLine(s) && <span>{placeLine(s)}</span>}
            {deviceLine(s) && <span>{deviceLine(s)}</span>}
            {s.referrer && s.referrer !== "direct" && <span className="text-fg-4">via {s.referrer}</span>}
          </div>
          {(entry || current) && (
            <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[13px]" title={[s.entry?.path, s.current?.path].filter(Boolean).join(" → ")}>
              {entry && entry !== current && (
                <>
                  <span className="min-w-0 max-w-[40%] shrink truncate text-fg-3">{entry}</span>
                  <span aria-hidden className="shrink-0 font-mono text-fg-4">
                    →
                  </span>
                </>
              )}
              <span className={cx("min-w-0 flex-1 truncate", s.active ? "font-medium text-fg" : "text-fg-2")}>
                {s.active && <span className="sr-only">now on </span>}
                {current || entry}
              </span>
            </div>
          )}

          {/* compact event strip */}
          <div className="mt-2 flex min-w-0 items-center gap-1">
            {hidden > 0 && <span className="shrink-0 pr-0.5 font-mono text-[10px] text-fg-4">+{hidden}</span>}
            <ol aria-label="Latest events" className="relative flex min-w-0 items-center gap-[3px] overflow-hidden">
              {strip.map((e) => (
                <li key={e.id} title={`${hhmm(e.t)} · ${e.label}`} className="shrink-0">
                  <KindMark kind={e.kind} className={cx("!h-5 !w-5 !text-[10px]", (e.kind === "click" || e.kind === "pageview") && "opacity-70")} />
                  <span className="sr-only">
                    {hhmm(e.t)} {e.label}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          {top && (
            <div className="mt-1 truncate text-[12px] text-fg-2">
              <span className="font-mono text-[10px] text-fg-4">{KIND_META[top.kind]?.name ?? "event"} · </span>
              {top.label}
            </div>
          )}
        </div>

        {/* numbers + actions */}
        <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 sm:col-span-1 sm:flex-col sm:items-end sm:justify-start">
          <div className="flex items-baseline gap-2 sm:flex-col sm:items-end sm:gap-0">
            <span className="font-display text-xl font-extrabold leading-none tracking-tight text-fg">{clock(s.duration)}</span>
            <span className="font-mono text-[10px] text-fg-4 sm:mt-1">
              {s.events} event{s.events === 1 ? "" : "s"} · {s.pageviews} page{s.pageviews === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 sm:mt-2">
            {s.recording ? (
              <button
                type="button"
                onClick={onWatch}
                aria-expanded={watching}
                className={cx(
                  "inline-flex min-h-10 items-center gap-1.5 border px-3 font-mono text-xs",
                  watching ? "border-signal bg-signal font-semibold text-on-signal" : "border-signal text-signal-text hover:bg-signal/10"
                )}
              >
                {watching ? "■ close" : `▶ watch · ${clock(s.recording.duration)}`}
              </button>
            ) : (
              <span className="inline-flex min-h-10 items-center border border-dashed border-line-strong px-3 font-mono text-[11px] text-fg-4" title="PostHog didn't record a replay for this session (too short, Do Not Track, or not sampled)">
                no replay
              </span>
            )}
            <button
              type="button"
              onClick={onExpand}
              aria-expanded={expanded}
              aria-label={expanded ? "Hide events" : "Show events"}
              className={cx("grid h-10 w-10 place-items-center border font-mono text-sm", expanded ? "border-fg-3 bg-surface-2 text-fg" : "border-line-strong text-fg-2 hover:bg-surface-2")}
            >
              {expanded ? "▴" : "▾"}
            </button>
          </div>
        </div>
      </div>

      {watching && s.recording && (
        <div className="hidden px-3 pb-3 sm:block sm:px-4">
          <ReplayPlayer id={s.recording.id} title={s.current?.path || s.entry?.path || undefined} onClose={onCloseWatch} />
        </div>
      )}
      {expanded && <EventList s={s} />}
    </li>
  );
}

function EventList({ s }: { s: LiveSession }) {
  return (
    <div className="border-t border-line bg-bg">
      <ol className="relative flex flex-col py-1.5">
        <span aria-hidden className="absolute bottom-3 left-[calc(12px+44px+11px)] top-3 w-px bg-line sm:left-[calc(16px+44px+11px)]" />
        {s.timeline.map((e) => (
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
      {(s.events > s.timeline.length || s.personId) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2 font-mono text-[11px] text-fg-4">
          <span>{s.events > s.timeline.length ? `latest ${s.timeline.length} of ${s.events} events` : `${s.events} events`}</span>
          {s.personId && (
            <a href={personHref(s.personId)} className="min-h-9 content-center text-fg-2 underline-offset-4 hover:text-signal-text hover:underline">
              full journey →
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/** Phones: the replay opens as a full-screen sheet over the feed. */
export function ReplaySheet({ s, onClose, now }: { s: LiveSession; onClose: () => void; now: number }) {
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  if (!s.recording) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label={`Replay of ${s.who}'s session`} className="fixed inset-0 z-[100] flex animate-hk-in flex-col bg-bg">
      <header className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 pt-[calc(env(safe-area-inset-top,0px)+8px)]">
        <div className="min-w-0">
          <div className="truncate font-mono text-xs text-fg">{s.who}</div>
          <div className="truncate font-mono text-[10px] text-fg-4">
            {[placeLine(s), deviceLine(s), s.active ? "live now" : timeAgo(s.last, now)].filter(Boolean).join(" · ")}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close replay" className="grid h-11 w-11 shrink-0 place-items-center border border-line-strong text-lg text-fg hover:bg-surface-2">
          ×
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col p-2 pb-[calc(env(safe-area-inset-bottom,0px)+8px)]">
        <ReplayPlayer id={s.recording.id} title={s.current?.path || undefined} fill />
      </div>
    </div>
  );
}
