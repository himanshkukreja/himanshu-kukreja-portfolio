"use client";

import { useEffect, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

type Props = {
  children: React.ReactNode;
  sidebarLeft?: React.ReactNode;
  sidebarRight?: React.ReactNode;
  /** controlled focus state; omit for the self-contained version with its own toggle */
  focus?: boolean;
  onFocusChange?: (focus: boolean) => void;
  /** show the left sidebar above the content below 1024px (default true) */
  leftOnMobile?: boolean;
};

/**
 * Three-column reading layout (week rail · article · contents). Focus hides both rails and
 * centres the article; F toggles it. Uncontrolled callers get a floating toggle button,
 * controlled callers (the lesson reader's tools dock) drive `focus` themselves.
 */
export default function FocusMode({ children, sidebarLeft, sidebarRight, focus, onFocusChange, leftOnMobile = true }: Props) {
  const [own, setOwn] = useState(false);
  const controlled = focus !== undefined;
  const isFocus = controlled ? !!focus : own;

  useEffect(() => {
    const set = (f: boolean) => (controlled ? onFocusChange?.(f) : setOwn(f));
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "f" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable) return;
      e.preventDefault();
      set(!isFocus);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [controlled, onFocusChange, isFocus]);

  return (
    <>
      {!controlled && (
        <button
          type="button"
          onClick={() => setOwn((f) => !f)}
          aria-pressed={isFocus}
          aria-label={isFocus ? "Exit focus mode (F)" : "Focus mode (F)"}
          title={isFocus ? "Exit focus mode (F)" : "Focus mode (F)"}
          className="fixed bottom-6 right-6 z-40 hidden min-h-11 items-center gap-2 border border-line-strong bg-surface px-3 font-mono text-xs text-fg hover:bg-surface-2 lg:flex"
        >
          {isFocus ? <Minimize2 className="h-4 w-4" aria-hidden /> : <Maximize2 className="h-4 w-4" aria-hidden />}
          {isFocus ? "exit focus" : "focus"}
        </button>
      )}

      <div
        data-reader-grid
        className={
          isFocus
            ? "grid grid-cols-1 gap-8"
            : "grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_240px] xl:grid-cols-[220px_minmax(0,1fr)_248px] xl:gap-10"
        }
      >
        {sidebarLeft && !isFocus && <aside data-reader-left className={`${leftOnMobile ? "" : "hidden"} min-w-0 lg:hidden xl:block`}>{sidebarLeft}</aside>}
        <article className="w-full min-w-0 max-w-[740px] justify-self-center">{children}</article>
        {sidebarRight && !isFocus && <aside data-reader-right className="hidden min-w-0 lg:block">{sidebarRight}</aside>}
      </div>
    </>
  );
}
