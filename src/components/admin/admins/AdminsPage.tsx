"use client";

/**
 * /admin/admins: who can open /admin. The owner(s) come from the code and the ADMIN_EMAIL env and can't be removed
 * here; added admins live in admin_users (lib/admin/admins.ts) and get every admin page and power but this one. Only
 * an owner may add or remove (the API checks; this page shows everyone else the list read-only). Each change leaves
 * an audit row, listed under "history".
 */
import { useState } from "react";
import { Badge, Card, ConfirmButton, EmptyState, ErrorState, fmtDate, LABEL, PageHead, Table, timeAgo, useAdminClient, useAdminData } from "@/components/admin/ui";

type Owner = { email: string; account: boolean };
type Added = { email: string; added_by: string; added_at: string; note: string | null; account: boolean };
type Audit = { id: number; at: string; actor: string; action: "admin.add" | "admin.remove"; target: string; note: string | null };
type Resp = { owners: Owner[]; admins: Added[]; table: boolean; canManage: boolean; you: string; audit: Audit[] | null };
type Row = { email: string; owner: boolean; added_by: string | null; added_at: string | null; note: string | null; account: boolean };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const INPUT = "min-h-10 w-full border border-line-strong bg-bg px-2.5 text-sm text-fg placeholder:text-fg-4";

function NoAccount() {
  return (
    <span className="font-mono text-[11px] text-fg-4" title="They need a site account on this email to sign in and open /admin">
      no account yet
    </span>
  );
}

export default function AdminsPage() {
  const client = useAdminClient();
  const { data, error, loading, refresh } = useAdminData<Resp>("/api/admin/admins");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (error && !data) return <ErrorState error={error} onRetry={refresh} />;
  const manage = !!data?.canManage;
  const clean = email.trim().toLowerCase();
  const valid = EMAIL_RE.test(clean);
  const rows: Row[] = [
    ...(data?.owners ?? []).map((o) => ({ email: o.email, owner: true, added_by: null, added_at: null, note: null, account: o.account })),
    ...(data?.admins ?? []).map((a) => ({ email: a.email, owner: false, added_by: a.added_by, added_at: a.added_at, note: a.note, account: a.account })),
  ];

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return setMsg({ ok: false, text: "That isn't a valid email address." });
    setBusy(true);
    setMsg(null);
    try {
      await client.json("/api/admin/admins", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: clean, note: note.trim() || null }) });
      setMsg({ ok: true, text: `${clean} is now an admin. They sign in with a site account on that email (within a minute on every server).` });
      setEmail("");
      setNote("");
      refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Couldn't add." });
    }
    setBusy(false);
  };
  const remove = async (r: Row) => {
    setMsg(null);
    try {
      await client.json(`/api/admin/admins?email=${encodeURIComponent(r.email)}`, { method: "DELETE" });
      setMsg({ ok: true, text: `${r.email} is no longer an admin.` });
      refresh();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Couldn't remove." });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHead path="sudo ~/admin/admins" title="Admins" sub="Who can open /admin. Added admins can do everything here except manage admins; only the owner adds and removes them." />

      {data && !data.table && (
        <p className="m-0 border border-dashed border-line-strong px-3 py-2 font-mono text-xs text-fg-3">
          The admin_users table isn&apos;t there yet (supabase/migrations/20261101_admin_users.sql): only the owners below are admins until it&apos;s applied.
        </p>
      )}

      {manage ? (
        <Card label="add an admin" title="Give someone admin access">
          <form onSubmit={add} className="flex flex-col gap-3">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_auto] sm:items-end">
              <label className="flex min-w-0 flex-col gap-1">
                <span className={LABEL}>email</span>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="off" aria-invalid={!!email && !valid} className={INPUT} />
              </label>
              <label className="flex min-w-0 flex-col gap-1">
                <span className={LABEL}>note (optional)</span>
                <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="co-instructor, editor…" className={INPUT} />
              </label>
              <button type="submit" disabled={busy || !valid || !data?.table} className="min-h-10 bg-signal px-4 font-mono text-xs font-semibold text-on-signal disabled:opacity-50">
                {busy ? "adding…" : "add admin"}
              </button>
            </div>
            <p className="m-0 text-[13px] text-fg-3">They need a site account on this exact email to sign in (Google or email sign-in, the same address). Removing someone takes effect within a minute.</p>
            {msg && <p className={`m-0 font-mono text-xs ${msg.ok ? "text-ok-text" : "text-bad-text"}`}>{msg.text}</p>}
          </form>
        </Card>
      ) : (
        data && <p className="m-0 font-mono text-xs text-fg-3">Read-only: only the owner can add or remove admins.</p>
      )}

      <Card label="admins" title={`Who has access${data ? ` · ${rows.length}` : ""}`} pad={false}>
        <Table<Row>
          rowKey={(r) => r.email}
          rows={rows}
          loading={loading && !data}
          minWidth={560}
          empty={<EmptyState title="No admins" />}
          columns={[
            {
              key: "email",
              header: "Email",
              render: (r) => (
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="break-all text-fg">{r.email}</span>
                    {r.owner && <Badge tone="signal">owner</Badge>}
                    {r.email === data?.you && <Badge tone="muted">you</Badge>}
                  </span>
                  {!r.account && <NoAccount />}
                  {r.note && <span className="text-[12px] text-fg-3 sm:hidden">{r.note}</span>}
                </span>
              ),
            },
            { key: "by", header: "Added by", hideOnPhone: true, render: (r) => (r.owner ? <span className="text-fg-4">code / env</span> : <span className="break-all text-fg-3">{r.added_by}</span>) },
            { key: "at", header: "When", render: (r) => (r.added_at ? <span className="text-fg-3" title={fmtDate(r.added_at, true)}>{timeAgo(r.added_at)}</span> : <span className="text-fg-4">–</span>) },
            { key: "note", header: "Note", hideOnPhone: true, render: (r) => <span className="text-fg-3">{r.note || "–"}</span> },
            ...(manage
              ? [
                  {
                    key: "x",
                    header: "",
                    align: "right" as const,
                    render: (r: Row) =>
                      r.owner ? null : (
                        <ConfirmButton size="sm" confirmLabel="remove" onConfirm={() => remove(r)} aria-label={`Remove ${r.email}`}>
                          remove
                        </ConfirmButton>
                      ),
                  },
                ]
              : []),
          ]}
        />
      </Card>

      {data?.audit && data.audit.length > 0 && (
        <Card label="history" title="Recent changes" pad={false}>
          <ul className="m-0 list-none divide-y divide-line p-0">
            {data.audit.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-4 py-2.5 text-sm">
                <span className="text-fg-2">{a.actor}</span>
                <span className="font-mono text-xs text-fg-4">{a.action === "admin.add" ? "added" : "removed"}</span>
                <span className="break-all text-fg">{a.target}</span>
                {a.note && <span className="text-fg-3">· {a.note}</span>}
                <span className="ml-auto font-mono text-[11px] text-fg-4" title={fmtDate(a.at, true)}>
                  {timeAgo(a.at)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
