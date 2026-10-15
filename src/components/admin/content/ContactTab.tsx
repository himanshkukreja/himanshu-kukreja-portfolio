"use client";

/** Contact queries: search, status filter, status changes, notes, reply address, delete. All text, never HTML. */
import { useMemo, useState } from "react";
import { Badge, Card, ConfirmButton, Drawer, EmptyState, ErrorState, LABEL, Skeleton, fmtDate, timeAgo, useAdminClient, useAdminData } from "../ui";
import type { ContactQuery } from "../shell/types";
import { Field, SearchInput, Segmented, btnCls, inputCls, primaryBtnCls, type useFlash } from "./common";

type Say = ReturnType<typeof useFlash>["say"];
type Status = "new" | "replied" | "resolved";
const STATUSES: Status[] = ["new", "replied", "resolved"];
const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const tone = (s: string) => (s === "new" ? "solid" : s === "replied" ? "signal" : "neutral") as "solid" | "signal" | "neutral";

export default function ContactTab({ say, openId, onOpen }: { say: Say; openId: string | null; onOpen: (id: string | null) => void }) {
  const client = useAdminClient();
  const res = useAdminData<ContactQuery[]>("/api/admin/contact-queries?limit=500");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | Status>("all");

  const all = useMemo(() => res.data ?? [], [res.data]);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return all.filter((x) => (filter === "all" || x.status === filter) && (!n || [x.name, x.email, x.message].some((v) => v?.toLowerCase().includes(n))));
  }, [all, q, filter]);
  const open = all.find((x) => x.id === openId) || null;

  const patch = async (id: string, body: Partial<ContactQuery>) => {
    try {
      await client.json("/api/admin/contact-queries", jsonInit("PATCH", { id, ...body }));
      res.mutate((d) => d?.map((x) => (x.id === id ? { ...x, ...body } : x)));
      say(body.status ? `Marked ${body.status}` : "Notes saved");
    } catch (e) {
      say(`Update failed: ${(e as Error).message}`, "bad");
    }
  };
  const remove = async (id: string) => {
    try {
      await client.json("/api/admin/contact-queries", jsonInit("DELETE", { id }));
      res.mutate((d) => d?.filter((x) => x.id !== id));
      if (openId === id) onOpen(null);
      say("Query deleted");
    } catch (e) {
      say(`Delete failed: ${(e as Error).message}`, "bad");
    }
  };

  if (res.error && !res.data) return <ErrorState error={res.error} onRetry={res.refresh} title="Couldn't load contact queries" />;
  const count = (s: Status) => all.filter((x) => x.status === s).length;

  return (
    <Card label="contact_queries" title="Contact queries" pad={false}>
      <div className="flex flex-col gap-2 border-b border-line p-4 sm:flex-row sm:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="name, email, message" className="sm:max-w-sm sm:flex-1" label="Search queries" />
        <Segmented
          label="Status filter"
          value={filter}
          onChange={setFilter}
          options={[{ id: "all" as const, label: `all ${all.length}` }, ...STATUSES.map((s) => ({ id: s, label: `${s} ${count(s)}` }))]}
        />
      </div>
      {res.loading && !res.data ? (
        <div className="flex flex-col gap-2 p-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : !shown.length ? (
        <div className="p-4">
          <EmptyState title={all.length ? "Nothing matches" : "No contact queries yet"} />
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((x) => (
            <li key={x.id} className="flex flex-col gap-2 px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="min-w-0 truncate text-sm font-semibold text-fg">{x.name}</span>
                <span className="min-w-0 truncate font-mono text-xs text-fg-3">{x.email}</span>
                <span className="ml-auto flex items-center gap-2">
                  <Badge tone={tone(x.status)}>{x.status}</Badge>
                  <span className="font-mono text-[11px] text-fg-3" title={fmtDate(x.created_at, true)}>
                    {timeAgo(x.created_at)}
                  </span>
                </span>
              </div>
              {/* user-generated: plain text */}
              <p className="line-clamp-3 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-fg-2">{x.message}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={() => onOpen(x.id)} className={btnCls}>
                  open
                </button>
                {x.status !== "replied" && (
                  <button type="button" onClick={() => patch(x.id, { status: "replied" })} className={btnCls}>
                    mark replied
                  </button>
                )}
                {x.status !== "resolved" && (
                  <button type="button" onClick={() => patch(x.id, { status: "resolved" })} className={btnCls}>
                    resolve
                  </button>
                )}
                <ConfirmButton confirmLabel="delete?" onConfirm={() => remove(x.id)} aria-label={`Delete query from ${x.name}`}>
                  delete
                </ConfirmButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Drawer open={!!open} onClose={() => onOpen(null)} label={open ? `query · ${fmtDate(open.created_at, true)}` : ""} title={open?.name}>
        {open && <QueryDetail key={open.id} q={open} onPatch={(b) => patch(open.id, b)} onDelete={() => remove(open.id)} />}
      </Drawer>
    </Card>
  );
}

function QueryDetail({ q, onPatch, onDelete }: { q: ContactQuery; onPatch: (b: Partial<ContactQuery>) => Promise<void>; onDelete: () => Promise<void> }) {
  const [notes, setNotes] = useState(q.admin_notes || "");
  const [saving, setSaving] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className={LABEL}>reply to</div>
        {/* address shown as selectable text; the link is a convenience */}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <code className="select-all break-all border border-line bg-surface-2 px-2 py-1 font-mono text-[13px] text-fg">{q.email}</code>
          <a href={`mailto:${encodeURIComponent(q.email)}?subject=${encodeURIComponent("Re: your message")}`} className={btnCls}>
            reply ↗
          </a>
        </div>
      </div>
      <div>
        <div className={LABEL}>message</div>
        <p className="mt-1 whitespace-pre-wrap break-words border-l-2 border-signal pl-3 text-sm leading-relaxed text-fg">{q.message}</p>
      </div>
      <div>
        <div className={`${LABEL} mb-1.5`}>status</div>
        <div role="radiogroup" aria-label="Status" className="inline-flex border border-line-strong">
          {STATUSES.map((s, i) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={q.status === s}
              onClick={() => onPatch({ status: s })}
              className={`min-h-10 px-3 font-mono text-xs ${i ? "border-l border-line-strong" : ""} ${q.status === s ? "bg-signal font-semibold text-on-signal" : "text-fg-2 hover:bg-surface-2"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <Field label="Private notes">
        <textarea className={`${inputCls} min-h-[96px] py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Only visible here." />
      </Field>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving || notes === (q.admin_notes || "")}
          onClick={async () => {
            setSaving(true);
            await onPatch({ admin_notes: notes });
            setSaving(false);
          }}
          className={primaryBtnCls}
        >
          {saving ? "saving…" : "save notes"}
        </button>
        <ConfirmButton confirmLabel="delete query?" onConfirm={onDelete}>
          delete
        </ConfirmButton>
      </div>
    </div>
  );
}
