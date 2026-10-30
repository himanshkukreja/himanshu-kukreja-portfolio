"use client";

/**
 * A one-time pointer to the Notebook: "Take notes anywhere…", next to the pen button (or, on a lesson, the reading
 * tools' Notebook button). It shows once per browser, signed in or not: on the first course visit after the
 * notebook went course-wide, or at once the first time a stylus touches a course page. Remembered in localStorage
 * (hk.ink.coach) the moment it shows, so nobody sees it twice; dismissed by its buttons, Esc, or opening the notebook.
 */
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { INK_EVENTS } from "@/lib/learn/ink/types";
import { notebookAllowed, readLS, writeLS } from "./context";
import { NotebookPenIcon } from "./PenIcon";

const SEEN = "hk.ink.coach";
const FIRST_VISIT_DELAY = 2500;

/** The visible Notebook entry on this page: the pen button, else the lesson reading tools' Notebook button. */
function anchor(): HTMLElement | null {
  const cands = [
    ...Array.from(document.querySelectorAll<HTMLElement>("[data-nb-fab]")),
    ...Array.from(document.querySelectorAll<HTMLElement>('[role="toolbar"][aria-label="Reading tools"] button[aria-label^="Notebook"]')),
  ];
  return (
    cands.find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && !el.closest("[inert]");
    }) || null
  );
}

type Pos = { right: number; bottom: number; arrowRight: number };

export default function NotebookCoach() {
  const pathname = usePathname() || "";
  const allowed = notebookAllowed(pathname);
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const dismiss = useCallback(() => setShow(false), []);

  // first visit, or the first stylus touch
  useEffect(() => {
    if (!allowed || show || readLS(SEEN)) return;
    let t = 0;
    const tryShow = () => {
      if (readLS(SEEN)) return;
      if (document.documentElement.classList.contains("hk-nb-open")) return;
      if (!anchor()) return;
      writeLS(SEEN, String(Date.now()));
      setShow(true);
    };
    const onPen = (e: PointerEvent) => {
      if (e.pointerType === "pen") tryShow();
    };
    // the first try after a moment on the page, then again until the entry is on screen (a slow first load)
    t = window.setTimeout(function again() {
      tryShow();
      if (!readLS(SEEN)) t = window.setTimeout(again, 1500);
    }, FIRST_VISIT_DELAY);
    window.addEventListener("pointerdown", onPen, { passive: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointerdown", onPen);
    };
  }, [allowed, show, pathname]);

  // follow the anchor (it moves with the Listen strip, the reading bar sliding away, the window size)
  useEffect(() => {
    if (!show) return;
    let raf = 0;
    const place = () => {
      raf = 0;
      const a = anchor();
      if (!a) return setPos(null);
      const r = a.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const right = Math.max(12, vw - r.right);
      setPos({ right, bottom: window.innerHeight - r.top + 12, arrowRight: Math.max(16, vw - (r.left + r.width / 2) - right - 7) });
    };
    const req = () => {
      if (!raf) raf = requestAnimationFrame(place);
    };
    place();
    const iv = window.setInterval(req, 400);
    window.addEventListener("resize", req);
    window.addEventListener("scroll", req, { passive: true });
    const onOpen = () => setShow(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShow(false);
    };
    window.addEventListener(INK_EVENTS.open, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.clearInterval(iv);
      window.removeEventListener("resize", req);
      window.removeEventListener("scroll", req);
      window.removeEventListener(INK_EVENTS.open, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, [show]);

  if (!show || !allowed || !pos) return null;
  return (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      data-nb-coach
      className="fixed z-[80] w-[min(340px,calc(100vw-24px))] border border-fg bg-fg p-4 text-bg shadow-[0_12px_40px_rgba(0,0,0,0.35)] animate-hk-in"
      style={{ right: pos.right, bottom: pos.bottom }}
    >
      <span aria-hidden className="absolute -bottom-[7px] h-3.5 w-3.5 rotate-45 border-b border-r border-fg bg-fg" style={{ right: pos.arrowRight }} />
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center bg-signal text-on-signal">
          <NotebookPenIcon className="h-[18px] w-[18px]" />
        </span>
        <p className="m-0 flex-1 text-[14.5px] leading-snug">
          <strong className="font-semibold">Take notes anywhere:</strong> tap the pen (or press <kbd className="border border-bg/40 px-1 font-mono text-[12px]">N</kbd>). Write with Apple Pencil, clip text, snip diagrams.
        </p>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center text-bg/70 hover:text-bg">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="mt-3 flex gap-2 pl-12">
        <button
          type="button"
          onClick={() => {
            setShow(false);
            window.dispatchEvent(new CustomEvent(INK_EVENTS.open, { detail: {} }));
          }}
          className="min-h-11 bg-signal px-4 text-[14px] font-semibold text-on-signal"
        >
          Open the notebook
        </button>
        <button type="button" onClick={dismiss} className="min-h-11 border border-bg/40 px-4 text-[14px] text-bg hover:bg-bg/10">
          Got it
        </button>
      </div>
    </div>
  );
}
