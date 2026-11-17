"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Download, Filter, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { useGame } from "@/game/GameProvider";
import { useDsaProgress } from "../progress/useDsaProgress";
import { useDsaDaily, useDsaStreak } from "../daily/useDsaDaily";
import { StreakDots } from "../daily/DailyCard";
import { activeCount, clearAll, emptyState, evaluate, GROUPS, isFiltered, parseState, serializeState, solvedSummary, SORTS, statusViewCounts, statusViewOf, toggle, withStatusView, type FilterRow, type FilterState, type GroupId, type SortId, type Status, type StatusView } from "@/lib/dsa/problem-filters";
import type { ProblemData } from "@/lib/dsa/problem-rows";
import { groupDefs } from "../problems/problem-options";
import { holdAttention } from "@/lib/learn/guide/attention";
import { isListId, listCount, listDef, listIdSet, LISTS, pageOf, plannedNote, recommendedOrder, sectionRows, type ListContext, type ListId, type PracticeLists, type Section } from "@/lib/dsa/lists";
import { FACETS } from "@/lib/dsa/taxonomy";
import { companyLabel } from "@/lib/dsa/problem-rows";
import { itemsFromRows } from "@/lib/dsa/search/items";
import { buildIndex, isNatural, type SearchIndex } from "@/lib/dsa/search/engine";
import { instantRank, smartRank } from "@/lib/dsa/search/rank";
import { smartKey } from "@/lib/dsa/search/smart";
import ListsRail from "./ListsRail";
import SmartSearchBox from "./SmartSearchBox";
import { useSmartSearch } from "./useSmartSearch";
import { ProblemTable } from "./ProblemTable";
import { Chip, Group, useTried, useVideoIds } from "./FilterGroups";
import { useSavedProblems } from "./useSavedProblems";

// the export dialog and its file writer load only when the learner opens it
const ExportSheetDialog = dynamic(() => import("../problems/ExportSheetDialog"), { ssr: false });

/**
 * /dsa/practice: the problem bank. A lists rail (library, curated, soon, mine), a filter bar (module, pattern, difficulty
 * and status inline; "More filters" for the rest), and a compact table of 50 rows a page. The URL is the state:
 * ?list=<id>, the facet params of src/lib/dsa/problem-filters.ts, ?page=, ?group=lesson|pattern.
 */

const PRIMARY: GroupId[] = ["step", "patterns", "level", "status"];
const SORT_LABEL: Record<SortId, string> = { course: "Recommended", easiest: "Easiest first", hardest: "Hardest first", quickest: "Quickest first" };
type Grouping = "none" | "lesson" | "pattern";

type View = { list: ListId; page: number; grouping: Grouping };

function urlOf(s: FilterState, v: View): string {
  const sp = new URLSearchParams(serializeState(s));
  if (v.list !== "all") sp.set("list", v.list);
  if (v.page > 1) sp.set("page", String(v.page));
  if (v.grouping !== "none") sp.set("group", v.grouping);
  const q = sp.toString();
  return `/dsa/practice${q ? `?${q}` : ""}`;
}

function readView(sp: URLSearchParams): View {
  const l = sp.get("list");
  const g = sp.get("group");
  return { list: isListId(l) ? l : "all", page: Math.max(1, Number(sp.get("page")) || 1), grouping: g === "lesson" || g === "pattern" ? g : "none" };
}

/* ------------------------------------------------------------------ pieces */

function FilterMenu({ def, open, onOpen, state, counts, base, onToggle }: { def: ReturnType<typeof groupDefs>[number]; open: boolean; onOpen: (o: boolean) => void; state: FilterState; counts: Map<string, number>; base: Map<string, number> | null; onToggle: (g: GroupId, v: string) => void }) {
  const n = state.sel[def.id].length;
  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => onOpen(!open)}
        className={`inline-flex h-11 items-center gap-2 border px-3 text-[14px] font-medium text-fg hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-text rounded-[10px] ${n ? "border-signal bg-surface" : "border-line-strong bg-surface"}`}
      >
        {def.id === "step" ? "Module" : def.title.replace("Step in the course", "Module")}
        {n ? <span className="bg-signal px-1.5 py-0.5 text-[11px] text-on-signal">{n}</span> : null}
        <ChevronDown className={`h-4 w-4 text-fg-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open ? (
        <div role="group" aria-label={def.title} className="absolute left-0 top-full z-30 mt-1 max-h-[60vh] w-[300px] overflow-y-auto border border-line-strong bg-surface px-3 py-1 shadow-lg rounded-[14px]">
          <Group bare def={def} state={state} counts={counts} base={base} onToggle={onToggle} />
        </div>
      ) : null}
    </div>
  );
}

function StatusTabs({ value, counts, onPick }: { value: StatusView; counts: Record<StatusView, number>; onPick: (v: StatusView) => void }) {
  const VIEWS: { id: StatusView; label: string }[] = [
    { id: "all", label: "All" },
    { id: "unsolved", label: "Unsolved" },
    { id: "solved", label: "Solved" },
  ];
  return (
    <div role="radiogroup" aria-label="Show problems" className="flex border border-line-strong bg-surface">
      {VIEWS.map((v) => {
        const on = value === v.id;
        return (
          <button
            key={v.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(v.id)}
            className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 px-3 font-mono text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal-text sm:flex-none ${on ? "bg-signal font-semibold text-on-signal" : "text-fg hover:bg-surface-2"}`}
          >
            {v.label}
            <span className={`tabular-nums ${on ? "text-on-signal" : "text-fg-3"}`}>{counts[v.id]}</span>
          </button>
        );
      })}
    </div>
  );
}

function PlannedPanel({ id }: { id: ListId }) {
  const def = listDef(id);
  return (
    <section aria-labelledby="pl-h" className="flex flex-col items-start gap-3 border border-dashed border-line-strong bg-surface px-5 py-8 rounded-2xl">
      <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Planned</span>
      <h2 id="pl-h" className="m-0 font-display text-[22px] font-bold tracking-[-0.02em] text-fg">
        {def.label}
      </h2>
      <p className="m-0 max-w-[60ch] text-[15px] leading-relaxed text-fg-2">{def.planned?.line}</p>
      {def.planned?.link ? (
        <Link href={def.planned.link.href} className="inline-flex min-h-11 items-center bg-signal px-4 text-[14px] font-semibold text-on-signal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text rounded-[10px]">
          {def.planned.link.label} →
        </Link>
      ) : null}
    </section>
  );
}

function Pager({ page, pages, total, onGo }: { page: number; pages: number; total: number; onGo: (p: number) => void }) {
  if (pages <= 1) return null;
  const btn = "inline-flex h-11 min-w-[44px] items-center justify-center border border-line-strong bg-surface px-4 font-mono text-[13px] text-fg hover:bg-surface-2 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-text";
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3">
      <span className="font-mono text-[12px] text-fg-3">
        {(page - 1) * 50 + 1} to {Math.min(page * 50, total)} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onGo(page - 1)}>
          ← Previous
        </button>
        <span className="font-mono text-[12px] tabular-nums text-fg-2">
          {page} / {pages}
        </span>
        <button type="button" className={btn} disabled={page >= pages} onClick={() => onGo(page + 1)}>
          Next →
        </button>
      </div>
    </nav>
  );
}

/** A collapsed-by-default group of rows; its table is built only once it is opened. */
function Fold({ title, count, hint, defaultOpen, children }: { title: string; count: number; hint?: string; defaultOpen?: boolean; children: () => React.ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <section className="flex flex-col gap-2">
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex min-h-11 w-full items-center justify-between gap-3 border border-line bg-surface px-4 text-left hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal-text rounded-[10px]"
        >
          <span className="min-w-0">
            <span className="font-display text-[17px] font-bold tracking-[-0.01em] text-fg">{title}</span>
            {hint ? <span className="ml-3 font-mono text-[12px] text-fg-3">{hint}</span> : null}
          </span>
          <span className="flex shrink-0 items-center gap-3">
            <span className="font-mono text-[12px] tabular-nums text-fg-3">{count}</span>
            <ChevronDown className={`h-4 w-4 text-fg-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
          </span>
        </button>
      </h3>
      {open ? children() : null}
    </section>
  );
}

/* ------------------------------------------------------------------ the page */

export default function PracticeBank({ data: page, lists }: { data: ProblemData; lists: PracticeLists }) {
  const videoIds = useVideoIds();
  const data = useMemo<ProblemData>(() => (videoIds ? { ...page, rows: page.rows.map((r) => ({ ...r, video: videoIds.has(r.id) })) } : page), [page, videoIds]);
  const [state, setState] = useState<FilterState>(emptyState);
  const [view, setView] = useState<View>({ list: "all", page: 1, grouping: "none" });
  const [text, setText] = useState("");
  const [sheet, setSheet] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [menu, setMenu] = useState<GroupId | null>(null);
  const { done } = useGame();
  useEffect(() => (sheet ? holdAttention() : undefined), [sheet]);
  const progress = useDsaProgress();
  const tried = useTried();
  const saved = useSavedProblems();
  const daily = useDsaDaily();
  const streak = useDsaStreak();
  const defs = useMemo(() => groupDefs(data), [data]);
  // the search box: the instant engine's index is built when the box is first used (about 30 ms, once); the smart layer is signed-in only
  const smartHook = useSmartSearch();
  const [indexOn, setIndexOn] = useState(false);
  const sortedRows = useMemo(() => [...data.rows].sort((a, b) => a.seq - b.seq || a.order - b.order), [data.rows]);
  const index = useMemo<SearchIndex | null>(() => (indexOn ? buildIndex(itemsFromRows(sortedRows, data.concepts, companyLabel)) : null), [indexOn, sortedRows, data.concepts]);
  const sheetRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const exportRef = useRef<HTMLButtonElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // the URL is the state: read it once the page is interactive, and again on back/forward
  useEffect(() => {
    const read = () => {
      const sp = new URLSearchParams(window.location.search);
      const s = parseState(sp);
      setState(s);
      setText(s.q);
      setView(readView(sp));
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const commit = useCallback((next: FilterState, v: View, how: "push" | "replace" = "push") => {
    setState(next);
    setView(v);
    const url = urlOf(next, v);
    if (url !== `${window.location.pathname}${window.location.search}`) window.history[how === "push" ? "pushState" : "replaceState"](null, "", url);
  }, []);
  // a filter change goes back to page 1
  const commitFilters = useCallback((next: FilterState, how: "push" | "replace" = "push") => commit(next, { ...view, page: 1 }, how), [commit, view]);

  const stateRef = useRef({ state, view });
  useEffect(() => {
    stateRef.current = { state, view };
  }, [state, view]);
  useEffect(() => {
    if (text === stateRef.current.state.q) return;
    const t = setTimeout(() => commit({ ...stateRef.current.state, q: text }, { ...stateRef.current.view, page: 1 }, "replace"), 150);
    return () => clearTimeout(t);
  }, [text, commit]);

  // close an open filter menu on a click outside or Escape
  useEffect(() => {
    if (!menu) return;
    const away = (e: MouseEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setMenu(null);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [menu]);

  const statusOf = useCallback((id: string): Status => (progress.solved.has(id) ? "solved" : tried.has(id) ? "tried" : "todo"), [progress.solved, tried]);

  // the list decides which rows the filters work over (facet counts then describe that list)
  const dailyIds = useMemo(() => (daily.data ? [...(daily.data.daily ? [daily.data.daily.problem.id] : []), ...daily.data.recent.map((x) => x.problem.id)] : daily.error ? [] : null), [daily.data, daily.error]);
  const ctx = useMemo<ListContext>(() => ({ rows: data.rows, saved: saved.saved, daily: dailyIds, lists }), [data.rows, saved.saved, dailyIds, lists]);
  const inList = useMemo(() => {
    const set = listIdSet(view.list, ctx);
    return set ? data.rows.filter((r) => set.has(r.id)) : data.rows;
  }, [view.list, ctx, data.rows]);

  // search: the instant engine ranks the typed words (and the filter words in them); a smart answer for this very text
  // replaces it with the model's chips and keywords, ranked by the same engine
  const searchProgress = useMemo(() => ({ statusOf, isSaved: saved.isSaved }), [statusOf, saved.isSaved]);
  useEffect(() => {
    if (state.q.trim()) setIndexOn(true);
  }, [state.q]);
  const smartHere = smartHook.state && smartHook.state.key === smartKey(state.q) ? smartHook.state : null;
  const instant = useMemo(() => (index && state.q.trim() && !smartHere ? instantRank(index, state.q, searchProgress, 1000) : null), [index, state.q, smartHere, searchProgress]);
  const smartRanked = useMemo(() => (index && smartHere ? smartRank(sortedRows, index, smartHere.answer, statusOf, state.q) : null), [index, smartHere, sortedRows, statusOf, state.q]);
  const rankAt = useMemo(() => {
    const ids = instant ? instant.hits.map((h) => h.item.id) : smartRanked ? smartRanked.rows.map((r) => r.id) : null;
    return ids ? new Map(ids.map((id, i) => [id, i])) : null;
  }, [instant, smartRanked]);
  // before the index exists the old word filter answers (a link with ?q= opens straight onto it)
  const pending = !!state.q.trim() && !index;
  const scoped = useMemo(() => (rankAt && !pending ? inList.filter((r) => rankAt.has(r.id)) : inList), [rankAt, pending, inList]);
  const { results, counts, total } = useMemo(() => evaluate(scoped, pending ? state : { ...state, q: "" }, statusOf), [scoped, pending, state, statusOf]);
  const base = useMemo(() => evaluate(inList, emptyState(), () => "todo").counts, [inList]);
  const summary = useMemo(() => solvedSummary(data.rows, (id) => progress.solved.has(id)), [data.rows, progress.solved]);
  const viewCounts = useMemo(() => statusViewCounts(counts.status), [counts]);
  const railCounts = useMemo(() => Object.fromEntries(LISTS.map((l) => [l.id, listCount(l.id, ctx)])) as Partial<Record<ListId, number | null>>, [ctx]);

  const def = listDef(view.list);
  const planned = !def.ready;
  const sections: Section[] | null = view.list === "interview-patterns" ? lists["interview-patterns"].sections : view.list === "company-types" ? lists["company-types"].sections : null;

  // the rows in the order shown: recommended = course order with unsolved first; the daily list keeps its own order
  const ordered = useMemo(() => {
    if (view.list === "daily" && dailyIds) {
      const at = new Map(dailyIds.map((id, i) => [id, i]));
      return [...results].sort((a, b) => (at.get(a.id) ?? 99) - (at.get(b.id) ?? 99));
    }
    if (rankAt && state.sort === "course") return [...results].sort((a, b) => (rankAt.get(a.id) ?? 0) - (rankAt.get(b.id) ?? 0));
    return state.sort === "course" ? recommendedOrder(results, (id) => progress.solved.has(id)) : results;
  }, [results, state.sort, progress.solved, view.list, dailyIds, rankAt]);
  const paged = pageOf(ordered, view.page);

  const onToggle = (g: GroupId, v: string) => commitFilters(toggle(state, g, v));
  const clear = () => {
    setText("");
    smartHook.clear();
    commitFilters(clearAll(state));
  };
  // a sentence from a signed-in learner goes to the smart layer by itself (once it has sat for a moment); Enter and the
  // "Ask smart search" row ask at once. Guests and failures keep the instant results.
  const askSmart = (q: string) => {
    setText(q);
    commit({ ...stateRef.current.state, q }, { ...stateRef.current.view, page: 1 }, "replace");
    void smartHook.ask(q);
  };
  const { signedIn: smartSignedIn, ask: smartAsk } = smartHook;
  useEffect(() => {
    if (!smartSignedIn || !isNatural(state.q) || smartHere) return;
    const t = setTimeout(() => void smartAsk(state.q), 700);
    return () => clearTimeout(t);
  }, [state.q, smartHere, smartSignedIn, smartAsk]);
  const pickList = (id: ListId) => {
    setMenu(null);
    commit({ ...state }, { list: id, page: 1, grouping: view.grouping });
  };
  const go = (p: number) => {
    commit(state, { ...view, page: p });
    topRef.current?.scrollIntoView({ block: "start" });
  };

  // the filter sheet (phone: bottom sheet with every group; wider: a side panel with the rest): scroll lock, Escape, focus
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
  const moreN = GROUPS.filter((g) => !PRIMARY.includes(g)).reduce((a, g) => a + state.sel[g].length, 0);
  const filtered = isFiltered(state);
  const labelOf = (g: GroupId, v: string) => (g === "video" ? "Has a solution video" : defs.find((d) => d.id === g)?.options.find((o) => o.id === v)?.label || v);
  const chips = GROUPS.flatMap((g) => state.sel[g].map((v) => ({ g, v, label: labelOf(g, v), title: defs.find((d) => d.id === g)?.title || "" })));
  const tableProps = { d: data, statusOf, isSaved: saved.isSaved, onSave: saved.toggle, tag: view.list === "daily" && daily.data?.daily ? { id: daily.data.daily.problem.id, label: "Today" } : null };

  const groupedRows = useMemo(() => {
    if (view.grouping === "none" || sections || planned) return null;
    const m = new Map<string, { title: string; rows: FilterRow[] }>();
    for (const r of ordered) {
      const key = view.grouping === "lesson" ? r.concept : r.patterns[0] || "other";
      const title = view.grouping === "lesson" ? data.concepts[r.concept] || "More practice" : defs.find((d) => d.id === "patterns")?.options.find((o) => o.id === key)?.label || "Other";
      const e = m.get(key) || { title, rows: [] };
      e.rows.push(r);
      m.set(key, e);
    }
    return [...m.entries()].map(([id, v]) => ({ id, ...v }));
  }, [view.grouping, ordered, sections, planned, data.concepts, defs]);

  const listNote =
    view.list === "core-150"
      ? `${lists["core-150"].ids.length} ready${lists["core-150"].planned ? ` · ${lists["core-150"].planned} more planned toward ${lists["core-150"].target}` : ""}`
      : view.list === "interview-patterns"
        ? `${lists["interview-patterns"].sections.filter((s) => s.ids.length).length} of ${lists["interview-patterns"].sections.length} sets open${lists["interview-patterns"].sections.some((s) => s.planned) ? ` · ${lists["interview-patterns"].sections.reduce((a, s) => a + (s.planned || 0), 0)} more problems planned` : ""}`
        : "";

  // the smart answer as chips the learner can take off (nothing is asked again; the page re-ranks at once)
  const topicLabel = (id: string) => [...FACETS.patterns, ...FACETS.algorithms, ...FACETS.structures].find((f) => f.id === id)?.label || id;
  const smartChips = useMemo(() => {
    if (!smartHere) return [];
    const f = smartHere.answer.filters;
    const out: { id: string; label: string; remove: () => void }[] = [];
    f.topics.forEach((id) => out.push({ id: `t-${id}`, label: topicLabel(id), remove: () => smartHook.edit((a) => ({ ...a, filters: { ...a.filters, topics: a.filters.topics.filter((x) => x !== id) } })) }));
    f.difficulty.forEach((d) => out.push({ id: `d-${d}`, label: d[0].toUpperCase() + d.slice(1), remove: () => smartHook.edit((a) => ({ ...a, filters: { ...a.filters, difficulty: a.filters.difficulty.filter((x) => x !== d) } })) }));
    f.domains.forEach((id) => out.push({ id: `c-${id}`, label: companyLabel(id), remove: () => smartHook.edit((a) => ({ ...a, filters: { ...a.filters, domains: a.filters.domains.filter((x) => x !== id) } })) }));
    f.tags.forEach((id) => out.push({ id: `g-${id}`, label: id.replace(/-/g, " "), remove: () => smartHook.edit((a) => ({ ...a, filters: { ...a.filters, tags: a.filters.tags.filter((x) => x !== id) } })) }));
    if (f.status) out.push({ id: "s", label: f.status === "solved" ? "Solved" : "Unsolved", remove: () => smartHook.edit((a) => ({ ...a, filters: { ...a.filters, status: undefined } })) });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smartHere, smartHook.edit]);

  const sheetDefs = defs.map((d) => ({ d, primary: PRIMARY.includes(d.id) }));
  const body = (
    <>
      {/* a list that has nothing to show yet */}
      {planned ? <PlannedPanel id={view.list} /> : null}
      {view.list === "daily" && daily.data?.daily ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-line bg-surface px-4 py-3 rounded-2xl">
          <p className="m-0 text-[14px] text-fg-2">
            <span className="font-semibold text-fg">Today is #{daily.data.daily.number}.</span> {streak?.today ? "✓ Solved today." : "Solve it before midnight India time to keep your streak."}
          </p>
          {streak && daily.data ? (
            <span className="flex items-center gap-3 font-mono text-[12px] text-fg-2">
              {streak.current}-day streak
              <StreakDots days={streak.days} today={daily.data.today} />
            </span>
          ) : null}
        </div>
      ) : null}
      {view.list === "saved" && saved.ready && !saved.saved.size ? (
        <div className="flex flex-col items-start gap-3 border border-dashed border-line-strong px-5 py-10 rounded-2xl">
          <p className="m-0 font-display text-[20px] font-bold text-fg">Nothing saved yet</p>
          <p className="m-0 max-w-[52ch] text-[15px] leading-relaxed text-fg-2">Tap the bookmark on any problem (here or on its page) and it waits for you in this list. It stays on this device; sign in and it follows your account.</p>
          <button type="button" onClick={() => pickList("all")} className="inline-flex h-11 items-center bg-signal px-5 text-[14px] font-semibold text-on-signal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text rounded-[10px]">
            Browse all problems
          </button>
        </div>
      ) : null}

      {!planned && total ? (
        sections ? (
          <div className="flex flex-col gap-3">
            {sectionRows(sections, results).map(({ section, rows, streets }, i, all) => {
              if (!rows.length) {
                // nothing ready in this set (or the filters removed it): a one-line state, not an empty table
                if (filtered || !section.planned) return null;
                return (
                  <p key={section.id} className="m-0 flex flex-wrap items-baseline justify-between gap-2 border border-dashed border-line px-4 py-3 text-[14px] text-fg-2 rounded-2xl">
                    <span className="font-semibold text-fg">{section.title}</span>
                    <span className="font-mono text-[12px] text-fg-3">{plannedNote(section)}</span>
                  </p>
                );
              }
              const first = all.findIndex((x) => x.rows.length) === i;
              return (
                <Fold key={section.id} title={section.title} count={rows.length} hint={section.planned ? plannedNote(section) : undefined} defaultOpen={first || filtered}>
                  {() =>
                    streets.length > 1 || (streets.length === 1 && view.list === "interview-patterns") ? (
                      <div className="flex flex-col gap-4">
                        {streets.map((st) => (
                          <div key={st.id} className="flex flex-col gap-1.5">
                            <h4 className="m-0 font-mono text-[11px] uppercase tracking-label text-fg-3">{st.title}</h4>
                            <ProblemTable rows={st.rows} {...tableProps} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <ProblemTable rows={rows} {...tableProps} />
                    )
                  }
                </Fold>
              );
            })}
          </div>
        ) : groupedRows ? (
          <div className="flex flex-col gap-2">
            {groupedRows.map((g) => (
              <Fold key={g.id} title={g.title} count={g.rows.length}>
                {() => <ProblemTable rows={g.rows} {...tableProps} />}
              </Fold>
            ))}
          </div>
        ) : (
          <>
            <ProblemTable rows={paged.rows} {...tableProps} />
            <Pager page={paged.page} pages={paged.pages} total={ordered.length} onGo={go} />
          </>
        )
      ) : null}

      {!planned && !total && !(view.list === "saved" && !saved.saved.size) ? (
        !videoIds && state.sel.video.length ? (
          <p className="m-0 font-mono text-[12px] text-fg-3">Finding the problems with a solution video…</p>
        ) : view.list === "daily" && dailyIds === null ? (
          <div aria-busy="true" aria-label="Loading the daily problems" className="h-[200px] animate-pulse bg-surface-2" />
        ) : (
          <div className="flex flex-col items-start gap-3 border border-dashed border-line-strong px-5 py-10 rounded-2xl">
            <p className="m-0 font-display text-[20px] font-bold text-fg">{statusViewOf(state) === "solved" && !chips.some((c) => c.g !== "status") && !state.q.trim() ? "You haven't solved a problem here yet" : "No problems match these filters"}</p>
            <p className="m-0 max-w-[52ch] text-[15px] leading-relaxed text-fg-2">Try removing one filter, or searching a shorter word. Choosing several options inside one group widens the list; every group you use narrows it.</p>
            <button type="button" onClick={clear} className="inline-flex h-11 items-center bg-signal px-5 text-[14px] font-semibold text-on-signal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text rounded-[10px]">
              Clear filters
            </button>
          </div>
        )
      ) : null}
    </>
  );

  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[212px_minmax(0,1fr)] lg:items-start lg:gap-8">
      <ListsRail active={view.list} counts={railCounts} hrefOf={(id) => urlOf(emptyState(), { list: id, page: 1, grouping: "none" })} onPick={pickList} />

      <div ref={topRef} className="flex min-w-0 scroll-mt-20 flex-col gap-4">
        <header className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="m-0 font-display text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-fg">{def.label}</h2>
            <p className="m-0 font-mono text-[12px] tabular-nums text-fg-3" aria-label="Your progress">
              {progress.ready ? summary.solved : "–"} of {summary.total} solved
            </p>
          </div>
          <p className="m-0 max-w-[70ch] text-[14.5px] leading-relaxed text-fg-2">{def.blurb}</p>
          {listNote ? <p className="m-0 font-mono text-[12px] text-fg-3">{listNote}</p> : null}
        </header>

        {!planned ? (
          <>
            <div ref={barRef} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <SmartSearchBox
                  value={text}
                  onChange={setText}
                  index={index}
                  onFocusIndex={() => setIndexOn(true)}
                  progress={searchProgress}
                  signedIn={smartHook.signedIn}
                  authLoading={smartHook.authLoading}
                  busy={smartHook.busy}
                  message={smartHook.message}
                  onAsk={askSmart}
                  onClear={() => smartHook.clear()}
                  smartOn={!!smartHere}
                  placeholder="Name, topic, tag or a question"
                />
                {/* module, pattern, difficulty, status: inline from a tablet up */}
                <div className="hidden flex-wrap items-center gap-2 sm:flex">
                  {PRIMARY.map((g) => {
                    const d = defs.find((x) => x.id === g);
                    return d ? <FilterMenu key={g} def={d} open={menu === g} onOpen={(o) => setMenu(o ? g : null)} state={state} counts={counts[g]} base={base[g]} onToggle={onToggle} /> : null;
                  })}
                  <button
                    ref={openerRef}
                    type="button"
                    onClick={() => {
                      setMenu(null);
                      setSheet(true);
                    }}
                    aria-haspopup="dialog"
                    className="inline-flex h-11 items-center gap-2 border border-line-strong bg-surface px-3 text-[14px] font-medium text-fg hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-text rounded-[10px]"
                  >
                    <SlidersHorizontal className="h-4 w-4" aria-hidden />
                    More filters{moreN ? ` (${moreN})` : ""}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setSheet(true)}
                  aria-haspopup="dialog"
                  className="inline-flex h-11 min-w-[44px] flex-1 items-center justify-center gap-2 border border-line-strong bg-surface px-4 text-[14px] font-medium text-fg hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-text sm:hidden rounded-[10px]"
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
                    onChange={(e) => commitFilters({ ...state, sort: e.target.value as SortId })}
                    className="h-11 w-full appearance-none border border-line-strong bg-surface pl-3 pr-9 text-[14px] font-medium text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-text rounded-[10px]"
                  >
                    {SORTS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {SORT_LABEL[s.id]}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" aria-hidden />
                </div>
                {!sections && view.list !== "daily" ? (
                  <div className="relative hidden sm:block">
                    <label htmlFor="pb-group" className="sr-only">
                      Group problems
                    </label>
                    <select
                      id="pb-group"
                      value={view.grouping}
                      onChange={(e) => commit(state, { ...view, page: 1, grouping: e.target.value as Grouping })}
                      className="h-11 appearance-none border border-line-strong bg-surface pl-3 pr-9 text-[14px] font-medium text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-text rounded-[10px]"
                    >
                      <option value="none">No grouping</option>
                      <option value="lesson">By lesson</option>
                      <option value="pattern">By pattern</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" aria-hidden />
                  </div>
                ) : null}
                <button
                  ref={exportRef}
                  type="button"
                  onClick={() => setExporting(true)}
                  aria-haspopup="dialog"
                  aria-label="Export sheet"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 border border-line-strong bg-surface text-[14px] font-medium text-fg hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-text sm:w-auto sm:px-4 rounded-[10px]"
                >
                  <Download className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">Export</span>
                </button>
              </div>
              <StatusTabs value={statusViewOf(state)} counts={viewCounts} onPick={(v) => commitFilters(withStatusView(state, v))} />
            </div>

            {chips.length || state.q.trim() ? (
              <ul aria-label="Active filters" className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
                {state.q.trim() ? (
                  <li>
                    <Chip
                      label={`“${state.q.trim()}”`}
                      remove="search"
                      onRemove={() => {
                        setText("");
                        commitFilters({ ...state, q: "" });
                      }}
                    />
                  </li>
                ) : null}
                {chips.map((c) => (
                  <li key={`${c.g}-${c.v}`}>
                    <Chip label={c.label} remove={`${c.title}: ${c.label}`} onRemove={() => onToggle(c.g, c.v)} />
                  </li>
                ))}
                <li>
                  <button type="button" onClick={clear} className="min-h-10 px-2 font-mono text-[12px] text-signal-text underline decoration-line-strong underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-text">
                    Clear all
                  </button>
                </li>
              </ul>
            ) : null}

            {smartHere ? (
              <section aria-label="What smart search understood" className="flex flex-col gap-2 border border-line bg-surface px-3 py-3 rounded-[14px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-label text-signal-text">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    Understood as
                  </span>
                  <ul className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
                    {smartChips.map((c) => (
                      <li key={c.id}>
                        <Chip label={c.label} remove={c.label} onRemove={c.remove} />
                      </li>
                    ))}
                    {!smartChips.length ? <li className="font-mono text-[12px] text-fg-3">no filters, ranked by words</li> : null}
                  </ul>
                </div>
                {smartHere.answer.note ? <p className="m-0 text-[14px] leading-relaxed text-fg-2">{smartHere.answer.note}</p> : null}
                {smartRanked?.relaxed.length ? <p className="m-0 font-mono text-[12px] text-fg-3">Nothing fit every filter, so the closest are shown.</p> : null}
                {smartHere.learn ? (
                  <Link href={smartHere.learn.href} className="inline-flex min-h-11 w-fit items-center gap-2 text-[14px] font-semibold text-signal-text underline decoration-line-strong underline-offset-4 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-text">
                    Learn {smartHere.learn.title} first →
                  </Link>
                ) : null}
              </section>
            ) : null}

            <p role="status" aria-live="polite" className="m-0 font-mono text-[12px] text-fg-3">
              {filtered ? `${total} of ${inList.length} problems` : `${inList.length} problems`}
              {instant?.pq.filterWords.length ? ` · from your words: ${[...new Set(instant.pq.filterWords.map((f) => f.value))].join(", ")}` : ""}
            </p>
          </>
        ) : null}

        {body}
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

      {sheet ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-[var(--c-scrim)]" onClick={() => setSheet(false)} aria-hidden />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
            className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col border-t-2 border-signal bg-bg sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[400px] sm:border-l sm:border-t-0 sm:border-line-strong"
          >
            <div className="flex min-h-14 items-center justify-between gap-3 border-b border-line px-4">
              <span className="font-mono text-[13px] font-semibold uppercase tracking-label text-fg">
                <span className="sm:hidden">Filters{n ? ` (${n})` : ""}</span>
                <span className="hidden sm:inline">More filters{moreN ? ` (${moreN})` : ""}</span>
              </span>
              <button type="button" onClick={() => setSheet(false)} aria-label="Close filters" className="grid h-11 w-11 place-items-center text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-text">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
              {sheetDefs.map(({ d, primary }) => (
                <div key={d.id} className={primary ? "sm:hidden" : ""}>
                  <Group def={d} state={state} counts={counts[d.id]} base={base[d.id]} onToggle={onToggle} />
                </div>
              ))}
            </div>
            <div className="flex gap-3 border-t border-line bg-bg px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button type="button" onClick={clear} disabled={!n && !state.q} className="h-11 flex-1 border border-line-strong text-[14px] font-medium text-fg disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-text rounded-[10px]">
                Clear all
              </button>
              <button type="button" onClick={() => setSheet(false)} className="h-11 flex-[2] bg-signal text-[14px] font-semibold text-on-signal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text rounded-[10px]">
                Show {total} {total === 1 ? "problem" : "problems"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
