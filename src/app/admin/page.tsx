"use client";

/**
 * /admin — Overview: traffic + learning KPIs, traffic trend, live now, where learners are right
 * now, top lessons, latest contact queries and newsletter signups.
 */
import Link from "next/link";
import { useMemo } from "react";
import {
  BarList,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Kpi,
  LABEL,
  LiveDot,
  PageHead,
  RangePicker,
  Skeleton,
  TrendChart,
  fmtDuration,
  fmtNum,
  fmtPct,
  timeAgo,
  useAdminData,
  useNow,
  useRange,
  type Range,
} from "@/components/admin/ui";
import type { ContactQuery, LearnersSummary, Subscriber, TrafficLive, TrafficOverview } from "@/components/admin/shell/types";
import ReferralsCard from "@/components/admin/ReferralsCard";

const tz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
  } catch {
    return "Asia/Kolkata";
  }
};

const xFormat = (range: Range) => (t: string | number) => {
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return String(t);
  if (range === "24h") return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (range === "12m") return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

const RANGE_LABEL: Record<Range, string> = { "24h": "last 24 hours", "7d": "last 7 days", "30d": "last 30 days", "90d": "last 90 days", "12m": "last 12 months" };

export default function AdminOverview() {
  const range = useRange();
  const traffic = useAdminData<TrafficOverview>(`/api/admin/traffic/overview?range=${range}&tz=${encodeURIComponent(tz())}`);
  const learn = useAdminData<LearnersSummary>(`/api/admin/learners/summary?range=${range}`);
  const live = useAdminData<TrafficLive>("/api/admin/traffic/live", { refreshMs: 30_000 });
  const queries = useAdminData<ContactQuery[]>("/api/admin/contact-queries?limit=5");
  const subs = useAdminData<Subscriber[]>("/api/admin/subscribers");

  const t = traffic.data;
  const k = t?.kpis;
  const spark = useMemo(
    () => ({
      visitors: t?.series.map((p) => p.visitors) ?? [],
      pageviews: t?.series.map((p) => p.pageviews) ?? [],
    }),
    [t]
  );
  const l = learn.data;
  const now = useNow(60_000);

  return (
    <div>
      <PageHead
        path="sudo ~/admin"
        title="Overview"
        sub={<>Everything at a glance for the {RANGE_LABEL[range]}.</>}
        actions={<RangePicker />}
      />

      {/* ── Traffic KPIs ── */}
      <div className="mb-2 flex items-center justify-between">
        <span className={LABEL}>traffic</span>
        <Link href={`/admin/traffic?range=${range}`} className="min-h-9 content-center font-mono text-[11px] text-fg-3 hover:text-fg">
          open traffic →
        </Link>
      </div>
      {traffic.error ? (
        <ErrorState error={traffic.error} onRetry={traffic.refresh} title="Traffic overview unavailable" className="mb-6" />
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Visitors" loading={traffic.loading && !k} value={fmtNum(k?.visitors)} current={k?.visitors} previous={k?.prev.visitors} spark={spark.visitors} />
          <Kpi label="Page views" loading={traffic.loading && !k} value={fmtNum(k?.pageviews)} current={k?.pageviews} previous={k?.prev.pageviews} spark={spark.pageviews} />
          <Kpi label="Avg engaged" loading={traffic.loading && !k} value={fmtDuration(k?.avgEngagedSec)} current={k?.avgEngagedSec} previous={k?.prev.avgEngagedSec} />
          <Kpi label="Bounce rate" loading={traffic.loading && !k} value={fmtPct(k?.bounceRate, 0)} current={k?.bounceRate} previous={k?.prev.bounceRate} invert />
        </div>
      )}

      {/* ── Learning KPIs ── */}
      <div className="mb-2 flex items-center justify-between">
        <span className={LABEL}>learning</span>
        <Link href={`/admin/learners?range=${range}`} className="min-h-9 content-center font-mono text-[11px] text-fg-3 hover:text-fg">
          open learners →
        </Link>
      </div>
      {learn.error ? (
        <ErrorState error={learn.error} onRetry={learn.refresh} title="Learner summary unavailable" className="mb-6" />
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Learners" loading={learn.loading && !l} value={fmtNum(l?.learners)} hint={l ? `+ ${fmtNum(l.guests)} guests` : undefined} />
          <Kpi label="Active today · 7d" loading={learn.loading && !l} value={l ? <>{fmtNum(l.activeToday)}<span className="text-[0.6em] font-bold text-fg-4"> / </span>{fmtNum(l.active7d)}</> : "—"} hint={l ? `${fmtNum(l.avgMinutesPerLearner)} min / learner` : undefined} />
          <Kpi label="Lessons completed" loading={learn.loading && !l} value={fmtNum(l?.lessonsCompleted)} />
          <Kpi label="Stages done" loading={learn.loading && !l} value={fmtNum(l?.stagesDone)} />
        </div>
      )}

      {/* ── Trend + live ── */}
      <div className="mb-6 grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card label="trend" title={`Visitors & page views · ${range}`}>
          {traffic.error ? (
            <ErrorState error={traffic.error} onRetry={traffic.refresh} />
          ) : (
            <TrendChart
              loading={traffic.loading && !t}
              data={t?.series ?? []}
              series={[
                { key: "pageviews", label: "Page views" },
                { key: "visitors", label: "Visitors" },
              ]}
              formatX={xFormat(range)}
              ariaLabel="Visitors and page views over time"
            />
          )}
        </Card>
        <LiveCard live={live} />
      </div>

      {/* ── Learners right now + top lessons ── */}
      <div className="mb-6 grid gap-3 xl:grid-cols-2">
        <Card label="learn" title="Where learners are right now" action={<Link href="/admin/learners" className="font-mono text-[11px] text-fg-3 hover:text-fg">all learners →</Link>} pad={false}>
          {learn.error ? (
            <div className="p-4">
              <ErrorState error={learn.error} onRetry={learn.refresh} />
            </div>
          ) : learn.loading && !l ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : !l?.recent.length ? (
            <div className="p-4">
              <EmptyState title="No learner activity yet" hint="Signed-in readers show up here as they open lessons and clear stages." />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {l.recent.slice(0, 8).map((r) => (
                <li key={`${r.userId}-${r.at}`}>
                  <Link href={`/admin/learners/${encodeURIComponent(r.userId)}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                    <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center border border-line-strong font-mono text-xs text-fg-2">
                      {(r.name || r.email || "?").trim().charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-fg">{r.name || r.email || "Learner"}</span>
                      <span className="block truncate text-xs text-fg-3">
                        {r.title}
                        {r.stage && <span className="text-fg-4"> · {r.stage}</span>}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-fg-3">{timeAgo(r.at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card label="learn" title="Top lessons" action={<Link href="/admin/course" className="font-mono text-[11px] text-fg-3 hover:text-fg">course →</Link>}>
          {learn.error ? (
            <ErrorState error={learn.error} onRetry={learn.refresh} />
          ) : (
            <BarList
              loading={learn.loading && !l}
              valueLabel="readers · share"
              limit={8}
              items={(l?.topLessons ?? []).map((x) => ({
                key: `${x.week}/${x.lesson}`,
                label: x.title,
                hint: `${fmtNum(x.completions)} done`,
                value: x.readers,
                href: `/admin/course?lesson=${encodeURIComponent(`${x.course}/${x.week}/${x.lesson}`)}`,
              }))}
              empty="No lesson reads in this range"
            />
          )}
        </Card>
      </div>

      {/* ── Referrals (share my progress) ── */}
      <ReferralsCard range={range} />

      {/* ── Inbox ── */}
      <div className="grid gap-3 xl:grid-cols-2">
        <Card label="inbox" title="Latest contact queries" action={<Link href="/admin/content?tab=contact" className="font-mono text-[11px] text-fg-3 hover:text-fg">all →</Link>} pad={false}>
          {queries.error ? (
            <div className="p-4">
              <ErrorState error={queries.error} onRetry={queries.refresh} />
            </div>
          ) : queries.loading && !queries.data ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !queries.data?.length ? (
            <div className="p-4">
              <EmptyState title="Inbox zero" />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {queries.data.slice(0, 5).map((q) => (
                <li key={q.id}>
                  <Link href={`/admin/content?tab=contact&q=${encodeURIComponent(q.id)}`} className="block px-4 py-3 hover:bg-surface-2">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{q.name}</span>
                      <Badge tone={q.status === "new" ? "solid" : q.status === "replied" ? "signal" : "neutral"}>{q.status}</Badge>
                      <span className="shrink-0 font-mono text-[11px] text-fg-3">{timeAgo(q.created_at)}</span>
                    </div>
                    {/* user-generated: rendered as text, never HTML */}
                    <p className="mt-1 line-clamp-2 break-words text-[13px] text-fg-3">{q.message}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card label="newsletter" title="Latest signups" action={<Link href="/admin/content?tab=newsletter" className="font-mono text-[11px] text-fg-3 hover:text-fg">manage →</Link>} pad={false}>
          {subs.error ? (
            <div className="p-4">
              <ErrorState error={subs.error} onRetry={subs.refresh} />
            </div>
          ) : subs.loading && !subs.data ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !subs.data?.length ? (
            <div className="p-4">
              <EmptyState title="No subscribers yet" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-line px-4 py-2.5 font-mono text-[11px] text-fg-3">
                <span>
                  <span className="text-fg">{fmtNum(subs.data.filter((s) => !s.unsubscribed).length)}</span> active
                </span>
                <span>
                  <span className="text-fg">{fmtNum(subs.data.filter((s) => now - new Date(s.created_at).getTime() < 30 * 86400_000).length)}</span> new in 30d
                </span>
                <span>
                  <span className="text-fg">{fmtNum(subs.data.filter((s) => s.unsubscribed).length)}</span> unsubscribed
                </span>
              </div>
              <ul className="divide-y divide-line">
                {subs.data.slice(0, 6).map((s) => (
                  <li key={s.email} className="flex min-h-11 items-center gap-3 px-4 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-fg">{s.email}</span>
                    <span className="hidden shrink-0 truncate text-xs text-fg-3 sm:block">{[s.city, s.country].filter(Boolean).join(", ")}</span>
                    {s.unsubscribed && <Badge tone="muted">unsub</Badge>}
                    <span className="shrink-0 font-mono text-[11px] text-fg-3">{timeAgo(s.created_at)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function LiveCard({ live }: { live: { data?: TrafficLive; error?: Error; loading: boolean; refresh: () => void } }) {
  const d = live.data;
  return (
    <Card
      label={
        <span className="inline-flex items-center gap-2">
          <LiveDot on={!!d?.live} /> live
        </span>
      }
      title="On the site now"
      action={<span className="font-mono text-[11px] text-fg-4">5 min · auto 30s</span>}
    >
      {live.error ? (
        <ErrorState error={live.error} onRetry={live.refresh} />
      ) : live.loading && !d ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[56px] font-extrabold leading-none tracking-tightest text-fg">{fmtNum(d?.live ?? 0)}</span>
            <span className="text-sm text-fg-3">visitor{d?.live === 1 ? "" : "s"}</span>
          </div>
          {d?.pages.length ? (
            <ul className="flex flex-col gap-1">
              {d.pages.slice(0, 5).map((p) => (
                <li key={p.path} className="flex items-center gap-3 border-l-2 border-signal bg-surface-2/60 px-2.5 py-1.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-2" title={p.path}>
                    {p.path}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-fg">{p.n}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-3">Nobody right now. Quiet as a Sunday deploy.</p>
          )}
        </div>
      )}
    </Card>
  );
}
