"use client";

/**
 * /admin/gaps: the content-gap radar (what people ask smart search and the course chat that the course
 * doesn't cover well, grouped into topics and ranked by how many learners asked) and the shared answers
 * list (hide one and its public page 404s). Data: GET /api/admin/gaps, GET/PATCH /api/admin/shares.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, ExternalLink, EyeOff, Eye, RefreshCw } from "lucide-react";
import { adminFetch } from "@/lib/admin/fetch";
import { Badge, Card, EmptyState, ErrorState, Kpi, LABEL, PageHead, Skeleton, Table, Tabs, fmtDate, fmtNum, useAdminClient, type BadgeTone, type Column } from "@/components/admin/ui";
import type { GapLabel, GapReport, GapTopic } from "@/lib/admin/gaps/types";
import type { AdminShare } from "@/lib/share/answers";

const PREVIEW_HEADER = "x-hk-admin-preview";

/** JSON from an admin API; the dev preview sends its header so the server answers with sample data. */
function useJson() {
  const client = useAdminClient();
  return useCallback(
    async <T,>(url: string, init: RequestInit = {}): Promise<T> => {
      if (!client.preview) return client.json<T>(url, init);
      const headers = new Headers(init.headers);
      headers.set(PREVIEW_HEADER, "1");
      if (init.body) headers.set("Content-Type", "application/json");
      const res = await adminFetch(url, { ...init, headers });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(body?.error || `HTTP ${res.status}`), { status: res.status });
      return body as T;
    },
    [client],
  );
}

function useLoad<T>(url: string) {
  const json = useJson();
  const [state, setState] = useState<{ url: string; data?: T; error?: Error }>({ url: "" });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let off = false;
    json<T>(url)
      .then((data) => !off && setState({ url, data }))
      .catch((error: Error) => !off && setState({ url, error }));
    return () => {
      off = true;
    };
  }, [url, nonce, json]);
  return { data: state.url === url ? state.data : undefined, error: state.url === url ? state.error : undefined, loading: state.url !== url, reload: () => setNonce((n) => n + 1), setData: (d: T) => setState({ url, data: d }) };
}

const VERDICT: Record<GapLabel, { tone: BadgeTone; label: string }> = {
  gap: { tone: "signal", label: "gap" },
  thin: { tone: "neutral", label: "thin" },
  covered: { tone: "muted", label: "covered" },
};
const VIA: Record<GapTopic["via"], string> = { concept: "concept", synonym: "synonyms", "new-words": "new words", words: "wording" };

const csvCell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function downloadCsv(r: GapReport, topics: GapTopic[]) {
  const head = ["topic", "verdict", "why", "asks", "learners", "gap_share", "smart_search", "chat", "grouped_by", "concept_id", "examples", "closest_material", "first_day", "last_day"];
  const rows = topics.map((t) => [
    t.label,
    t.verdict,
    t.why,
    t.count,
    t.users,
    t.gapShare === null ? null : Math.round(t.gapShare * 100) / 100,
    t.bySource["smart-search"] ?? 0,
    t.bySource.chat ?? 0,
    t.via,
    t.conceptId,
    t.examples.map((e) => `${e.q} (${e.n})`).join(" | "),
    t.closest.map((m) => `${m.title} <${m.href}>`).join(" | "),
    t.firstDay,
    t.lastDay,
  ]);
  const csv = [head, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `content-gaps-${r.days}d-${r.generatedAt.slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function TopicsPanel() {
  const [days, setDays] = useState(30);
  const [filter, setFilter] = useState<GapLabel | "all">("all");
  const [fresh, setFresh] = useState(0);
  const { data, error, loading, reload } = useLoad<GapReport>(`/api/admin/gaps?days=${days}${fresh ? `&fresh=1&n=${fresh}` : ""}`);
  const topics = useMemo(() => (data?.topics ?? []).filter((t) => filter === "all" || t.verdict === filter), [data, filter]);

  const columns: Column<GapTopic>[] = [
    {
      key: "topic",
      header: "Topic",
      sort: (t) => t.label,
      render: (t) => (
        <div className="flex min-w-0 flex-col gap-1 py-1">
          <div className="flex flex-wrap items-center gap-2">
            {t.conceptId ? (
              <Link href={`/learn/concepts/${t.conceptId}`} className="font-semibold text-fg hover:underline" target="_blank">
                {t.label}
              </Link>
            ) : (
              <span className="font-semibold text-fg">{t.label}</span>
            )}
            <span className="font-mono text-[10px] uppercase tracking-label text-fg-4">{VIA[t.via]}</span>
          </div>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {t.examples.slice(0, 3).map((e) => (
              <li key={e.q} className="truncate text-[12px] text-fg-3">
                “{e.q}”{e.n > 1 ? <span className="font-mono text-fg-4"> ×{e.n}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ),
    },
    { key: "users", header: "Learners", align: "right", sort: (t) => t.users, render: (t) => <span className="font-mono">{fmtNum(t.users)}</span> },
    { key: "count", header: "Asks", align: "right", sort: (t) => t.count, render: (t) => <span className="font-mono">{fmtNum(t.count)}</span>, hideOnPhone: true },
    {
      key: "gapShare",
      header: "Missed",
      align: "right",
      sort: (t) => t.gapShare ?? -1,
      hideOnPhone: true,
      render: (t) => <span className="font-mono text-fg-2" title="share of asks that came back partial or with nothing">{t.gapShare === null ? "—" : `${Math.round(t.gapShare * 100)}%`}</span>,
    },
    {
      key: "closest",
      header: "Closest course material",
      hideOnPhone: true,
      render: (t) =>
        t.closest.length ? (
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {t.closest.map((m) => (
              <li key={m.id} className="max-w-[300px] truncate text-[12px]">
                <span className="font-mono text-[10px] uppercase text-fg-4">{m.kind}</span>{" "}
                <Link href={m.href} target="_blank" className="text-fg-2 hover:text-fg hover:underline">
                  {m.title}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-[12px] text-fg-4">nothing close</span>
        ),
    },
    {
      key: "verdict",
      header: "Verdict",
      sort: (t) => ({ gap: 0, thin: 1, covered: 2 })[t.verdict],
      render: (t) => (
        <div className="flex max-w-[220px] flex-col items-start gap-1">
          <Badge tone={VERDICT[t.verdict].tone}>{VERDICT[t.verdict].label}</Badge>
          <span className="text-[11px] leading-snug text-fg-3">{t.why}</span>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1" role="group" aria-label="Window">
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d} className={`min-h-9 border px-3 font-mono text-[12px] ${days === d ? "border-signal text-fg" : "border-line text-fg-3 hover:text-fg"}`}>
              {d}d
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setFresh((n) => n + 1)} className="inline-flex min-h-9 items-center gap-2 border border-line px-3 text-[13px] text-fg-2 hover:text-fg">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Rebuild
          </button>
          <button type="button" disabled={!data || !topics.length} onClick={() => data && downloadCsv(data, topics)} className="inline-flex min-h-9 items-center gap-2 border border-line-strong px-3 text-[13px] font-semibold text-fg hover:border-fg-3 disabled:opacity-50">
            <Download className="h-3.5 w-3.5" aria-hidden /> Export CSV
          </button>
        </div>
      </div>

      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi label="Asks" value={data ? fmtNum(data.totals.asks) : "—"} loading={loading && !data} hint={data?.totals.offTopic ? `${data.totals.offTopic} off-topic left out` : undefined} />
            <Kpi label="Learners" value={data ? fmtNum(data.totals.users) : "—"} loading={loading && !data} />
            <Kpi label="Topics" value={data ? fmtNum(data.totals.topics) : "—"} loading={loading && !data} />
            <Kpi label="Gaps" value={data ? fmtNum(data.totals.gap) : "—"} loading={loading && !data} />
            <Kpi label="Thin" value={data ? fmtNum(data.totals.thin) : "—"} loading={loading && !data} />
          </div>

          {data && (
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-fg-3">
              <span className={LABEL}>Sources</span>
              {data.sources.map((s) => (
                <Badge key={s.id} tone={s.status === "ok" ? "ok" : s.status === "error" ? "bad" : "muted"} title={s.note}>
                  {s.label}: {s.status === "ok" ? fmtNum(s.events) : s.status === "missing" ? "not connected yet" : s.status}
                </Badge>
              ))}
              {data.sample && <Badge tone="signal">sample data</Badge>}
              {data.engineError && <Badge tone="bad" title={data.engineError}>search index unavailable</Badge>}
            </div>
          )}

          <Card
            label="Topics, most learners first"
            action={
              <Tabs
                label="Verdict"
                value={filter}
                onChange={setFilter}
                tabs={[
                  { id: "all", label: "All", count: data?.totals.topics ?? null },
                  { id: "gap", label: "Gap", count: data?.totals.gap ?? null },
                  { id: "thin", label: "Thin", count: data?.totals.thin ?? null },
                  { id: "covered", label: "Covered", count: data?.totals.covered ?? null },
                ]}
              />
            }
            pad={false}
          >
            {loading && !data ? (
              <div className="flex flex-col gap-2 p-4">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <Table
                columns={columns}
                rows={topics}
                rowKey={(t) => t.key}
                minWidth={860}
                empty={<EmptyState title="No asks in this window" hint="Smart search asks are logged once the search_queries migration is applied; until then the last 30 days of smart-search transcripts are read. The course chat joins once its log table exists." />}
              />
            )}
          </Card>
          {data && <p className="m-0 text-[12px] text-fg-4">Built {fmtDate(data.generatedAt, true)} · kept 5 minutes · queries shown normalised, never with who asked.</p>}
        </>
      )}
    </div>
  );
}

type SharesResponse = { enabled: boolean; shares: AdminShare[]; total: number };

function SharesPanel() {
  const json = useJson();
  const { data, error, loading, reload, setData } = useLoad<SharesResponse>("/api/admin/shares");
  const [busy, setBusy] = useState<string | null>(null);
  const toggle = async (s: AdminShare) => {
    setBusy(s.id);
    try {
      await json("/api/admin/shares", { method: "PATCH", body: JSON.stringify({ id: s.id, hidden: !s.hidden }) });
      if (data) setData({ ...data, shares: data.shares.map((x) => (x.id === s.id ? { ...x, hidden: !s.hidden } : x)) });
    } finally {
      setBusy(null);
    }
  };
  const columns: Column<AdminShare>[] = [
    {
      key: "q",
      header: "Question",
      render: (s) => (
        <div className="flex min-w-0 flex-col gap-0.5 py-1">
          <span className={`text-[14px] ${s.hidden ? "text-fg-4 line-through" : "text-fg"}`}>{s.question}</span>
          <span className="font-mono text-[11px] text-fg-4">/learn/answer/{s.id}</span>
        </div>
      ),
    },
    { key: "sources", header: "Sources", align: "right", sort: (s) => s.sources, render: (s) => <span className="font-mono">{s.sources}</span>, hideOnPhone: true },
    { key: "at", header: "Shared", sort: (s) => s.createdAt, render: (s) => <span className="font-mono text-[12px] text-fg-3">{fmtDate(s.createdAt, true)}</span>, hideOnPhone: true },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (s) => (
        <div className="flex items-center justify-end gap-2">
          {!s.hidden && (
            <a href={`/learn/answer/${s.id}`} target="_blank" rel="noopener" className="inline-flex min-h-8 items-center gap-1 px-2 text-[12px] text-fg-3 hover:text-fg" aria-label="Open the page">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          )}
          <button type="button" disabled={busy === s.id} onClick={() => toggle(s)} className="inline-flex min-h-8 items-center gap-1.5 border border-line px-2.5 text-[12px] text-fg-2 hover:text-fg disabled:opacity-50">
            {s.hidden ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />}
            {s.hidden ? "Show" : "Hide"}
          </button>
        </div>
      ),
    },
  ];
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (data && !data.enabled)
    return <EmptyState title="Answer sharing is off" hint="It switches on when the shared_answers migration (supabase/migrations/20261029_shared_answers.sql) is applied. Until then /learn/chat hides Share." />;
  return (
    <Card label={`Shared answers${data ? ` · ${fmtNum(data.total)}` : ""}`} pad={false}>
      {loading && !data ? (
        <div className="p-4">
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <Table columns={columns} rows={data?.shares ?? []} rowKey={(s) => s.id} minWidth={560} empty={<EmptyState title="Nothing shared yet" />} />
      )}
    </Card>
  );
}

export default function GapsDashboard() {
  const [tab, setTab] = useState<"topics" | "shares">("topics");
  return (
    <div className="flex flex-col gap-5">
      <PageHead
        path="admin/gaps"
        title="Content gaps"
        sub="What learners search for or ask the tutor about that the course doesn't cover well, grouped into topics and ranked by how many learners asked."
      />
      <Tabs
        label="Content gaps"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "topics", label: "Topics" },
          { id: "shares", label: "Shared answers" },
        ]}
      />
      {tab === "topics" ? <TopicsPanel /> : <SharesPanel />}
    </div>
  );
}
