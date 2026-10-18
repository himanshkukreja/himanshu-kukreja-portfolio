"use client";

/** /admin/design-week: every challenge, participation, open reports, and "new from template". */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, EmptyState, ErrorState, Kpi, LABEL, PageHead, Table, fmtNum, timeAgo, useAdminClient, useAdminData, type Column } from "@/components/admin/ui";
import type { AdminChallengeRow, AdminList, AdminReport } from "@/lib/design-week/views";
import { BTN_PRIMARY, DesignWeekClient, fmtIst, INPUT, jsonInit, PhasePill, SubStatus } from "./shared";

export default function DesignWeekList() {
  return (
    <DesignWeekClient>
      <ListInner />
    </DesignWeekClient>
  );
}

function ListInner() {
  const { data, error, loading, refresh } = useAdminData<AdminList>("/api/admin/design-week");
  const t = data?.totals;
  const cols: Column<AdminChallengeRow>[] = [
    {
      key: "title",
      header: "Challenge",
      render: (c) => (
        <Link href={`/admin/design-week/${c.id}`} className="flex min-h-11 flex-col justify-center hover:text-signal-text">
          <span className="font-semibold text-fg">{c.title}</span>
          <span className="font-mono text-[11px] text-fg-3">/{c.slug}</span>
        </Link>
      ),
      sort: (c) => c.title,
    },
    { key: "phase", header: "Phase", render: (c) => <PhasePill phase={c.phase} />, sort: (c) => c.phase },
    { key: "window", header: "Opens", render: (c) => <span className="font-mono text-xs text-fg-2">{fmtIst(c.startsAt)}</span>, sort: (c) => c.startsAt, hideOnPhone: true },
    { key: "subs", header: "Designs", align: "right", render: (c) => <span className="font-mono">{c.stats.submitted}</span>, sort: (c) => c.stats.submitted },
    { key: "people", header: "People", align: "right", render: (c) => <span className="font-mono">{c.stats.participants}</span>, sort: (c) => c.stats.participants, hideOnPhone: true },
    { key: "votes", header: "Votes", align: "right", render: (c) => <span className="font-mono">{c.stats.votes}</span>, sort: (c) => c.stats.votes },
    { key: "reports", header: "Reports", align: "right", render: (c) => <span className={`font-mono ${c.stats.openReports ? "text-signal-text" : "text-fg-3"}`}>{c.stats.openReports}</span>, sort: (c) => c.stats.openReports },
  ];

  return (
    <div>
      <PageHead path="sudo ~/admin/design-week" title="Design of the week" sub="Schedule the weekly challenge, moderate designs, confirm winners." />
      {error ? (
        <ErrorState error={error} onRetry={refresh} title="Design of the week unavailable" />
      ) : (
        <>
          {data && !data.ready && (
            <div className="mb-5 border border-dashed border-signal bg-signal/10 px-4 py-3 text-sm text-fg">
              <b>Tables missing:</b> {data.missing.join(", ")}. Apply <code className="font-mono">supabase/migrations/20261018_design_of_week.sql</code> in the Supabase SQL editor. Learners see &ldquo;coming soon&rdquo; until then.
            </div>
          )}
          {data?.store === "fixtures" && <div className="mb-5 font-mono text-xs text-fg-3">store: in-memory dev fixtures (DOW_FIXTURES=1). Nothing touches the database.</div>}
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi label="Live challenges" loading={loading && !t} value={fmtNum(t?.live)} hint={t ? `${fmtNum(t.challenges)} total` : undefined} />
            <Kpi label="Participants" loading={loading && !t} value={fmtNum(t?.participants)} hint={t ? `${fmtNum(t.submissions)} designs` : undefined} />
            <Kpi label="Came back" loading={loading && !t} value={fmtNum(t?.repeat)} hint={t && t.participants ? `${Math.round((t.repeat / t.participants) * 100)}% did 2+ weeks` : "2+ weeks"} />
            <Kpi label="Votes" loading={loading && !t} value={fmtNum(t?.votes)} hint={t ? `${fmtNum(t.voters)} voters` : undefined} />
            <Kpi label="Open reports" loading={loading && !t} value={fmtNum(t?.openReports)} />
          </div>
          <div className="mb-6 grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Card label="challenges" title="Schedule" pad={false}>
              <Table columns={cols} rows={data?.challenges ?? []} rowKey={(c) => c.id} loading={loading && !data} minWidth={620} empty={<EmptyState title="No challenges yet" hint="Create the first one from a template." />} />
            </Card>
            {data && <NewChallenge data={data} />}
          </div>
          <Card label="moderation" title="Open reports" pad={false}>
            <Reports reports={data?.openReports ?? []} loading={loading && !data} />
          </Card>
        </>
      )}
    </div>
  );
}

function NewChallenge({ data }: { data: AdminList }) {
  const client = useAdminClient();
  const router = useRouter();
  const [tpl, setTpl] = useState(data.templates[0]?.slug || "");
  const [monday, setMonday] = useState(data.nextMonday);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pick = data.templates.find((t) => t.slug === tpl);
  const create = async (blank: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      const body = blank ? { monday, title: "Untitled challenge", slug: `challenge-${monday.replace(/-/g, "")}` } : { template: tpl, monday };
      const r = await client.json<{ challenge: { id: string } }>("/api/admin/design-week", jsonInit("POST", body));
      router.push(`/admin/design-week/${r.challenge.id}${client.preview ? "?preview=1" : ""}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Card label="new" title="New challenge">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className={LABEL}>template</span>
          <select value={tpl} onChange={(e) => setTpl(e.target.value)} className={INPUT}>
            {data.templates.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
        {pick && <p className="m-0 text-[13px] leading-snug text-fg-3">{pick.summary}</p>}
        <label className="flex flex-col gap-1">
          <span className={LABEL}>week starting (Monday)</span>
          <input type="date" value={monday} onChange={(e) => setMonday(e.target.value)} className={INPUT} />
          <span className="text-[12px] text-fg-3">Opens Mon 09:00 IST · submissions until Sat 09:00 · voting until next Mon 09:00. Editable after.</span>
        </label>
        {err && <p className="m-0 text-sm text-bad-text">{err}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy || !tpl || !data.ready} onClick={() => create(false)} className={BTN_PRIMARY}>
            create draft
          </button>
          <button type="button" disabled={busy || !data.ready} onClick={() => create(true)} className="inline-flex min-h-10 items-center px-2 font-mono text-[13px] text-fg-3 hover:text-fg">
            blank
          </button>
        </div>
      </div>
    </Card>
  );
}

export function Reports({ reports, loading, onChange }: { reports: AdminReport[]; loading?: boolean; onChange?: () => void }) {
  const client = useAdminClient();
  const [busy, setBusy] = useState<string | null>(null);
  if (loading) return <div className="p-4 text-sm text-fg-3">Loading…</div>;
  if (!reports.length)
    return (
      <div className="p-4">
        <EmptyState title="No open reports" />
      </div>
    );
  return (
    <ul className="divide-y divide-line">
      {reports.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-fg">{r.submissionTitle}</span>
            <span className="block truncate text-xs text-fg-3">
              {r.challengeTitle} · <b className="text-fg-2">{r.reason}</b>
              {r.note && <> · {r.note}</>}
            </span>
          </span>
          {r.submissionStatus && <SubStatus status={r.submissionStatus} />}
          <span className="font-mono text-[11px] text-fg-3">{timeAgo(r.createdAt)}</span>
          {r.status === "open" && onChange && (
            <button
              type="button"
              disabled={busy === r.id}
              onClick={async () => {
                setBusy(r.id);
                try {
                  await client.json(`/api/admin/design-week/reports/${r.id}`, jsonInit("POST", { action: "dismiss" }));
                  onChange();
                } finally {
                  setBusy(null);
                }
              }}
              className="min-h-9 border border-line-strong px-2 font-mono text-[12px] text-fg-2 hover:bg-surface-2"
            >
              dismiss
            </button>
          )}
          {r.status !== "open" && <span className="font-mono text-[11px] text-fg-4">{r.status}</span>}
          <Link href={`/admin/design-week/${r.challengeId}${client.preview ? "?preview=1" : ""}`} className="font-mono text-[12px] text-fg-3 hover:text-fg">
            review →
          </Link>
        </li>
      ))}
    </ul>
  );
}
