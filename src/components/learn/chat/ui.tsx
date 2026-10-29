"use client";

/**
 * Small layout pieces the chat views share: a media-query hook, the on-screen keyboard (visualViewport), and
 * the sheet that holds history and context on smaller screens (a drawer from the left or right, or a bottom
 * sheet on phones), above the course dock, with the safe areas respected.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";

/** A CSS media query as state (false on the server and the first render). */
export function useMedia(q: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(q);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(q).matches,
    () => false,
  );
}

/**
 * How much of the bottom of the layout viewport the on-screen keyboard covers (0 when it's down). iOS Safari
 * doesn't resize the page for the keyboard: fixed things at bottom: 0 end up behind it unless they move up by this.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        // ignore the few pixels browser toolbars move by
        setInset(covered > 80 ? Math.round(covered) : 0);
      });
    };
    on();
    vv.addEventListener("resize", on);
    vv.addEventListener("scroll", on);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", on);
      vv.removeEventListener("scroll", on);
    };
  }, []);
  return inset;
}

/** An element's height as state (for padding the thread by the fixed composer's height). */
export function useHeight<T extends HTMLElement>(dep?: unknown): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [h, setH] = useState(0);
  // `dep`: re-attach when the measured element is swapped (a layout change)
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setH(Math.round(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [dep]);
  return [ref, h];
}

/**
 * A drawer (left / right) or a bottom sheet. Closes on Escape, a tap outside, or the close button; focus goes in
 * when it opens and back to where it was when it closes. Above the dock (z 80) with the safe areas inside it.
 */
export function Sheet({ open, onClose, side, label, children, className = "", width = "w-[min(360px,88vw)]" }: { open: boolean; onClose: () => void; side: "left" | "right" | "bottom"; label: string; children: React.ReactNode; className?: string; width?: string }) {
  const panel = useRef<HTMLDivElement>(null);
  // the latest onClose, so a parent re-render doesn't re-run the open effect (and steal focus)
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    const id = window.setTimeout(() => panel.current?.querySelector<HTMLElement>("[data-autofocus], button, a, input")?.focus({ preventScroll: true }), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKey, true);
      html.style.overflow = prev;
      back?.focus?.({ preventScroll: true });
    };
  }, [open]);
  if (!open) return null;
  const pos =
    side === "bottom"
      ? "inset-x-0 bottom-0 max-h-[min(86dvh,calc(100dvh-env(safe-area-inset-top,0px)-24px))] w-full border-t pb-[env(safe-area-inset-bottom,0px)] motion-safe:animate-[hk-sheet-up_180ms_ease-out]"
      : side === "left"
        ? `inset-y-0 left-0 ${width} border-r pl-[env(safe-area-inset-left,0px)] pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] motion-safe:animate-[hk-sheet-left_180ms_ease-out]`
        : `inset-y-0 right-0 ${width} border-l pr-[env(safe-area-inset-right,0px)] pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] motion-safe:animate-[hk-sheet-right_180ms_ease-out]`;
  return (
    <div className="fixed inset-0 z-[80] bg-black/50" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} role="dialog" aria-modal="true" aria-label={label} className={`absolute flex flex-col overflow-hidden border-line-strong bg-surface shadow-[0_12px_48px_rgba(0,0,0,0.5)] ${pos} ${className}`}>
        {side === "bottom" && <span aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 bg-line-strong" />}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-4 py-1.5">
          <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{label}</span>
          <button type="button" onClick={onClose} aria-label={`Close ${label.toLowerCase()}`} className="-mr-2 grid h-11 w-11 place-items-center text-fg-3 hover:text-fg">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
