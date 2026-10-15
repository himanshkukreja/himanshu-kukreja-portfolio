"use client";

/**
 * /admin/newsletter/new?template=… and /admin/newsletter/[id].
 * Drafts: compose · audience · preview & test · send. Sent / sending: report · send · content.
 * Edits live in local state until "save draft"; the live preview renders with the same code the
 * server sends with.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Card, ConfirmButton, ErrorState, PageHead, Skeleton, Tabs, fmtDate, useAdminClient, useAdminData } from "@/components/admin/ui";
import { Field, FlashLine, btnCls, inputCls, primaryBtnCls, useFlash } from "@/components/admin/content/common";
import { contentProblems } from "@/lib/campaigns/validate";
import type { Campaign, CampaignSummary, EventRow, NewsletterInfo, RecipientPreview, TemplateInfo } from "@/lib/campaigns/types";
import AudiencePicker from "./AudiencePicker";
import Composer from "./Composer";
import EmailPreview, { RecipientPicker } from "./EmailPreview";
import Report from "./Report";
import SendPanel from "./SendPanel";
import { CampaignBadge, Note, SetupBanners, jsonInit } from "./bits";
import { draftFromCampaign, draftFromTemplate, type Draft } from "./types";

type DraftTab = "compose" | "audience" | "preview" | "send";
type SentTab = "report" | "send" | "content";
type Full = { campaign: CampaignSummary & { doc: Campaign["doc"] }; events: EventRow[] };

export default function CampaignPage({ id }: { id: string }) {
  const isNew = id === "new";
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const client = useAdminClient();
  const { flash, say, clear } = useFlash();

  const info = useAdminData<NewsletterInfo>("/api/admin/newsletter");
  const templates = useAdminData<{ templates: TemplateInfo[] }>("/api/admin/newsletter/templates");
  const full = useAdminData<Full>(isNew ? null : `/api/admin/newsletter/campaigns/${id}`, { refreshMs: 15_000 });

  const campaign = full.data?.campaign ?? null;
  const templateId = isNew ? params.get("template") || "blank" : campaign?.template;
  const template = templates.data?.templates.find((t) => t.id === templateId) ?? null;
  const defaultSender = info.data?.senders.find((s) => s.isDefault)?.id ?? info.data?.senders[0]?.id ?? null;

  const base = useMemo<Draft | null>(() => {
    if (isNew) return template ? draftFromTemplate(template, defaultSender) : null;
    return campaign ? draftFromCampaign(campaign as unknown as Campaign) : null;
  }, [isNew, template, defaultSender, campaign]);

  const [edits, setEdits] = useState<Draft | null>(null);
  const draft = edits ?? base;
  const dirty = isNew || edits !== null;
  const [as, setAs] = useState<RecipientPreview | null>(null);
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [lastTest, setLastTest] = useState<string | null>(null);

  const status = campaign?.status ?? "draft";
  const editable = status === "draft";
  const problems = useMemo(() => (draft ? contentProblems(draft) : []), [draft]);

  const tabParam = params.get("tab");
  const draftTabs: { id: DraftTab; label: string }[] = [
    { id: "compose", label: "1 · compose" },
    { id: "audience", label: "2 · audience" },
    { id: "preview", label: "3 · preview & test" },
    { id: "send", label: "4 · send" },
  ];
  const sentTabs: { id: SentTab; label: string }[] = [
    { id: "report", label: "report" },
    { id: "send", label: "send" },
    { id: "content", label: "content" },
  ];
  const tab = editable ? ((draftTabs.find((t) => t.id === tabParam)?.id ?? "compose") as DraftTab) : ((sentTabs.find((t) => t.id === tabParam)?.id ?? "report") as SentTab);
  const setTab = (t: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("tab", t);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const save = async (): Promise<string | null> => {
    if (!draft) return null;
    setSaving(true);
    try {
      if (isNew) {
        const r = await client.json<{ campaign: { id: string } }>("/api/admin/newsletter/campaigns", jsonInit("POST", draft));
        say("Draft saved");
        router.replace(`/admin/newsletter/${r.campaign.id}?tab=${tab}`);
        return r.campaign.id;
      }
      const r = await client.json<{ campaign: Full["campaign"] }>(`/api/admin/newsletter/campaigns/${id}`, jsonInit("PATCH", draft));
      full.mutate((d) => (d ? { ...d, campaign: r.campaign } : d));
      setEdits(null);
      say("Draft saved");
      return id;
    } catch (e) {
      say((e as Error).message, "bad");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async () => {
    if (!draft) return;
    try {
      const r = await client.json<{ campaign: { id: string } }>("/api/admin/newsletter/campaigns", jsonInit("POST", { ...draft, name: `${draft.name} (copy)` }));
      router.push(`/admin/newsletter/${r.campaign.id}`);
    } catch (e) {
      say((e as Error).message, "bad");
    }
  };

  const remove = async () => {
    try {
      await client.json(`/api/admin/newsletter/campaigns/${id}`, { method: "DELETE" });
      router.push("/admin/newsletter");
    } catch (e) {
      say((e as Error).message, "bad");
    }
  };

  const sendTest = async () => {
    if (!draft) return;
    setTesting(true);
    try {
      const r = await client.json<{ mode: string; to: string; as: string; subject: string }>("/api/admin/newsletter/test", jsonInit("POST", { ...draft, to: testTo.trim() || undefined, asEmail: as?.email }));
      const msg = r.mode === "console" ? `Test rendered to the server console (not emailed) · to ${r.to} as ${r.as}` : `Test sent to ${r.to} (as ${r.as})`;
      setLastTest(`${msg} · “${r.subject}”`);
      say(msg);
    } catch (e) {
      say(`Test failed: ${(e as Error).message}`, "bad");
    } finally {
      setTesting(false);
    }
  };

  const loadError = full.error || (isNew && templates.error);
  if (loadError && !draft) return <ErrorState error={loadError} onRetry={() => (isNew ? templates.refresh() : full.refresh())} title={full.error?.status === 404 ? "Campaign not found" : "Couldn't load this campaign"} />;
  if (!draft || !info.data)
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );

  const set = (d: Draft) => setEdits(d);
  const trackingBase = info.data.setup.trackingBase;
  const tablesReady = info.data.setup.tablesReady;

  return (
    <div>
      <PageHead
        path={`sudo ~/admin/newsletter/${isNew ? "new" : id.slice(0, 8)}`}
        title={draft.name || "Untitled campaign"}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            <CampaignBadge status={status} />
            {campaign && <span className="font-mono text-xs">created {fmtDate(campaign.createdAt, true)}{campaign.createdBy ? ` · ${campaign.createdBy}` : ""}</span>}
            {isNew && <span className="font-mono text-xs">from template · {template?.name}</span>}
          </span>
        }
        actions={
          <>
            <Link href="/admin/newsletter" className={btnCls}>
              ← campaigns
            </Link>
            {!editable && (
              <button type="button" className={btnCls} onClick={duplicate}>
                ⧉ duplicate
              </button>
            )}
            {!isNew && (status === "draft" || status === "cancelled") && (
              <ConfirmButton onConfirm={remove} confirmLabel="delete campaign?">
                delete
              </ConfirmButton>
            )}
            {editable && (
              <button type="button" className={primaryBtnCls} disabled={!dirty || saving || !tablesReady} onClick={() => void save()} title={tablesReady ? undefined : "Apply the migration first"}>
                {saving ? "saving…" : dirty ? "save draft" : "saved"}
              </button>
            )}
          </>
        }
      />
      <SetupBanners setup={info.data.setup} />

      <Tabs label="Campaign steps" tabs={editable ? draftTabs : sentTabs} value={tab} onChange={setTab} className="mb-5" />

      {tab === "compose" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,720px)]">
          <Composer draft={draft} onChange={set} senders={info.data.senders} problems={problems} template={template} />
          <div className="hidden xl:block">
            <div className="sticky top-[calc(var(--hk-header-h,57px)+24px)]">
              <EmailPreview draft={draft} base={trackingBase} as={as} compact />
            </div>
          </div>
        </div>
      )}

      {tab === "audience" && <AudiencePicker spec={draft.audience} onChange={(audience) => set({ ...draft, audience })} campaignId={campaign?.id} />}

      {tab === "preview" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <EmailPreview draft={draft} base={trackingBase} as={as} setAs={setAs} />
          <div className="flex flex-col gap-4">
            <Card label="test send" title="Send a [test] copy">
              <div className="flex flex-col gap-3">
                <p className="m-0 text-sm text-fg-3">
                  Goes to you ({info.data.setup.admin}) or the address below, with the subject prefixed “[test]”, merge tags filled {as ? `with ${as.name || as.email}'s data` : "with your own data"}. Nothing is logged; tracking links use the ignored “test” token.
                </p>
                <Field label="To (optional)">
                  <input className={inputCls} type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder={info.data.setup.admin} autoComplete="off" />
                </Field>
                <button type="button" className={primaryBtnCls} disabled={testing || problems.length > 0} onClick={sendTest}>
                  {testing ? "sending…" : `✉ send test${info.data.setup.transportMode === "console" ? " (console)" : ""}`}
                </button>
                {problems.length > 0 && <p className="m-0 text-xs text-bad-text">Fix {problems.length} problem(s) in compose first.</p>}
                {lastTest && <p className="m-0 break-words font-mono text-[11px] text-fg-3">{lastTest}</p>}
              </div>
            </Card>
            <Note title="checklist">
              <ul className="m-0 list-none p-0 text-sm">
                <li>{problems.length ? "✗" : "✓"} merge tags valid</li>
                <li>{draft.subjectFallback ? "✓" : "·"} subject fallback for people without a name</li>
                <li>{info.data.senders.find((s) => s.id === draft.senderId)?.check.level === "ok" ? "✓" : "!"} sender identity verified</li>
                <li>✓ unsubscribe link + List-Unsubscribe header</li>
              </ul>
            </Note>
          </div>
        </div>
      )}

      {tab === "send" && (
        <SendPanel
          campaign={isNew ? null : campaign}
          info={info.data}
          dirty={!isNew && dirty}
          problems={problems}
          onSave={save}
          onChanged={() => {
            full.refresh();
            info.refresh();
          }}
          say={say}
        />
      )}

      {tab === "report" && campaign && <Report campaign={campaign} events={full.data?.events ?? []} />}

      {tab === "content" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,720px)]">
          <div className="flex flex-col gap-4">
            <Card label="content" title="What was sent">
              <p className="m-0 text-sm text-fg-3">Sent campaigns are read-only. Duplicate it to send a changed version to a new audience.</p>
            </Card>
            <Card label="preview as" title="Pick a recipient">
              <RecipientPicker as={as} setAs={setAs} />
            </Card>
          </div>
          <EmailPreview draft={draft} base={trackingBase} as={as} compact />
        </div>
      )}

      <FlashLine flash={flash} onDismiss={clear} />
    </div>
  );
}
