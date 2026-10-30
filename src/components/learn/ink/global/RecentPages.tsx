"use client";

/**
 * Recent notebook pages, one step away: the list the pen button's menu and the panel's page switcher show. Pages
 * written on the page the learner is on come first ("Here"), then the newest across every notebook. Loaded with
 * recentPages() (no ink), only when the menu opens.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Check, Plus } from "lucide-react";
import { InkError, recentPages, type PageSummary } from "@/lib/learn/ink/client";
import { timeAgo } from "@/lib/learn/progress";
import { describeKey } from "./context";

export { NotebookPenIcon } from "./PenIcon";

export const ALL_NOTES_HREF = "/learn/notebook?from=pen";

export function useRecentPages(limit: number, enabled: boolean, refresh = 0) {
  const [pages, setPages] = useState<PageSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let off = false;
    recentPages(limit)
      .then((p) => {
        if (off) return;
        setPages(p);
        setError(null);
      })
      .catch((e) => {
        if (off) return;
        setPages([]);
        setError(e instanceof InkError ? e.message : "Couldn't load your pages.");
      });
    return () => {
      off = true;
    };
  }, [limit, enabled, refresh]);
  return { pages, error };
}

const when = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? timeAgo(t) : "";
};

type Props = {
  /** the context key of the page the learner is on (its pages first) */
  ctxKey: string | null;
  /** the page open in the panel, marked */
  currentId?: string | null;
  /** how many to list */
  max?: number;
  onPick: (id: string) => void;
  /** "New page here"; omitted where it can't be made */
  onNew?: () => void;
  newLabel?: string;
  onNavigate?: () => void;
  enabled: boolean;
};

/** The list: rows of pages, then New page and All notes. Keyboard: arrow keys move between rows. */
export default function RecentPagesList({ ctxKey, currentId, max = 8, onPick, onNew, newLabel = "New page here", onNavigate, enabled }: Props) {
  const { pages, error } = useRecentPages(Math.max(max * 2, 16), enabled);
  const listRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => {
    if (!pages) return null;
    const here = ctxKey ? pages.filter((p) => p.lessonKey === ctxKey) : [];
    const rest = pages.filter((p) => !ctxKey || p.lessonKey !== ctxKey);
    return [...here.map((p) => ({ p, here: true })), ...rest.map((p) => ({ p, here: false }))].slice(0, max);
  }, [pages, ctxKey, max]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-recent-item]") || []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
    next?.focus();
    e.preventDefault();
  };

  return (
    <div ref={listRef} onKeyDown={onKey} className="flex flex-col">
      {rows === null ? (
        <p className="m-0 px-4 py-3 font-mono text-[12px] text-fg-3">loading your pages…</p>
      ) : error ? (
        <p className="m-0 px-4 py-3 text-[14px] text-fg-2">{error}</p>
      ) : rows.length === 0 ? (
        <p className="m-0 px-4 py-3 text-[14px] leading-snug text-fg-2">No pages yet. Your first one starts when you open the notebook.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {rows.map(({ p, here }) => {
            const where = describeKey(p.lessonKey);
            const on = p.id === currentId;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  data-recent-item
                  onClick={() => onPick(p.id)}
                  aria-current={on ? "page" : undefined}
                  className={`flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none ${on ? "bg-surface-2" : ""}`}
                >
                  <span aria-hidden className={`grid h-8 w-6 shrink-0 place-items-center border ${on ? "border-signal bg-signal/10" : "border-line-strong bg-surface"}`}>
                    {on ? <Check className="h-3.5 w-3.5 text-signal-text" /> : <span className="h-px w-3 bg-line-strong shadow-[0_4px_0_var(--c-line-strong),0_-4px_0_var(--c-line-strong)]" />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-semibold text-fg">{p.title || "Untitled page"}</span>
                    <span className="truncate font-mono text-[11px] text-fg-3">
                      {here && <span className="mr-1.5 bg-signal px-1 text-on-signal">HERE</span>}
                      {[where ? (where.kind === "lesson" ? p.notebookTitle || where.short : where.short) : p.notebookTitle, when(p.updatedAt)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex border-t border-line">
        {onNew && (
          <button type="button" data-recent-item onClick={onNew} className="flex min-h-12 flex-1 items-center gap-2 px-4 text-[14px] font-semibold text-fg hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none">
            <Plus className="h-4 w-4 text-signal-text" aria-hidden />
            {newLabel}
          </button>
        )}
        <Link
          href={ALL_NOTES_HREF}
          data-recent-item
          onClick={onNavigate}
          className="flex min-h-12 flex-1 items-center justify-end gap-1.5 border-l border-line px-4 text-[14px] text-fg-2 hover:bg-surface-2 hover:text-fg focus-visible:bg-surface-2 focus-visible:outline-none"
        >
          All notes
          <ArrowUpRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
