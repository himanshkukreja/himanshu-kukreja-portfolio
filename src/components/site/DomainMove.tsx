"use client";

/**
 * The course moved to systemdesignmastery.dev (src/lib/site/carry.ts):
 *
 * - CourseLinkCarry (portfolio host): a click on a link to the course host carries this browser's
 *   course state along once, exactly like the old-URL bridge page, so a learner who arrives through
 *   the portfolio (menu, home card) doesn't start from zero. Ordinary clicks only.
 * - MovedNotice (course host): after an import, one quiet line says the progress came along (and,
 *   when the carry had to leave something too big behind, what). Dismissable; shown once.
 */
import { useEffect, useState } from "react";
import { CARRY_JS, MOVED_COOKIE, droppedKinds } from "@/lib/site/carry";
import { COURSE_ORIGIN } from "@/lib/site/hosts";
import { useSite } from "./SiteMode";

type CarryWindow = Window & { __hkCarry?: (target: string) => void };

export function CourseLinkCarry() {
  const site = useSite();
  useEffect(() => {
    if (site !== "portfolio") return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      if (!a.href.startsWith(COURSE_ORIGIN)) return;
      if (document.cookie.split(/;\s*/).some((c) => c.startsWith(`${MOVED_COOKIE}=`))) return;
      const w = window as CarryWindow;
      if (!w.__hkCarry) {
        try {
          new Function(CARRY_JS)();
        } catch {
          return;
        }
      }
      if (!w.__hkCarry) return;
      e.preventDefault();
      w.__hkCarry(a.href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [site]);
  return null;
}

type Moved = { n: number; kept: number; dropped: string[] };

export function MovedNotice() {
  const site = useSite();
  const [moved, setMoved] = useState<Moved | null>(null);
  useEffect(() => {
    if (site !== "course") return;
    let m: Moved | null = null;
    try {
      const raw = sessionStorage.getItem("hk.moved");
      if (!raw) return;
      m = JSON.parse(raw) as Moved;
    } catch {
      /* storage blocked: nothing to say */
    }
    if (!m || !(m.n > 0 || m.dropped?.length)) return;
    const t = setTimeout(() => {
      setMoved(m);
      try {
        sessionStorage.removeItem("hk.moved");
      } catch {
        /* ignore */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [site]);
  useEffect(() => {
    if (!moved) return;
    const t = setTimeout(() => setMoved(null), 12000);
    return () => clearTimeout(t);
  }, [moved]);
  if (!moved) return null;
  const left = droppedKinds(moved.dropped || []);
  return (
    <div role="status" className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+84px)] z-[60] mx-auto flex max-w-[560px] items-start gap-3 border border-line-strong bg-surface px-4 py-3 font-mono text-[12px] leading-relaxed text-fg-2 shadow-lg lg:bottom-6">
      <span className="flex-1">
        System Design Mastery lives at systemdesignmastery.dev now. Your progress on this browser came with you.
        {left.length > 0 && <> Too big to carry over: {left.join(", ")}.</>}
      </span>
      <button type="button" onClick={() => setMoved(null)} aria-label="Dismiss" className="shrink-0 px-1 text-fg-3 hover:text-fg">
        ×
      </button>
    </div>
  );
}
