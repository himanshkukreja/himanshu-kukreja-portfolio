"use client";

/** /learn/reading: every reading-trail entry by world and lesson, with search and company / type filters. */
import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { useConnectivity } from "@/lib/offline/connectivity";
import { TRAIL_TYPES, TRAIL_TYPE_LABEL, type TrailEntry, type TrailIndexGroup, type TrailType } from "@/lib/learn/trail/types";
import TrailCard from "./TrailCard";
import { useTrailReads } from "./useTrailReads";

type Props = { groups: TrailIndexGroup[]; total: number };

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
const haystack = (e: TrailEntry) => norm([e.title, e.company, e.publisher, e.authors.join(" "), e.concept, e.summary.what, e.summary.idea, e.summary.connects, e.type].join(" "));

export default function TrailIndex({ groups, total }: Props) {
  const { offline } = useConnectivity();
  const { isRead, toggle, hydrated } = useTrailReads();
  const [q, setQ] = useState("");
  const [company, setCompany] = useState("");
  const [types, setTypes] = useState<Set<TrailType>>(new Set());
  const [unreadOnly, setUnreadOnly] = useState(false);

  const companies = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of groups) for (const l of g.lessons) for (const e of l.entries) m.set(e.company, (m.get(e.company) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [groups]);
  const typeCounts = useMemo(() => {
    const m = new Map<TrailType, number>();
    for (const g of groups) for (const l of g.lessons) for (const e of l.entries) m.set(e.type, (m.get(e.type) ?? 0) + 1);
    return m;
  }, [groups]);

  const terms = norm(q).split(/\s+/).filter(Boolean);
  const keep = (lesson: string, e: TrailEntry) =>
    (!company || e.company === company) &&
    (!types.size || types.has(e.type)) &&
    (!unreadOnly || !isRead(lesson, e.id)) &&
    (!terms.length || terms.every((t) => haystack(e).includes(t)));

  const visible = groups
    .map((g) => ({ ...g, lessons: g.lessons.map((l) => ({ ...l, entries: l.entries.filter((e) => keep(l.key, e)) })).filter((l) => l.entries.length) }))
    .filter((g) => g.lessons.length);
  const shown = visible.reduce((a, g) => a + g.lessons.reduce((b, l) => b + l.entries.length, 0), 0);
  const readTotal = hydrated ? groups.reduce((a, g) => a + g.lessons.reduce((b, l) => b + l.entries.filter((e) => isRead(l.key, e.id)).length, 0), 0) : 0;
  const filtered = !!(terms.length || company || types.size || unreadOnly);
  const clear = () => {
    setQ("");
    setCompany("");
    setTypes(new Set());
    setUnreadOnly(false);
  };
  const toggleType = (t: TrailType) =>
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-10 px-4 pb-32 pt-10 sm:px-6 sm:pt-16 lg:pb-24">
      <header className="flex flex-col gap-5">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">Learn · reading trail · free</span>
        <h1 className="font-display text-[clamp(44px,7vw,104px)] font-extrabold leading-[0.88] tracking-tightest text-fg">
          Read the originals<span className="text-signal-text">.</span>
        </h1>
        <p className="max-w-[760px] text-[17px] leading-relaxed text-fg-2 sm:text-[19px]">
          Every lesson and side quest links two or three real write-ups: engineering blogs from Uber, Netflix, Razorpay, Zerodha, Discord, PhonePe and others, the classic papers, and well-known postmortems. Each comes with three lines on what it is, its key idea and how it connects to the lesson.
        </p>
        <div className="grid grid-cols-3 gap-px self-stretch border border-line bg-line font-mono sm:flex sm:self-start">
          <span className="flex flex-col bg-bg px-3 py-2.5 text-[13px] text-fg-3 sm:block sm:px-4">
            <span className="text-xl font-semibold text-fg">{total}</span> <span>write-ups</span>
          </span>
          <span className="flex flex-col bg-bg px-3 py-2.5 text-[13px] text-fg-3 sm:block sm:px-4">
            <span className="text-xl font-semibold text-fg">{companies.length}</span> companies
          </span>
          <span className="flex flex-col bg-bg px-3 py-2.5 text-[13px] text-fg-3 sm:block sm:px-4">
            <span className="text-xl font-semibold text-signal-text">{readTotal}</span> read by you
          </span>
        </div>
        {offline && <p className="m-0 text-sm text-fg-3">You&apos;re offline: summaries are here, the articles open once you&apos;re back online.</p>}
      </header>

      <section aria-label="Filter the reading trail" className="flex flex-col gap-3 border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Search</span>
            <span className="flex min-h-11 items-center gap-2 border border-line-strong bg-bg px-3">
              <Search className="h-4 w-4 shrink-0 text-fg-3" aria-hidden />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="idempotency, Kafka, Zerodha, postmortem…"
                className="min-w-0 flex-1 bg-transparent py-2 text-[15px] text-fg outline-none placeholder:text-fg-4"
              />
            </span>
          </label>
          <label className="flex flex-col gap-1.5 md:w-[280px]">
            <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Company</span>
            <select value={company} onChange={(e) => setCompany(e.target.value)} className="min-h-11 border border-line-strong bg-bg px-3 text-[15px] text-fg">
              <option value="">All companies</option>
              {companies.map(([c, n]) => (
                <option key={c} value={c}>
                  {c} ({n})
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Type">
          <span className="mr-1 font-mono text-[11px] uppercase tracking-label text-fg-3">Type</span>
          {TRAIL_TYPES.filter((t) => typeCounts.get(t)).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={types.has(t)}
              onClick={() => toggleType(t)}
              className={`min-h-9 border px-3 font-mono text-[12px] ${types.has(t) ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg-2 hover:border-fg-3 hover:text-fg"}`}
            >
              {TRAIL_TYPE_LABEL[t]} · {typeCounts.get(t)}
            </button>
          ))}
          <label className="ml-auto inline-flex min-h-9 cursor-pointer items-center gap-2 font-mono text-[12px] text-fg-2">
            <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} className="h-4 w-4 accent-[var(--c-signal)]" />
            Unread only
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[12px] text-fg-3" aria-live="polite">
          <span>
            Showing {shown} of {total}
          </span>
          {filtered && (
            <button type="button" onClick={clear} className="inline-flex min-h-9 items-center gap-1 text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-fg">
              <X className="h-3.5 w-3.5" aria-hidden /> Clear filters
            </button>
          )}
        </div>
      </section>

      {!total && <p className="text-fg-3">The reading trail isn&apos;t published yet. Check back soon.</p>}
      {total > 0 && !shown && <p className="text-fg-3">Nothing matches those filters.</p>}

      {visible.map((g) => (
        <section key={g.key} aria-labelledby={`trail-${g.key}`} className="flex flex-col gap-6">
          <h2 id={`trail-${g.key}`} className="m-0 flex flex-col gap-1 border-b border-line pb-3">
            <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{g.code === "SQ" ? "Side quests" : `World ${g.code.slice(1)}`}</span>
            <span className="font-display text-[28px] font-bold leading-none tracking-[-0.02em] text-fg">{g.title}</span>
          </h2>
          {g.lessons.map((l) => (
            <div key={l.key} className="flex flex-col gap-2.5">
              <Link href={l.href} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 self-start text-fg no-underline hover:text-signal-text">
                <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">{l.tag}</span>
                <span className="text-[17px] font-semibold">{l.title} →</span>
              </Link>
              <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(min(320px,100%),1fr))]">
                {l.entries.map((e) => (
                  <TrailCard key={e.id} entry={e} lesson={l.key} read={isRead(l.key, e.id)} onToggleRead={() => toggle(l.key, e.id)} offline={offline} surface="index" />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
