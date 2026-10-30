"use client";

/**
 * The one Notebook panel of the course, mounted by the Learn layout (and the case files' layout), so it opens on
 * every course page: from the floating pen button, the lesson reading tools' Notebook button, the capture tools
 * (openNotebookPanel()), or the keyboard (N opens and closes it, Esc closes it). Nothing loads until it is first
 * opened: the panel and the ink engine are a separate chunk.
 *
 * Which page it opens comes from where the learner is (ink/global/context.ts): the pathname, plus what the lesson
 * reader publishes. Moving to another piece of content with the panel open (a split, side or bottom: it stays
 * docked) opens that place's page; on a phone, where the panel covers the page, a new page closes it.
 */
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { INK_EVENTS } from "@/lib/learn/ink/types";
import { contextFor, NOTEBOOK_CLOSE, notebookAllowed, useLessonContext } from "./global/context";
import { panelMode } from "./global/panelMode";

/** While the panel's code loads (the first open on a page; under `next dev` the first compile can take seconds): the
 * panel's frame at once, in the same place, so the open is seen to work. */
function PanelLoading() {
  const mode = panelMode();
  const frame =
    mode === "side"
      ? "top-[var(--hk-header-h,61px)] w-[min(480px,42vw)] border-l border-line-strong"
      : mode === "bottom"
        ? "left-0 h-1/2 border-t border-line-strong"
        : "left-0 top-0";
  return (
    <aside role="dialog" aria-label="Notebook" aria-busy="true" data-notebook-panel className={`fixed bottom-0 right-0 z-[72] grid place-items-center bg-bg ${frame}`}>
      <span className="font-mono text-[12px] text-fg-3">opening your notebook…</span>
    </aside>
  );
}

const loadPanel = () => import("./NotebookPanel");
const NotebookPanel = dynamic(loadPanel, { ssr: false, loading: PanelLoading });
/** Fetch the panel's code ahead of a likely open (the pen is hovered, focused or touched). */
export const preloadNotebookPanel = () => void loadPanel().catch(() => undefined);

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable || !!el.closest?.("[contenteditable=''], [contenteditable='true'], [role='textbox']");
};

export default function NotebookPanelHost() {
  const pathname = usePathname() || "";
  const lesson = useLessonContext();
  const allowed = notebookAllowed(pathname);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<{ pageId?: string; n: number }>({ n: 0 });
  const returnFocus = useRef<HTMLElement | null>(null);

  const show = useCallback((pageId?: string) => {
    if (!returnFocus.current) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setTarget((t) => ({ pageId, n: t.n + 1 }));
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    const el = returnFocus.current;
    returnFocus.current = null;
    if (el && el.isConnected) el.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => show((e as CustomEvent<{ pageId?: string }>).detail?.pageId);
    window.addEventListener(INK_EVENTS.open, onOpen);
    window.addEventListener(NOTEBOOK_CLOSE, close);
    return () => {
      window.removeEventListener(INK_EVENTS.open, onOpen);
      window.removeEventListener(NOTEBOOK_CLOSE, close);
    };
  }, [show, close]);

  // N opens / closes it, Esc closes it (never while typing, never over another tool's own use of the key: the
  // selection popover's "N" for a note calls preventDefault, and so do the editors that use Esc)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      if (typing(e.target)) return;
      if ((e.key === "n" || e.key === "N") && !e.repeat) {
        if (!allowed) return;
        // another dialog (search, sign-in, the chat on a phone) has the keyboard
        if (document.querySelector('[aria-modal="true"]:not([data-notebook-panel])')) return;
        e.preventDefault();
        if (open) close();
        else show();
        return;
      }
      if (e.key === "Escape" && open) {
        const panel = document.querySelector("[data-notebook-panel]");
        // a lasso selection, an open menu or popover inside the panel takes Esc first
        if (panel?.querySelector('[data-ink-ui], [aria-expanded="true"], [role="menu"]')) return;
        if (document.querySelector('[aria-modal="true"]:not([data-notebook-panel])')) return;
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allowed, open, show, close]);

  // a new page closes the panel on phones (it covers the page); on a computer it stays docked
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    if (open && (!allowed || panelMode() === "sheet")) setOpen(false);
  }

  if (!open || !allowed) return null;
  const ctx = contextFor(pathname, lesson);
  // a new place, a new lookup (the panel remembers the page per place)
  return <NotebookPanel key={ctx.key ?? "anywhere"} ctx={ctx} target={target} onClose={close} />;
}
