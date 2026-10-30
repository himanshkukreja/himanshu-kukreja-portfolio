"use client";

/**
 * The floating pen: the Notebook from any course page. It sits in the bottom-right corner dock with the chat's Ask
 * button (ChatDock renders both in one stack, so they can never overlap), above the phone dock.
 *   tap          open / close the Notebook panel for this page (N does the same)
 *   chevron,     the recent-pages menu: the last few pages (this page's first), New page here, All notes
 *   long-press
 * Not on lesson reader pages (their reading tools have the Notebook button, in the same corner) nor where the
 * panel doesn't open (context.ts: the notebook itself, the Shorts feed, full-screen tools).
 */
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronUp } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { INK_EVENTS } from "@/lib/learn/ink/types";
import { closeNotebookPanel, contextFor, readLS, showPenButton, useLessonContext, useNotebookOpen } from "./context";
import { NotebookPenIcon } from "./PenIcon";
import { preloadNotebookPanel } from "../NotebookPanelHost";

const RecentMenu = dynamic(() => import("./RecentMenu"), { ssr: false, loading: () => <p className="m-0 px-4 py-3 font-mono text-[12px] text-fg-3">loading…</p> });

const LONG_PRESS_MS = 480;
const devStandIn = () => process.env.NODE_ENV === "development" && readLS("hk.ink.dev") === "1";

export default function NotebookFab() {
  const pathname = usePathname() || "";
  const { user } = useAuth();
  const lesson = useLessonContext();
  const open = useNotebookOpen();
  const [menu, setMenu] = useState(false);
  const [canList, setCanList] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const press = useRef<{ t: number; fired: boolean } | null>(null);

  // the menu lists the learner's own pages: signed in (or the dev stand-in)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads localStorage after mount (no SSR mismatch)
    setCanList(!!user || devStandIn());
  }, [user]);

  // a new page closes the menu
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    setMenu(false);
  }

  useEffect(() => {
    if (!menu) return;
    const down = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setMenu(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setMenu(false);
      wrap.current?.querySelector<HTMLElement>("[data-nb-fab]")?.focus();
    };
    document.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key, true);
    // the first row takes the keyboard
    const t = window.setTimeout(() => wrap.current?.querySelector<HTMLElement>("[data-recent-item]")?.focus({ preventScroll: true }), 60);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key, true);
      window.clearTimeout(t);
    };
  }, [menu]);

  if (!showPenButton(pathname)) return null;

  const toggle = () => {
    setMenu(false);
    if (open) closeNotebookPanel();
    else window.dispatchEvent(new CustomEvent(INK_EVENTS.open, { detail: {} }));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" || !canList) return;
    const p = { t: window.setTimeout(() => {
      p.fired = true;
      navigator.vibrate?.(8);
      setMenu(true);
    }, LONG_PRESS_MS), fired: false };
    press.current = p;
  };
  const endPress = () => {
    if (press.current) window.clearTimeout(press.current.t);
  };

  return (
    <div ref={wrap} className="relative flex items-stretch shadow-[0_6px_24px_rgba(0,0,0,0.30)]">
      {menu && (
        <div role="dialog" aria-label="Recent notebook pages" className="absolute bottom-[calc(100%+8px)] right-0 w-[min(340px,calc(100vw-24px))] border border-line-strong bg-bg shadow-[0_12px_40px_rgba(0,0,0,0.28)] animate-hk-in">
          <div className="flex items-baseline justify-between border-b border-line px-4 py-2.5">
            <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">❯ recent pages</span>
            <span className="hidden font-mono text-[11px] text-fg-4 [@media(hover:hover)]:inline">N opens this page&apos;s</span>
          </div>
          <RecentMenu ctx={contextFor(pathname, lesson)} onDone={() => setMenu(false)} />
        </div>
      )}
      <button
        type="button"
        data-nb-fab
        onClick={() => {
          if (press.current?.fired) {
            press.current = null;
            return;
          }
          toggle();
        }}
        onPointerDown={(e) => {
          preloadNotebookPanel();
          onPointerDown(e);
        }}
        onPointerEnter={preloadNotebookPanel}
        onFocus={preloadNotebookPanel}
        onPointerUp={endPress}
        onPointerLeave={endPress}
        onPointerCancel={endPress}
        onContextMenu={(e) => {
          // a long-press on iPad / Android opens the menu, not the system's
          if (canList) {
            e.preventDefault();
            setMenu(true);
          }
        }}
        aria-expanded={open}
        aria-keyshortcuts="N"
        aria-label={open ? "Close the notebook" : "Notebook: take notes on this page"}
        title={open ? "Close the notebook (N)" : "Notebook: take notes here (N)"}
        className={`flex h-12 min-w-12 items-center justify-center gap-2 border px-3 font-mono text-[13px] font-semibold transition-colors [-webkit-touch-callout:none] [-webkit-user-select:none] select-none ${
          open ? "border-fg bg-fg text-bg" : "border-line-strong bg-bg text-fg hover:bg-surface-2"
        }`}
      >
        <NotebookPenIcon />
        <span className="max-sm:sr-only">{open ? "Close" : "Notebook"}</span>
      </button>
      {canList && (
        <button
          type="button"
          onClick={() => setMenu((m) => !m)}
          aria-expanded={menu}
          aria-haspopup="dialog"
          aria-label="Recent notebook pages"
          title="Recent pages"
          className={`grid h-12 w-11 place-items-center border border-l-0 ${open ? "border-fg bg-fg text-bg" : "border-line-strong bg-bg text-fg-2 hover:bg-surface-2 hover:text-fg"} ${menu ? "!bg-surface-2 !text-fg" : ""}`}
        >
          <ChevronUp className={`h-4 w-4 transition-transform ${menu ? "rotate-180" : ""}`} aria-hidden />
        </button>
      )}
    </div>
  );
}
