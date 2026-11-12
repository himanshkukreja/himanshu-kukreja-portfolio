"use client";

/**
 * /admin/ai/quality: how good the AI answers are, per feature and per day. Thumbs-up rate and the down reasons (the
 * learners' ratings, chat_feedback), errors, p50/p90 latency and cost (ai_calls), the citation check's unsupported rate
 * (course and DSA chat), the turns the routing sent to Sonnet, the latest downs with an excerpt of the AI's answer (never
 * the learner's message), and the nightly evals' pass rates. Counts and aggregates only for learner data. The window
 * (?days=) and the feature tab live in the URL; the data comes through the admin's shared SWR cache (useAdminData).
 */
import { BarList, Card, EmptyState, ErrorState, fmtDate, fmtNum, Kpi, PageHead, Table, Tabs, TrendChart, useAdminData, Badge } from "@/components/admin/ui";
import { ExternalSwitch, useExternalOnly, useUrlFilters } from "@/components/admin/ai/filters";
import { FEATURES, type FeatureId } from "@/lib/ai/features";
import { FEEDBACK_REASONS, REASON_IDS, type FeedbackReason } from "@/lib/ai/feedback-model";

type Bucket = {
  calls: number;
  ok: number;
  errors: number;
  up: number;
  down: number;
  reasons: Record<FeedbackReason, number>;
  p50: number | null;
  p90: number | null;
  cost: number;
  cites: number;
  citesBad: number;
  sonnet: number;
  routeHeld: number;
};
type Day = { day: string } & Bucket;
type Nightly = { runs?: { at: string; sha?: string; spend?: number; rates: Record<string, number | null>; drops?: string[] }[] } | null;
type Resp = {
  window: number;
  feedback: { enabled: boolean; migrated: boolean };
  partial: boolean;
  total: Bucket;
  daily: Day[];
  features: { feature: string; total: Bucket; days: Day[] }[];
  recentDowns: { callId: number; at: string; feature: string; model: string | null; pv: string | null; reason: FeedbackReason | null; excerpt: string | null }[];
  nightly: Nightly;
};

const usd = (n: number, d = 2) => `$${n.toFixed(d)}`;
const pct = (n: number | null) => (n == null ? "–" : `${Math.round(n * 100)}%`);
const rate = (b: Pick<Bucket, "up" | "down">) => (b.up + b.down ? b.up / (b.up + b.down) : null);
const secs = (ms: number | null) => (ms == null ? "–" : `${(ms / 1000).toFixed(1)} s`);
const label = (f: string) => FEATURES[f as FeatureId]?.label ?? f;
const shortModel = (m: string | null) => (m ? m.replace(/^claude-/, "").replace(/-\d{8}$/, "") : "–");

export default function AiQuality() {
  const url = useUrlFilters();
  const days = [7, 14, 30, 90].includes(Number(url.get("days"))) ? Number(url.get("days")) : 14;
  const external = useExternalOnly().on;
  const { data, error, loading, refresh } = useAdminData<Resp>(`/api/admin/ai/quality?days=${days}${external ? "&ext=1" : ""}`, { refreshMs: 120_000 });
  const tab = url.get("f") || "all";
  if (error && !data) return <ErrorState error={error} onRetry={refresh} />;
  const t = data?.total;
  const sel = tab === "all" ? null : data?.features.find((f) => f.feature === tab);
  const daily: Day[] = sel ? sel.days : (data?.daily ?? []);
  const reasons = sel ? sel.total.reasons : t?.reasons;
  return (
    <div className="flex flex-col gap-6">
      <PageHead
        path="sudo ~/admin/ai/quality"
        title="AI quality"
        sub="Learners' ratings, errors, speed and cost of every AI answer, per feature and day. Counts only: no learner text."
        actions={
          <span className="flex gap-1">
            {[7, 14, 30, 90].map((d) => (
              <button key={d} type="button" onClick={() => url.set({ days: d === 14 ? null : String(d) })} className={`min-h-9 px-2.5 font-mono text-xs ${days === d ? "bg-fg text-bg" : "border border-line-strong text-fg-3"}`}>
                {d}d
              </button>
            ))}
          </span>
        }
      />
      <ExternalSwitch hidden={external ? "admins hidden" : null} />
      {data && !data.feedback.enabled && <p className="m-0 border border-dashed border-line-strong px-3 py-2 text-[13px] text-fg-3">Ratings are off: the chat_feedback table isn&apos;t there yet.</p>}
      {data && data.feedback.enabled && !data.feedback.migrated && (
        <p className="m-0 font-mono text-[11.5px] text-fg-4">feedback migration 20261112 not applied yet: reasons are read from the interim code, models and prompt versions from the call rows</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi loading={loading && !data} label="thumbs-up rate" value={t ? pct(rate(t)) : "–"} hint={t ? `${fmtNum(t.up)} 👍 · ${fmtNum(t.down)} 👎` : ""} />
        <Kpi loading={loading && !data} label={`answers · ${days} days`} value={t ? fmtNum(t.calls) : "–"} hint={t ? `${t.calls ? ((100 * (t.up + t.down)) / t.calls).toFixed(1) : 0}% rated` : ""} />
        <Kpi loading={loading && !data} label="errors" value={t ? fmtNum(t.errors) : "–"} hint={t && t.calls ? `${((100 * t.errors) / t.calls).toFixed(1)}% of answers` : ""} />
        <Kpi loading={loading && !data} label="latency p50 / p90" value={t ? `${secs(t.p50)} / ${secs(t.p90)}` : "–"} hint="all features, answered calls" />
        <Kpi loading={loading && !data} label="cost" value={t ? usd(t.cost) : "–"} hint={t && t.calls ? `${usd(t.cost / t.calls, 4)} an answer` : ""} />
        <Kpi loading={loading && !data} label="unsupported citations" value={t && t.cites ? pct(t.citesBad / t.cites) : "–"} hint={t ? `${fmtNum(t.citesBad)} of ${fmtNum(t.cites)} fixed or dropped` : ""} />
        <Kpi loading={loading && !data} label="routed to sonnet" value={t ? fmtNum(t.sonnet) : "–"} hint={t ? `${fmtNum(t.routeHeld)} hard turns held on Haiku (cap / mode)` : ""} />
        <Kpi loading={loading && !data} label="nightly evals" value={nightlyHead(data?.nightly)} hint={nightlyHint(data?.nightly)} />
      </div>

      <Card label="per feature" title="Window totals">
        <Table
          loading={loading && !data}
          rows={data?.features ?? []}
          rowKey={(r) => r.feature}
          onRowClick={(r) => url.set({ f: r.feature })}
          minWidth={820}
          initialSort={{ key: "calls", dir: "desc" }}
          empty={<EmptyState title="No AI answers in this window" />}
          columns={[
            { key: "feature", header: "feature", render: (r) => <span className="text-fg">{label(r.feature)}</span>, sort: (r) => r.feature },
            { key: "calls", header: "answers", align: "right", sort: (r) => r.total.calls, render: (r) => fmtNum(r.total.calls) },
            { key: "up", header: "👍 rate", align: "right", sort: (r) => rate(r.total) ?? -1, render: (r) => `${pct(rate(r.total))} · ${r.total.up}/${r.total.up + r.total.down}` },
            { key: "reason", header: "top down reason", hideOnPhone: true, render: (r) => topReason(r.total) },
            { key: "errors", header: "errors", align: "right", sort: (r) => r.total.errors, render: (r) => (r.total.errors ? <span className="text-bad-text">{fmtNum(r.total.errors)}</span> : "0") },
            { key: "p50", header: "p50 / p90", align: "right", sort: (r) => r.total.p50 ?? 0, render: (r) => `${secs(r.total.p50)} / ${secs(r.total.p90)}` },
            { key: "cost", header: "cost", align: "right", sort: (r) => r.total.cost, render: (r) => usd(r.total.cost, 3) },
            { key: "cites", header: "bad cites", align: "right", hideOnPhone: true, sort: (r) => (r.total.cites ? r.total.citesBad / r.total.cites : -1), render: (r) => (r.total.cites ? pct(r.total.citesBad / r.total.cites) : "–") },
            { key: "sonnet", header: "sonnet", align: "right", hideOnPhone: true, sort: (r) => r.total.sonnet, render: (r) => (r.total.sonnet || r.total.routeHeld ? `${r.total.sonnet}${r.total.routeHeld ? ` (+${r.total.routeHeld} held)` : ""}` : "–") },
          ]}
        />
      </Card>

      <Tabs
        label="Feature"
        value={tab}
        onChange={(f) => url.set({ f: f === "all" ? null : f })}
        tabs={[{ id: "all", label: "all features" }, ...(data?.features ?? []).map((f) => ({ id: f.feature, label: label(f.feature), count: f.total.calls }))]}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card label="per day" title={`Ratings${sel ? ` · ${label(sel.feature)}` : ""}`}>
          <TrendChart
            loading={loading && !data}
            data={daily.map((d) => ({ t: d.day, up: d.up, down: d.down, rate: rate(d) == null ? null : Math.round(100 * (rate(d) as number)) }))}
            series={[
              { key: "up", label: "👍" },
              { key: "down", label: "👎" },
              { key: "rate", label: "👍 rate %", dashed: true },
            ]}
            empty="No ratings yet"
          />
        </Card>
        <Card label="per day" title={`Latency p50 / p90 (s)${sel ? ` · ${label(sel.feature)}` : ""}`}>
          <TrendChart
            loading={loading && !data}
            data={daily.map((d) => ({ t: d.day, p50: d.p50 == null ? null : Math.round(d.p50 / 100) / 10, p90: d.p90 == null ? null : Math.round(d.p90 / 100) / 10 }))}
            series={[
              { key: "p50", label: "p50" },
              { key: "p90", label: "p90" },
            ]}
            empty="No answers yet"
          />
        </Card>
        <Card label="per day" title={`Answers and errors${sel ? ` · ${label(sel.feature)}` : ""}`}>
          <TrendChart
            loading={loading && !data}
            data={daily.map((d) => ({ t: d.day, calls: d.calls, errors: d.errors }))}
            series={[
              { key: "calls", label: "answers" },
              { key: "errors", label: "errors" },
            ]}
            empty="No answers yet"
          />
        </Card>
        <Card label="per day" title={`Cost (USD)${sel ? ` · ${label(sel.feature)}` : ""}`}>
          <TrendChart loading={loading && !data} data={daily.map((d) => ({ t: d.day, cost: d.cost }))} series={[{ key: "cost", label: "cost", format: (n) => usd(n, 3) }]} formatY={(n) => usd(n, 2)} empty="No spend yet" />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card label="down reasons" title={sel ? label(sel.feature) : "All features"}>
          {reasons && REASON_IDS.some((r) => reasons[r]) ? (
            <BarList items={REASON_IDS.map((r) => ({ key: r, label: FEEDBACK_REASONS[r], value: reasons[r] }))} />
          ) : (
            <EmptyState title="No reasons picked yet" hint="A thumbs down offers five optional chips." />
          )}
        </Card>
        <Card label="recent downs" title="The AI's answer (an excerpt), never the learner's message">
          {data?.recentDowns.length ? (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {data.recentDowns.filter((d) => !sel || d.feature === sel.feature).map((d) => (
                <li key={d.callId} className="flex flex-col gap-1 border-b border-line pb-3 last:border-0">
                  <span className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-fg-4">
                    {fmtDate(d.at, true)} · {label(d.feature)}
                    {d.reason ? <Badge tone="bad">{FEEDBACK_REASONS[d.reason].toLowerCase()}</Badge> : <Badge tone="muted">no reason</Badge>}
                    <span>· {shortModel(d.model)}</span>
                    {d.pv && <span>· prompt {d.pv}</span>}
                    <span>· #{d.callId}</span>
                  </span>
                  <span className="line-clamp-3 text-[13px] text-fg-2">{d.excerpt ?? <em className="text-fg-4">answer text no longer kept</em>}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No thumbs-down answers in this window" hint="scripts/ai-eval/downs-to-cases.ts turns recent downs into draft eval cases." />
          )}
        </Card>
      </div>

      <Card label="nightly evals" title="Pass rates (chat, dsa, lld-mock, brief, citations)">
        <NightlyTable n={data?.nightly ?? null} />
      </Card>
    </div>
  );
}

function topReason(b: Bucket): string {
  const best = REASON_IDS.filter((r) => b.reasons[r]).sort((x, y) => b.reasons[y] - b.reasons[x])[0];
  return best ? `${FEEDBACK_REASONS[best].toLowerCase()} (${b.reasons[best]})` : "–";
}

function nightlyHead(n: Nightly | undefined): string {
  const last = n?.runs?.[n.runs.length - 1];
  if (!last) return "–";
  const v = Object.values(last.rates).filter((x): x is number => typeof x === "number");
  return v.length ? `${Math.round((100 * v.reduce((a, b) => a + b, 0)) / v.length)}%` : "–";
}
function nightlyHint(n: Nightly | undefined): string {
  const last = n?.runs?.[n.runs.length - 1];
  if (!last) return "no run yet";
  return `${fmtDate(last.at)}${last.drops?.length ? ` · ${last.drops.length} dropped >10 pts` : ""}`;
}

function NightlyTable({ n }: { n: Nightly }) {
  const runs = (n?.runs ?? []).slice(-10).reverse();
  if (!runs.length) return <EmptyState title="No nightly run yet" hint="The ai-evals-nightly workflow writes its pass rates to the ai-evals branch." />;
  const keys = [...new Set(runs.flatMap((r) => Object.keys(r.rates)))];
  return (
    <Table
      rows={runs}
      rowKey={(r) => r.at}
      minWidth={640}
      columns={[
        { key: "at", header: "run", render: (r) => <span className="font-mono text-xs">{fmtDate(r.at, true)}</span> },
        ...keys.map((k) => ({ key: k, header: k, align: "right" as const, render: (r: (typeof runs)[number]) => (r.rates[k] == null ? "–" : <span className={r.drops?.includes(k) ? "text-bad-text" : ""}>{pct(r.rates[k] as number)}</span>) })),
        { key: "spend", header: "spend", align: "right", render: (r) => (r.spend == null ? "–" : usd(r.spend)) },
      ]}
    />
  );
}
