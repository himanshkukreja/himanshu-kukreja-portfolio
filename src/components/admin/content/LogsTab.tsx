"use client";

/** Newsletter send logs (newsletter_logs) + ops: revalidate the /learn cache. */
import { useMemo, useState } from "react";
import { Badge, Card, ConfirmButton, ErrorState, Kpi, Table, fmtDate, fmtNum, timeAgo, useAdminClient, useAdminData, type Column } from "../ui";
import type { SendLog } from "../shell/types";
import { SearchInput, Segmented, type useFlash } from "./common";

type Say = ReturnType<typeof useFlash>["say"];

export default function LogsTab({ say }: { say: Say }) {
  const client = useAdminClient();
  const [limit, setLimit] = useState<"100" | "500" | "1000">("100");
  const res = useAdminData<SendLog[]>(`/api/admin/logs?limit=${limit}`);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "sent" | "failed">("all");
  const all = useMemo(() => res.data ?? [], [res.data]);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return all.filter((l) => (status === "all" || (status === "sent" ? l.status === "sent" : l.status !== "sent")) && (!n || [l.email, l.detail].some((v) => v?.toLowerCase().includes(n))));
  }, [all, q, status]);
  const sent = all.filter((l) => l.status === "sent").length;

  const revalidate = async () => {
    try {
      await client.json("/api/revalidate-courses", { method: "POST" });
      say("Course pages revalidated");
    } catch (e) {
      say(`Revalidate failed: ${(e as Error).message}`, "bad");
    }
  };

  const columns: Column<SendLog>[] = [
    { key: "at", header: "time", sort: (l) => l.created_at, render: (l) => <span className="whitespace-nowrap font-mono text-xs" title={fmtDate(l.created_at, true)}>{timeAgo(l.created_at)}</span> },
    { key: "email", header: "email", sort: (l) => l.email, render: (l) => <span className="block max-w-[260px] truncate text-fg">{l.email}</span> },
    { key: "status", header: "status", sort: (l) => l.status, render: (l) => <Badge tone={l.status === "sent" ? "ok" : "bad"}>{l.status}</Badge> },
    { key: "campaign", header: "campaign", hideOnPhone: true, sort: (l) => l.campaign_id ?? 0, render: (l) => <span className="font-mono text-xs">{l.campaign_id != null ? `#${l.campaign_id}` : "—"}</span> },
    { key: "detail", header: "detail", render: (l) => <span className="block max-w-[320px] truncate font-mono text-[11px] text-fg-3" title={l.detail || undefined}>{l.detail || "—"}</span> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <Kpi label={`Logged · last ${limit}`} value={fmtNum(all.length)} loading={res.loading && !res.data} />
        <Kpi label="Sent" value={fmtNum(sent)} loading={res.loading && !res.data} />
        <Kpi label="Failed" value={fmtNum(all.length - sent)} loading={res.loading && !res.data} />
      </div>
      <Card label="newsletter_logs" title="Send logs" action={<Segmented label="Rows" value={limit} onChange={setLimit} options={[{ id: "100", label: "100" }, { id: "500", label: "500" }, { id: "1000", label: "1k" }]} />}>
        {res.error && !res.data ? (
          <ErrorState error={res.error} onRetry={res.refresh} />
        ) : (
          <>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <SearchInput value={q} onChange={setQ} placeholder="email or error" className="sm:max-w-sm sm:flex-1" label="Search logs" />
              <Segmented
                label="Status"
                value={status}
                onChange={setStatus}
                options={[
                  { id: "all", label: "all" },
                  { id: "sent", label: "sent" },
                  { id: "failed", label: "failed" },
                ]}
              />
            </div>
            <Table columns={columns} rows={shown} rowKey={(l, i) => `${l.email}-${l.created_at}-${i}`} loading={res.loading && !res.data} minWidth={620} className="max-h-[560px] overflow-y-auto" empty="No send logs" dense />
          </>
        )}
      </Card>
      <Card label="ops" title="Course cache">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-prose text-sm text-fg-3">Pushed new lessons to the course repo? Revalidate /learn so the next visitor gets them without waiting for the cache to expire.</p>
          <ConfirmButton tone="signal" confirmLabel="revalidate now?" onConfirm={revalidate} className="shrink-0">
            ↻ revalidate /learn
          </ConfirmButton>
        </div>
      </Card>
    </div>
  );
}
