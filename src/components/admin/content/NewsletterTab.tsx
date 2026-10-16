"use client";

/**
 * Subscribers (search, filter, unsubscribe/resubscribe, delete, CSV export). Sending moved to
 * /admin/newsletter: the old "pick stories → send" composer is the "Case file update" template there
 * (scheduling, tracking, merge tags, per-person story history), so there's one place to send from.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Card, ConfirmButton, ErrorState, Kpi, Table, fmtDate, fmtNum, timeAgo, useAdminClient, useAdminData, useNow, type Column } from "../ui";
import type { Subscriber } from "../shell/types";
import { SearchInput, Segmented, btnCls, downloadText, primaryBtnCls, type useFlash } from "./common";

type Say = ReturnType<typeof useFlash>["say"];
type Filter = "active" | "all" | "unsub";

const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export default function NewsletterTab({ say }: { say: Say }) {
  const client = useAdminClient();
  const subs = useAdminData<Subscriber[]>("/api/admin/subscribers");

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [exporting, setExporting] = useState(false);

  const all = useMemo(() => subs.data ?? [], [subs.data]);

  const now = useNow();
  const counts = useMemo(() => {
    return {
      active: all.filter((s) => !s.unsubscribed).length,
      unsub: all.filter((s) => s.unsubscribed).length,
      new30: all.filter((s) => now - new Date(s.created_at).getTime() < 30 * 86400_000).length,
    };
  }, [all, now]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((s) => {
      if (filter === "active" && s.unsubscribed) return false;
      if (filter === "unsub" && !s.unsubscribed) return false;
      if (!needle) return true;
      return [s.email, s.city, s.region, s.country, s.timezone].some((v) => v && v.toLowerCase().includes(needle));
    });
  }, [all, q, filter]);

  const setUnsub = async (email: string, unsubscribed: boolean) => {
    try {
      await client.json("/api/admin/subscribers", jsonInit("PATCH", { email, unsubscribed }));
      subs.mutate((d) => d?.map((s) => (s.email === email ? { ...s, unsubscribed, unsubscribed_at: unsubscribed ? new Date().toISOString() : null } : s)));
      say(unsubscribed ? `Unsubscribed ${email}` : `Resubscribed ${email}`);
    } catch (e) {
      say(`Update failed: ${(e as Error).message}`, "bad");
    }
  };
  const remove = async (email: string) => {
    try {
      await client.json("/api/admin/subscribers", jsonInit("DELETE", { email }));
      subs.mutate((d) => d?.filter((s) => s.email !== email));
      say(`Deleted ${email}`);
    } catch (e) {
      say(`Delete failed: ${(e as Error).message}`, "bad");
    }
  };
  const exportCsv = async () => {
    setExporting(true);
    try {
      const csv = await client.text("/api/admin/export-csv");
      downloadText(`subscribers-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      say("CSV exported");
    } catch (e) {
      say(`Export failed: ${(e as Error).message}`, "bad");
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<Subscriber>[] = [
    {
      key: "email",
      header: "email",
      sort: (s) => s.email,
      render: (s) => (
        <div className="min-w-0">
          <div className="max-w-[260px] truncate text-fg" title={s.email}>
            {s.email}
          </div>
          <div className="truncate text-xs text-fg-4 sm:hidden">{[s.city, s.country].filter(Boolean).join(", ") || "—"}</div>
        </div>
      ),
    },
    {
      key: "where",
      header: "location",
      hideOnPhone: true,
      sort: (s) => s.country || "",
      render: (s) => (
        <span className="block max-w-[220px] truncate text-xs" title={s.timezone || undefined}>
          {[s.city, s.region, s.country].filter(Boolean).join(", ") || "—"}
        </span>
      ),
    },
    { key: "created_at", header: "joined", sort: (s) => s.created_at, render: (s) => <span className="whitespace-nowrap font-mono text-xs" title={fmtDate(s.created_at, true)}>{timeAgo(s.created_at)}</span> },
    { key: "status", header: "status", sort: (s) => (s.unsubscribed ? 1 : 0), render: (s) => (s.unsubscribed ? <Badge tone="muted">unsubscribed</Badge> : <Badge tone="ok">active</Badge>) },
    {
      key: "actions",
      header: <span className="sr-only">actions</span>,
      align: "right",
      render: (s) => (
        <div className="flex justify-end gap-1.5">
          {s.unsubscribed ? (
            <ConfirmButton size="sm" tone="signal" confirmLabel="resubscribe?" onConfirm={() => setUnsub(s.email, false)} aria-label={`Resubscribe ${s.email}`}>
              resub
            </ConfirmButton>
          ) : (
            <ConfirmButton size="sm" confirmLabel="unsubscribe?" onConfirm={() => setUnsub(s.email, true)} aria-label={`Unsubscribe ${s.email}`}>
              unsub
            </ConfirmButton>
          )}
          <ConfirmButton size="sm" confirmLabel="delete forever?" onConfirm={() => remove(s.email)} aria-label={`Delete ${s.email}`}>
            delete
          </ConfirmButton>
        </div>
      ),
    },
  ];

  if (subs.error && !subs.data) return <ErrorState error={subs.error} onRetry={subs.refresh} title="Couldn't load subscribers" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Active" value={fmtNum(counts.active)} loading={subs.loading && !subs.data} />
        <Kpi label="New · 30d" value={fmtNum(counts.new30)} loading={subs.loading && !subs.data} />
        <Kpi label="Unsubscribed" value={fmtNum(counts.unsub)} loading={subs.loading && !subs.data} />
      </div>

      <Card label="sending moved" title="Send a case-file update from /admin/newsletter">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="m-0 max-w-prose text-sm text-fg-3">
            Pick the story from a dropdown, choose who gets it (subscribers + learners by default), preview as a real reader, test, then send now or schedule it. People who already got a story are skipped.
          </p>
          <Link href="/admin/newsletter/new?template=story" className={`${primaryBtnCls} shrink-0`}>
            compose case-file update →
          </Link>
        </div>
      </Card>

      <Card
        label="newsletter_subscribers"
        title="Subscribers"
        action={
          <button type="button" onClick={exportCsv} disabled={exporting} className={btnCls}>
            {exporting ? "exporting…" : "↓ export csv"}
          </button>
        }
      >
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput value={q} onChange={setQ} placeholder="email, city, country, timezone" className="sm:max-w-sm sm:flex-1" label="Search subscribers" />
          <Segmented
            label="Status filter"
            value={filter}
            onChange={setFilter}
            options={[
              { id: "active", label: `active ${counts.active}` },
              { id: "all", label: `all ${all.length}` },
              { id: "unsub", label: `unsub ${counts.unsub}` },
            ]}
          />
        </div>
        <Table
          columns={columns}
          rows={shown}
          rowKey={(s) => s.email}
          loading={subs.loading && !subs.data}
          minWidth={600}
          className="max-h-[520px] overflow-y-auto"
          empty={q ? "No subscribers match that search" : "No subscribers in this view"}
          dense
        />
      </Card>

    </div>
  );
}
