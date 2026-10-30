"use client";

/**
 * The admin's shared filter bar for AI logs and tables (/admin/ai's call log and dashboard, /admin/chat's message log
 * and conversations, a learner's AI calls): URL-kept filters (`useUrlFilters`, an optional key prefix when a page has
 * two logs), labelled selects, the learner picker (by email, with a search box when the list is long), the content-
 * jobs switch, the active-filter chips and the pager. Each surface builds its controls from these; the filtering,
 * sorting and paging happen on the server (lib/admin/aiCalls.ts, lib/admin/chatConversations.ts).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FilterChips, fmtNum, LABEL, type Chip } from "@/components/admin/ui";

export const usd = (n: number | null | undefined, d = 2) => `$${Number(n ?? 0).toFixed(d)}`;
const SELECT = "min-h-10 w-full min-w-0 border border-line-strong bg-bg px-2 font-mono text-xs text-fg";

/** Filters kept in the URL query (shareable, survive a reload). `prefix` keeps two logs on one page apart. */
export function useUrlFilters(prefix = "") {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const get = useCallback((k: string) => params.get(prefix + k) || "", [params, prefix]);
  const set = useCallback(
    (patch: Record<string, string | null>) => {
      // from the address bar, not this render's snapshot: two quick changes in a row both stick
      const next = new URLSearchParams(typeof window === "undefined" ? params.toString() : window.location.search);
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(prefix + k, v);
        else next.delete(prefix + k);
      }
      const s = next.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [params, pathname, prefix, router],
  );
  return { get, set };
}

/**
 * Content jobs (eval, batch: features.ts CONTENT_FEATURES) are left out of every admin AI view unless `?content=1`;
 * one page-wide key, so the dashboard and its call log always agree.
 */
export function useContentJobs() {
  const { get, set } = useUrlFilters();
  return { included: get("content") === "1", setIncluded: (on: boolean) => set({ content: on ? "1" : null }) };
}

/** The switch, ON (content jobs excluded) by default, with what it hides so it's never confusing. */
export function ContentSwitch({ hidden, className = "" }: { hidden?: { calls?: number; cost: number } | null; className?: string }) {
  const { included, setIncluded } = useContentJobs();
  return (
    <span className={`flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 ${className}`}>
      <button
        type="button"
        role="switch"
        aria-checked={!included}
        onClick={() => setIncluded(!included)}
        title="Content jobs: model evaluations and batch content generation (scripts), not learner requests"
        className="inline-flex min-h-10 items-center gap-2 border border-line-strong px-2.5 font-mono text-xs text-fg-2 hover:text-fg"
      >
        <span aria-hidden className={`relative inline-block h-4 w-7 border ${included ? "border-line-strong bg-bg" : "border-signal bg-signal"}`}>
          <span className={`absolute top-[1px] h-3 w-3 bg-fg transition-[left] ${included ? "left-[1px]" : "left-[13px] bg-on-signal"}`} />
        </span>
        exclude content jobs
      </button>
      {hidden && !included && (
        <span className="font-mono text-[11px] text-fg-4">
          content jobs hidden · {usd(hidden.cost)}
          {hidden.calls != null ? ` · ${fmtNum(hidden.calls)} calls` : ""} ·{" "}
          <button type="button" onClick={() => setIncluded(true)} className="min-h-8 underline decoration-line-strong underline-offset-2 hover:text-fg">
            show
          </button>
        </span>
      )}
    </span>
  );
}

export type Option = { value: string; label: string; disabled?: boolean };

export function FilterSelect({ label, value, onChange, options, allLabel }: { label: string; value: string; onChange: (v: string) => void; options: Option[]; allLabel?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className={LABEL}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${SELECT} ${value && allLabel !== undefined ? "border-signal" : ""}`}>
        {allLabel !== undefined && <option value="">{allLabel}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export type PickUser = { id: string; email: string | null; calls: number };

/** Learner filter: a dropdown of the window's learners by email, with a search box when the list is long. */
export function UserPicker({ label = "learner", users, value, fallback, loading, partial, onPick }: { label?: string; users: PickUser[]; value: string; fallback: string | null; loading: boolean; partial?: boolean; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  // the list opens to the right of the button, or to its left when that would run off the screen (phones)
  const [alignRight, setAlignRight] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    search.current?.focus();
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const picked = users.find((u) => u.id === value);
  const shownLabel = value ? picked?.email || fallback || `${value.slice(0, 8)}…` : "all learners";
  const long = users.length > 8;
  const needle = q.trim().toLowerCase();
  const shown = needle ? users.filter((u) => (u.email || u.id).toLowerCase().includes(needle)) : users;
  const pick = (id: string) => {
    onPick(id);
    setOpen(false);
    setQ("");
  };
  return (
    <div ref={box} className="relative flex min-w-0 flex-col gap-1">
      <span className={LABEL}>
        {label}
        {users.length ? ` (${fmtNum(users.length)}${partial ? "+" : ""})` : ""}
      </span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          const r = box.current?.getBoundingClientRect();
          if (r) setAlignRight(r.left + Math.min(320, window.innerWidth - 48) > window.innerWidth - 8);
          setOpen(!open);
        }} className={`${SELECT} flex items-center justify-between gap-2 text-left ${value ? "border-signal" : ""}`}>
        <span className="min-w-0 truncate">{shownLabel}</span>
        <span aria-hidden className="shrink-0 text-fg-4">
          ▾
        </span>
      </button>
      {open && (
        <div className={`absolute top-full z-30 mt-1 flex w-[min(320px,calc(100vw-48px))] flex-col border border-line-strong bg-surface shadow-lg ${alignRight ? "right-0" : "left-0"}`}>
          {long && (
            <input
              ref={search}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`search ${users.length} emails`}
              aria-label="Search learners by email"
              className="min-h-10 border-b border-line bg-bg px-2.5 font-mono text-xs text-fg placeholder:text-fg-4"
            />
          )}
          <ul role="listbox" aria-label="Learners" className="m-0 max-h-[280px] list-none overflow-y-auto p-0">
            <li>
              <button type="button" role="option" aria-selected={!value} onClick={() => pick("")} className={`flex min-h-10 w-full items-center px-2.5 text-left font-mono text-xs hover:bg-surface-2 ${!value ? "text-signal-text" : "text-fg-2"}`}>
                all learners
              </button>
            </li>
            {shown.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={u.id === value}
                  onClick={() => pick(u.id)}
                  className={`flex min-h-10 w-full items-center justify-between gap-3 px-2.5 text-left font-mono text-xs hover:bg-surface-2 ${u.id === value ? "text-signal-text" : "text-fg-2"}`}
                >
                  <span className="min-w-0 truncate">{u.email || `${u.id.slice(0, 8)}…`}</span>
                  <span className="shrink-0 text-fg-4">{fmtNum(u.calls)}</span>
                </button>
              </li>
            ))}
            {!shown.length && <li className="px-2.5 py-3 font-mono text-xs text-fg-4">{loading ? "loading…" : needle ? "no email matches" : "no learners in this window"}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The bar: a grid of controls, then the active-filter chips and any notes. */
export function FilterBar({ children, chips, onRemove, onClear, notes }: { children: ReactNode; chips: Chip[]; onRemove: (key: string) => void; onClear: () => void; notes?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-line p-3 sm:p-4">
      <div className="grid grid-cols-2 items-end gap-2 lg:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">{children}</div>
      <FilterChips chips={chips} onRemove={onRemove} onClear={onClear} />
      {notes}
    </div>
  );
}

/** Page n of m (the page itself is state: it resets when a filter changes). */
export function usePage(filterKey: string) {
  const [s, setS] = useState({ key: filterKey, page: 1 });
  const page = s.key === filterKey ? s.page : 1;
  return [page, (n: number) => setS({ key: filterKey, page: n })] as const;
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (n: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-1.5 font-mono text-xs text-fg-3">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="min-h-10 px-1 disabled:opacity-40">
        ← prev
      </button>
      <span>
        page {page} of {pages}
      </span>
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className="min-h-10 px-1 disabled:opacity-40">
        next →
      </button>
    </div>
  );
}
