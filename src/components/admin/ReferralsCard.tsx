"use client";

/**
 * Admin overview card: the share-my-progress loop. Public pages, visits through share links,
 * referred sign-ups, how many of them started / finished a first lesson, and the top sharers.
 * Data: GET /api/admin/referrals?range=… (needs the 20261016_share_profiles migration).
 */
import { Card, EmptyState, ErrorState, LABEL, Skeleton, Table, fmtNum, fmtPct, timeAgo, useAdminClient, useAdminData, type Range } from "@/components/admin/ui";
import type { ReferralSummary } from "@/lib/share/referrals";

const PREVIEW: ReferralSummary = {
  available: true,
  range: { from: "", to: "" },
  sharers: 14,
  visits: 212,
  signups: 23,
  started: 17,
  finished: 11,
  conversion: 23 / 212,
  top: [
    { handle: "grace-h", visits: 81, signups: 9, started: 7, finished: 5, shares: 12 },
    { handle: "ada", visits: 54, signups: 6, started: 4, finished: 3, shares: 7 },
    { handle: "linus-t", visits: 33, signups: 4, started: 3, finished: 1, shares: 5 },
    { handle: "margaret", visits: 21, signups: 2, started: 2, finished: 1, shares: 3 },
  ],
  recent: [
    { handle: "grace-h", at: new Date(Date.now() - 40 * 60_000).toISOString(), stage: "signup" },
    { handle: "ada", at: new Date(Date.now() - 2 * 3_600_000).toISOString(), stage: "visit" },
    { handle: "grace-h", at: new Date(Date.now() - 5 * 3_600_000).toISOString(), stage: "finished" },
  ],
};

const STAGE: Record<ReferralSummary["recent"][number]["stage"], string> = { visit: "visit", signup: "sign-up", started: "started", finished: "first lesson ✓" };

type Top = ReferralSummary["top"][number];

export default function ReferralsCard({ range }: { range: Range }) {
  const { preview } = useAdminClient();
  const live = useAdminData<ReferralSummary>(preview ? null : `/api/admin/referrals?range=${range}`);
  const d = preview ? PREVIEW : live.data;
  const funnel = d
    ? [
        { label: "Visits via share links", value: d.visits },
        { label: "Signed up", value: d.signups },
        { label: "Started a lesson", value: d.started },
        { label: "Finished a lesson", value: d.finished },
      ]
    : [];
  const max = Math.max(1, ...funnel.map((f) => f.value));

  return (
    <Card label="growth" title={`Referrals · share my progress · ${range}`} className="mb-6" pad={false}>
      {live.error && !preview ? (
        <div className="p-4">
          <ErrorState error={live.error} onRetry={live.refresh} title="Referrals unavailable" />
        </div>
      ) : !d ? (
        <div className="flex flex-col gap-2 p-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : !d.available ? (
        <div className="p-4">
          <EmptyState title="Sharing isn't switched on yet" hint="Apply supabase/migrations/20261016_share_profiles.sql to turn on public progress pages (/u/<handle>) and referral tracking." />
        </div>
      ) : (
        <div className="grid gap-px bg-line lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div className="flex flex-col gap-4 bg-surface p-4">
            <div className="grid grid-cols-3 gap-px border border-line bg-line">
              {[
                { k: "public pages", v: fmtNum(d.sharers) },
                { k: "referred sign-ups", v: fmtNum(d.signups) },
                { k: "visit → sign-up", v: d.conversion == null ? "—" : fmtPct(d.conversion, 1) },
              ].map((x) => (
                <div key={x.k} className="flex min-w-0 flex-col gap-1 bg-bg px-3 py-3">
                  <span className={LABEL}>{x.k}</span>
                  <span className="font-display text-[24px] font-extrabold leading-none tracking-[-0.03em] text-fg">{x.v}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2" aria-label="Referral funnel">
              {funnel.map((f) => (
                <div key={f.label} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="text-fg-2">{f.label}</span>
                    <span className="font-mono text-fg">{fmtNum(f.value)}</span>
                  </div>
                  <span className="block h-2 bg-surface-2">
                    <span className="block h-2 bg-signal" style={{ width: `${(f.value / max) * 100}%` }} />
                  </span>
                </div>
              ))}
            </div>
            {d.recent.length > 0 && (
              <ul className="m-0 flex list-none flex-col gap-1 border-t border-line p-0 pt-3">
                {d.recent.slice(0, 5).map((r, i) => (
                  <li key={`${r.handle}-${r.at}-${i}`} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="min-w-0 truncate text-fg-2">
                      <span className="font-mono text-fg">@{r.handle}</span> · {STAGE[r.stage]}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-fg-3">{timeAgo(r.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="min-w-0 bg-surface">
            <div className={`${LABEL} px-4 pb-2 pt-4`}>top sharers</div>
            <Table<Top>
              dense
              minWidth={440}
              rows={d.top}
              rowKey={(r) => r.handle}
              initialSort={{ key: "signups", dir: "desc" }}
              empty={<span className="text-sm text-fg-3">No visits through share links yet.</span>}
              columns={[
                {
                  key: "handle",
                  header: "Sharer",
                  render: (r) => (
                    <a href={`/u/${r.handle}`} target="_blank" rel="noopener noreferrer" className="font-mono text-[13px] text-fg underline-offset-4 hover:underline">
                      @{r.handle}
                    </a>
                  ),
                },
                { key: "visits", header: "Visits", align: "right", sort: (r) => r.visits, render: (r) => fmtNum(r.visits) },
                { key: "signups", header: "Sign-ups", align: "right", sort: (r) => r.signups, render: (r) => <span className="font-semibold text-fg">{fmtNum(r.signups)}</span> },
                { key: "finished", header: "1st lesson", align: "right", sort: (r) => r.finished, render: (r) => fmtNum(r.finished), hideOnPhone: true },
                { key: "shares", header: "Shares", align: "right", sort: (r) => r.shares, render: (r) => fmtNum(r.shares), hideOnPhone: true },
              ]}
            />
          </div>
        </div>
      )}
    </Card>
  );
}
