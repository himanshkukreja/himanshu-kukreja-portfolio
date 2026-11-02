"use client";

/**
 * The course moved to systemdesignmastery.dev (src/lib/site/carry.ts):
 *
 * - CourseLinkCarry (portfolio host): a click on a link to the course host carries this browser's
 *   course state along once, exactly like the old-URL bridge page, so a learner who arrives through
 *   the portfolio (menu, home card) doesn't start from zero. Ordinary clicks only.
 * - MovedNotice (course host): after an import, one quiet line says the progress came along (and,
 *   when the carry had to leave something too big behind, what). Dismissable; shown once.
 * - SignInOnce (course host): a learner who was signed in on himanshukukreja.in arrives signed out
 *   (sessions are per site and never travel in a URL). Until they sign in here or dismiss it, a banner
 *   says the course has a new home and offers one-tap sign-in, so nobody thinks their progress is gone.
 */
import { useEffect, useState } from "react";
import { CARRY_JS, MOVED_COOKIE, SIGNIN_KEY, droppedKinds } from "@/lib/site/carry";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { holdAttention } from "@/lib/learn/guide/attention";
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

type Moved = { n: number; kept: number; dropped: string[]; s?: number };

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
    // a signed-in learner gets the sign-in banner instead (it says the same thing, plus the button)
    if (m.s) return;
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

/** Was signed in on the old domain, not signed in here yet: one banner with a one-tap sign-in (14 days at most). */
export function SignInOnce() {
  const site = useSite();
  const { user, loading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [show, setShow] = useState(false);
  const clear = () => {
    try {
      localStorage.removeItem(SIGNIN_KEY);
    } catch {
      /* ignore */
    }
    setShow(false);
    setHold(false);
  };
  useEffect(() => {
    if (site !== "course" || loading) return;
    let at = 0;
    try {
      at = Number(localStorage.getItem(SIGNIN_KEY)) || 0;
    } catch {
      return;
    }
    if (!at) return;
    if (user || Date.now() - at > 14 * 864e5) {
      // signed in (or too old): forget the flag; `show` is already false here
      try {
        localStorage.removeItem(SIGNIN_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    const t = setTimeout(() => setShow(true), 600);
    return () => clearTimeout(t);
  }, [site, user, loading]);
  // one first-visit popup at a time: from the first moment a returning learner is detected (before the sign-in
  // check finishes) the notebook tip and the welcome card wait; released once signed in or dismissed
  const [hold, setHold] = useState(() => {
    try {
      return typeof window !== "undefined" && !!localStorage.getItem(SIGNIN_KEY);
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!hold || user || site !== "course") return;
    return holdAttention();
  }, [hold, user, site]);
  if (!show || user) return null;
  return (
    <div role="region" aria-label="Sign in on the new domain" className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)+84px)] z-[60] mx-auto flex max-w-[560px] flex-col gap-3 border border-signal bg-surface px-4 py-3 shadow-lg sm:flex-row sm:items-center lg:bottom-6">
      <p className="m-0 flex-1 text-[14px] leading-snug text-fg">
        <span className="font-semibold">System Design Mastery has a new home.</span> Sign in once here to pick up where you left off: your progress, notes and certificates are on your account.
      </p>
      <span className="flex shrink-0 items-center gap-2">
        <button type="button" onClick={openAuthModal} className="min-h-11 bg-signal px-4 font-mono text-[12px] font-semibold text-on-signal">
          Sign in
        </button>
        <button type="button" onClick={clear} aria-label="Dismiss" className="min-h-11 px-2 text-fg-3 hover:text-fg">
          ×
        </button>
      </span>
    </div>
  );
}
