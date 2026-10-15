"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import CaseCover from "./CaseCover";
import { useGame } from "@/game/GameProvider";
import { BADGES } from "@/game/catalog";
import {
  CASE_TYPE_LABEL,
  READ_FLAG,
  TATKAL_SLUG,
  flagList,
  formatLongDate,
  formatMonthYear,
  type CaseFile,
  type CaseType,
} from "./case-types";
import { ACTIVITY_FLAG, readActivityResults } from "./activities/types";

type Filter = "all" | CaseType;
type Sort = "new" | "short";

const FILTERS: { id: Filter; label: string; short: string }[] = [
  { id: "all", label: "All", short: "All" },
  { id: "incident", label: "Incidents", short: "Incidents" },
  { id: "design", label: "System design", short: "Design" },
  { id: "build", label: "Build logs", short: "Build logs" },
];

const ONCALL = BADGES.find((b) => b.id === "oncall");

const GRID_COLS = "grid-cols-[110px_minmax(0,1fr)_140px_90px_120px_92px]";

const BLUEPRINT_BG =
  "bg-raised bg-[linear-gradient(var(--c-line)_1px,transparent_1px),linear-gradient(90deg,var(--c-line)_1px,transparent_1px)] bg-[size:24px_24px]";

function TypePill({ type }: { type: CaseType }) {
  return (
    <span
      className={`justify-self-start border px-2 py-1 font-mono text-[11px] tracking-[0.04em] ${
        type === "incident" ? "border-bad text-bad-text" : "border-line-strong text-fg-2"
      }`}
    >
      {CASE_TYPE_LABEL[type]}
    </span>
  );
}

export default function CaseFilesIndex({ cases }: { cases: CaseFile[] }) {
  const { hydrated, flags, done } = useGame();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("new");

  const closed = useMemo(() => new Set(hydrated ? flagList(flags[READ_FLAG]) : []), [hydrated, flags]);
  const closedCount = cases.filter((c) => closed.has(c.slug)).length;
  // End-of-file activities completed in this browser (best score kept in game flags).
  const solved = useMemo(() => (hydrated ? readActivityResults(flags[ACTIVITY_FLAG]) : {}), [hydrated, flags]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: cases.length, incident: 0, design: 0, build: 0 };
    cases.forEach((s) => {
      c[s.type] += 1;
    });
    return c;
  }, [cases]);

  const latest = cases[0];
  const query = q.trim().toLowerCase();
  const featuredVisible = !!latest && filter === "all" && !query && sort === "new";

  const rows = useMemo(() => {
    let list = cases.filter((c) => {
      if (filter !== "all" && c.type !== filter) return false;
      if (!query) return true;
      const hay = [c.caseId, c.title, c.excerpt || "", CASE_TYPE_LABEL[c.type], ...c.tags].join(" ").toLowerCase();
      return hay.includes(query);
    });
    if (sort === "short") list = [...list].sort((a, b) => a.mins - b.mins);
    if (featuredVisible && latest) list = list.filter((c) => c.slug !== latest.slug);
    return list;
  }, [cases, filter, query, sort, featuredVisible, latest]);

  const empty = rows.length === 0 && !featuredVisible;
  const oncallEarned = hydrated && ONCALL ? ONCALL.earned(done) : false;

  return (
    <>
      {/* Header + record */}
      <div className="flex flex-wrap items-end justify-between gap-8">
        <div className="flex max-w-[820px] flex-col gap-4 sm:gap-[18px]">
          <span className="label-mono hidden text-signal-text sm:block">Case files · engineering stories</span>
          <h1 className="m-0 font-display text-[clamp(44px,8vw,120px)] font-extrabold leading-[0.86] tracking-tightest">
            Case files<span className="text-signal-text">.</span>
          </h1>
          <p className="m-0 hidden text-[19px] leading-[1.55] text-fg-2 [text-wrap:pretty] sm:block">
            Production incidents, rush hours and the things I built, told as stories with blueprints. Each one ends with the lessons you can steal.
          </p>
        </div>
        <div className="hidden min-w-[260px] flex-col gap-2.5 border border-line bg-surface px-5 py-[18px] sm:flex" aria-live="polite">
          <span className="label-mono text-fg-3">Your record</span>
          <span className="text-[15px]">
            <span className="font-mono text-[22px] font-semibold">{closedCount}</span> of {cases.length} closed
          </span>
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${Math.max(1, cases.length)}, minmax(0, 1fr))` }}
            role="img"
            aria-label={`${closedCount} of ${cases.length} case files closed`}
          >
            {cases.map((c, k) => (
              <span key={c.slug} className={`h-3.5 ${k < closedCount ? "bg-signal" : "border border-line-strong"}`} />
            ))}
          </div>
          {ONCALL && (
            <span className="text-xs text-fg-3">
              {oncallEarned ? "On-call badge earned ✓" : `On-call badge: ${ONCALL.how.charAt(0).toLowerCase()}${ONCALL.how.slice(1)}`}
            </span>
          )}
        </div>
      </div>

      {/* Toolbar: filter chips, search, sort */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:border sm:border-line sm:bg-surface sm:p-3">
        <div role="group" aria-label="Filter by type" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {FILTERS.map((f) => {
            const on = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={on}
                className={`min-h-11 shrink-0 border px-3.5 text-sm font-semibold ${
                  on ? "border-fg bg-fg text-bg" : "border-line-strong bg-transparent text-fg-2 hover:text-fg"
                }`}
              >
                <span className="sm:hidden">{f.short}</span>
                <span className="hidden sm:inline">{f.label}</span>{" "}
                <span className="font-mono text-xs opacity-80">{counts[f.id]}</span>
              </button>
            );
          })}
        </div>
        <div className="hidden grow sm:block" />
        <div className="flex gap-2.5 sm:contents">
          <label className="flex min-h-11 max-w-[420px] flex-[1_1_260px] items-center gap-2.5 border border-line-strong bg-bg px-3.5 focus-within:border-signal">
            <Search className="h-4 w-4 shrink-0 text-fg-3" aria-hidden />
            <span className="sr-only">Search case files</span>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search: cache, WebRTC, saga…"
              className="min-h-10 min-w-0 grow border-0 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-4 focus-visible:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => setSort((s) => (s === "new" ? "short" : "new"))}
            className="min-h-11 shrink-0 border border-line-strong bg-transparent px-3.5 font-mono text-xs text-fg hover:bg-surface-2"
          >
            Sort: {sort === "new" ? "newest" : "shortest read"}
          </button>
        </div>
      </div>

      {/* Featured: latest case file */}
      {featuredVisible && latest && (
        <Link
          href={`/stories/${latest.slug}`}
          className="group flex flex-wrap border border-signal bg-surface text-fg no-underline hover:text-fg"
        >
          <span className={`relative grid aspect-[3/2] flex-[1_1_480px] place-items-center overflow-hidden border-line sm:aspect-auto sm:min-h-[340px] sm:border-r ${BLUEPRINT_BG}`}>
            {latest.cover ? (
              // Covers carry labels, so show the whole 3:2 plate (pinned to the top) instead of cropping it to the
              // card. CoverImage's fill wrapper ends up `relative` (zero height) in a grid cell: give it a sized box.
              <span className="absolute inset-x-0 top-0 aspect-[3/2]">
                <CaseCover src={latest.cover} alt="" fill priority sizes="(min-width: 1024px) 700px, 100vw" className="h-full w-full" />
              </span>
            ) : (
              <span className="font-mono text-[13px] text-fg-3">[cover]</span>
            )}
            <span className="absolute left-3 top-3 flex gap-1.5 sm:left-5 sm:top-5">
              <span className="bg-signal px-2 py-1 font-mono text-xs font-semibold tracking-[0.06em] text-on-signal">{latest.caseId}</span>
              <span className="border border-line-strong bg-bg px-2 py-1 font-mono text-xs tracking-[0.06em] text-fg">
                {closed.has(latest.slug) ? "CLOSED ✓" : "NEW"}
                {solved[latest.slug] ? " · SOLVED ◆" : ""}
              </span>
            </span>
          </span>
          <span className="flex flex-[1_1_420px] flex-col justify-center gap-2 p-4 sm:gap-4 sm:p-9">
            <span className="font-mono text-[11px] tracking-[0.08em] text-signal-text sm:hidden">
              {latest.caseId} · {latest.mins} MIN
            </span>
            <span className="hidden font-mono text-xs tracking-[0.08em] text-fg-3 sm:block">
              {formatLongDate(latest.date)} · {CASE_TYPE_LABEL[latest.type].toUpperCase()} · {latest.mins} MIN READ
            </span>
            <span className="font-display text-[20px] font-bold leading-[1.1] tracking-[-0.02em] sm:text-[clamp(32px,3.4vw,48px)] sm:font-extrabold sm:leading-[0.98] sm:tracking-[-0.035em]">
              {latest.title}
            </span>
            {latest.excerpt && <span className="hidden text-[17px] leading-[1.55] text-fg-2 sm:block">{latest.excerpt}</span>}
            {latest.tags.length > 0 && (
              <span className="hidden flex-wrap gap-1.5 sm:flex">
                {latest.tags.slice(0, 3).map((t) => (
                  <span key={t} className="border border-line-strong px-2 py-1 font-mono text-[11px] text-fg-2">
                    {t}
                  </span>
                ))}
              </span>
            )}
            <span className="mt-1 hidden flex-wrap items-center gap-3 sm:flex">
              <span className="inline-flex min-h-12 items-center bg-signal px-5 text-[15px] font-semibold text-on-signal group-hover:brightness-110">
                Open the case file
              </span>
              <FeaturedNote c={latest} readDone={hydrated && !!done.read} />
            </span>
          </span>
        </Link>
      )}

      {/* Ledger */}
      <div className="border border-line">
        {/* Desktop / tablet: table */}
        <div className="hidden overflow-x-auto md:block">
          <div className="flex min-w-[920px] flex-col">
            <div aria-hidden>
              <div
                className={`grid ${GRID_COLS} gap-4 border-b border-line bg-surface px-5 py-3 font-mono text-[11px] uppercase tracking-label text-fg-3`}
              >
                <span>File</span>
                <span>Story</span>
                <span>Type</span>
                <span>Read</span>
                <span>Opened</span>
                <span>Status</span>
              </div>
            </div>
            <ul aria-label="Case files" className="m-0 list-none p-0">
              {rows.map((r) => {
                const isClosed = closed.has(r.slug);
                return (
                  <li key={r.slug} className="border-b border-line last:border-b-0">
                  <Link
                    href={`/stories/${r.slug}`}
                    className={`grid ${GRID_COLS} items-center gap-4 bg-bg p-5 text-fg no-underline hover:bg-surface hover:text-fg`}
                  >
                    <span className="font-mono text-[13px] text-signal-text">
                      {r.caseId}
                    </span>
                    <span className="flex min-w-0 flex-col gap-1.5">
                      <span className="font-display text-[21px] font-bold leading-[1.15] tracking-[-0.015em]">{r.title}</span>
                      {r.excerpt && <span className="line-clamp-2 text-sm leading-normal text-fg-3">{r.excerpt}</span>}
                    </span>
                    <span>
                      <TypePill type={r.type} />
                    </span>
                    <span className="font-mono text-[13px] text-fg-2">
                      {r.mins} min
                    </span>
                    <span className="font-mono text-[13px] text-fg-2">
                      {formatMonthYear(r.date)}
                    </span>
                    <span className="flex flex-col gap-1 font-mono text-xs tracking-[0.06em]">
                      <span className={isClosed ? "font-semibold text-signal-text" : "text-fg-3"}>{isClosed ? "CLOSED ✓" : "OPEN"}</span>
                      {solved[r.slug] && (
                        <span className="text-[11px] text-fg-2" title={`Activity best: ${solved[r.slug].best}/${solved[r.slug].max}`}>
                          SOLVED ◆
                        </span>
                      )}
                    </span>
                  </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Phone: stacked list */}
        <ul className="m-0 flex list-none flex-col p-0 md:hidden">
          {rows.map((r) => {
            const isClosed = closed.has(r.slug);
            return (
              <li key={r.slug} className="border-b border-line last:border-b-0">
                <Link href={`/stories/${r.slug}`} className="flex min-h-11 flex-col gap-1 p-3 text-fg no-underline hover:bg-surface hover:text-fg">
                  <span className={`font-mono text-[11px] tracking-[0.04em] ${r.type === "incident" ? "text-bad-text" : "text-fg-3"}`}>
                    {r.caseId} · {CASE_TYPE_LABEL[r.type].toUpperCase()} ·{" "}
                    {isClosed ? <span className="font-semibold text-signal-text">CLOSED ✓</span> : `${r.mins} MIN`}
                    {solved[r.slug] && <span className="text-fg-2"> · SOLVED ◆</span>}
                  </span>
                  <span className="text-[15px] font-semibold leading-snug">{r.title}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        {empty && (
          <div className="flex flex-col items-start gap-2 px-5 py-10">
            <span className="font-display text-2xl font-bold">
              {query ? <>No case file matches “{q.trim()}”.</> : "No case files of this type yet."}
            </span>
            <span className="text-[15px] text-fg-3">Try a technology (Redis, WebRTC) or a failure (outage, overflow).</span>
          </div>
        )}
      </div>
    </>
  );
}

function FeaturedNote({ c, readDone }: { c: CaseFile; readDone: boolean }) {
  const parts: string[] = [];
  if (c.hasDebrief) parts.push("+50 XP");
  else if (!readDone) parts.push("+50 XP");
  if (c.slug === TATKAL_SLUG) parts.push("and you can replay it as Tatkal Rush");
  if (!parts.length) return null;
  return <span className="font-mono text-xs text-signal-text">{parts.join(" · ")}</span>;
}
