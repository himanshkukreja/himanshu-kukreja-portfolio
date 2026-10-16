"use client";

import Link from "next/link";
import { BarList, Card, Kpi, Skeleton, fmtNum, fmtPct, useAdminData } from "@/components/admin/ui";
import type { NotConfigured, PathsRes } from "@/lib/analytics/journeys";
import { DaysPicker, useDays, PhErrorState } from "./bits";
import SetupCard from "./SetupCard";

/** Paths & funnel: entry/exit pages, the most common page sequences, and the learn funnel. */
export default function PathsTab() {
  const days = useDays("7d");
  const { data, error, loading, refresh } = useAdminData<PathsRes | NotConfigured>(`/api/admin/posthog/paths?days=${days}`);
  if (data && data.configured === false) return <SetupCard status={data.status} />;
  const res = data as PathsRes | undefined;
  const top = res?.funnel[0]?.n || 0;
  const last = res?.funnel[res.funnel.length - 1]?.n || 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[11px] text-fg-3">from PostHog $pageview + learn events · computed per person, in order</p>
        <DaysPicker fallback="7d" />
      </div>
      {error ? (
        <PhErrorState error={error} onRetry={refresh} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="sessions" value={fmtNum(res?.sessions)} loading={loading && !res} />
            <Kpi label="people" value={fmtNum(top)} loading={loading && !res} />
            <Kpi label="completed a lesson" value={fmtNum(last)} loading={loading && !res} />
            <Kpi label="land → complete" value={top ? fmtPct(last / top) : "—"} loading={loading && !res} />
          </div>

          <Card label="funnel" title="Landing → lesson complete">
            {!res ? <Skeleton className="h-48 w-full" /> : <Funnel steps={res.funnel} />}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card label="where sessions start" title="Entry pages">
              <BarList
                loading={!res}
                limit={10}
                items={(res?.entries || []).map((e) => ({ key: e.path, label: e.title || e.path, hint: e.title ? e.path : undefined, value: e.n, href: `/admin/journeys?tab=heatmaps&path=${encodeURIComponent(e.path)}` }))}
              />
            </Card>
            <Card label="where sessions end" title="Exit pages">
              <BarList loading={!res} limit={8} items={(res?.exits || []).map((e) => ({ key: e.path, label: e.title || e.path, hint: e.title ? e.path : undefined, value: e.n }))} />
            </Card>
          </div>

          <Card label="first 4 pages of a session" title="Top paths" pad={false}>
            {!res ? (
              <Skeleton className="m-4 h-40" />
            ) : res.paths.length ? (
              <ol className="flex flex-col divide-y divide-line">
                {res.paths.map((p, i) => (
                  <li key={i} className="flex items-start gap-3 px-4 py-2.5">
                    <span className="w-6 shrink-0 pt-1 font-mono text-[11px] text-fg-4">{String(i + 1).padStart(2, "0")}</span>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                      {p.steps.map((s, j) => (
                        <span key={j} className="inline-flex min-w-0 items-center gap-1">
                          {j > 0 && <span className="font-mono text-[11px] text-signal-text">→</span>}
                          <Link
                            href={`/admin/journeys?tab=recordings&path=${encodeURIComponent(s)}`}
                            title={`Recordings that visited ${s}`}
                            className="max-w-[220px] truncate border border-line bg-surface-2/60 px-1.5 py-0.5 font-mono text-[11px] text-fg hover:border-signal"
                          >
                            {s}
                          </Link>
                        </span>
                      ))}
                    </div>
                    <span className="shrink-0 pt-0.5 font-mono text-xs tabular-nums text-fg">{fmtNum(p.n)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="px-4 py-6 font-mono text-xs text-fg-4">No multi-page sessions yet.</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Funnel({ steps }: { steps: PathsRes["funnel"] }) {
  const top = steps[0]?.n || 0;
  return (
    <ol className="flex flex-col gap-2">
      {steps.map((s, i) => {
        const share = top ? s.n / top : 0;
        const prev = i > 0 ? steps[i - 1].n : 0;
        const step = i > 0 && prev ? s.n / prev : null;
        return (
          <li key={s.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[180px_minmax(0,1fr)_120px]">
            <span className="min-w-0 truncate text-[13px] text-fg">
              <span className="mr-1.5 font-mono text-[11px] text-fg-4">{i + 1}</span>
              {s.label}
            </span>
            <span className="relative order-3 col-span-2 h-7 border border-line bg-surface-2/40 sm:order-none sm:col-span-1">
              <span className="absolute inset-y-0 left-0 bg-signal" style={{ width: `${Math.max(share * 100, s.n ? 1.5 : 0)}%`, opacity: 1 - i * 0.12 }} />
            </span>
            <span className="text-right font-mono text-xs tabular-nums text-fg">
              {fmtNum(s.n)}
              <span className="ml-2 text-fg-3">{fmtPct(share, 0)}</span>
              {step != null && <span className="ml-1.5 text-fg-4" title="of the previous step">({fmtPct(step, 0)})</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
