"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { BarList, Card, EmptyState, LABEL, Skeleton, fmtNum, fmtPct, useAdminData } from "@/components/admin/ui";
import type { NotConfigured, PageDetailRes, PathsRes } from "@/lib/analytics/journeys";
import { DaysPicker, ExtLink, cx, useDays, useSetParams, PhErrorState } from "./bits";
import SetupCard from "./SetupCard";

/**
 * Pages & heatmaps. PostHog has no public share/embed API for heatmaps, so the visual overlay is a
 * link-out (in-app Heatmaps or the toolbar on the live page); the clicks and reading depth that
 * matter are pulled with HogQL and shown here.
 */
export default function HeatmapsTab() {
  const days = useDays("30d");
  const params = useSearchParams();
  const setParams = useSetParams();
  const path = params.get("path");
  const pages = useAdminData<PathsRes | NotConfigured>(`/api/admin/posthog/paths?days=${days}`);
  if (pages.data && pages.data.configured === false) return <SetupCard status={pages.data.status} />;
  const list = (pages.data as PathsRes | undefined)?.pages;
  const selected = path || list?.[0]?.path || null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[11px] text-fg-3">pick a page → most clicked elements, reading depth, heatmap overlay in PostHog</p>
        <DaysPicker fallback="30d" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <Card label="top pages" title="By views" pad={false}>
          {pages.error ? (
            <PhErrorState className="m-4" error={pages.error} onRetry={pages.refresh} />
          ) : !list ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : list.length ? (
            <ul className="flex max-h-[560px] flex-col divide-y divide-line overflow-y-auto">
              {list.map((p) => {
                const on = p.path === selected;
                return (
                  <li key={p.path}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => setParams({ path: p.path })}
                      className={cx("relative flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left", on ? "bg-surface-2" : "hover:bg-surface-2/60")}
                    >
                      {on && <span aria-hidden className="absolute inset-y-1.5 left-0 w-[3px] bg-signal" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-fg">{p.title || p.path}</span>
                        {p.title && <span className="block truncate font-mono text-[10px] text-fg-4">{p.path}</span>}
                      </span>
                      <span className="shrink-0 text-right font-mono text-[11px] tabular-nums text-fg-2">
                        {fmtNum(p.views)}
                        <span className="block text-[10px] text-fg-4">{fmtNum(p.visitors)} ppl</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState className="m-4" title="No page views yet" />
          )}
        </Card>
        {selected ? <PageDetail key={`${selected}:${days}`} path={selected} days={days} /> : <Skeleton className="h-80 w-full" />}
      </div>
    </div>
  );
}

function PageDetail({ path, days }: { path: string; days: number }) {
  const { data, error, refresh } = useAdminData<PageDetailRes | NotConfigured>(`/api/admin/posthog/page?path=${encodeURIComponent(path)}&days=${days}`);
  const [copied, setCopied] = useState(false);
  if (data && data.configured === false) return <SetupCard status={data.status} compact />;
  const d = data as PageDetailRes | undefined;
  if (error) return <PhErrorState error={error} onRetry={refresh} />;
  if (!d) return <Skeleton className="h-96 w-full" />;
  const maxReaders = Math.max(1, ...d.depth.map((x) => x.readers));
  const isContent = /^\/(learn\/[^/]+\/[^/]+\/[^/]+|stories\/[^/]+)$/.test(d.path);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card
        label={d.path}
        title={d.title || d.path}
        action={
          <Link href={`/admin/journeys?tab=recordings&path=${encodeURIComponent(d.path)}`} className="min-h-10 content-center font-mono text-xs text-fg-3 hover:text-fg">
            ▶ replays on this page
          </Link>
        }
      >
        <div className="flex flex-wrap gap-2">
          <ExtLink href={d.heatmapUrl}>heatmap in PostHog</ExtLink>
          <ExtLink href={d.toolbarUrl}>launch toolbar</ExtLink>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(d.siteUrl).then(() => setCopied(true));
            }}
            className="inline-flex min-h-10 items-center border border-line-strong px-3 font-mono text-xs text-fg-2 hover:border-signal hover:text-signal-text"
          >
            {copied ? "copied ✓" : "copy page url"}
          </button>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-fg-3">
          PostHog doesn&apos;t offer embeddable heatmaps, so the click/scroll overlay opens in PostHog (Heatmaps → paste the page URL, or the
          toolbar on the live page). Below is the same click data, counted here.
        </p>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card label={`last ${days === 1 ? "24 h" : `${days} days`}`} title="Most clicked">
          <BarList
            limit={12}
            empty="No clicks recorded on this page"
            items={d.clicks.map((c, i) => ({
              key: `${c.text}:${i}`,
              label: c.text,
              hint: [c.tag, c.rage > 0 ? `${c.rage} rage` : null].filter(Boolean).join(" · ") || undefined,
              value: c.n + c.rage,
            }))}
          />
        </Card>
        <Card label="read_progress" title="Reading depth">
          {!isContent ? (
            <p className="font-mono text-xs text-fg-4">Reading depth is tracked on lessons and case files only.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {d.depth.map((x) => (
                <li key={x.pct} className="grid grid-cols-[44px_minmax(0,1fr)_64px] items-center gap-3">
                  <span className="font-mono text-xs text-fg-2">{x.pct}%</span>
                  <span className="relative h-6 border border-line bg-surface-2/40">
                    <span className="absolute inset-y-0 left-0 bg-signal" style={{ width: `${(x.readers / maxReaders) * 100}%` }} />
                  </span>
                  <span className="text-right font-mono text-xs tabular-nums text-fg">
                    {fmtNum(x.readers)}
                    {d.depth[0].readers > 0 && x.pct > 25 && <span className="block text-[10px] text-fg-4">{fmtPct(x.readers / d.depth[0].readers, 0)}</span>}
                  </span>
                </li>
              ))}
              <li className={cx(LABEL, "mt-1 normal-case tracking-normal text-fg-4")}>people who read at least this far (engaged, not just scrolled)</li>
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
