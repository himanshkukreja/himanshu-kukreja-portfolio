"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bookmark, ChevronLeft, ClipboardCopy, Highlighter, MessageCircleQuestion, StickyNote, X } from "lucide-react";
import { HIGHLIGHT_COLOURS } from "@/lib/learn/notebook";
import type { AskClient } from "@/lib/learn/askAi";

/** Monochrome marks for the AI clients (currentColor, 16px). */
export function ClaudeMark({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4" />
    </svg>
  );
}

export function ChatGptMark({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z" />
      <path d="M12 8.2l3.3 1.9v3.8L12 15.8l-3.3-1.9v-3.8z" />
    </svg>
  );
}

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
  /** highlight / note / bookmark (lessons); without them the toolbar shows the Ask actions directly */
  onHighlight?: (color: string) => void;
  onBookmark?: () => void;
  onNote?: () => void;
  /** "Ask Claude" / "Ask ChatGPT": open the client with the selection and its context */
  onAsk?: (client: AskClient) => void;
  /** "Copy as prompt" */
  onCopyPrompt?: () => void;
  onClose: () => void;
  /** where the arrow points: "above" = toolbar sits above the selection (default);
   *  "sheet" = docked to the bottom of the screen (touch: clear of the native selection UI) */
  placement?: "above" | "below" | "sheet";
  /** move focus into the toolbar (keyboard-opened) */
  autoFocus?: boolean;
};

type Panel = "main" | "colors" | "ask";

export default function TextSelectionMenu(props: TextSelectionMenuProps) {
  const { onClose, onHighlight, onBookmark, onNote, onAsk, onCopyPrompt, autoFocus } = props;
  const notes = !!(onHighlight || onNote || onBookmark);
  const ask = !!(onAsk || onCopyPrompt);
  const [panel, setPanel] = useState<Panel>("main");
  // with no notebook actions (case files) the Ask actions are the main panel
  const view: Panel = !notes && ask && panel === "main" ? "ask" : panel;
  const showColors = view === "colors";
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
        if (panel !== "main") setPanel("main");
        else onClose();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (view === "colors" && onHighlight && /^[1-4]$/.test(k)) {
        e.preventDefault();
        onHighlight(HIGHLIGHT_COLORS[Number(k) - 1].value);
      } else if (view === "ask" && onAsk && (k === "c" || k === "g")) {
        e.preventDefault();
        onAsk(k === "c" ? "claude" : "chatgpt");
      } else if (view === "ask" && onCopyPrompt && k === "p") {
        e.preventDefault();
        onCopyPrompt();
      } else if (k === "h" && onHighlight) {
        e.preventDefault();
        setPanel("colors");
      } else if (k === "n" && onNote) {
        e.preventDefault();
        onNote();
      } else if (k === "b" && onBookmark) {
        e.preventDefault();
        onBookmark();
      } else if (k === "a" && ask && notes) {
        e.preventDefault();
        setPanel("ask");
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, onHighlight, onBookmark, onNote, onAsk, onCopyPrompt, panel, view, ask, notes]);

  useEffect(() => {
    if (!mounted || !ref.current) return;
    if (autoFocus || panel !== "main") ref.current.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, [mounted, autoFocus, panel]);

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

  const sheet = props.placement === "sheet";
  const btn = `inline-flex items-center gap-1.5 bg-transparent text-fg font-semibold hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal ${
    sheet ? "min-h-[52px] min-w-0 flex-1 flex-col justify-center gap-1 px-1 text-[12px] leading-none" : "min-h-[44px] px-3 text-[13px]"
  }`;
  const below = props.placement === "below";
  const key = sheet ? "hidden" : "font-mono text-[10px] text-fg-4 font-normal";

  const menu = (
    <div
      ref={ref}
      role="toolbar"
      aria-label={showColors ? "Highlight colour" : view === "ask" ? "Ask an AI about the selection" : "Selection actions"}
      onKeyDown={onToolbarKey}
      onMouseDown={(e) => e.preventDefault()}
      data-sd-chrome=""
      className={`fixed z-[9999] flex items-center gap-0.5 p-1 bg-surface-2 border border-line-strong shadow-[0_12px_40px_rgba(0,0,0,0.45)] animate-hk-in ${
        sheet ? "inset-x-2 bottom-[calc(env(safe-area-inset-bottom,0px)+8px)]" : ""
      }`}
      style={sheet ? undefined : { left: `${props.position.x}px`, top: `${props.position.y}px` }}
    >
      {view === "main" && (
        <>
          {onHighlight && (
            <button type="button" className={btn} onClick={() => setPanel("colors")} aria-keyshortcuts="H">
              <Highlighter className="w-3.5 h-3.5" aria-hidden="true" />
              Highlight
              <span className={key}>H</span>
            </button>
          )}
          {onNote && (
            <button type="button" className={btn} onClick={onNote} aria-keyshortcuts="N">
              <StickyNote className="w-3.5 h-3.5" aria-hidden="true" />
              Note
              <span className={key}>N</span>
            </button>
          )}
          {onBookmark && (
            <button type="button" className={btn} onClick={onBookmark} aria-keyshortcuts="B">
              <Bookmark className="w-3.5 h-3.5" aria-hidden="true" />
              {sheet ? "Save" : "Bookmark"}
              <span className={key}>B</span>
            </button>
          )}
          {ask && (
            <button type="button" className={btn} onClick={() => setPanel("ask")} aria-keyshortcuts="A" aria-label="Ask AI: Claude or ChatGPT">
              <MessageCircleQuestion className="w-3.5 h-3.5" aria-hidden="true" />
              Ask AI
              <span className={key}>A</span>
            </button>
          )}
        </>
      )}
      {view === "ask" && (
        <>
          {notes && (
            <button type="button" className={`${btn} px-2 ${sheet ? "!w-11 !flex-none" : ""}`} onClick={() => setPanel("main")} aria-label="Back to actions">
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
          {onAsk && (
            <>
              <button type="button" className={btn} onClick={() => onAsk("claude")} aria-keyshortcuts="C" aria-label="Ask Claude about this (opens claude.ai in a new tab)">
                <ClaudeMark className="w-3.5 h-3.5" />
                {sheet ? "Claude" : "Ask Claude"}
                <span className={key}>C</span>
              </button>
              <button type="button" className={btn} onClick={() => onAsk("chatgpt")} aria-keyshortcuts="G" aria-label="Ask ChatGPT about this (opens chatgpt.com in a new tab)">
                <ChatGptMark className="w-3.5 h-3.5" />
                {sheet ? "ChatGPT" : "Ask ChatGPT"}
                <span className={key}>G</span>
              </button>
            </>
          )}
          {onCopyPrompt && (
            <button type="button" className={btn} onClick={onCopyPrompt} aria-keyshortcuts="P" aria-label="Copy as a prompt for any AI">
              <ClipboardCopy className="w-3.5 h-3.5" aria-hidden="true" />
              {sheet ? "Copy" : "Copy prompt"}
              <span className={key}>P</span>
            </button>
          )}
        </>
      )}
      {view === "colors" && onHighlight && (
        <>
          <button type="button" className={`${btn} px-2 ${sheet ? "!w-11 !flex-none" : ""}`} onClick={() => setPanel("main")} aria-label="Back to actions">
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
      {!sheet && (
        <span
          aria-hidden="true"
          className={`absolute left-9 w-2.5 h-2.5 bg-surface-2 border-line-strong rotate-45 ${below ? "-top-[6px] border-l border-t" : "-bottom-[6px] border-r border-b"}`}
        />
      )}
    </div>
  );

  return createPortal(menu, document.body);
}
