"use client";

/**
 * Senders: which account a campaign goes out from. Transports come from env (SMTP_*, SMTP2_*); env
 * senders (SMTP_FROM, SMTP2_FROM) are read-only, extra identities live in email_senders.
 */
import { useState } from "react";
import { Badge, Card, ConfirmButton, Drawer, LABEL, Table, type Column } from "@/components/admin/ui";
import { Field, btnCls, inputCls, primaryBtnCls, type useFlash } from "@/components/admin/content/common";
import { useAdminClient } from "@/components/admin/ui";
import type { NewsletterInfo, Sender, TransportId } from "@/lib/campaigns/types";
import { CheckBadge, Note, Toggle, jsonInit } from "./bits";

type Say = ReturnType<typeof useFlash>["say"];
type Form = { id?: string; label: string; fromName: string; fromEmail: string; replyTo: string; transport: TransportId; isDefault: boolean };
const EMPTY: Form = { label: "", fromName: "Himanshu Kukreja", fromEmail: "", replyTo: "", transport: "smtp", isDefault: false };
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export default function SendersPanel({ info, onChanged, say }: { info: NewsletterInfo; onChanged: () => void; say: Say }) {
  const client = useAdminClient();
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const canStore = info.setup.tablesReady;

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const body = { ...form, replyTo: form.replyTo || null };
      await client.json(form.id ? `/api/admin/newsletter/senders/${form.id}` : "/api/admin/newsletter/senders", jsonInit(form.id ? "PATCH" : "POST", body));
      say(form.id ? "Sender updated" : "Sender added");
      setForm(null);
      onChanged();
    } catch (e) {
      say((e as Error).message, "bad");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s: Sender) => {
    try {
      await client.json(`/api/admin/newsletter/senders/${s.id}`, { method: "DELETE" });
      say("Sender removed");
      onChanged();
    } catch (e) {
      say((e as Error).message, "bad");
    }
  };

  const transport = (id: TransportId) => info.transports.find((t) => t.id === id);
  const cols: Column<Sender>[] = [
    {
      key: "from",
      header: "from",
      render: (s) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-fg">
            {s.fromName || "—"} <span className="font-normal text-fg-3">&lt;{s.fromEmail}&gt;</span>
          </span>
          <span className="truncate font-mono text-[11px] text-fg-4">
            {s.label}
            {s.replyTo ? ` · reply-to ${s.replyTo}` : ""}
          </span>
        </span>
      ),
    },
    { key: "transport", header: "via", render: (s) => <span className="font-mono text-xs">{s.transport}{transport(s.transport) ? ` · ${transport(s.transport)!.provider}` : ""}</span>, hideOnPhone: true },
    {
      key: "check",
      header: "identity",
      render: (s) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <CheckBadge check={s.check} />
          {s.isDefault && <Badge tone="neutral">default</Badge>}
          {s.source === "env" && <Badge tone="muted">env</Badge>}
        </span>
      ),
    },
    {
      key: "act",
      header: "",
      align: "right",
      render: (s) =>
        s.source === "db" ? (
          <span className="inline-flex gap-1.5" onClick={(e) => e.stopPropagation()}>
            <button type="button" className={btnCls} onClick={() => setForm({ id: s.id, label: s.label, fromName: s.fromName, fromEmail: s.fromEmail, replyTo: s.replyTo || "", transport: s.transport, isDefault: s.isDefault })}>
              edit
            </button>
            <ConfirmButton size="md" onConfirm={() => remove(s)} confirmLabel="delete?">
              ×
            </ConfirmButton>
          </span>
        ) : (
          <span className="font-mono text-[11px] text-fg-4">set in env</span>
        ),
    },
  ];

  const formOk = !!form && EMAIL_RE.test(form.fromEmail.trim()) && (!form.replyTo.trim() || EMAIL_RE.test(form.replyTo.trim()));
  const formDomain = form?.fromEmail.split("@")[1]?.toLowerCase() || "";
  const formTransport = form ? transport(form.transport) : undefined;
  const domainKnown = !!formTransport && formTransport.verifiedDomains.includes(formDomain);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        {info.transports.map((t) => (
          <Card key={t.id} label={`transport · ${t.id}`} title={t.label} action={t.configured ? <Badge tone="ok">configured</Badge> : <Badge tone="muted">not set</Badge>}>
            <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
              <dt className={LABEL}>provider</dt>
              <dd className="m-0 break-words text-fg-2">{t.configured ? t.provider : "—"}</dd>
              <dt className={LABEL}>host</dt>
              <dd className="m-0 break-all font-mono text-xs text-fg-2">{t.host || "—"}</dd>
              <dt className={LABEL}>domains</dt>
              <dd className="m-0 text-fg-2">
                {t.verifiedDomains.length ? t.verifiedDomains.join(", ") : "—"}{" "}
                {t.verifiedSource === "assumed" && <span className="font-mono text-[11px] text-fg-4">(from SMTP_FROM, assumed)</span>}
                {t.verifiedSource === "env" && <span className="font-mono text-[11px] text-fg-4">(VERIFIED_DOMAINS)</span>}
              </dd>
            </dl>
            <p className="m-0 mt-3 text-xs text-fg-3">{t.configured ? t.note : `Add ${t.id === "smtp" ? "SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM" : "SMTP2_HOST, SMTP2_PORT, SMTP2_USER, SMTP2_PASS, SMTP2_FROM"} to the deployment env to use it.`}</p>
          </Card>
        ))}
      </div>

      <Note tone="warn" title="providers only deliver from verified identities">
        Brevo, SES and most SMTP relays reject or rewrite mail whose From domain isn&apos;t verified with them (SPF + DKIM). Verify the domain or address in the provider first, then list it in{" "}
        <code className="font-mono text-xs">SMTP_VERIFIED_DOMAINS</code> (comma-separated) so the checks below turn green. Replies go to the reply-to address.
      </Note>

      <Card
        label="senders"
        title="From addresses"
        pad={false}
        action={
          <button type="button" disabled={!canStore} onClick={() => setForm({ ...EMPTY })} className={primaryBtnCls} title={canStore ? undefined : "Apply the migration first"}>
            + add sender
          </button>
        }
      >
        <Table columns={cols} rows={info.senders} rowKey={(s) => s.id} minWidth={560} className="border-0" />
        {info.senders.map((s) =>
          s.check.level !== "ok" ? (
            <p key={s.id} className="m-0 border-t border-line px-4 py-2 text-xs text-fg-3">
              <span className="font-mono text-fg-2">{s.fromEmail}</span> · {s.check.message}
            </p>
          ) : null
        )}
      </Card>

      <Drawer
        open={!!form}
        onClose={() => setForm(null)}
        label={form?.id ? "edit sender" : "new sender"}
        title={form?.id ? form.fromEmail : "Add a from address"}
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" className={btnCls} onClick={() => setForm(null)}>
              cancel
            </button>
            <button type="button" className={primaryBtnCls} disabled={!formOk || saving} onClick={save}>
              {saving ? "saving…" : "save sender"}
            </button>
          </div>
        }
      >
        {form && (
          <div className="flex flex-col gap-4">
            <Field label="From name">
              <input className={inputCls} value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} maxLength={80} placeholder="Himanshu Kukreja" />
            </Field>
            <Field label="From address" hint={form.fromEmail && !EMAIL_RE.test(form.fromEmail.trim()) ? "Not a valid address yet." : undefined}>
              <input className={inputCls} type="email" value={form.fromEmail} onChange={(e) => setForm({ ...form, fromEmail: e.target.value })} placeholder="himanshu@himanshukukreja.in" autoComplete="off" />
            </Field>
            <Field label="Reply-to (optional)">
              <input className={inputCls} type="email" value={form.replyTo} onChange={(e) => setForm({ ...form, replyTo: e.target.value })} placeholder="kukreja.him@gmail.com" autoComplete="off" />
            </Field>
            <Field label="Label (optional)">
              <input className={inputCls} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Course updates" maxLength={60} />
            </Field>
            <Field label="Transport">
              <select className={inputCls} value={form.transport} onChange={(e) => setForm({ ...form, transport: e.target.value as TransportId })}>
                {info.transports.map((t) => (
                  <option key={t.id} value={t.id} disabled={!t.configured}>
                    {t.id} · {t.configured ? t.provider : "not configured"}
                  </option>
                ))}
              </select>
            </Field>
            <Toggle on={form.isDefault} onChange={(v) => setForm({ ...form, isDefault: v })} label="Default sender" hint="preselected for new campaigns" />
            {formDomain && formTransport && (
              <Note tone={domainKnown ? "neutral" : "warn"} title={domainKnown ? "domain matches" : "domain not known to be verified"}>
                {domainKnown ? `${formDomain} is a domain ${formTransport.provider} already sends from.` : `${formDomain} isn't in this transport's verified domains (${formTransport.verifiedDomains.join(", ") || "none"}). ${formTransport.note}`}
              </Note>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
