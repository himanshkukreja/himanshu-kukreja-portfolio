"use client";

/**
 * The sign-in gate, in the browser (src/lib/gate/flag.ts has the why and the switch; src/lib/gate/split.ts marks the
 * gated text on the server).
 *
 * - <GateSync /> (root layout): keeps html.hk-guest in step with the real auth state after hydration, and reports
 *   gate_unlocked once a sign-in started from a gate completes (in place, or back from Google's redirect).
 * - <SignInGate kind /> (after an article's body): the card the gated text fades into. Rendered for everyone,
 *   shown by CSS for guests only, so neither a guest nor a member sees the wrong state before hydration.
 * - <GateNotice /> (a locked feature: hints, the editorial, …): the same message, compact, rendered by React.
 * - useSignInGate(kind): `locked` for a signed-out reader (gate on), and `ask(feature)` opens the sign-in dialog.
 */
import { useCallback, useEffect, useId, useRef } from "react";
import { Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { track } from "@/lib/track";
import { GATE_ON, GUEST_CLASS, gateCourse } from "@/lib/gate/flag";
import { GATED_CLASS } from "@/lib/gate/split";

/** the page type in the gate's analytics: lesson, lld, side-quest, case-file, war-story, dsa-concept, dsa-problem, lecture, lab, listen… */
export type GateKind = string;

const PENDING_KEY = "hk.gate.pending";
const here = () => (typeof window === "undefined" ? "/" : window.location.pathname);

function remember(kind: GateKind, feature: string) {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ kind, feature, course: gateCourse(here()) }));
  } catch {}
}

export function useSignInGate(kind: GateKind) {
  const { user, loading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const locked = GATE_ON && !loading && !user;
  const ask = useCallback(
    (feature: string) => {
      track("gate_signin_click", { course: gateCourse(here()), page: kind, feature });
      remember(kind, feature);
      openAuthModal();
    },
    [kind, openAuthModal],
  );
  /** for an action: true (and the sign-in dialog opens) when a guest tries it */
  const blocked = useCallback(
    (feature: string) => {
      if (!locked) return false;
      track("gate_shown", { course: gateCourse(here()), page: kind, feature });
      ask(feature);
      return true;
    },
    [locked, ask, kind],
  );
  return { on: GATE_ON, locked, ask, blocked };
}

export function GateSync() {
  const { user, loading } = useAuth();
  useEffect(() => {
    if (!GATE_ON || loading) return;
    document.documentElement.classList.toggle(GUEST_CLASS, !user);
    if (!user) return;
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      if (!raw) return;
      sessionStorage.removeItem(PENDING_KEY);
      const p = JSON.parse(raw) as { kind?: string; feature?: string; course?: string };
      track("gate_unlocked", { course: p.course || gateCourse(here()), page: p.kind || "", feature: p.feature || "" });
    } catch {}
  }, [user, loading]);
  return null;
}

const PERKS = ["the AI tutor that remembers you", "progress that syncs", "notes", "mock interviews", "running code"];

/** The card an article's gated text fades into (guests only, by CSS). */
export default function SignInGate({ kind, className = "" }: { kind: GateKind; className?: string }) {
  const { user, loading } = useAuth();
  const { ask } = useSignInGate(kind);
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  const shown = useRef(false);

  // the gated text is out of reach for a guest: not focusable, not read out (display:none already hides all but the peek)
  useEffect(() => {
    if (!GATE_ON || loading) return;
    document.querySelectorAll<HTMLElement>(`.${GATED_CLASS}`).forEach((el) => {
      if (user) {
        el.removeAttribute("inert");
        el.removeAttribute("aria-hidden");
      } else {
        el.setAttribute("inert", "");
        el.setAttribute("aria-hidden", "true");
      }
    });
  }, [user, loading]);

  // gate_shown once, when a guest actually reaches the card
  useEffect(() => {
    const el = ref.current;
    if (!GATE_ON || !el || loading || user || shown.current) return;
    const io = new IntersectionObserver(
      (es) => {
        if (shown.current || !es.some((e) => e.isIntersecting) || !document.documentElement.classList.contains(GUEST_CLASS)) return;
        shown.current = true;
        track("gate_shown", { course: gateCourse(here()), page: kind, feature: "read" });
        io.disconnect();
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [kind, user, loading]);

  if (!GATE_ON) return null;
  return (
    <section ref={ref} aria-labelledby={titleId} tabIndex={-1} data-gate-card="" className={`hk-gate-card relative mx-auto w-full max-w-[760px] border border-line bg-raised p-5 outline-none focus-visible:ring-2 focus-visible:ring-signal sm:p-7 ${className}`}>
      <div className="flex flex-col gap-3">
        <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-signal-text">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          free for now
        </span>
        <h2 id={titleId} className="m-0 font-display text-[26px] font-extrabold leading-[1.02] tracking-[-0.035em] text-fg sm:text-[30px]">
          Sign in to keep reading<span className="text-signal-text">.</span>
        </h2>
        <p className="m-0 text-[15px] leading-relaxed text-fg-2">
          The whole course is free right now. Sign in to read the rest of this page and unlock {PERKS.slice(0, -1).join(", ")} and {PERKS[PERKS.length - 1]}.
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
          <button type="button" onClick={() => ask("read")} className="min-h-[48px] bg-signal px-6 font-semibold text-on-signal hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal">
            Sign in to keep reading
          </button>
          <span className="font-mono text-[11px] text-fg-3">Google or email · takes a few seconds</span>
        </div>
      </div>
    </section>
  );
}

/** A locked feature (hints, the editorial, Run): the same invitation, compact. Render it only when `locked`. */
export function GateNotice({ kind, feature, title, body, className = "" }: { kind: GateKind; feature: string; title: string; body?: string; className?: string }) {
  const { ask } = useSignInGate(kind);
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    track("gate_shown", { course: gateCourse(here()), page: kind, feature });
  }, [kind, feature]);
  return (
    <div role="region" aria-label={title} className={`flex flex-col gap-2.5 border border-line bg-raised p-4 sm:p-5 ${className}`}>
      <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-signal-text">
        <Lock className="h-3.5 w-3.5" aria-hidden />
        free for now
      </span>
      <p className="m-0 text-[16px] font-semibold text-fg">{title}</p>
      <p className="m-0 text-[14px] leading-relaxed text-fg-2">{body ?? "The whole course is free right now. Signing in also unlocks the AI tutor that remembers you, progress sync, notes, mock interviews and running code."}</p>
      <button type="button" onClick={() => ask(feature)} className="min-h-11 self-start bg-signal px-5 text-[15px] font-semibold text-on-signal hover:brightness-110">
        Sign in free
      </button>
    </div>
  );
}
