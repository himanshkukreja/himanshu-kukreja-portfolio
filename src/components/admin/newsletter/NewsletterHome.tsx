"use client";

/**
 * /admin/newsletter — campaign list (status, sent, open + click rates), start a new campaign from a
 * template, and the sender identities ("which account it goes out from").
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { Card, ErrorState, Kpi, LABEL, PageHead, Table, Tabs, fmtNum, timeAgo, useAdminData, useNow, type Column } from "@/components/admin/ui";
import { FlashLine, useFlash } from "@/components/admin/content/common";
import type { CampaignSummary, NewsletterInfo, TemplateInfo } from "@/lib/campaigns/types";
import { CampaignBadge, SetupBanners, cx, fmtCountdown, pct } from "./bits";
import SendersPanel from "./SendersPanel";
import RecipientNames from "./RecipientNames";

type Tab = "campaigns" | "recipients" | "senders";

export default function NewsletterHome() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab: Tab = params.get("tab") === "senders" ? "senders" : params.get("tab") === "recipients" ? "recipients" : "campaigns";
  // refresh so countdowns turn into "sending" / "sent" as the Supabase cron picks campaigns up
  const info = useAdminData<NewsletterInfo>("/api/admin/newsletter", { refreshMs: 15_000 });
  const templates = useAdminData<{ templates: TemplateInfo[] }>("/api/admin/newsletter/templates");
  const { flash, say, clear } = useFlash();
  const now = useNow(1000);
  const d = info.data;
  const campaigns = useMemo(() => d?.campaigns ?? [], [d]);

  const totals = useMemo(() => {
    let sent = 0,
      opened = 0,
      clicked = 0;
    for (const c of campaigns) {
      sent += c.counts.sent;
      opened += c.counts.opened;
      clicked += c.counts.clicked;
    }
    return { sent, opened, clicked, live: campaigns.filter((c) => c.status === "sending").length, scheduled: campaigns.filter((c) => c.status === "scheduled").length };
  }, [campaigns]);

  const cols: Column<CampaignSummary>[] = [
    {
      key: "name",
      header: "campaign",
      sort: (c) => c.name.toLowerCase(),
      render: (c) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-fg">{c.name}</span>
          <span className="truncate text-xs text-fg-3">{c.subject}</span>
        </span>
      ),
      className: "max-w-[360px]",
    },
    {
      key: "status",
      header: "status",
      sort: (c) => c.status,
      render: (c) => (
        <span className="flex flex-col items-start gap-0.5">
          <CampaignBadge status={c.status} />
          {c.status === "scheduled" && <span className="whitespace-nowrap font-mono text-[11px] text-signal-text">{fmtCountdown(c.scheduledAt, now)}</span>}
        </span>
      ),
    },
    { key: "sent", header: "sent", align: "right", sort: (c) => c.counts.sent, render: (c) => <span className="font-mono">{c.counts.total ? `${fmtNum(c.counts.sent)}/${fmtNum(c.counts.total)}` : "—"}</span> },
    { key: "open", header: "opened", align: "right", sort: (c) => (c.counts.sent ? c.counts.opened / c.counts.sent : -1), render: (c) => <span className="font-mono">{pct(c.counts.opened, c.counts.sent)}</span> },
    { key: "click", header: "clicked", align: "right", hideOnPhone: true, sort: (c) => (c.counts.sent ? c.counts.clicked / c.counts.sent : -1), render: (c) => <span className="font-mono">{pct(c.counts.clicked, c.counts.sent)}</span> },
    { key: "at", header: "updated", align: "right", hideOnPhone: true, sort: (c) => c.updatedAt, render: (c) => <span className="font-mono text-xs text-fg-3">{timeAgo(c.updatedAt, now)}</span> },
  ];

  return (
    <div>
      <PageHead
        path="sudo ~/admin/newsletter"
        title="Newsletter"
        sub="Compose with merge tags, preview as a real learner, test, then send in throttled batches and watch opens and clicks come in."
        actions={
          <Link href="#new" className="inline-flex min-h-10 items-center gap-2 bg-signal px-4 font-mono text-xs font-semibold text-on-signal hover:brightness-110">
            + new campaign
          </Link>
        }
      />
      <SetupBanners setup={d?.setup} />
      <Tabs
        label="Newsletter sections"
        tabs={[
          { id: "campaigns" as Tab, label: "campaigns", count: d ? campaigns.length : null },
          { id: "recipients" as Tab, label: "recipients · names" },
          { id: "senders" as Tab, label: "senders", count: d ? d.senders.length : null },
        ]}
        value={tab}
        onChange={(id) => router.replace(id === "campaigns" ? pathname : `${pathname}?tab=${id}`, { scroll: false })}
        className="mb-5"
      />

      {info.error && !d && <ErrorState error={info.error} onRetry={info.refresh} title="Couldn't load campaigns" />}

      {tab === "campaigns" && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Emails sent" value={fmtNum(totals.sent)} loading={!d} hint="all campaigns" />
            <Kpi label="Opened · unique" value={pct(totals.opened, totals.sent)} loading={!d} hint={d ? `${fmtNum(totals.opened)} people` : undefined} />
            <Kpi label="Clicked · unique" value={pct(totals.clicked, totals.sent)} loading={!d} hint={d ? `${fmtNum(totals.clicked)} people` : undefined} />
            <Kpi label="Sending · scheduled" value={`${fmtNum(totals.live)} · ${fmtNum(totals.scheduled)}`} loading={!d} hint="campaigns in progress / queued for later" />
          </div>

          <Card label="campaigns" title="All campaigns" pad={false}>
            <Table
              columns={cols}
              rows={campaigns}
              rowKey={(c) => c.id}
              loading={!d && !info.error}
              onRowClick={(c) => router.push(`/admin/newsletter/${c.id}`)}
              minWidth={520}
              className="border-0"
              initialSort={{ key: "at", dir: "desc" }}
              empty={d?.setup.tablesReady === false ? "Campaigns appear here once the migration is applied." : "No campaigns yet. Start one from a template below."}
            />
          </Card>

          <section id="new" className="scroll-mt-28">
            <div className={`${LABEL} mb-2`}>new campaign · pick a starting point</div>
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
              {(templates.data?.templates ?? []).map((t, i) => (
                <Link
                  key={t.id}
                  href={`/admin/newsletter/new?template=${t.id}`}
                  className={cx("group flex min-h-[148px] flex-col gap-2 border bg-surface p-4 hover:border-signal", i === 0 ? "border-line-strong" : "border-line")}
                >
                  <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">
                    0{i + 1} · {t.doc.layout === "raw" ? "full template" : "blocks"}
                  </span>
                  <span className="font-display text-xl font-extrabold leading-tight tracking-tight text-fg">{t.name}</span>
                  <span className="text-sm text-fg-3">{t.description}</span>
                  <span className="mt-auto font-mono text-xs text-fg-2 group-hover:text-signal-text">compose →</span>
                </Link>
              ))}
              {!templates.data && !templates.error && [0, 1, 2].map((i) => <div key={i} className="h-[148px] border border-line bg-surface" />)}
              {templates.error && <ErrorState error={templates.error} onRetry={templates.refresh} title="Couldn't load templates" />}
            </div>
          </section>
        </div>
      )}

      {tab === "recipients" && (
        <RecipientNames
          scope={{ spec: null }}
          label="everyone · accounts + subscribers"
          title="Recipient names"
          intro={
            <p className="m-0 text-sm text-fg-3">
              Newsletter subscribers and email-code sign-ins often have no name. Add one here (or in a campaign&apos;s audience step) and every future email uses it for{" "}
              <code className="font-mono text-xs">{"{{first_name}}"}</code>.
            </p>
          }
        />
      )}
      {tab === "senders" && d && <SendersPanel info={d} onChanged={info.refresh} say={say} />}
      <FlashLine flash={flash} onDismiss={clear} />
    </div>
  );
}
