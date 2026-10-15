"use client";

/**
 * Newsletter: subscribers (search, filter, select, unsubscribe/resubscribe, delete, CSV export)
 * and the composer (pick stories, subject + header title, preview, send to selected or all active).
 */
import { useMemo, useState } from "react";
import { Badge, Card, ConfirmButton, Drawer, ErrorState, Kpi, LABEL, Table, fmtDate, fmtNum, timeAgo, useAdminClient, useAdminData, useNow, type Column } from "../ui";
import type { StoryLite, Subscriber } from "../shell/types";
import { Field, SearchInput, Segmented, btnCls, downloadText, inputCls, type useFlash } from "./common";

type Say = ReturnType<typeof useFlash>["say"];
type Filter = "active" | "all" | "unsub";

const DEFAULT_SUBJECT = "🚀 Your Weekly Dose of Engineering Stories is Here!";
const DEFAULT_HEADER = "Latest from Himanshu Kukreja";
const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const checkbox = "h-4 w-4 shrink-0 accent-[var(--c-signal)]";

export default function NewsletterTab({ say }: { say: Say }) {
  const client = useAdminClient();
  const subs = useAdminData<Subscriber[]>("/api/admin/subscribers");
  const storiesRes = useAdminData<{ stories: StoryLite[] }>("/api/stories");

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [storyQ, setStoryQ] = useState("");
  const [slugs, setSlugs] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [headerTitle, setHeaderTitle] = useState(DEFAULT_HEADER);
  const [preview, setPreview] = useState<{ html: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const all = useMemo(() => subs.data ?? [], [subs.data]);
  const stories = useMemo(() => storiesRes.data?.stories ?? [], [storiesRes.data]);

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

  const visibleActive = useMemo(() => shown.filter((s) => !s.unsubscribed).map((s) => s.email), [shown]);
  const allVisiblePicked = visibleActive.length > 0 && visibleActive.every((e) => picked.has(e));
  // Selected recipients, or every active subscriber when nothing is ticked (as before).
  const recipients = useMemo(() => {
    const activeSet = new Set(all.filter((s) => !s.unsubscribed).map((s) => s.email));
    const chosen = [...picked].filter((e) => activeSet.has(e));
    return chosen.length ? chosen : [...activeSet];
  }, [picked, all]);

  const shownStories = useMemo(() => {
    const n = storyQ.trim().toLowerCase();
    if (!n) return stories;
    return stories.filter((s) => [s.title, s.slug, s.excerpt].some((v) => v && v.toLowerCase().includes(n)));
  }, [stories, storyQ]);
  // Selected stories, or the latest five when none are ticked (server default).
  const chosenStories = useMemo(() => (slugs.size ? stories.filter((s) => slugs.has(s.slug)) : stories.slice(0, 5)), [slugs, stories]);

  const toggle = (set: Set<string>, v: string) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };

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
      setPicked((p) => {
        const n = new Set(p);
        n.delete(email);
        return n;
      });
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
  const openPreview = async () => {
    setPreviewing(true);
    try {
      const html = await client.text("/api/admin/preview-email", jsonInit("POST", { slugs: chosenStories.map((s) => s.slug), subject, headerTitle }));
      setPreview({ html });
    } catch (e) {
      say(`Preview failed: ${(e as Error).message}`, "bad");
    } finally {
      setPreviewing(false);
    }
  };
  const send = async () => {
    try {
      const r = await client.json<{ ok?: boolean; sent?: number; total?: number; error?: string }>(
        "/api/newsletter/send-latest",
        jsonInit("POST", { emails: recipients, slugs: chosenStories.map((s) => s.slug), subject: subject || undefined, headerTitle: headerTitle || undefined })
      );
      say(`Sent ${fmtNum(r.sent ?? 0)} of ${fmtNum(r.total ?? recipients.length)} emails`, r.sent === r.total ? "ok" : "bad");
    } catch (e) {
      say(`Send failed: ${(e as Error).message}`, "bad");
    }
  };

  const columns: Column<Subscriber>[] = [
    {
      key: "pick",
      header: (
        <label className="-m-2 flex min-h-10 min-w-10 items-center justify-center" title="Select all visible active">
          <span className="sr-only">Select all visible active subscribers</span>
          <input
            type="checkbox"
            className={checkbox}
            checked={allVisiblePicked}
            onChange={() =>
              setPicked((p) => {
                const n = new Set(p);
                if (allVisiblePicked) visibleActive.forEach((e) => n.delete(e));
                else visibleActive.forEach((e) => n.add(e));
                return n;
              })
            }
          />
        </label>
      ),
      className: "w-10",
      render: (s) => (
        <label className="-m-2 flex min-h-10 min-w-10 items-center justify-center">
          <span className="sr-only">Select {s.email}</span>
          <input type="checkbox" className={checkbox} disabled={!!s.unsubscribed} checked={picked.has(s.email)} onChange={() => setPicked((p) => toggle(p, s.email))} />
        </label>
      ),
    },
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
          {picked.size > 0 && (
            <button type="button" onClick={() => setPicked(new Set())} className="min-h-10 px-2 font-mono text-xs text-fg-3 hover:text-fg sm:ml-auto">
              {picked.size} selected · clear
            </button>
          )}
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

      <Card label="compose" title="Send the newsletter">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className={LABEL}>stories · {slugs.size ? `${slugs.size} picked` : "latest 5 by default"}</span>
              {slugs.size > 0 && (
                <button type="button" onClick={() => setSlugs(new Set())} className="min-h-9 px-1 font-mono text-[11px] text-fg-3 hover:text-fg">
                  clear
                </button>
              )}
            </div>
            <SearchInput value={storyQ} onChange={setStoryQ} placeholder="search stories" label="Search stories" />
            {storiesRes.error ? (
              <ErrorState error={storiesRes.error} onRetry={storiesRes.refresh} />
            ) : (
              <ul className="max-h-[320px] divide-y divide-line overflow-y-auto border border-line">
                {shownStories.map((s) => (
                  <li key={s.slug}>
                    <label className={`flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-surface-2 ${slugs.has(s.slug) ? "bg-signal/10" : ""}`}>
                      <input type="checkbox" className={`${checkbox} mt-0.5`} checked={slugs.has(s.slug)} onChange={() => setSlugs((p) => toggle(p, s.slug))} />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-fg">{s.title}</span>
                        {s.excerpt && <span className="line-clamp-2 block text-xs text-fg-3">{s.excerpt}</span>}
                      </span>
                    </label>
                  </li>
                ))}
                {!shownStories.length && <li className="px-3 py-4 text-sm text-fg-3">{storiesRes.loading ? "loading stories…" : "No stories match."}</li>}
              </ul>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-3">
            <Field label="Subject line">
              <input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} />
            </Field>
            <Field label="Email header title" hint="The small line above the headline.">
              <input className={inputCls} value={headerTitle} onChange={(e) => setHeaderTitle(e.target.value)} placeholder={DEFAULT_HEADER} />
            </Field>
            <div className="border border-line bg-surface-2/50 p-3 text-sm">
              <div className={LABEL}>about to send</div>
              <p className="mt-1 text-fg">
                <b>{chosenStories.length}</b> stor{chosenStories.length === 1 ? "y" : "ies"} → <b>{fmtNum(recipients.length)}</b> subscriber{recipients.length === 1 ? "" : "s"}
                <span className="text-fg-3"> ({picked.size ? "selected" : "all active"})</span>
              </p>
              {chosenStories.length > 0 && <p className="mt-1 line-clamp-2 text-xs text-fg-3">{chosenStories.map((s) => s.title).join(" · ")}</p>}
              {recipients.length > 0 && (
                <p className="mt-1 break-words text-xs text-fg-4">
                  {recipients.slice(0, 6).join(", ")}
                  {recipients.length > 6 ? ` + ${recipients.length - 6} more` : ""}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={openPreview} disabled={previewing || !chosenStories.length} className={btnCls}>
                {previewing ? "rendering…" : "◱ preview email"}
              </button>
              <ConfirmButton
                tone="signal"
                primary
                disabled={!recipients.length || !chosenStories.length}
                confirmLabel={`send to ${fmtNum(recipients.length)}?`}
                onConfirm={send}
                timeoutMs={8000}
                className="[&>button:first-child]:min-w-[120px]"
              >
                ✉ send newsletter
              </ConfirmButton>
            </div>
          </div>
        </div>
      </Card>

      <Drawer open={!!preview} onClose={() => setPreview(null)} label="preview · preview@example.com" title={subject || "(no subject)"} width={720}>
        {preview && (
          // sandbox with no permissions: no scripts, no same-origin, no top navigation
          <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="h-[70dvh] w-full border border-line bg-white sm:h-[calc(100dvh-140px)]" />
        )}
      </Drawer>
    </div>
  );
}
