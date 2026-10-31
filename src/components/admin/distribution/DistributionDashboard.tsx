"use client";

/**
 * /admin/distribution: everything needed to post the shorts to YouTube Shorts and Instagram Reels. For every
 * live short: the poster, length, MP4, transcript and ready-to-copy text for each platform (written from the
 * short's own data, see src/lib/learn/shorts/distribution.ts), a posting tracker per platform, and a suggested
 * order: best first by engagement, never two from the same lecture in a row, categories mixed, 2 a day.
 * Hidden or scheduled shorts (/admin/publishing) aren't listed.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Card, Drawer, EmptyState, ErrorState, fmtNum, Kpi, LABEL, PageHead, Table, useAdminClient, useAdminData } from "@/components/admin/ui";
import {
  categoryLabel,
  distributionCsv,
  instagramCaption,
  lessonUrl,
  PLATFORMS,
  postStatus,
  settlePost,
  suggestOrder,
  youtubeDescription,
  youtubeTitle,
  type DistShort,
  type Platform,
  type PostStatus,
  type Slot,
} from "@/lib/learn/shorts/distribution";

type Resp = { days: number; tracker: boolean; trackerError: string | null; shorts: DistShort[] };

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
const fmtDay = (day: string) => new Date(`${day}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const fmtWhen = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) + " IST";
/** ISO → the value of a datetime-local input (the browser's own zone). */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const slotIso = (s: Slot) => new Date(`${s.date}T${s.time}:00+05:30`).toISOString();
const btn = "inline-flex min-h-9 items-center border border-line-strong px-2.5 font-mono text-xs text-fg hover:border-signal disabled:opacity-40";
const field = "min-h-9 border border-line-strong bg-bg px-2 font-mono text-xs text-fg";

function StatusBadge({ s, p }: { s: DistShort; p: Platform }) {
  const post = s.posts[p];
  if (post?.status === "posted") return <Badge tone="ok" title={post.url || undefined}>posted{post.postedAt ? ` ${new Date(post.postedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}</Badge>;
  if (post?.status === "scheduled" && post.scheduledAt) return <Badge tone="signal" title={`${fmtWhen(post.scheduledAt)}${post.url ? ` · ${post.url}` : ""}`}>scheduled {new Date(post.scheduledAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</Badge>;
  return <Badge tone="muted">not posted</Badge>;
}

/** Saves a file from text in the browser. */
function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DistributionDashboard() {
  const client = useAdminClient();
  const [platform, setPlatform] = useState<Platform>("youtube");
  const [only, setOnly] = useState<"all" | PostStatus>("all");
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const { data, error, loading, refresh, mutate } = useAdminData<Resp>("/api/admin/distribution?days=90");
  // a scheduled post whose time passes while the page is open shows as posted too (the server saves it on the next load)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const all = useMemo(
    () =>
      (data?.shorts ?? []).map((s) => {
        const posts: DistShort["posts"] = {};
        for (const p of PLATFORMS) if (s.posts[p.id]) posts[p.id] = settlePost(s.posts[p.id]!, now);
        return { ...s, posts };
      }),
    [data, now]
  );

  const slots = useMemo<Record<Platform, Map<string, Slot>>>(() => ({ youtube: suggestOrder(all, "youtube"), instagram: suggestOrder(all, "instagram") }), [all]);
  const cats = useMemo(() => [...new Set(all.map((s) => s.category))], [all]);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return all.filter(
      (s) =>
        (cat === "all" || s.category === cat) &&
        (only === "all" || postStatus(s, platform) === only) &&
        (!n || s.title.toLowerCase().includes(n) || s.id.includes(n) || s.label.toLowerCase().includes(n) || s.topics.some((t) => t.includes(n)))
    );
  }, [all, q, cat, only, platform]);
  const slot = slots[platform];
  // queue order first, then what's scheduled (soonest first), then what's posted (latest first)
  const orderKey = (s: DistShort) => {
    const sl = slot.get(s.id);
    if (sl) return sl.n;
    const p = s.posts[platform];
    if (p?.status === "scheduled" && p.scheduledAt) return 1e6 + Date.parse(p.scheduledAt) / 1e6;
    return 1e7 - (p?.postedAt ? Date.parse(p.postedAt) / 1e6 : 0);
  };

  const save = useCallback(
    async (ids: string[], p: Platform, status: PostStatus, at?: string, url?: string) => {
      setMsg(null);
      try {
        await client.json("/api/admin/distribution", { method: "POST", body: JSON.stringify({ ids, platform: p, status, at, url }) });
        mutate((d) =>
          d && {
            ...d,
            shorts: d.shorts.map((s) => {
              if (!ids.includes(s.id)) return s;
              const posts = { ...s.posts };
              if (status === "none") delete posts[p];
              else posts[p] = { status, scheduledAt: status === "scheduled" ? at! : null, postedAt: status === "posted" ? at || new Date().toISOString() : null, url: url || null };
              if (posts[p]) posts[p] = settlePost(posts[p]!);
              return { ...s, posts };
            }),
          }
        );
        refresh();
        return null;
      } catch (e) {
        return (e as Error).message || "Couldn't save.";
      }
    },
    [client, mutate, refresh]
  );

  const exportCsv = () => {
    const sorted = [...rows].sort((a, b) => orderKey(a) - orderKey(b));
    download(`shorts-distribution-${platform}-${new Date().toISOString().slice(0, 10)}.csv`, distributionCsv(sorted, slots), "text/csv;charset=utf-8");
    setMsg(`Exported ${sorted.length} shorts.`);
  };

  const count = (p: Platform, st: PostStatus) => all.filter((s) => postStatus(s, p) === st).length;
  const lastSlot = [...slot.values()].at(-1);
  const busy = loading && !data;
  const current = open ? all.find((s) => s.id === open) : undefined;

  return (
    <main className="flex flex-col gap-6">
      <PageHead
        path="admin / distribution"
        title="Distribution"
        sub="Post every short to YouTube Shorts and Instagram Reels: the MP4, the copy for each platform, where each one is posted, and a suggested order (best first, no two from the same lecture in a row, categories mixed, 2 a day). Only live shorts are listed."
        actions={
          <span className="flex gap-1" role="group" aria-label="Platform">
            {PLATFORMS.map((p) => (
              <button key={p.id} type="button" onClick={() => setPlatform(p.id)} aria-pressed={platform === p.id} className={`min-h-9 border px-2.5 font-mono text-xs ${platform === p.id ? "border-signal text-fg" : "border-line-strong text-fg-3 hover:text-fg"}`}>
                {p.label}
              </button>
            ))}
          </span>
        }
      />
      {error && <ErrorState error={error} title="Couldn't load the distribution pack" />}
      {data && !data.tracker && (
        <div role="status" className="border border-dashed border-signal bg-signal/10 px-3 py-2 font-mono text-xs text-fg">
          <span className="font-semibold text-signal-text">read-only</span> · {data.trackerError || "The posting tracker isn't available."} Everything else works; posts can be tracked once the table exists.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi loading={busy} label="live shorts" value={data ? fmtNum(all.length) : "–"} hint="hidden and scheduled ones left out" />
        {PLATFORMS.map((p) => (
          <Kpi key={p.id} loading={busy} label={`posted · ${p.short}`} value={data ? fmtNum(count(p.id, "posted")) : "–"} hint={data ? `${fmtNum(count(p.id, "scheduled"))} scheduled · ${fmtNum(count(p.id, "none"))} to go` : ""} />
        ))}
        <Kpi loading={busy} label={`queue · ${PLATFORMS.find((p) => p.id === platform)!.short}`} value={lastSlot ? fmtDay(lastSlot.date) : data ? "done" : "–"} hint={lastSlot ? `last one at 2 a day · ${fmtNum(slot.size)} queued` : ""} />
      </div>

      <Card pad={false}>
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <input placeholder="search title, id or topic" value={q} onChange={(e) => setQ(e.target.value)} className={`${field} w-56`} />
            <select value={only} onChange={(e) => setOnly(e.target.value as typeof only)} aria-label={`${platform} status`} className={field}>
              <option value="all">{PLATFORMS.find((p) => p.id === platform)!.short}: any status</option>
              <option value="none">not posted</option>
              <option value="scheduled">scheduled</option>
              <option value="posted">posted</option>
            </select>
            <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category" className={field}>
              <option value="all">every category</option>
              {cats.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </select>
            <button type="button" disabled={!rows.length} onClick={exportCsv} className={btn}>
              export CSV ({fmtNum(rows.length)})
            </button>
            {msg && <span role="status" className="font-mono text-xs text-fg-2">{msg}</span>}
          </div>
        </div>
        <Table<DistShort>
          key={platform}
          rowKey={(r) => r.id}
          rows={rows}
          loading={busy}
          minWidth={900}
          dense
          onRowClick={(r) => setOpen(r.id)}
          initialSort={{ key: "n", dir: "asc" }}
          empty={<EmptyState title="No shorts match" />}
          columns={[
            { key: "n", header: "#", align: "right", sort: orderKey, render: (r) => <span className="font-mono text-xs tabular-nums">{slot.get(r.id)?.n ?? "–"}</span> },
            {
              key: "when",
              header: `Post on ${PLATFORMS.find((p) => p.id === platform)!.short}`,
              sort: orderKey,
              render: (r) => {
                const sl = slot.get(r.id);
                return sl ? (
                  <span className="whitespace-nowrap font-mono text-xs text-fg">
                    {fmtDay(sl.date)} <span className="text-fg-4">{sl.time}</span>
                  </span>
                ) : (
                  <StatusBadge s={r} p={platform} />
                );
              },
            },
            {
              key: "title",
              header: "Short",
              className: "max-w-[360px]",
              sort: (r) => r.title,
              render: (r) => (
                <span className="flex min-w-0 items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the short's poster on the media host */}
                  <img src={r.poster} alt="" loading="lazy" className="h-12 w-[27px] shrink-0 border border-line object-cover" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[13px] text-fg">{r.title}</span>
                    <span className="truncate font-mono text-[10px] text-fg-4">
                      {categoryLabel(r.category)} · {r.label}
                    </span>
                  </span>
                </span>
              ),
            },
            { key: "len", header: "Length", align: "right", hideOnPhone: true, sort: (r) => r.duration, render: (r) => <span className="font-mono text-xs tabular-nums">{mmss(r.duration)}</span> },
            { key: "score", header: "Score", align: "right", hideOnPhone: true, sort: (r) => r.score, render: (r) => <span className="font-mono text-xs tabular-nums" title={`${r.viewers} viewers in ${data?.days ?? 90} days`}>{r.score.toFixed(2)}</span> },
            ...PLATFORMS.map((p) => ({ key: p.id, header: p.short, sort: (r: DistShort) => postStatus(r, p.id), render: (r: DistShort) => <StatusBadge s={r} p={p.id} /> })),
          ]}
        />
      </Card>

      <Drawer open={!!current} onClose={() => setOpen(null)} label={current ? `${categoryLabel(current.category)} · ${current.label}` : undefined} title={current?.title} width={640}>
        {current && <Detail key={current.id} s={current} slots={slots} tracker={!!data?.tracker} onSave={save} />}
      </Drawer>
    </main>
  );
}

/* ─────────────────────────────── detail ─────────────────────────────── */

function CopyField({ label, value, max }: { label: string; value: string; max?: number }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      setDone(false);
    }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className={LABEL}>
          {label}
          {max ? (
            <span className={value.length > max ? "text-bad-text" : "text-fg-4"}>
              {" "}
              · {value.length}/{max}
            </span>
          ) : null}
        </span>
        <button type="button" onClick={() => void copy()} className={btn} aria-label={`Copy ${label}`}>
          {done ? "copied ✓" : "copy"}
        </button>
      </div>
      <pre className="m-0 max-h-56 overflow-auto whitespace-pre-wrap break-words border border-line bg-bg p-2.5 font-sans text-[13px] leading-relaxed text-fg">{value}</pre>
    </div>
  );
}

function Detail({ s, slots, tracker, onSave }: { s: DistShort; slots: Record<Platform, Map<string, Slot>>; tracker: boolean; onSave: (ids: string[], p: Platform, status: PostStatus, at?: string, url?: string) => Promise<string | null> }) {
  const { data: tr, error: trErr } = useAdminData<{ transcript: string[] }>(`/api/admin/distribution?id=${encodeURIComponent(s.id)}`);
  const [dl, setDl] = useState<string | null>(null);
  const saveMp4 = async () => {
    setDl("downloading…");
    try {
      const res = await fetch(s.video);
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: `${s.id}.mp4` });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setDl(null);
    } catch {
      // the media host refused a cross-origin read (e.g. on localhost): open the file instead
      window.open(s.video, "_blank", "noopener");
      setDl("opened in a new tab: save it from there");
    }
  };
  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- the short's poster on the media host */}
        <img src={s.poster} alt={`Poster of ${s.title}`} className="h-[213px] w-[120px] shrink-0 border border-line object-cover" />
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="neutral">{mmss(s.duration)}</Badge>
            <Badge tone="neutral" title="engagement score (higher is better)">score {s.score.toFixed(2)}</Badge>
            <Badge tone="neutral">{fmtNum(s.viewers)} viewers</Badge>
          </div>
          {s.topics.length > 0 && <div className="font-mono text-[11px] text-fg-3">topics: {s.topics.join(", ")}</div>}
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => void saveMp4()} className={btn}>
              ↓ download MP4
            </button>
            <a href={s.video} target="_blank" rel="noreferrer" className={btn}>
              open MP4
            </a>
            <a href={s.poster} target="_blank" rel="noreferrer" className={btn}>
              poster
            </a>
            <a href={`/learn/shorts/${s.id}`} target="_blank" rel="noreferrer" className={btn}>
              watch page ↗
            </a>
          </div>
          {dl && <span className="font-mono text-[11px] text-fg-3">{dl}</span>}
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="m-0 text-[15px] font-semibold text-fg">YouTube Shorts</h3>
        <CopyField label="title" value={youtubeTitle(s)} max={100} />
        <CopyField label="description" value={youtubeDescription(s)} max={5000} />
        <PostEditor s={s} p="youtube" slot={slots.youtube.get(s.id)} tracker={tracker} onSave={onSave} />
      </section>

      <section className="flex flex-col gap-3 border-t border-line pt-5">
        <h3 className="m-0 text-[15px] font-semibold text-fg">Instagram Reels</h3>
        <CopyField label="caption" value={instagramCaption(s)} max={2200} />
        <CopyField label="link for the bio (Reels captions don't link)" value={lessonUrl(s, "instagram")} />
        <PostEditor s={s} p="instagram" slot={slots.instagram.get(s.id)} tracker={tracker} onSave={onSave} />
      </section>

      <section className="flex flex-col gap-2 border-t border-line pt-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="m-0 text-[15px] font-semibold text-fg">Transcript</h3>
          {tr && <CopyButton text={tr.transcript.join("\n\n")} />}
        </div>
        {trErr ? (
          <span className="font-mono text-xs text-bad-text">{trErr.message}</span>
        ) : !tr ? (
          <span className="font-mono text-xs text-fg-3">loading…</span>
        ) : (
          tr.transcript.map((p, i) => (
            <p key={i} className="m-0 text-[14px] leading-relaxed text-fg-2">
              {p}
            </p>
          ))
        )}
      </section>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={btn}
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        })
      }
    >
      {done ? "copied ✓" : "copy"}
    </button>
  );
}

function PostEditor({ s, p, slot, tracker, onSave }: { s: DistShort; p: Platform; slot?: Slot; tracker: boolean; onSave: (ids: string[], p: Platform, status: PostStatus, at?: string, url?: string) => Promise<string | null> }) {
  const post = s.posts[p];
  const [status, setStatus] = useState<PostStatus>(post?.status ?? "none");
  const [at, setAt] = useState(() => {
    const iso = post?.status === "scheduled" ? post.scheduledAt : post?.status === "posted" ? post.postedAt : slot ? slotIso(slot) : null;
    return iso ? toLocalInput(iso) : "";
  });
  const [url, setUrl] = useState(post?.url ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const pick = (st: PostStatus) => {
    setStatus(st);
    // a fresh "posted" defaults to now, a fresh "scheduled" to the suggested slot
    if (st === "posted" && post?.status !== "posted") setAt(toLocalInput(new Date().toISOString()));
    if (st === "scheduled" && post?.status !== "scheduled") setAt(slot ? toLocalInput(slotIso(slot)) : "");
  };
  const submit = async () => {
    setBusy(true);
    const err = await onSave([s.id], p, status, status === "none" ? undefined : at ? new Date(at).toISOString() : undefined, status === "none" ? undefined : url.trim() || undefined);
    setBusy(false);
    setMsg(err || "saved");
  };
  const label = PLATFORMS.find((x) => x.id === p)!.short;
  return (
    <div className="flex flex-col gap-2 border border-line bg-surface-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={LABEL}>posting · {label}</span>
        <StatusBadge s={s} p={p} />
      </div>
      {post?.url && (
        <a href={post.url} target="_blank" rel="noreferrer" className="truncate font-mono text-xs text-signal-text underline underline-offset-4">
          {post.url}
        </a>
      )}
      {slot && <span className="font-mono text-[11px] text-fg-3">suggested: #{slot.n} in the queue · {fmtDay(slot.date)}, {slot.time} IST</span>}
      <fieldset disabled={!tracker || busy} className="flex flex-wrap items-center gap-2 disabled:opacity-50">
        <select value={status} onChange={(e) => pick(e.target.value as PostStatus)} aria-label={`${label} status`} className={field}>
          <option value="none">not posted</option>
          <option value="scheduled">scheduled</option>
          <option value="posted">posted</option>
        </select>
        {status !== "none" && <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} aria-label={status === "scheduled" ? "Scheduled for" : "Posted on"} className={field} />}
        {status !== "none" && <input type="url" placeholder={status === "scheduled" ? `https://… the ${label} link (given when you schedule)` : `https://… the ${label} post`} value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Post link" className={`${field} min-w-0 flex-1`} />}
        <button type="button" onClick={() => void submit()} className={btn}>
          save
        </button>
      </fieldset>
      {!tracker && <span className="font-mono text-[11px] text-fg-4">read-only until the tracker table exists</span>}
      {msg && <span role="status" className="font-mono text-[11px] text-fg-2">{msg}</span>}
    </div>
  );
}
