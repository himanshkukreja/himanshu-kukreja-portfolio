"use client";

import { Card, EmptyState, ErrorState, LABEL, LiveDot, Skeleton, fmtNum, timeAgo, useNow } from "@/components/admin/ui";
import { countryFlag } from "./format";
import type { LiveRes } from "./types";

/** Live visitors (last 5 min), what they're reading, and the last 20 page views. Polls every 15 s while visible. */
export function LivePanel({ data, error, loading, onRetry }: { data?: LiveRes; error?: Error; loading: boolean; onRetry: () => void }) {
  const now = useNow(15_000);
  return (
    <Card
      label="live"
      title={
        <span className="inline-flex items-center gap-2">
          <LiveDot on={!!data?.live} /> Right now
        </span>
      }
      action={<span className="font-mono text-[11px] text-fg-4">↻ 15s</span>}
    >
      {error ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : loading && !data ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-24" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : data ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-end gap-3">
            <span className="font-display text-[44px] font-extrabold leading-none tracking-tightest text-fg">{fmtNum(data.live)}</span>
            <span className="pb-1 font-mono text-[11px] text-fg-3">{data.live === 1 ? "visitor" : "visitors"} · last 5 min</span>
          </div>
          {data.pages.length > 0 && (
            <div>
              <div className={`${LABEL} mb-1.5`}>on page now</div>
              <ul className="flex flex-col gap-1">
                {data.pages.slice(0, 6).map((p) => (
                  <li key={p.path} className="flex items-center justify-between gap-3 border-l-2 border-signal bg-surface-2/60 px-2.5 py-1.5">
                    <span className="min-w-0 truncate font-mono text-xs text-fg">{p.path}</span>
                    <span className="shrink-0 font-mono text-xs text-fg-2">{p.n}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <div className={`${LABEL} mb-1.5`}>latest page views</div>
            {data.recent.length ? (
              <ul className="flex flex-col divide-y divide-line border border-line">
                {data.recent.map((r, i) => (
                  <li key={r.at + i} className="flex min-h-10 items-center gap-2.5 px-2.5 py-1.5">
                    <span className="w-14 shrink-0 font-mono text-[11px] text-fg-4">{timeAgo(r.at, now)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-xs text-fg">{r.path}</span>
                      <span className="block truncate font-mono text-[10px] text-fg-4">
                        {countryFlag(r.country)} {[r.city, r.country].filter(Boolean).join(", ") || "unknown"} · {r.device} · {r.channel}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No page views in the last 24 h" />
            )}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
