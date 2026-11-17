"use client";

/**
 * The lesson's tools, in the page header: Notebook, the Aa reading panel (with the "whole lesson on one page"
 * preference) and the ⋯ menu (Focus, Snip, Annotate, Terms on/off, Save offline, Save my place). This replaces the
 * floating reading dock, the phone reading bar and the floating Ask and Notebook buttons on lesson pages.
 */
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { BookOpen, Maximize2, MoreHorizontal, PenLine, Scissors, Bookmark, Type } from "lucide-react";
import ReadingSettings from "@/components/learn/reading/ReadingPanel";
import { useReadingSettings } from "@/components/learn/reading/useReading";
import SaveOfflineButton from "@/components/offline/SaveOfflineButton";
import { openNotebookPanel } from "@/lib/learn/ink/client";
import { activeHost, startSnip, subscribeHosts } from "@/components/learn/ink/capture/events";
import { toggleAnnotating, useAnnotate } from "@/components/learn/ink/annotate/mode";
import { setTermsEnabled, subscribeTerms, termsEnabled } from "@/lib/concepts/dom";
import { useWholeLesson } from "./learnPrefs";

const tool = "inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-line bg-surface px-3.5 text-[13px] font-medium text-fg hover:bg-surface-2 [@media(pointer:coarse)]:min-h-11";

/** "Whole lesson on one page": a real switch, in the Aa panel (it replaces the old "Show everything"). */
function WholeLessonRow() {
  const [whole, setWhole] = useWholeLesson();
  return (
    <div className="border-t border-line pt-3">
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold text-fg">Whole lesson on one page</span>
          <span className="text-[12px] leading-snug text-fg-3">On: every part of the lesson in one scroll. Off: one part at a time.</span>
        </span>
        <span className="relative inline-flex shrink-0 items-center">
          <input type="checkbox" role="switch" checked={whole} onChange={(e) => setWhole(e.target.checked)} className="peer sr-only" />
          <span aria-hidden className="block h-6 w-11 rounded-full border border-line-strong bg-surface-2 transition-colors peer-checked:border-signal peer-checked:bg-signal peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-signal" />
          <span aria-hidden className="absolute left-1 top-1 h-4 w-4 rounded-full bg-fg-3 transition-transform peer-checked:translate-x-5 peer-checked:bg-on-signal" />
        </span>
      </label>
    </div>
  );
}

function MenuItem({ icon, children, onClick, pressed }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; pressed?: boolean }) {
  return (
    <button type="button" role={pressed === undefined ? "menuitem" : "menuitemcheckbox"} aria-checked={pressed} onClick={onClick} className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-[14px] text-fg hover:bg-surface-2">
      <span aria-hidden className="grid w-5 shrink-0 place-items-center text-fg-2">
        {icon}
      </span>
      {children}
    </button>
  );
}

export default function LessonTools({
  title,
  focus,
  onFocus,
  onSavePlace,
  className = "",
}: {
  title: string;
  focus: boolean;
  onFocus: () => void;
  onSavePlace: () => void;
  className?: string;
}) {
  const { size } = useReadingSettings();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const snipReady = useSyncExternalStore(subscribeHosts, () => activeHost() !== null, () => false);
  const annotate = useAnnotate();
  const terms = useSyncExternalStore(subscribeTerms, termsEnabled, () => true);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      wrap.current?.querySelector<HTMLElement>("[data-more-btn]")?.focus();
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key, true);
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div role="toolbar" aria-label="Lesson tools" data-focus-hide className={`flex items-center gap-2 ${className}`}>
      <button type="button" onClick={() => openNotebookPanel()} title="Notebook: write beside this lesson" aria-label="Notebook: write beside this lesson" className={tool}>
        <BookOpen className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">Notebook</span>
      </button>
      <ReadingSettings placement="down" extra={<WholeLessonRow />}>
        {(t) => (
          <button
            type="button"
            ref={t.ref}
            onClick={t.onClick}
            aria-expanded={t["aria-expanded"]}
            aria-haspopup={t["aria-haspopup"]}
            aria-controls={t["aria-controls"]}
            aria-label={`Reading settings: theme, font, text size (${size} pixels), whole lesson`}
            title="Reading settings"
            className={`${tool} font-display text-[15px] font-bold ${t["aria-expanded"] ? "border-signal text-signal-text" : ""}`}
          >
            <span aria-hidden>Aa</span>
          </button>
        )}
      </ReadingSettings>
      <div ref={wrap} className="relative">
        <button
          type="button"
          data-more-btn
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label="More lesson tools"
          title="More"
          className={`${tool} px-2.5 ${open ? "border-signal" : ""}`}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </button>
        {open ? (
          <div id={menuId} role="menu" aria-label="More lesson tools" className="absolute right-0 top-[calc(100%+6px)] z-[61] flex w-[248px] flex-col overflow-hidden rounded-[14px] border border-line bg-surface py-1 shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
            <MenuItem icon={<Maximize2 className="h-4 w-4" />} pressed={focus} onClick={run(onFocus)}>
              {focus ? "Exit focus" : "Focus"} <kbd className="ml-auto border border-line-strong px-1 font-mono text-[10px] text-fg-3">F</kbd>
            </MenuItem>
            {snipReady ? (
              <MenuItem icon={<Scissors className="h-4 w-4" />} onClick={run(() => startSnip({ keyboard: false }))}>
                Snip part of the page <kbd className="ml-auto border border-line-strong px-1 font-mono text-[10px] text-fg-3">S</kbd>
              </MenuItem>
            ) : null}
            {annotate.ready ? (
              <MenuItem icon={<PenLine className="h-4 w-4" />} pressed={annotate.on} onClick={run(toggleAnnotating)}>
                {annotate.on ? "Finish annotating" : "Annotate the lesson"}
              </MenuItem>
            ) : null}
            <MenuItem icon={<Type className="h-4 w-4" />} pressed={terms} onClick={() => setTermsEnabled(!terms)}>
              Terms {terms ? "on" : "off"}
            </MenuItem>
            <MenuItem icon={<Bookmark className="h-4 w-4" />} onClick={run(onSavePlace)}>
              Save my place
            </MenuItem>
            <div className="border-t border-line px-3 py-2">
              <SaveOfflineButton title={title} kind="dsa-concept" />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
