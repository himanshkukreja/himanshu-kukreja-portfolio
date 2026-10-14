"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bookmark, ChevronLeft, Highlighter, StickyNote, X } from "lucide-react";
import { HIGHLIGHT_COLOURS } from "@/lib/learn/notebook";

/**
 * The four highlight colours (Notebook.dc.html). Stored values keep the existing
 * content_notes vocabulary (see src/lib/learn/notebook.ts) so old rows stay readable:
 * yellow = orange "Key idea", blue = white "Definition", red = grey "Numbers",
 * green = teal "Interview line"; legacy purple shows as "Marked".
 */
export const HIGHLIGHT_COLORS = (["yellow", "blue", "red", "green"] as const).map((value) => ({
  value,
  name: ({ yellow: "orange", blue: "white", red: "grey", green: "teal" } as const)[value],
  label: HIGHLIGHT_COLOURS[value].label,
  swatch: HIGHLIGHT_COLOURS[value].swatch,
}));

export type HighlightDisplay = "orange" | "white" | "grey" | "teal" | "marked";

const DISPLAY: Record<string, HighlightDisplay> = {
  yellow: "orange",
  orange: "orange",
  pink: "orange",
  blue: "white",
  white: "white",
  red: "grey",
  grey: "grey",
  gray: "grey",
  green: "teal",
  teal: "teal",
  purple: "marked",
};

/** Map any stored colour (old or new names) to the colour shown in the reader. */
export function displayHighlightColor(stored: string | null | undefined): HighlightDisplay {
  return DISPLAY[(stored || "").toLowerCase()] || "orange";
}

type TextSelectionMenuProps = {
  selectedText: string;
  /** viewport position (top-left of the toolbar) */
  position: { x: number; y: number };
  onHighlight: (color: string) => void;
  onBookmark: () => void;
  onNote: () => void;
  onClose: () => void;
  /** where the arrow points: "above" = toolbar sits above the selection (default) */
  placement?: "above" | "below";
  /** move focus into the toolbar (keyboard-opened) */
  autoFocus?: boolean;
};

export default function TextSelectionMenu(props: TextSelectionMenuProps) {
  const { onClose, onHighlight, onBookmark, onNote, autoFocus } = props;
  const [showColors, setShowColors] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // portal target only exists after mount
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // outside press + keyboard shortcuts
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (showColors) setShowColors(false);
        else onClose();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (showColors && /^[1-4]$/.test(k)) {
        e.preventDefault();
        onHighlight(HIGHLIGHT_COLORS[Number(k) - 1].value);
      } else if (k === "h") {
        e.preventDefault();
        setShowColors(true);
      } else if (k === "n") {
        e.preventDefault();
        onNote();
      } else if (k === "b") {
        e.preventDefault();
        onBookmark();
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, onHighlight, onBookmark, onNote, showColors]);

  useEffect(() => {
    if (!mounted || !ref.current) return;
    if (autoFocus || showColors) ref.current.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, [mounted, autoFocus, showColors]);

  // arrow keys move along the toolbar
  const onToolbarKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const btns = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button") || []);
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    const next = btns[(i + (e.key === "ArrowRight" ? 1 : -1) + btns.length) % btns.length];
    next?.focus();
    e.preventDefault();
  };

  if (!mounted) return null;

  const btn =
    "inline-flex items-center gap-1.5 min-h-[44px] px-3 bg-transparent text-fg text-[13px] font-semibold hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal";
  const below = props.placement === "below";

  const menu = (
    <div
      ref={ref}
      role="toolbar"
      aria-label={showColors ? "Highlight colour" : "Selection actions"}
      onKeyDown={onToolbarKey}
      onMouseDown={(e) => e.preventDefault()}
      data-sd-chrome=""
      className="fixed z-[9999] flex items-center gap-0.5 p-1 bg-surface-2 border border-line-strong shadow-[0_12px_40px_rgba(0,0,0,0.45)] animate-hk-in"
      style={{ left: `${props.position.x}px`, top: `${props.position.y}px` }}
    >
      {!showColors ? (
        <>
          <button type="button" className={btn} onClick={() => setShowColors(true)} aria-keyshortcuts="H">
            <Highlighter className="w-3.5 h-3.5" aria-hidden="true" />
            Highlight
            <span className="font-mono text-[10px] text-fg-4 font-normal">H</span>
          </button>
          <button type="button" className={btn} onClick={onNote} aria-keyshortcuts="N">
            <StickyNote className="w-3.5 h-3.5" aria-hidden="true" />
            Note
            <span className="font-mono text-[10px] text-fg-4 font-normal">N</span>
          </button>
          <button type="button" className={btn} onClick={onBookmark} aria-keyshortcuts="B">
            <Bookmark className="w-3.5 h-3.5" aria-hidden="true" />
            Bookmark
            <span className="font-mono text-[10px] text-fg-4 font-normal">B</span>
          </button>
        </>
      ) : (
        <>
          <button type="button" className={`${btn} px-2`} onClick={() => setShowColors(false)} aria-label="Back to actions">
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          {HIGHLIGHT_COLORS.map((c, i) => (
            <button
              key={c.value}
              type="button"
              className={`${btn} px-2 font-normal`}
              onClick={() => onHighlight(c.value)}
              aria-label={`Highlight ${c.name} · ${c.label}`}
              title={`${c.label} (${i + 1})`}
            >
              <span className="inline-block w-4 h-4 border border-line-strong" style={{ background: c.swatch }} aria-hidden="true" />
              <span className="hidden sm:inline text-[12px] text-fg-2">{c.label}</span>
            </button>
          ))}
        </>
      )}
      <span aria-hidden="true" className="w-px h-6 bg-line-strong mx-0.5" />
      <button type="button" onClick={onClose} aria-label="Dismiss selection toolbar" className="grid place-items-center w-11 h-11 text-fg-3 hover:text-fg">
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
      <span
        aria-hidden="true"
        className={`absolute left-9 w-2.5 h-2.5 bg-surface-2 border-line-strong rotate-45 ${below ? "-top-[6px] border-l border-t" : "-bottom-[6px] border-r border-b"}`}
      />
    </div>
  );

  return createPortal(menu, document.body);
}
