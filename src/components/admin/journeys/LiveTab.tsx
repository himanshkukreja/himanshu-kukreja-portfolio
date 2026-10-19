"use client";

import Link from "next/link";
import { Card, EmptyState, LABEL, LiveDot, Skeleton, fmtNum, timeAgo, useAdminData, useNow } from "@/components/admin/ui";
import type { LiveRes, NotConfigured, StreamEvent } from "@/lib/analytics/journeys";
import { KindMark, Who, countryFlag, personHref, PhErrorState } from "./bits";
import SetupCard from "./SetupCard";

/** Live: visitors in the last 5 min + the latest events across the site (polls every 30 s). The
 * session-grouped feed with inline replays lives at /admin/live (linked from the stream card). */
export default function LiveTab() {
  const { data, error, refresh } = useAdminData<LiveRes | NotConfigured>("/api/admin/posthog/live", { refreshMs: 30_000 });
  const now = useNow(15_000);
  if (data && data.configured === false) return <SetupCard status={data.status} />;
  const live = data as LiveRes | undefined;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <Card
        label="right now"
        title={
          <span className="inline-flex items-center gap-2">
            <LiveDot on={!!live?.live} /> Visitors
          </span>
        }
        action={<span className="font-mono text-[11px] text-fg-4">↻ 30s</span>}
      >
        {error ? (
          <PhErrorState error={error} onRetry={refresh} />
        ) : !live ? (
          <Skeleton className="h-28 w-full" />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-end gap-3">
              <span className="font-display text-[52px] font-extrabold leading-none tracking-tightest text-fg">{fmtNum(live.live)}</span>
              <span className="pb-1.5 font-mono text-[11px] text-fg-3">{live.live === 1 ? "person" : "people"} · last 5 min</span>
            </div>
            <div>
              <div className={`${LABEL} mb-1.5`}>on page now</div>
              {live.pages.length ? (
                <ul className="flex flex-col gap-1">
                  {live.pages.map((p) => (
                    <li key={p.path} className="flex items-center justify-between gap-3 border-l-2 border-signal bg-surface-2/60 px-2.5 py-1.5">
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] text-fg">{p.title || p.path}</span>
                        {p.title && <span className="block truncate font-mono text-[10px] text-fg-4">{p.path}</span>}
                      </span>
                      <span className="shrink-0 font-mono text-xs text-fg-2">{p.n}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="font-mono text-xs text-fg-4">nobody on the site right now</p>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card
        label="last 24 h"
        title="Event stream"
        pad={false}
        action={
          <>
            <span className="font-mono text-[11px] text-fg-4">60 latest</span>
            <Link href="/admin/live" className="inline-flex min-h-9 items-center border border-signal px-2.5 font-mono text-[11px] text-signal-text hover:bg-signal/10">
              sessions + replays → live
            </Link>
          </>
        }
      >
        {error ? (
          <PhErrorState className="m-4" error={error} onRetry={refresh} />
        ) : !live ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : live.events.length ? (
          <ul className="flex flex-col divide-y divide-line">
            {live.events.map((e) => (
              <StreamRow key={e.id} e={e} now={now} />
            ))}
          </ul>
        ) : (
          <EmptyState className="m-4" title="No events in the last 24 h" hint="Once the site sends events (NEXT_PUBLIC_POSTHOG_KEY set and deployed) they stream in here." />
        )}
      </Card>
    </div>
  );
}

function StreamRow({ e, now }: { e: StreamEvent; now: number }) {
  return (
    <li className="flex min-h-12 items-start gap-2.5 px-3 py-2 sm:px-4">
      <KindMark kind={e.kind} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="min-w-0 break-words text-[13px] text-fg">{e.label}</span>
        </div>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] text-fg-4">
          {e.personId ? <Who who={e.who} identified={e.identified} href={personHref(e.personId)} className="!text-[11px]" /> : <span>{e.who}</span>}
          <span>
            {countryFlag(e.country)} {e.city || e.country || ""}
          </span>
          {e.device && <span>{e.device.toLowerCase()}</span>}
          {e.path && e.kind !== "pageview" && (
            <Link href={`/admin/journeys?tab=heatmaps&path=${encodeURIComponent(e.path)}`} className="max-w-[220px] truncate hover:text-fg">
              {e.path}
            </Link>
          )}
        </div>
      </div>
      <span className="w-16 shrink-0 text-right font-mono text-[11px] text-fg-4">{timeAgo(e.t, now)}</span>
    </li>
  );
}
