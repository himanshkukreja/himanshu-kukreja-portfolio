"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import CoverImage from "@/components/CoverImage";
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
import { ACTIVITY_FLAG, isSolved, readActivityResults } from "./activities/types";

type Filter = "all" | CaseType;
type Sort = "new" | "old" | "short";

const FILTERS: { id: Filter; label: string; short: string }[] = [
  { id: "all", label: "All", short: "All" },
  { id: "incident", label: "Incidents", short: "Incidents" },
  { id: "design", label: "System design", short: "Design" },
  { id: "build", label: "Build logs", short: "Build logs" },
];

const SORTS: { id: Sort; label: string }[] = [
  { id: "new", label: "Newest first" },
  { id: "old", label: "Oldest first" },
  { id: "short", label: "Shortest read" },
];

const ONCALL = BADGES.find((b) => b.id === "oncall");

const BLUEPRINT_BG =
  "bg-raised bg-[linear-gradient(var(--c-line)_1px,transparent_1px),linear-gradient(90deg,var(--c-line)_1px,transparent_1px)] bg-[size:24px_24px]";

/** Desktop-only hover motion: pointer devices that hover, and only when the reader allows motion. */
const HOVER_ZOOM =
  "transition-transform duration-500 ease-out [@media(hover:hover)_and_(prefers-reduced-motion:no-preference)]:group-hover:scale-[1.035]";

type Status = { closed: boolean; solved: boolean; isNew: boolean };

function StatusChips({ s, className = "" }: { s: Status; className?: string }) {
  if (!s.closed && !s.solved && !s.isNew) return null;
  return (
    <span className={`flex flex-wrap justify-end gap-1 ${className}`}>
      {s.isNew && !s.closed && (
        <span className="bg-signal px-1.5 py-1 font-mono text-[10.5px] font-semibold tracking-[0.06em] text-on-signal">NEW</span>
      )}
      {s.closed && (
        <span className="border border-line-strong bg-bg px-1.5 py-1 font-mono text-[10.5px] font-semibold tracking-[0.06em] text-signal-text">CLOSED ✓</span>
      )}
      {s.solved && (
        <span className="border border-line-strong bg-bg px-1.5 py-1 font-mono text-[10.5px] font-semibold tracking-[0.06em] text-fg">SOLVED ◆</span>
      )}
    </span>
  );
}

function TypeTag({ type }: { type: CaseType }) {
  return <span className={type === "incident" ? "text-bad-text" : "text-fg-2"}>{CASE_TYPE_LABEL[type].toUpperCase()}</span>;
}

export default function CaseFilesIndex({ cases }: { cases: CaseFile[] }) {
  const { hydrated, flags, done } = useGame();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("new");

  const closed = useMemo(() => new Set(hydrated ? flagList(flags[READ_FLAG]) : []), [hydrated, flags]);
  // End-of-file activities cleared in this browser (best score kept in game flags, must beat the pass line).
  const solved = useMemo(() => {
    const r = hydrated ? readActivityResults(flags[ACTIVITY_FLAG]) : {};
    return new Set(Object.keys(r).filter((slug) => isSolved(r[slug])));
  }, [hydrated, flags]);
  const closedCount = cases.filter((c) => closed.has(c.slug)).length;
  const solvedCount = cases.filter((c) => solved.has(c.slug)).length;

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

  const matches = useMemo(() => {
    let list = cases.filter((c) => {
      if (filter !== "all" && c.type !== filter) return false;
      if (!query) return true;
      const hay = [c.caseId, c.title, c.excerpt || "", CASE_TYPE_LABEL[c.type], ...c.tags].join(" ").toLowerCase();
      return hay.includes(query);
    });
    if (sort === "short") list = [...list].sort((a, b) => a.mins - b.mins || b.caseId.localeCompare(a.caseId));
    if (sort === "old") list = [...list].reverse();
    return list;
  }, [cases, filter, query, sort]);

  const rows = featuredVisible && latest ? matches.filter((c) => c.slug !== latest.slug) : matches;
  const status = (c: CaseFile): Status => ({ closed: closed.has(c.slug), solved: solved.has(c.slug), isNew: c.slug === latest?.slug });
  const oncallEarned = hydrated && ONCALL ? ONCALL.earned(done) : false;

  return (
    <>
      {/* Header + record */}
      <div className="flex flex-wrap items-end justify-between gap-6 sm:gap-8">
        <div className="flex max-w-[820px] flex-col gap-3 sm:gap-[18px]">
          <span className="label-mono text-signal-text">Case files · engineering stories</span>
          <h1 className="m-0 font-display text-[clamp(44px,8vw,120px)] font-extrabold leading-[0.86] tracking-tightest">
            Case files<span className="text-signal-text">.</span>
          </h1>
          <p className="m-0 text-[16px] leading-[1.55] text-fg-2 [text-wrap:pretty] sm:text-[19px]">
            Production incidents, rush hours and the things I built, told as stories with blueprints. Each one ends with the lessons you can steal.
          </p>
          <span className="font-mono text-[12px] text-fg-3 sm:hidden" aria-hidden>
            your record · {hydrated ? closedCount : "–"}/{cases.length} closed · {hydrated ? solvedCount : "–"} solved ◆
          </span>
        </div>
        <div className="hidden min-w-[260px] flex-col gap-2.5 border border-line bg-surface px-5 py-[18px] sm:flex" aria-live="polite">
          <span className="label-mono text-fg-3">Your record</span>
          <span className="text-[15px]">
            <span className="font-mono text-[22px] font-semibold">{closedCount}</span> of {cases.length} closed
            <span className="text-fg-3"> · {solvedCount} solved ◆</span>
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
          <label className="flex min-h-11 min-w-0 max-w-[420px] flex-[1_1_220px] items-center gap-2.5 border border-line-strong bg-bg px-3.5 focus-within:border-signal">
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
          <label className="relative flex min-h-11 shrink-0 items-center border border-line-strong bg-transparent focus-within:border-signal">
            <span className="sr-only">Sort case files</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="h-11 cursor-pointer appearance-none bg-transparent pl-3.5 pr-8 font-mono text-xs text-fg outline-none focus-visible:outline-none"
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id} className="bg-surface text-fg">
                  {s.label}
                </option>
              ))}
            </select>
            <span aria-hidden className="pointer-events-none absolute right-3 font-mono text-[10px] text-fg-3">
              ▼
            </span>
          </label>
        </div>
      </div>

      <p className="-mt-4 m-0 font-mono text-[12px] text-fg-3 sm:-mt-6" aria-live="polite">
        {matches.length === cases.length ? `${cases.length} case files` : `${matches.length} of ${cases.length} case files`}
        {query ? ` matching “${q.trim()}”` : ""} · {SORTS.find((s) => s.id === sort)?.label.toLowerCase()}
      </p>

      {/* Featured: the newest case file */}
      {featuredVisible && latest && <Featured c={latest} s={status(latest)} readDone={hydrated && !!done.read} />}

      {/* Grid: 1 col phone, 2 tablet, 3 desktop */}
      {rows.length > 0 ? (
        <ul aria-label="Case files" className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {rows.map((c) => (
            <CaseCard key={c.slug} c={c} s={status(c)} />
          ))}
        </ul>
      ) : (
        !featuredVisible && (
          <div className="flex flex-col items-start gap-2 border border-line px-5 py-10">
            <span className="font-display text-2xl font-bold">
              {query ? <>No case file matches “{q.trim()}”.</> : "No case files of this type yet."}
            </span>
            <span className="text-[15px] text-fg-3">Try a technology (Redis, WebRTC) or a failure (outage, overflow).</span>
            {(query || filter !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setFilter("all");
                }}
                className="mt-2 min-h-11 border border-line-strong px-3.5 font-mono text-xs text-fg hover:bg-surface-2"
              >
                clear filters
              </button>
            )}
          </div>
        )
      )}
    </>
  );
}

function Featured({ c, s, readDone }: { c: CaseFile; s: Status; readDone: boolean }) {
  return (
    <Link
      href={`/stories/${c.slug}`}
      className="group grid border border-signal bg-surface text-fg no-underline hover:text-fg lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]"
    >
      {/* The plate carries its own CASE / FIG labels, so nothing is laid over it; on wide screens it sits centred on the blueprint grid. */}
      <span className={`flex items-center overflow-hidden border-b border-line lg:border-b-0 lg:border-r ${BLUEPRINT_BG}`}>
        <span className="relative block aspect-[3/2] w-full overflow-hidden">
          {c.cover ? (
            <span className={`absolute inset-0 ${HOVER_ZOOM}`}>
              <CaseCover src={c.cover} alt="" fill priority sizes="(min-width: 1320px) 740px, (min-width: 1024px) 56vw, 100vw" className="h-full w-full" />
            </span>
          ) : (
            <span className="absolute inset-0 grid place-items-center font-mono text-[13px] text-fg-3">{c.caseId}</span>
          )}
        </span>
      </span>
      <span className="flex flex-col justify-center gap-3 p-4 sm:gap-4 sm:p-8">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="bg-signal px-2 py-1 font-mono text-xs font-semibold tracking-[0.06em] text-on-signal">{c.caseId}</span>
          <span className="border border-line-strong px-2 py-1 font-mono text-xs tracking-[0.06em] text-fg">LATEST</span>
          <StatusChips s={{ ...s, isNew: false }} className="!justify-start" />
        </span>
        <span className="font-mono text-[11.5px] tracking-[0.08em] text-fg-3 sm:text-xs">
          <TypeTag type={c.type} /> · {c.mins} MIN READ · {formatLongDate(c.date)}
        </span>
        <span className="font-display text-[26px] font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-[clamp(30px,3.2vw,46px)] sm:leading-[0.98] sm:tracking-[-0.035em]">
          {c.title}
        </span>
        {c.excerpt && <span className="line-clamp-3 text-[15px] leading-[1.55] text-fg-2 sm:line-clamp-none sm:text-[17px]">{c.excerpt}</span>}
        {c.tags.length > 0 && (
          <span className="flex flex-wrap gap-1.5">
            {c.tags.slice(0, 4).map((t) => (
              <span key={t} className="border border-line-strong px-2 py-1 font-mono text-[11px] text-fg-2">
                {t}
              </span>
            ))}
          </span>
        )}
        <span className="mt-1 flex flex-wrap items-center gap-3">
          <span className="inline-flex min-h-12 items-center bg-signal px-5 text-[15px] font-semibold text-on-signal group-hover:brightness-110">
            Open the case file →
          </span>
          <FeaturedNote c={c} readDone={readDone} />
        </span>
      </span>
    </Link>
  );
}

function CaseCard({ c, s }: { c: CaseFile; s: Status }) {
  return (
    <li className="flex min-w-0">
      <Link
        href={`/stories/${c.slug}`}
        className="group flex w-full min-w-0 flex-col border border-line bg-surface text-fg no-underline transition-colors hover:border-fg-4 hover:text-fg"
      >
        <span className={`relative block aspect-[3/2] overflow-hidden border-b border-line ${BLUEPRINT_BG}`}>
          {c.cover ? (
            <span className={`absolute inset-0 ${HOVER_ZOOM}`}>
              <CoverImage
                src={c.cover}
                alt=""
                fill
                sizes="(min-width: 1320px) 420px, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                className="h-full w-full"
              />
            </span>
          ) : (
            <span className="absolute inset-0 grid place-items-center font-mono text-[13px] text-fg-3">{c.caseId}</span>
          )}
        </span>
        <span className="flex grow flex-col gap-2.5 p-4 sm:p-5">
          <span className="flex items-start justify-between gap-2">
            <span className="pt-1 font-mono text-[11px] tracking-[0.06em] text-fg-3">
              <span className="font-semibold text-signal-text">{c.caseId}</span> · <TypeTag type={c.type} /> · {c.mins} MIN · {formatMonthYear(c.date)}
            </span>
            <StatusChips s={s} className="shrink-0" />
          </span>
          <span className="font-display text-[21px] font-bold leading-[1.12] tracking-[-0.02em] [text-wrap:balance] sm:text-[22px]">{c.title}</span>
          {c.excerpt && <span className="line-clamp-3 text-[14.5px] leading-[1.5] text-fg-2">{c.excerpt}</span>}
          {c.tags.length > 0 && (
            <span className="mt-auto flex flex-wrap gap-1.5 pt-1.5">
              {c.tags.slice(0, 3).map((t) => (
                <span key={t} className="border border-line px-1.5 py-0.5 font-mono text-[10.5px] text-fg-3">
                  {t}
                </span>
              ))}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

function FeaturedNote({ c, readDone }: { c: CaseFile; readDone: boolean }) {
  const parts: string[] = [];
  if (c.hasDebrief || !readDone) parts.push("+50 XP");
  if (c.slug === TATKAL_SLUG) parts.push("then run the rush yourself on the home page");
  if (!parts.length) return null;
  return <span className="font-mono text-xs text-signal-text">{parts.join(" · ")}</span>;
}
