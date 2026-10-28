"use client";

/**
 * /admin/publishing: what's shown on the site. Every released short and side quest with its state (live,
 * hidden, scheduled), its numbers for the range, and the controls: publish, unpublish, schedule a go-live
 * time, pin shorts to the front of the feed. Select rows for bulk changes. Changes reach the site within a
 * minute (the API refreshes the cached pages).
 */
import { useMemo, useState } from "react";
import { Badge, Card, EmptyState, ErrorState, fmtNum, Kpi, PageHead, Table, Tabs, useAdminData } from "@/components/admin/ui";
import { adminJson } from "@/lib/admin/fetch";

type State = "live" | "hidden" | "scheduled";
type ShortRow = { id: string; title: string; group: string; category: string; lecture: string; poster: string; seconds: number; status: State; publishAt: string | null; pin: number | null; questHidden: boolean; viewers: number; plays: number; avgSec: number | null; finish: number | null; votes: number; saves: number; comments: number };
type QuestRow = { slug: string; title: string; href: string; status: State; publishAt: string | null; views: number; viewers: number; votes: number; shorts: number };
type Resp = { days: number; shorts: ShortRow[]; quests: QuestRow[] };
type Action = "publish" | "hide" | "schedule" | "pin" | "unpin";

const fmtWhen = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) + " IST";

function StateBadge({ status, publishAt, extra }: { status: State; publishAt: string | null; extra?: string }) {
  if (status === "hidden") return <Badge tone="bad">hidden</Badge>;
  if (status === "scheduled") return <Badge tone="signal" title={publishAt ? fmtWhen(publishAt) : undefined}>{publishAt ? `goes live ${fmtWhen(publishAt)}` : "scheduled"}</Badge>;
  return extra ? <Badge tone="muted" title={extra}>live · {extra}</Badge> : <Badge tone="ok">live</Badge>;
}

export default function PublishingDashboard() {
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<"shorts" | "quests">("shorts");
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | State | "pinned">("all");
  const [cat, setCat] = useState("all");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [at, setAt] = useState("");
  const { data, error, loading, refresh } = useAdminData<Resp>(`/api/admin/publishing?days=${days}`);

  const shorts = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (data?.shorts ?? []).filter(
      (s) =>
        (cat === "all" || s.category === cat) &&
        (only === "all" || (only === "pinned" ? s.pin !== null : s.status === only)) &&
        (!n || s.title.toLowerCase().includes(n) || s.id.includes(n) || s.group.toLowerCase().includes(n))
    );
  }, [data, q, only, cat]);
  const quests = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (data?.quests ?? []).filter((x) => (only === "all" || only === "pinned" || x.status === only) && (!n || x.title.toLowerCase().includes(n) || x.slug.includes(n)));
  }, [data, q, only]);
  const cats = useMemo(() => [...new Set((data?.shorts ?? []).map((s) => s.category))], [data]);

  const keyOf = (kind: "short" | "quest", id: string) => `${kind}:${id}`;
  const toggle = (k: string) => setSel((s) => (s.has(k) ? new Set([...s].filter((x) => x !== k)) : new Set([...s, k])));
  const visibleKeys = tab === "shorts" ? shorts.map((s) => keyOf("short", s.id)) : quests.map((x) => keyOf("quest", x.slug));
  const allOn = visibleKeys.length > 0 && visibleKeys.every((k) => sel.has(k));

  const act = async (action: Action, keys: string[]) => {
    if (!keys.length) return;
    if (action === "schedule" && !at) return setMsg("Pick a date and time first.");
    if (action === "hide" && keys.length > 1 && !window.confirm(`Hide ${keys.length} items from the site?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await adminJson<{ updated: number }>("/api/admin/publishing", { method: "POST", body: JSON.stringify({ keys, action, at: action === "schedule" ? new Date(at).toISOString() : undefined }) });
      setMsg(`${r.updated} updated. The site shows it within a minute.`);
      setSel(new Set());
      refresh();
    } catch (e) {
      setMsg((e as Error).message || "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  const s = data?.shorts ?? [];
  const qs = data?.quests ?? [];
  const btn = "min-h-9 border border-line-strong px-2.5 font-mono text-xs text-fg hover:border-signal disabled:opacity-40";
  const check = (k: string) => <input type="checkbox" aria-label="Select" checked={sel.has(k)} onChange={() => toggle(k)} onClick={(e) => e.stopPropagation()} className="h-4 w-4 accent-[#FF6B2B]" />;

  return (
    <main className="flex flex-col gap-6">
      <PageHead
        path="admin / publishing"
        title="Publishing"
        sub="What the site shows: publish, unpublish or schedule shorts and side quests, and pin shorts to the front of the feed. Unpublished items are hidden everywhere (feed, hubs, search engines, their own page). New content still ships through a release; this controls what's already released."
        actions={
          <span className="flex gap-1">
            {[7, 30, 90].map((d) => (
              <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d} className={`min-h-9 border px-2.5 font-mono text-xs ${days === d ? "border-signal text-fg" : "border-line-strong text-fg-3 hover:text-fg"}`}>
                {d} days
              </button>
            ))}
          </span>
        }
      />
      {error && <ErrorState error={error} title="Couldn't load publishing" />}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi loading={loading && !data} label="shorts live" value={data ? fmtNum(s.filter((x) => x.status === "live" && !x.questHidden).length) : "–"} hint={data ? `of ${fmtNum(s.length)} released` : ""} />
        <Kpi loading={loading && !data} label="hidden or scheduled" value={data ? fmtNum(s.filter((x) => x.status !== "live").length + qs.filter((x) => x.status !== "live").length) : "–"} hint="shorts + side quests" />
        <Kpi loading={loading && !data} label="pinned shorts" value={data ? fmtNum(s.filter((x) => x.pin !== null).length) : "–"} hint="lead the feed" />
        <Kpi loading={loading && !data} label="side quests live" value={data ? fmtNum(qs.filter((x) => x.status === "live").length) : "–"} hint={data ? `of ${fmtNum(qs.length)}` : ""} />
      </div>

      <Card pad={false}>
        <div className="flex flex-col gap-3 p-4">
          <Tabs
            tabs={[
              { id: "shorts", label: "Shorts", count: s.length },
              { id: "quests", label: "Side quests", count: qs.length },
            ]}
            value={tab}
            onChange={(t) => {
              setTab(t);
              setSel(new Set());
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <input placeholder="search title or id" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-9 w-56 border border-line-strong bg-bg px-2 font-mono text-xs text-fg" />
            <select value={only} onChange={(e) => setOnly(e.target.value as typeof only)} className="min-h-9 border border-line-strong bg-bg px-2 font-mono text-xs text-fg">
              <option value="all">every state</option>
              <option value="live">live</option>
              <option value="hidden">hidden</option>
              <option value="scheduled">scheduled</option>
              {tab === "shorts" && <option value="pinned">pinned</option>}
            </select>
            {tab === "shorts" && (
              <select value={cat} onChange={(e) => setCat(e.target.value)} className="min-h-9 border border-line-strong bg-bg px-2 font-mono text-xs text-fg">
                <option value="all">every category</option>
                {cats.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 border border-line bg-surface-2 p-2">
            <span className="font-mono text-xs text-fg-3">{sel.size ? `${sel.size} selected` : "select rows for bulk changes"}</span>
            <button type="button" disabled={busy || !sel.size} onClick={() => void act("publish", [...sel])} className={btn}>publish</button>
            <button type="button" disabled={busy || !sel.size} onClick={() => void act("hide", [...sel])} className={btn}>unpublish</button>
            <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} aria-label="Go-live time" className="min-h-9 border border-line-strong bg-bg px-2 font-mono text-xs text-fg" />
            <button type="button" disabled={busy || !sel.size} onClick={() => void act("schedule", [...sel])} className={btn}>schedule</button>
            {tab === "shorts" && (
              <>
                <button type="button" disabled={busy || !sel.size} onClick={() => void act("pin", [...sel])} className={btn}>pin</button>
                <button type="button" disabled={busy || !sel.size} onClick={() => void act("unpin", [...sel])} className={btn}>unpin</button>
              </>
            )}
            {msg && <span role="status" className="font-mono text-xs text-fg-2">{msg}</span>}
          </div>
        </div>

        {tab === "shorts" ? (
          <Table<ShortRow>
            rowKey={(r) => r.id}
            rows={shorts}
            loading={loading && !data}
            minWidth={1100}
            dense
            initialSort={{ key: "viewers", dir: "desc" }}
            empty={<EmptyState title="No shorts match" />}
            columns={[
              {
                key: "sel",
                header: <input type="checkbox" aria-label="Select all shown" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(visibleKeys))} className="h-4 w-4 accent-[#FF6B2B]" />,
                render: (r) => check(keyOf("short", r.id)),
              },
              {
                key: "title",
                header: "Short",
                sort: (r) => r.title,
                render: (r) => (
                  <a href={`/learn/shorts/${r.id}`} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 hover:underline">
                    {/* eslint-disable-next-line @next/next/no-img-element -- the short's poster on the media host */}
                    <img src={r.poster} alt="" loading="lazy" className="h-12 w-[27px] shrink-0 border border-line object-cover" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[13px] text-fg">{r.title}</span>
                      <span className="truncate font-mono text-[10px] text-fg-4">{r.group}</span>
                    </span>
                  </a>
                ),
              },
              { key: "state", header: "State", sort: (r) => r.status, render: (r) => <StateBadge status={r.status} publishAt={r.publishAt} extra={r.questHidden ? "its quest is hidden" : undefined} /> },
              { key: "pin", header: "Pin", align: "right", sort: (r) => r.pin ?? 999, render: (r) => (r.pin ? `#${r.pin}` : "–") },
              { key: "viewers", header: "Viewers", align: "right", sort: (r) => r.viewers, render: (r) => fmtNum(r.viewers) },
              { key: "avg", header: "Avg watch", align: "right", hideOnPhone: true, sort: (r) => r.avgSec ?? -1, render: (r) => (r.avgSec !== null ? `${r.avgSec} / ${r.seconds} s` : "–") },
              { key: "finish", header: "Finished", align: "right", hideOnPhone: true, sort: (r) => r.finish ?? -1, render: (r) => (r.finish !== null ? `${r.finish}%` : "–") },
              { key: "votes", header: "Upvotes", align: "right", sort: (r) => r.votes, render: (r) => fmtNum(r.votes) },
              { key: "saves", header: "Saves", align: "right", hideOnPhone: true, sort: (r) => r.saves, render: (r) => fmtNum(r.saves) },
              { key: "comments", header: "Comments", align: "right", hideOnPhone: true, sort: (r) => r.comments, render: (r) => fmtNum(r.comments) },
              {
                key: "act",
                header: "",
                render: (r) => (
                  <span className="flex gap-1">
                    {r.status === "live" ? (
                      <button type="button" disabled={busy} onClick={() => void act("hide", [keyOf("short", r.id)])} className={btn}>unpublish</button>
                    ) : (
                      <button type="button" disabled={busy} onClick={() => void act("publish", [keyOf("short", r.id)])} className={btn}>publish</button>
                    )}
                    <button type="button" disabled={busy} onClick={() => void act(r.pin ? "unpin" : "pin", [keyOf("short", r.id)])} className={btn}>{r.pin ? "unpin" : "pin"}</button>
                  </span>
                ),
              },
            ]}
          />
        ) : (
          <Table<QuestRow>
            rowKey={(r) => r.slug}
            rows={quests}
            loading={loading && !data}
            minWidth={900}
            dense
            initialSort={{ key: "views", dir: "desc" }}
            empty={<EmptyState title="No side quests match" />}
            columns={[
              {
                key: "sel",
                header: <input type="checkbox" aria-label="Select all shown" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(visibleKeys))} className="h-4 w-4 accent-[#FF6B2B]" />,
                render: (r) => check(keyOf("quest", r.slug)),
              },
              {
                key: "title",
                header: "Side quest",
                sort: (r) => r.slug,
                render: (r) => (
                  <a href={r.href} target="_blank" rel="noreferrer" className="flex min-w-0 flex-col hover:underline">
                    <span className="truncate text-[13px] text-fg">{r.title}</span>
                    <span className="truncate font-mono text-[10px] text-fg-4">{r.slug}</span>
                  </a>
                ),
              },
              { key: "state", header: "State", sort: (r) => r.status, render: (r) => <StateBadge status={r.status} publishAt={r.publishAt} /> },
              { key: "views", header: "Page views", align: "right", sort: (r) => r.views, render: (r) => fmtNum(r.views) },
              { key: "viewers", header: "Readers", align: "right", sort: (r) => r.viewers, render: (r) => fmtNum(r.viewers) },
              { key: "votes", header: "Lecture upvotes", align: "right", hideOnPhone: true, sort: (r) => r.votes, render: (r) => fmtNum(r.votes) },
              { key: "shorts", header: "Shorts", align: "right", hideOnPhone: true, sort: (r) => r.shorts, render: (r) => fmtNum(r.shorts) },
              {
                key: "act",
                header: "",
                render: (r) =>
                  r.status === "live" ? (
                    <button type="button" disabled={busy} onClick={() => window.confirm(`Hide "${r.title}" and its lecture and shorts from the site?`) && void act("hide", [keyOf("quest", r.slug)])} className={btn}>
                      unpublish
                    </button>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => void act("publish", [keyOf("quest", r.slug)])} className={btn}>
                      publish
                    </button>
                  ),
              },
            ]}
          />
        )}
      </Card>
    </main>
  );
}
