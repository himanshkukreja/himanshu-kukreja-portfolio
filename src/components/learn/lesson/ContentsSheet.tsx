"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Stage, TocItem } from "@/lib/course/types";
import { useLessonProgress } from "@/components/LessonProgressTracker";
import { buildTocGroups, useActiveHeading } from "@/components/TableOfContents";
import { stageRailHeight } from "./layout";
import { isOptionalStage, numberedStages } from "./stageText";
import styles from "./reader.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  toc: TocItem[];
  stages: Stage[];
  kicker: string;
  title: string;
};

/**
 * Jump so the heading lands just under the chrome that will be showing once the scroll ends.
 * The site header slides away on scroll down and returns on scroll up (readerChrome), so a jump
 * down only clears the pinned stage bar, a jump up also clears the header that comes back.
 */
function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const headerH = parseFloat(window.getComputedStyle(document.documentElement).getPropertyValue("--hk-header-h")) || 0;
  const rail = stageRailHeight();
  const top = el.getBoundingClientRect().top;
  const up = top < headerH + rail;
  let y = window.scrollY + top - (up ? headerH + rail : rail) - 12;
  // near the top of the page the header always shows and the stage bar is not pinned yet
  if (y < 160) y = window.scrollY + top - headerH - 12;
  const far = Math.abs(y - window.scrollY) > window.innerHeight * 4;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: Math.max(0, y), behavior: far || reduce ? "auto" : "smooth" });
}

/** Phone contents: bottom sheet grouped by stage, with "find in this lesson". */
export default function ContentsSheet({ open, onClose, toc, stages, kicker, title }: Props) {
  const { current, done, completed } = useLessonProgress();
  const groups = useMemo(() => buildTocGroups(toc, stages), [toc, stages]);
  const ids = useMemo(() => toc.map((t) => t.id), [toc]);
  const active = useActiveHeading(open ? ids : []);
  const [query, setQuery] = useState("");
  const [openState, setOpenState] = useState<Record<string, boolean>>({});
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>("button, a[href], input");
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
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const jump = (id: string) => {
    onClose();
    // after the sheet has closed and the body scroll lock is gone
    window.setTimeout(() => jumpTo(id), 30);
  };

  const requiredCount = numberedStages(stages.filter((s) => !isOptionalStage(s))).length;

  return (
    <div className="fixed inset-0 z-[60] lg:hidden" data-reader-ui>
      <button type="button" aria-label="Close contents" tabIndex={-1} onClick={onClose} className="absolute inset-0 h-full w-full bg-black/60" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Contents"
        className={`absolute inset-x-0 bottom-0 top-[18%] flex flex-col gap-2 border-t border-line-strong bg-surface px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] pt-2 ${styles.sheetIn}`}
      >
        <span aria-hidden className="h-1 w-10 self-center bg-line-strong" />
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">
              Contents · {kicker} · {requiredCount} {requiredCount === 1 ? "stage" : "stages"}
            </span>
            <span className="truncate font-display text-[22px] font-bold tracking-[-0.02em]">{title}</span>
          </span>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close contents" className="grid h-11 w-11 shrink-0 place-items-center border border-line-strong text-lg text-fg-3">
            ×
          </button>
        </div>
        {toc.length > 0 && (
          <label className="flex min-h-11 items-center gap-2 border border-line-strong px-2.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="text-fg-3">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <span className="sr-only">Find in this lesson</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find in this lesson"
              className="min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-4"
            />
          </label>
        )}
        <div className={`-mx-1 flex flex-1 flex-col overflow-y-auto px-1 ${styles.sheet}`}>
          {groups.map((g) => {
            const items = q ? g.items.filter((i) => i.text.toLowerCase().includes(q)) : g.items;
            const titleHit = q && g.title.toLowerCase().includes(q);
            if (q && !items.length && !titleHit) return null;
            const isCur = g.kind === "stage" && g.id === current;
            const isDone = g.kind === "stage" && (completed || done.has(g.id));
            const open = q ? true : openState[g.id] ?? isCur;
            let glyph = <span aria-hidden className="h-5 w-5 shrink-0 border border-dashed border-line-strong" />;
            if (g.kind === "questions") glyph = <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center border border-signal text-[10px] text-signal-text">?</span>;
            else if (isCur) glyph = <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center bg-signal text-[9px] text-on-signal">{isDone ? "✓" : "▶"}</span>;
            else if (isDone) glyph = <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center bg-fg text-[10px] text-bg">✓</span>;
            const meta = g.kind === "questions" ? `${g.items.length} Qs` : g.optional ? `${g.stage?.minutes ?? 0}m · opt` : `${g.stage?.minutes ?? 0}m`;
            return (
              <div key={g.id} className="border-b border-surface-2">
                <button
                  type="button"
                  aria-expanded={g.items.length ? open : undefined}
                  onClick={() => (g.items.length ? setOpenState((o) => ({ ...o, [g.id]: !open })) : jump(g.id))}
                  className={`flex min-h-[46px] w-full items-center gap-2.5 text-left text-sm ${
                    isCur ? "font-semibold text-signal-text" : g.kind === "questions" ? "text-fg" : isDone ? "text-fg-2" : "text-fg"
                  }`}
                >
                  {glyph}
                  <span className="min-w-0 flex-1">{g.title}</span>
                  <span className={`font-mono text-[11px] ${isCur || g.kind === "questions" ? "" : "text-fg-3"}`}>
                    {meta} {g.items.length ? (open ? "▾" : "▸") : "›"}
                  </span>
                </button>
                {open && items.length > 0 && (
                  <div className="mb-1 ml-[9px] flex flex-col border-l border-line-strong pb-1 pl-5">
                    {g.kind === "stage" && (
                      <button type="button" onClick={() => jump(g.id)} className="flex min-h-10 items-center text-left font-mono text-xs text-fg-3">
                        Start of {g.stage?.label ?? "stage"} ›
                      </button>
                    )}
                    {items.map((it) => {
                      const on = it.id === active;
                      return (
                        <a
                          key={it.id}
                          href={`#${it.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            jump(it.id);
                          }}
                          aria-current={on ? "location" : undefined}
                          className={`flex min-h-10 items-center justify-between gap-3 text-sm ${on ? "font-semibold text-fg" : "text-fg-2"}`}
                        >
                          <span>{it.text}</span>
                          {on && <span className="shrink-0 font-mono text-[10px] text-signal-text">YOU ARE HERE</span>}
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {q && groups.every((g) => !g.items.some((i) => i.text.toLowerCase().includes(q)) && !g.title.toLowerCase().includes(q)) && (
            <p className="py-6 text-sm text-fg-3">No headings match “{query}”.</p>
          )}
        </div>
      </div>
    </div>
  );
}
