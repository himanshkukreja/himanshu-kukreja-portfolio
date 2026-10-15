"use client";

/**
 * Campaign dashboard: sent / failed / opened (unique + %) / clicked / unsubscribed, a delivery
 * funnel, recent activity, and the per-recipient table (filters, search, paging, CSV export).
 */
import { useState } from "react";
import { Card, Kpi, LABEL, Table, fmtDate, fmtNum, timeAgo, useAdminClient, useAdminData, useNow, type Column } from "@/components/admin/ui";
import { SearchInput, Segmented, btnCls, downloadText } from "@/components/admin/content/common";
import { displayStatus, type CampaignSummary, type EventRow, type MessageRow } from "@/lib/campaigns/types";
import { MessageBadge, Note, pct, useDebounced } from "./bits";

type Filter = "all" | "sent" | "opened" | "unopened" | "clicked" | "failed" | "skipped" | "queued" | "unsubscribed";
const FILTERS: Filter[] = ["all", "opened", "unopened", "clicked", "failed", "skipped", "queued", "unsubscribed"];
const PAGE = 50;

export default function Report({ campaign, events }: { campaign: CampaignSummary; events: EventRow[] }) {
  const client = useAdminClient();
  const now = useNow(30_000);
  const c = campaign.counts;
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 300);
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const url = `/api/admin/newsletter/campaigns/${campaign.id}/recipients?filter=${filter}&q=${encodeURIComponent(dq)}&offset=${page * PAGE}&limit=${PAGE}`;
  const rows = useAdminData<{ rows: MessageRow[]; total: number }>(url, { refreshMs: campaign.status === "sending" ? 10_000 : 30_000 });
  const total = rows.data?.total ?? 0;

  const exportCsv = async () => {
    setExporting(true);
    try {
      const csv = await client.text(`/api/admin/newsletter/campaigns/${campaign.id}/recipients?filter=${filter}&q=${encodeURIComponent(dq)}&format=csv`);
      downloadText(`${campaign.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${filter}.csv`, csv);
    } finally {
      setExporting(false);
    }
  };

  const cols: Column<MessageRow>[] = [
    {
      key: "who",
      header: "recipient",
      render: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-fg">{r.email}</span>
          {r.name && <span className="truncate text-xs text-fg-3">{r.name}</span>}
        </span>
      ),
      className: "max-w-[280px]",
    },
    {
      key: "status",
      header: "status",
      render: (r) => (
        <span className="flex flex-col items-start gap-0.5">
          <MessageBadge status={displayStatus(r)} />
          {r.error && <span className="max-w-[220px] truncate font-mono text-[10px] text-fg-4" title={r.error}>{r.error}</span>}
        </span>
      ),
    },
    { key: "sent", header: "sent", render: (r) => <span className="font-mono text-xs text-fg-3">{r.sentAt ? fmtDate(r.sentAt, true) : "—"}</span>, hideOnPhone: true },
    {
      key: "open",
      header: "opens",
      align: "right",
      render: (r) => (
        <span className="font-mono text-xs" title={r.firstOpenAt ? `first ${fmtDate(r.firstOpenAt, true)} · last ${fmtDate(r.lastOpenAt, true)}` : undefined}>
          {r.openCount || (r.firstOpenAt ? "✓" : "—")}
          {r.lastOpenAt && <span className="ml-1 text-fg-4">{timeAgo(r.lastOpenAt, now)}</span>}
        </span>
      ),
    },
    {
      key: "click",
      header: "clicks",
      align: "right",
      render: (r) => (
        <span className="font-mono text-xs" title={r.firstClickAt ? `first ${fmtDate(r.firstClickAt, true)}` : undefined}>
          {r.clickCount || "—"}
          {r.lastClickAt && <span className="ml-1 text-fg-4">{timeAgo(r.lastClickAt, now)}</span>}
        </span>
      ),
    },
  ];

  const funnel = [
    { label: "queued", n: c.total },
    { label: "sent", n: c.sent },
    { label: "opened", n: c.opened },
    { label: "clicked", n: c.clicked },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Sent" value={fmtNum(c.sent)} hint={`of ${fmtNum(c.total)} queued`} />
        <Kpi label="Failed" value={fmtNum(c.failed)} hint={c.skipped ? `${fmtNum(c.skipped)} skipped` : "rejected at send"} />
        <Kpi label="Opened · unique" value={pct(c.opened, c.sent)} hint={`${fmtNum(c.opened)} people · ${fmtNum(c.opens)} opens`} />
        <Kpi label="Clicked · unique" value={pct(c.clicked, c.sent)} hint={`${fmtNum(c.clicked)} people · ${fmtNum(c.clicks)} clicks`} />
        <Kpi label="Click-to-open" value={pct(c.clicked, c.opened)} hint="of openers" />
        <Kpi label="Unsubscribed" value={fmtNum(c.unsubscribed)} hint={pct(c.unsubscribed, c.sent)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card label="funnel" title="Delivery → open → click">
          <div className="flex flex-col gap-3">
            {funnel.map((f, i) => (
              <div key={f.label} className="grid grid-cols-[72px_minmax(0,1fr)_88px] items-center gap-3">
                <span className="font-mono text-xs text-fg-3">{f.label}</span>
                <span className="h-3 bg-line">
                  <span className={`block h-3 ${i === 0 ? "bg-fg-3" : "bg-signal"}`} style={{ width: `${c.total ? Math.max(1, (f.n / c.total) * 100) : 0}%` }} />
                </span>
                <span className="text-right font-mono text-xs text-fg-2">
                  {fmtNum(f.n)} <span className="text-fg-4">{i ? pct(f.n, i === 1 ? c.total : c.sent) : ""}</span>
                </span>
              </div>
            ))}
          </div>
          <Note title="how accurate are opens?" className="mt-4">
            Opens come from a 1×1 image. <b>Apple Mail Privacy Protection</b> preloads images for every message, so Apple Mail users can show as opened without reading (over-counted), while
            Gmail/Outlook users who block images never trigger it (under-counted). A click also counts as an open. Corporate link scanners can occasionally pre-click links.
            Clicks are the reliable signal.
          </Note>
        </Card>

        <Card label="activity" title="Latest opens and clicks" pad={false}>
          {events.length ? (
            <ul className="m-0 max-h-[340px] list-none overflow-y-auto p-0">
              {events.map((e, i) => (
                <li key={`${e.at}-${i}`} className="flex items-center justify-between gap-3 border-b border-line px-4 py-2 last:border-0">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-fg">{e.email}</span>
                    <span className="block truncate font-mono text-[11px] text-fg-3">{e.type === "click" && e.url ? e.url.replace(/^https?:\/\//, "").replace(/[?#].*$/, "") : e.type}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <MessageBadge status={e.type === "click" ? "clicked" : e.type === "open" ? "opened" : "skipped"} />
                    <span className="w-14 text-right font-mono text-[11px] text-fg-4">{timeAgo(e.at, now)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 px-4 py-6 text-sm text-fg-3">No opens or clicks yet.</p>
          )}
        </Card>
      </div>

      <Card
        label="recipients"
        title={`${fmtNum(total)} ${filter === "all" ? "recipients" : filter}`}
        pad={false}
        action={
          <button type="button" className={btnCls} disabled={exporting || !total} onClick={exportCsv}>
            {exporting ? "exporting…" : "↓ csv"}
          </button>
        }
      >
        <div className="flex flex-col gap-2 border-b border-line p-3 sm:flex-row sm:items-center">
          <Segmented
            label="Recipient filter"
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setPage(0);
            }}
            options={FILTERS.map((f) => ({ id: f, label: f }))}
          />
          <SearchInput
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(0);
            }}
            placeholder="email or name…"
            className="sm:ml-auto sm:w-64"
            label="Search recipients"
          />
        </div>
        <Table columns={cols} rows={rows.data?.rows ?? []} rowKey={(r) => String(r.id)} loading={!rows.data && !rows.error} minWidth={560} className="border-0" dense empty="Nobody matches this filter." />
        {total > PAGE && (
          <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
            <span className={LABEL}>
              {fmtNum(page * PAGE + 1)}–{fmtNum(Math.min(total, (page + 1) * PAGE))} of {fmtNum(total)}
            </span>
            <span className="flex gap-1.5">
              <button type="button" className={btnCls} disabled={page === 0} onClick={() => setPage(page - 1)}>
                ← prev
              </button>
              <button type="button" className={btnCls} disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>
                next →
              </button>
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}
