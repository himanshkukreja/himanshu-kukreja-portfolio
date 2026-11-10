"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronDown, Download, Filter, Play, Search, X } from "lucide-react";
import { useGame } from "@/game/GameProvider";
import { useDsaProgress } from "../progress/useDsaProgress";
import SolvedMark from "../problem/SolvedMark";
import { activeCount, clearAll, emptyState, evaluate, GROUPS, isFiltered, parseState, serializeState, solvedSummary, SORTS, statusViewCounts, statusViewOf, toggle, withStatusView, type FilterRow, type FilterState, type GroupId, type SortId, type Status, type StatusView } from "@/lib/dsa/problem-filters";
import type { ProblemData } from "@/lib/dsa/problem-rows";
import { facetLabel } from "@/lib/dsa/taxonomy";
import { groupDefs, type GroupDef } from "./problem-options";
import { holdAttention } from "@/lib/learn/guide/attention";

// the export dialog and its file writer load only when the learner opens it
const ExportSheetDialog = dynamic(() => import("./ExportSheetDialog"), { ssr: false });

/**
 * /dsa/problems: search, facet filters (OR inside a group, AND across groups, live counts), removable chips, sort, and
 * the URL as the filter state. The server renders the whole list; the filters take over once the page is interactive.
 * Logic lives in src/lib/dsa/problem-filters.ts.
 */


const LEVEL_LABEL: Record<string, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

/* ------------------------------------------------------------------ one group */

function Group({ def, state, counts, base, onToggle }: { def: GroupDef; state: FilterState; counts: Map<string, number>; base: Map<string, number> | null; onToggle: (g: GroupId, v: string) => void }) {
  const selected = state.sel[def.id];
  const [open, setOpen] = useState(def.open || selected.length > 0);
  const [all, setAll] = useState(false);
  // options nothing in the whole bank has are left out (they appear on their own once content arrives)
  const options = def.options.filter((o) => def.id === "status" || def.id === "level" || def.id === "kind" || def.id === "time" || (base?.get(o.id) || 0) > 0 || selected.includes(o.id));
  if (!options.length) return null;
  const visible = all ? options : options.filter((o, i) => i < def.max || selected.includes(o.id));
  const hidden = options.length - visible.length;
  const panel = `fg-${def.id}`;
  return (
    <section className="border-b border-line py-1">
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panel}
          onClick={() => setOpen(!open)}
          className="flex min-h-11 w-full items-center justify-between gap-2 text-left font-mono text-[12px] font-semibold uppercase tracking-label text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"
        >
          <span>
            {def.title}
            {selected.length ? <span className="ml-2 bg-signal px-1.5 py-0.5 text-[11px] text-on-signal">{selected.length}</span> : null}
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-fg-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
      </h3>
      {open ? (
        <div id={panel} className="flex flex-col pb-2">
          {visible.map((o) => {
            const on = selected.includes(o.id);
            const n = counts.get(o.id) || 0;
            const dead = n === 0 && !on;
            return (
              <label
                key={o.id}
                className={`flex min-h-10 cursor-pointer items-center gap-3 px-1 text-[14px] hover:bg-surface-2 lg:min-h-9 ${dead ? "text-fg-3" : "text-fg"} has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-signal`}
              >
                <input type="checkbox" checked={on} onChange={() => onToggle(def.id, o.id)} className="peer sr-only" />
                <span aria-hidden className="grid h-[18px] w-[18px] shrink-0 place-items-center border-2 border-line-strong peer-checked:border-signal peer-checked:bg-signal">
                  {on ? (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" className="text-on-signal">
                      <path d="M4 12.5l5 5L20 6.5" />
                    </svg>
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 leading-snug">
                  {o.label}
                  {o.hint ? <span className="block font-mono text-[11px] text-fg-3">{o.hint}</span> : null}
                </span>
                <span className="font-mono text-[12px] tabular-nums text-fg-3" aria-label={`${n} problems`}>
                  {n}
                </span>
              </label>
            );
          })}
          {hidden > 0 || all ? (
            <button type="button" onClick={() => setAll(!all)} className="min-h-10 self-start px-1 font-mono text-[12px] text-signal-text underline decoration-line-strong underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal">
              {all ? "Show fewer" : `Show all ${options.length}`}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ the list */

function Row({ p, d, num }: { p: FilterRow; d: ProblemData; num?: number }) {
  const meta = [p.minutes ? `${p.minutes} min` : "", p.kind === "checkpoint" ? "Checkpoint" : p.kind === "warm-up" ? "Warm-up" : ""].filter(Boolean).join(" · ");
  return (
    <li className="bg-surface [contain-intrinsic-size:auto_56px] [content-visibility:auto]">
      <Link href={`/dsa/problems/${p.id}`} className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal">
        {num ? <span className="w-6 font-mono text-[12px] tabular-nums text-fg-3">{num}</span> : null}
        <SolvedMark id={p.id} />
        <span className="min-w-0 flex-1 basis-40 text-[15px] text-fg">
          {p.title}
          {!num ? <span className="block font-mono text-[11px] text-fg-3">{[d.steps.find((s) => s.id === p.module)?.label, d.concepts[p.concept]].filter(Boolean).join(" · ")}</span> : null}
        </span>
        {p.video ? (
          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-signal-text">
            <Play className="h-3 w-3 fill-current" aria-hidden />
            <span className="sr-only">Has a solution video</span>
            <span aria-hidden className="hidden sm:inline">video</span>
          </span>
        ) : null}
        <span className="hidden max-w-[30%] truncate font-mono text-[11px] text-fg-3 md:inline">{[...p.patterns.map((id) => facetLabel("patterns", id)), ...p.structures.slice(0, 2).map((id) => facetLabel("structures", id))].slice(0, 3).join(", ")}</span>
        {meta ? <span className="font-mono text-[11px] text-fg-3">{meta}</span> : null}
        <span className="w-14 text-right font-mono text-[11px] uppercase tracking-label text-fg-3">{LEVEL_LABEL[p.level]}</span>
      </Link>
    </li>
  );
}

function List({ rows, sort, d }: { rows: FilterRow[]; sort: SortId; d: ProblemData }) {
  if (sort !== "course") {
    return (
      <ol className="m-0 flex list-none flex-col gap-px border border-line bg-line p-0">
        {rows.map((p) => (
          <Row key={p.id} p={p} d={d} />
        ))}
      </ol>
    );
  }
  const groups: { concept: string; module: string; rows: FilterRow[] }[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.concept === r.concept) last.rows.push(r);
    else groups.push({ concept: r.concept, module: r.module, rows: [r] });
  }
  // each section: its course step ("2.2 Hashing") above the lesson's title; problems numbered 1, 2, 3… within it
  const stepOf = (m: string) => d.steps.find((s) => s.id === m)?.label || "";
  // only written lessons link; a planned one shows its step label above and "lesson coming soon" (never a 404)
  const lessonHref = (g: { concept: string }) => d.lessons[g.concept] || null;
  return (
    <div className="flex flex-col gap-8">
      {groups.map((g) => (
        <section key={g.concept} aria-labelledby={`pc-${g.concept}`} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="flex min-w-0 flex-col gap-1">
              {stepOf(g.module) && <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">{stepOf(g.module)}</span>}
              <h2 id={`pc-${g.concept}`} className="m-0 font-display text-[22px] font-bold tracking-[-0.02em] text-fg">
                {d.concepts[g.concept] || (stepOf(g.module) ? `${stepOf(g.module).replace(/^[\d.]+\s*/, "")}: more practice` : "More practice")}
              </h2>
            </div>
            {lessonHref(g) ? (
              <Link href={lessonHref(g)!} className="inline-flex min-h-10 items-center font-mono text-[12px] text-signal-text underline decoration-line-strong underline-offset-4">
                the lesson →
              </Link>
            ) : d.concepts[g.concept] ? (
              <span className="font-mono text-[12px] text-fg-3">lesson coming soon</span>
            ) : null}
          </div>
          <ol className="m-0 flex list-none flex-col gap-px border border-line bg-line p-0">
            {g.rows.map((p, i) => (
              <Row key={p.id} p={p} d={d} num={i + 1} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ progress and the Solved view */

const VIEWS: { id: StatusView; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unsolved", label: "Unsolved" },
  { id: "solved", label: "Solved" },
];

/** "37 of 412 solved", a bar, and the Easy / Medium / Hard split (the whole bank, whatever the filters say). */
function ProgressBar({ sum, ready }: { sum: ReturnType<typeof solvedSummary>; ready: boolean }) {
  const pct = sum.total ? Math.round((sum.solved / sum.total) * 100) : 0;
  const split = (["easy", "medium", "hard"] as const).map((l) => `${LEVEL_LABEL[l]} ${sum.byLevel[l].solved}/${sum.byLevel[l].total}`);
  return (
    <section aria-label="Your progress" className="flex flex-col gap-2 border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="m-0 font-display text-[20px] font-bold tracking-[-0.02em] text-fg">
          <span className="tabular-nums">{ready ? sum.solved : "–"}</span> of <span className="tabular-nums">{sum.total}</span> solved
        </p>
        <p className="m-0 font-mono text-[12px] tabular-nums text-fg-3">{split.join(" · ")}</p>
      </div>
      <div role="progressbar" aria-label="Problems solved" aria-valuemin={0} aria-valuemax={sum.total} aria-valuenow={ready ? sum.solved : 0} className="h-2 w-full overflow-hidden bg-surface-2">
        <div className="h-full bg-signal transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${ready ? pct : 0}%` }} />
      </div>
    </section>
  );
}

/** All / Unsolved / Solved with counts: a shortcut onto the Status facet and the ?st= param. */
function StatusTabs({ value, counts, onPick }: { value: StatusView; counts: Record<StatusView, number>; onPick: (v: StatusView) => void }) {
  return (
    <div role="radiogroup" aria-label="Show problems" className="flex w-full border border-line-strong bg-surface sm:w-auto sm:self-start">
      {VIEWS.map((v) => {
        const on = value === v.id;
        return (
          <button
            key={v.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(v.id)}
            className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 px-4 font-mono text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal sm:flex-none ${on ? "bg-signal font-semibold text-on-signal" : "text-fg hover:bg-surface-2"}`}
          >
            {v.label}
            <span className={`tabular-nums ${on ? "text-on-signal" : "text-fg-3"}`}>{counts[v.id]}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ the page */

/**
 * The problems with a published solution video (GET /api/dsa/problem-videos), fetched once the page is interactive:
 * the page itself carries none, since working them out takes every problem's solution and media. null until it arrives;
 * empty when it can't be had (no row shows a video mark).
 */
function useVideoIds(): Set<string> | null {
  const [ids, setIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    fetch("/api/dsa/problem-videos", { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ids?: unknown } | null) => setIds(new Set(Array.isArray(j?.ids) ? j.ids.filter((x): x is string => typeof x === "string") : [])))
      .catch(() => {
        if (!ctl.signal.aborted) setIds(new Set());
      });
    return () => ctl.abort();
  }, []);
  return ids;
}

/** "Tried" on this device: a problem with a submission history or failed runs saved by the problem room, and not solved. */
function useTried(): Set<string> {
  const [tried, setTried] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const t = new Set<string>();
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i) || "";
        const m = k.match(/^dsa\.(?:history|fails)\.(.+)$/);
        if (!m) continue;
        const v = window.localStorage.getItem(k) || "";
        if (v && v !== "[]" && v !== "0") t.add(m[1]);
      }
      // device state, readable only after hydration
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTried(t);
    } catch {
      /* storage blocked: no "Tried" */
    }
  }, []);
  return tried;
}

export default function ProblemBrowser({ data: page }: { data: ProblemData }) {
  const videoIds = useVideoIds();
  const data = useMemo<ProblemData>(() => (videoIds ? { ...page, rows: page.rows.map((r) => ({ ...r, video: videoIds.has(r.id) })) } : page), [page, videoIds]);
  const [state, setState] = useState<FilterState>(emptyState);
  const [text, setText] = useState("");
  const [sheet, setSheet] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { done } = useGame();
  // no first-visit tips (the notebook's) over the open filter sheet
  useEffect(() => (sheet ? holdAttention() : undefined), [sheet]);
  const progress = useDsaProgress();
  const tried = useTried();
  const defs = useMemo(() => groupDefs(data), [data]);
  const sheetRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const exportRef = useRef<HTMLButtonElement>(null);

  // the URL is the state: read it once the page is interactive, and again on back/forward
  useEffect(() => {
    const read = () => {
      const s = parseState(window.location.search);
      setState(s);
      setText(s.q);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const commit = useCallback((next: FilterState, how: "push" | "replace" = "push") => {
    setState(next);
    const qs = serializeState(next);
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    if (url !== `${window.location.pathname}${window.location.search}`) window.history[how === "push" ? "pushState" : "replaceState"](null, "", url);
  }, []);

  // typing updates the list after a short pause and replaces (not stacks) history entries
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    if (text === stateRef.current.q) return;
    const t = setTimeout(() => commit({ ...stateRef.current, q: text }, "replace"), 150);
    return () => clearTimeout(t);
  }, [text, commit]);

  const statusOf = useCallback((id: string): Status => (progress.solved.has(id) ? "solved" : tried.has(id) ? "tried" : "todo"), [progress.solved, tried]);
  const { results, counts, total } = useMemo(() => evaluate(data.rows, state, statusOf), [data.rows, state, statusOf]);
  // what each option holds in the whole bank, to leave out options nothing carries
  const base = useMemo(() => evaluate(data.rows, emptyState(), () => "todo").counts, [data.rows]);

  const summary = useMemo(() => solvedSummary(data.rows, (id) => progress.solved.has(id)), [data.rows, progress.solved]);
  const viewCounts = useMemo(() => statusViewCounts(counts.status), [counts]);

  const onToggle = (g: GroupId, v: string) => commit(toggle(state, g, v));
  const clear = () => {
    setText("");
    commit(clearAll(state));
  };

  // the bottom sheet: scroll lock, Escape, focus in and back
  useEffect(() => {
    if (!sheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheet(false);
      if (e.key === "Tab" && sheetRef.current) {
        const f = [...sheetRef.current.querySelectorAll<HTMLElement>("button, input, a[href]")].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    sheetRef.current?.querySelector<HTMLElement>("button")?.focus();
    const opener = openerRef.current;
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", key);
      opener?.focus();
    };
  }, [sheet]);

  const n = activeCount(state);
  const filtered = isFiltered(state);
  const labelOf = (g: GroupId, v: string) => (g === "video" ? "Has a solution video" : defs.find((d) => d.id === g)?.options.find((o) => o.id === v)?.label || v);
  const chips = GROUPS.flatMap((g) => state.sel[g].map((v) => ({ g, v, label: labelOf(g, v), title: defs.find((d) => d.id === g)?.title || "" })));

  const panel = (
    <div>
      {defs.map((d) => (
        <Group key={d.id} def={d} state={state} counts={counts[d.id]} base={base[d.id]} onToggle={onToggle} />
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[272px_minmax(0,1fr)] lg:items-start lg:gap-8">
      {/* desktop sidebar */}
      <aside aria-label="Filters" className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:border lg:border-line lg:bg-surface lg:px-4 lg:py-2">
        <div className="flex min-h-11 items-center justify-between border-b border-line">
          <span className="font-mono text-[12px] font-semibold uppercase tracking-label text-fg">Filters{n ? ` · ${n}` : ""}</span>
          {n ? (
            <button type="button" onClick={clear} className="min-h-9 font-mono text-[12px] text-signal-text underline decoration-line-strong underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal">
              Clear all
            </button>
          ) : null}
        </div>
        {panel}
      </aside>

      <div className="flex min-w-0 flex-col gap-4">
        <ProgressBar sum={summary} ready={progress.ready} />
        <StatusTabs value={statusViewOf(state)} counts={viewCounts} onPick={(v) => commit(withStatusView(state, v))} />
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <div role="search" className="relative min-w-0 flex-1 basis-full sm:basis-0">
            <label htmlFor="pb-search" className="sr-only">
              Search problems by title, words in the statement, or a classic like LC 1
            </label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" aria-hidden />
            <input
              id="pb-search"
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Search by title, idea or a classic (LC 1)"
              autoComplete="off"
              enterKeyHint="search"
              className="h-11 w-full border border-line-strong bg-surface pl-9 pr-3 text-[15px] text-fg placeholder:text-fg-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"
            />
          </div>
          <button
            ref={openerRef}
            type="button"
            onClick={() => setSheet(true)}
            aria-haspopup="dialog"
            className="inline-flex h-11 min-w-[44px] flex-1 items-center justify-center gap-2 border border-line-strong bg-surface px-4 font-mono text-[13px] text-fg hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal sm:flex-none lg:hidden"
          >
            <Filter className="h-4 w-4" aria-hidden />
            Filters{n ? ` (${n})` : ""}
          </button>
          <div className="relative flex-1 sm:flex-none">
            <label htmlFor="pb-sort" className="sr-only">
              Sort problems
            </label>
            <select
              id="pb-sort"
              value={state.sort}
              onChange={(e) => commit({ ...state, sort: e.target.value as SortId })}
              className="h-11 w-full appearance-none border border-line-strong bg-surface pl-3 pr-9 font-mono text-[13px] text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" aria-hidden />
          </div>
          <button
            ref={exportRef}
            type="button"
            onClick={() => setExporting(true)}
            aria-haspopup="dialog"
            aria-label="Export sheet"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 border border-line-strong bg-surface font-mono text-[13px] text-fg hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal sm:w-auto sm:px-4"
          >
            <Download className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Export sheet</span>
          </button>
        </div>

        {chips.length || state.q.trim() ? (
          <ul aria-label="Active filters" className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
            {state.q.trim() ? (
              <li>
                <Chip label={`“${state.q.trim()}”`} remove="search" onRemove={() => {
                    setText("");
                    commit({ ...state, q: "" });
                  }} />
              </li>
            ) : null}
            {chips.map((c) => (
              <li key={`${c.g}-${c.v}`}>
                <Chip label={c.label} remove={`${c.title}: ${c.label}`} onRemove={() => onToggle(c.g, c.v)} />
              </li>
            ))}
            <li>
              <button type="button" onClick={clear} className="min-h-10 px-2 font-mono text-[12px] text-signal-text underline decoration-line-strong underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal">
                Clear all
              </button>
            </li>
          </ul>
        ) : null}

        <p role="status" aria-live="polite" className="m-0 font-mono text-[12px] text-fg-3">
          {filtered ? `${total} of ${data.rows.length} problems` : `${data.rows.length} problems`}
        </p>

        {total ? (
          <List rows={results} sort={state.sort} d={data} />
        ) : !videoIds && state.sel.video.length ? (
          <p className="m-0 font-mono text-[12px] text-fg-3">Finding the problems with a solution video…</p>
        ) : (
          <div className="flex flex-col items-start gap-3 border border-dashed border-line-strong px-5 py-10">
            <p className="m-0 font-display text-[20px] font-bold text-fg">{statusViewOf(state) === "solved" && !chips.some((c) => c.g !== "status") && !state.q.trim() ? "You haven't solved a problem yet" : "No problems match these filters"}</p>
            <p className="m-0 max-w-[52ch] text-[15px] leading-relaxed text-fg-2">Try removing one filter, or searching a shorter word. Choosing several options inside one group widens the list; every group you use narrows it.</p>
            <button type="button" onClick={clear} className="inline-flex h-11 items-center bg-signal px-5 font-mono text-[13px] font-semibold text-on-signal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal">
              Clear filters
            </button>
          </div>
        )}
      </div>

      {exporting ? (
        <ExportSheetDialog
          data={data}
          defs={defs}
          initial={state}
          statusOf={statusOf}
          solvedAt={(id) => done[`dsa:p:${id}`] ?? null}
          onClose={() => {
            setExporting(false);
            exportRef.current?.focus();
          }}
        />
      ) : null}

      {/* phone: bottom sheet */}
      {sheet ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSheet(false)} aria-hidden />
          <div ref={sheetRef} role="dialog" aria-modal="true" aria-label="Filters" className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col border-t-2 border-signal bg-bg">
            <div className="flex min-h-14 items-center justify-between gap-3 border-b border-line px-4">
              <span className="font-mono text-[13px] font-semibold uppercase tracking-label text-fg">Filters{n ? ` (${n})` : ""}</span>
              <button type="button" onClick={() => setSheet(false)} aria-label="Close filters" className="grid h-11 w-11 place-items-center text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">{panel}</div>
            <div className="flex gap-3 border-t border-line bg-bg px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button type="button" onClick={clear} disabled={!n && !state.q} className="h-11 flex-1 border border-line-strong font-mono text-[13px] text-fg disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal">
                Clear all
              </button>
              <button type="button" onClick={() => setSheet(false)} className="h-11 flex-[2] bg-signal font-mono text-[13px] font-semibold text-on-signal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal">
                Show {total} {total === 1 ? "problem" : "problems"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Chip({ label, remove, onRemove }: { label: string; remove: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove filter ${remove}`}
      className="inline-flex min-h-10 items-center gap-2 border border-signal bg-surface px-3 font-mono text-[12px] text-fg hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"
    >
      {label}
      <X className="h-3.5 w-3.5 text-fg-3" aria-hidden />
    </button>
  );
}
