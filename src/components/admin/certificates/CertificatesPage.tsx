"use client";

/**
 * /admin/certificates — every certificate issued: stats (course / world issued, verification views
 * over 30 days, LinkedIn adds), search, the table with evidence + status, revoke (with a private
 * reason) / restore, CSV export, and the earning rules.
 *
 * Dev preview (/admin?preview=1): requests carry the preview header and the server answers from
 * its in-memory fixture store (start the dev server with CERT_FIXTURES=1), so revoking here shows
 * on /cert/<code> straight away.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AdminClientContext, Badge, Card, EmptyState, ErrorState, Kpi, LABEL, PageHead, Table, fmtDate, fmtNum, useAdminClient, useAdminData, type AdminClient, type Column } from "@/components/admin/ui";
import type { AdminCertRow, AdminCerts } from "@/lib/certificates/service";

const PREVIEW_HEADER = "x-hk-admin-preview";

function withPreview(init: RequestInit | undefined): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set(PREVIEW_HEADER, "1");
  return { ...init, headers };
}

function PreviewAware({ children }: { children: ReactNode }) {
  const base = useAdminClient();
  const value = useMemo<AdminClient>(
    () => (base.preview ? { ...base, json: <T,>(url: string, init?: RequestInit) => base.json<T>(url, withPreview(init)), text: (url: string, init?: RequestInit) => base.text(url, withPreview(init)) } : base),
    [base]
  );
  return <AdminClientContext.Provider value={value}>{children}</AdminClientContext.Provider>;
}

export default function CertificatesPage() {
  return (
    <PreviewAware>
      <Screen />
    </PreviewAware>
  );
}

const INPUT = "min-h-10 border border-line-strong bg-bg px-3 font-mono text-[13px] text-fg outline-none focus:border-signal";
const BTN = "inline-flex min-h-10 items-center justify-center gap-2 border border-line-strong px-3 font-mono text-[13px] text-fg hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50";

function useDebounced(v: string, ms = 250) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = window.setTimeout(() => setD(v), ms);
    return () => window.clearTimeout(t);
  }, [v, ms]);
  return d;
}

function Screen() {
  const client = useAdminClient();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const { data, error, refresh, mutate } = useAdminData<AdminCerts>(`/api/admin/certificates${dq ? `?q=${encodeURIComponent(dq)}` : ""}`);
  const [exporting, setExporting] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const csv = await client.text("/api/admin/certificates/export");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `certificates-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setNote((e as Error).message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const act = async (row: AdminCertRow, action: "revoke" | "restore", reason = "") => {
    setNote(null);
    try {
      const r = await client.json<{ status: "valid" | "revoked"; revokedAt: string | null }>(`/api/admin/certificates/${row.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      mutate((d) =>
        d
          ? {
              ...d,
              rows: d.rows.map((x) => (x.id === row.id ? { ...x, status: r.status, revokedAt: r.revokedAt, revokeReason: action === "revoke" ? reason : null } : x)),
              stats: {
                ...d.stats,
                course: d.stats.course + (row.kind === "course" ? (action === "revoke" ? -1 : 1) : 0),
                world: d.stats.world + (row.kind === "world" ? (action === "revoke" ? -1 : 1) : 0),
                revoked: d.stats.revoked + (action === "revoke" ? 1 : -1),
              },
            }
          : d
      );
      setNote(`${row.code} ${action === "revoke" ? "revoked" : "restored"}. Its verification page shows it now.`);
    } catch (e) {
      setNote((e as Error).message || "That didn't work");
      throw e;
    }
  };

  const columns: Column<AdminCertRow>[] = [
    {
      key: "name",
      header: "Learner",
      sort: (r) => r.name.toLowerCase(),
      render: (r) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-semibold text-fg">{r.name}</span>
          <span className="font-mono text-[11px] text-fg-3">{r.email || "—"}</span>
        </span>
      ),
    },
    {
      key: "code",
      header: "Certificate",
      sort: (r) => r.label,
      render: (r) => (
        <span className="flex min-w-0 flex-col items-start gap-1">
          <span className="text-fg-2">{r.label}</span>
          <span className="flex flex-wrap items-center gap-1.5">
            <a href={`/cert/${r.code}`} target="_blank" rel="noopener noreferrer" className="font-mono text-[12px] text-fg underline decoration-line-strong underline-offset-4 hover:decoration-signal">
              {r.code}
            </a>
            {!r.isPublic && <Badge tone="muted">page hidden</Badge>}
          </span>
        </span>
      ),
    },
    { key: "issued", header: "Issued", sort: (r) => r.issuedAt, render: (r) => <span className="whitespace-nowrap font-mono text-[12px]">{fmtDate(r.issuedAt)}</span> },
    {
      key: "evidence",
      header: "Evidence",
      render: (r) => (
        <span className="flex flex-col gap-1">
          <span className="font-mono text-[12px] text-fg-2">{r.evidence}</span>
          <span className="flex flex-wrap gap-1">
            {r.flags.length > 0 && (
              <Badge tone="signal" title={r.flags.join("\n")}>
                {r.flags.length} flag{r.flags.length === 1 ? "" : "s"}
              </Badge>
            )}
            {r.linkedinAddedAt && <Badge tone="neutral">linkedin</Badge>}
            {r.views30d > 0 && <Badge tone="muted">{r.views30d} views</Badge>}
          </span>
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sort: (r) => r.status,
      render: (r) => (
        <span className="flex flex-col items-start gap-1">
          <Badge tone={r.status === "valid" ? "ok" : "bad"} title={r.revokeReason ? `Reason (private): ${r.revokeReason}` : undefined}>
            {r.status}
          </Badge>
          {r.signature === "bad" && <Badge tone="bad">signature ✕</Badge>}
          {r.signature === "unchecked" && <Badge tone="muted">sig unchecked</Badge>}
          {r.status === "revoked" && r.revokedAt && <span className="font-mono text-[10px] text-fg-4">{fmtDate(r.revokedAt)}</span>}
        </span>
      ),
    },
    { key: "act", header: <span className="sr-only">Actions</span>, align: "right", render: (r) => <Actions row={r} onAct={act} /> },
  ];

  return (
    <div>
      <PageHead
        path="sudo ~/admin/certificates"
        title="Certificates"
        sub="Every certificate issued, with the evidence checked at issue time. Revoking shows on the public page at once; the reason stays here."
        actions={
          <>
            <label htmlFor="cert-search" className="sr-only">
              Search certificates
            </label>
            <input id="cert-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="search name, email or ID" className={`${INPUT} w-[min(280px,100%)]`} />
            <button type="button" onClick={() => void exportCsv()} disabled={exporting || !data?.available} className={BTN}>
              {exporting ? "exporting…" : "Export CSV"}
            </button>
          </>
        }
      />
      {note && (
        <p role="status" className="mb-4 border border-line-strong bg-surface px-3 py-2 font-mono text-[12px] text-fg-2">
          {note}
        </p>
      )}
      {error ? (
        <ErrorState error={error} onRetry={refresh} title={client.preview ? "Preview needs the dev server started with CERT_FIXTURES=1" : "Certificates unavailable"} />
      ) : data && !data.available ? (
        <EmptyState title="The certificates table isn't there yet" hint="Apply supabase/migrations/20261019_certificates.sql in the Supabase SQL editor. Until then learners see their checklist and “switching on soon”." />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Course certificates" loading={!data} value={fmtNum(data?.stats.course)} hint={data ? `${data.stats.revoked} revoked (all kinds)` : undefined} />
            <Kpi label="World certificates" loading={!data} value={fmtNum(data?.stats.world)} hint="valid" />
            <Kpi label="Verification views" loading={!data} value={fmtNum(data?.stats.views30d)} hint="last 30 days" />
            <Kpi label="Added to LinkedIn" loading={!data} value={fmtNum(data?.stats.linkedin)} hint="pressed Add to profile" />
          </div>
          <Table
            columns={columns}
            rows={data?.rows || []}
            rowKey={(r) => r.id}
            loading={!data}
            minWidth={900}
            initialSort={{ key: "issued", dir: "desc" }}
            empty={dq ? `Nothing matches “${dq}”` : "No certificates issued yet"}
          />
        </>
      )}
      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        <Card label="earning rules · course certificate">
          <p className="m-0 text-[14px] leading-relaxed text-fg-2">
            Every core lesson completed (learning_progress) · every trial part at 80%+ (trial_attempts answers re-scored against the answer key) · every boss beaten (game_done boss:&lt;week&gt;) · one mock interview at Hire or better
            (game_done offer:&lt;id&gt; with a Hire+ scorecard in game_flags).
          </p>
        </Card>
        <Card label="earning rules · world certificate">
          <p className="m-0 text-[14px] leading-relaxed text-fg-2">Every lesson of the world · its trial parts at 80%+ · its boss beaten (World 00 has none). Checked again on the server when the learner claims; the evidence is stored with the certificate.</p>
        </Card>
      </div>
      <p className={`${LABEL} mt-4 normal-case tracking-normal text-fg-4`}>
        Flags (fast trial runs, lessons with no tracked time, answers from the older quiz screen) don&apos;t block a certificate; they&apos;re here to look at. Boss and mock results come from the learner&apos;s synced game state, so a determined
        learner could forge them: revoke if a record looks wrong.
      </p>
    </div>
  );
}

function Actions({ row, onAct }: { row: AdminCertRow; onAct: (r: AdminCertRow, a: "revoke" | "restore", reason?: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (a: "revoke" | "restore") => {
    setBusy(true);
    try {
      await onAct(row, a, reason.trim());
      setOpen(false);
      setReason("");
    } catch {
      /* the note says why */
    } finally {
      setBusy(false);
    }
  };
  if (row.status === "revoked")
    return (
      <button type="button" disabled={busy} onClick={() => void run("restore")} className={BTN} aria-label={`Restore ${row.code}`}>
        {busy ? "…" : "Restore"}
      </button>
    );
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${BTN} hover:border-bad hover:text-bad-text`} aria-label={`Revoke ${row.code}`}>
        Revoke
      </button>
    );
  return (
    <form
      className="flex flex-wrap items-center justify-end gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (reason.trim()) void run("revoke");
      }}
    >
      <label htmlFor={`reason-${row.id}`} className="sr-only">
        Reason for revoking {row.code} (private)
      </label>
      <input id={`reason-${row.id}`} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="reason (private)" className={`${INPUT} w-[180px]`} />
      <button type="submit" disabled={busy || !reason.trim()} className="inline-flex min-h-10 items-center bg-bad px-3 font-mono text-[12px] font-semibold text-white disabled:opacity-50">
        {busy ? "…" : "revoke"}
      </button>
      <button type="button" disabled={busy} onClick={() => setOpen(false)} className={BTN}>
        cancel
      </button>
    </form>
  );
}
