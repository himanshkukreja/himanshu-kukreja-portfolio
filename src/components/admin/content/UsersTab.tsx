"use client";

/** Auth users: email, name, provider, created, last sign-in. Learning stats live in /admin/learners. */
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Card, ErrorState, Kpi, Table, fmtDate, fmtNum, timeAgo, useAdminData, useNow, type Column } from "../ui";
import type { AdminUserRow } from "../shell/types";
import { SearchInput, Segmented } from "./common";

export default function UsersTab() {
  const res = useAdminData<{ users: AdminUserRow[]; total: number }>("/api/admin/users");
  const [q, setQ] = useState("");
  const [provider, setProvider] = useState("all");
  const all = useMemo(() => res.data?.users ?? [], [res.data]);
  const providers = useMemo(() => [...new Set(all.flatMap((u) => u.providers))].sort(), [all]);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return all.filter((u) => (provider === "all" || u.providers.includes(provider)) && (!n || [u.email, u.name, u.id].some((v) => v?.toLowerCase().includes(n))));
  }, [all, q, provider]);

  const now = useNow();
  const stats = useMemo(() => {
    return {
      new30: all.filter((u) => now - new Date(u.createdAt).getTime() < 30 * 86400_000).length,
      seen7: all.filter((u) => {
        const t = u.lastSeenAt || u.lastSignInAt;
        return t && now - new Date(t).getTime() < 7 * 86400_000;
      }).length,
      unconfirmed: all.filter((u) => !u.confirmed).length,
    };
  }, [all, now]);

  const columns: Column<AdminUserRow>[] = [
    {
      key: "user",
      header: "user",
      sort: (u) => (u.name || u.email || "").toLowerCase(),
      render: (u) => (
        <Link href={`/admin/learners/${encodeURIComponent(u.id)}`} className="group flex min-w-0 items-center gap-2.5">
          <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center border border-line-strong font-mono text-xs text-fg-2 group-hover:border-signal">
            {(u.name || u.email || "?").trim().charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block max-w-[220px] truncate text-sm font-semibold text-fg group-hover:text-signal-text">{u.name || "—"}</span>
            <span className="block max-w-[220px] truncate font-mono text-[11px] text-fg-3">{u.email || u.id}</span>
          </span>
        </Link>
      ),
    },
    {
      key: "provider",
      header: "provider",
      sort: (u) => u.providers.join(","),
      render: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.providers.length ? u.providers.map((p) => <Badge key={p}>{p}</Badge>) : <span className="text-fg-4">—</span>}
          {!u.confirmed && <Badge tone="bad">unconfirmed</Badge>}
        </div>
      ),
    },
    { key: "created", header: "joined", sort: (u) => u.createdAt, render: (u) => <span className="whitespace-nowrap font-mono text-xs" title={fmtDate(u.createdAt, true)}>{fmtDate(u.createdAt)}</span> },
    {
      key: "signin",
      header: "last sign-in",
      sort: (u) => u.lastSignInAt || "",
      render: (u) => <span className="whitespace-nowrap font-mono text-xs" title={u.lastSignInAt ? fmtDate(u.lastSignInAt, true) : undefined}>{timeAgo(u.lastSignInAt)}</span>,
    },
    {
      key: "seen",
      header: "last seen",
      hideOnPhone: true,
      sort: (u) => u.lastSeenAt || "",
      render: (u) => <span className="whitespace-nowrap font-mono text-xs">{timeAgo(u.lastSeenAt)}</span>,
    },
    {
      key: "go",
      header: <span className="sr-only">open</span>,
      align: "right",
      render: (u) => (
        <Link href={`/admin/learners/${encodeURIComponent(u.id)}`} className="inline-flex min-h-9 items-center px-1 font-mono text-[11px] text-fg-3 hover:text-fg">
          learner →
        </Link>
      ),
    },
  ];

  if (res.error && !res.data) return <ErrorState error={res.error} onRetry={res.refresh} title="Couldn't load users" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Accounts" value={fmtNum(all.length)} loading={res.loading && !res.data} />
        <Kpi label="New · 30d" value={fmtNum(stats.new30)} loading={res.loading && !res.data} />
        <Kpi label="Seen · 7d" value={fmtNum(stats.seen7)} loading={res.loading && !res.data} />
        <Kpi label="Unconfirmed" value={fmtNum(stats.unconfirmed)} loading={res.loading && !res.data} />
      </div>
      <Card label="auth.users" title="Users">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput value={q} onChange={setQ} placeholder="email, name, id" className="sm:max-w-sm sm:flex-1" label="Search users" />
          {providers.length > 1 && (
            <Segmented label="Provider" value={provider} onChange={setProvider} options={[{ id: "all", label: "all" }, ...providers.map((p) => ({ id: p, label: p }))]} />
          )}
        </div>
        <Table
          columns={columns}
          rows={shown}
          rowKey={(u) => u.id}
          loading={res.loading && !res.data}
          minWidth={680}
          initialSort={{ key: "created", dir: "desc" }}
          className="max-h-[640px] overflow-y-auto"
          empty={q ? "No users match that search" : "No users yet"}
          dense
        />
        <p className="mt-2 font-mono text-[11px] text-fg-4">Learning progress, resets and per-user activity live in Learners.</p>
      </Card>
    </div>
  );
}
