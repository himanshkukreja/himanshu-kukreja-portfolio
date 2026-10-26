"use client";

/**
 * Before the clock starts: what is about to happen in a mock interview, how to answer (type,
 * dictate, the whiteboard, a voice call with the AI interviewer), the live coach switch, and what
 * the debrief gives you. Shown on every start until "don't show this again".
 */
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Clock, Mic, PenTool, Phone, Sparkles, X, Zap } from "lucide-react";
import type { MockInterview } from "@/lib/learn/mock/types";
import { LEVEL_LABEL, type MockLevel } from "@/lib/learn/mock/types";
import { firstName } from "@/lib/learn/mock/engine";

const SKIP_KEY = "hk.mock.briefing.skip";

export function briefingSkipped(): boolean {
  try {
    return window.localStorage.getItem(SKIP_KEY) === "1";
  } catch {
    return false;
  }
}

export default function JoinBriefing({
  mock,
  level,
  open,
  coachAvailable,
  signedIn,
  coachDefault,
  onCancel,
  onJoin,
}: {
  mock: MockInterview;
  level: MockLevel;
  open: boolean;
  coachAvailable: boolean;
  signedIn: boolean;
  coachDefault: boolean;
  onCancel: () => void;
  onJoin: (opts: { coach: boolean }) => void;
}) {
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [coach, setCoach] = useState(coachDefault);
  const [skip, setSkip] = useState(false);
  const joinRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => joinRef.current?.focus(), 50);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = prev;
    };
  }, [open, onCancel]);
  if (!mounted || !open) return null;
  const who = firstName(mock.interviewer.name);
  const curveballs = mock.phases.reduce((a, p) => a + p.curveballs.length, 0);
  const row = "flex gap-3";
  const icon = "mt-0.5 h-4 w-4 shrink-0 text-signal-text";

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/75" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="briefing-h"
        className="relative flex max-h-[92vh] w-full max-w-[640px] animate-hk-in flex-col border border-line-strong bg-surface sm:max-h-[88vh]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">
              before you join · {mock.company.name} · {LEVEL_LABEL[level]} loop
            </span>
            <h2 id="briefing-h" className="m-0 font-display text-[26px] font-bold leading-tight tracking-[-0.02em] text-fg">
              Here&apos;s what happens next
            </h2>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close" className="grid h-10 w-10 shrink-0 place-items-center text-fg-3 hover:text-fg">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5 text-[15px] leading-relaxed text-fg-2 sm:px-6">
          <div className={row}>
            <Clock className={icon} aria-hidden />
            <p className="m-0">
              <strong className="text-fg">One clock starts the moment you join: {mock.minutes} minutes, {mock.phases.length} phases.</strong> Each phase has a budget ({mock.phases.map((p) => `${p.minutes}`).join(" + ")} min). The clock
              runs over budget but never stops you; {who} keeps time and nudges you along. You can pause, but it&apos;s noted, like on a real call.
            </p>
          </div>
          <div className={row}>
            <Zap className={icon} aria-hidden />
            <p className="m-0">
              <strong className="text-fg">{who} talks while you work.</strong> Prompts and follow-ups arrive in the call transcript; pressing Done can bring a reply (the answers to your clarifying questions, for example).{" "}
              {curveballs > 0 && <>Expect {curveballs} curveball{curveballs === 1 ? "" : "s"} that change the problem mid-round; each needs its own answer. </>}
              Hints exist, and each one is noted.
            </p>
          </div>
          <div className={row}>
            <PenTool className={icon} aria-hidden />
            <p className="m-0">
              <strong className="text-fg">Answer however you think best:</strong> type in the answer box, tap <Mic className="inline h-3.5 w-3.5" aria-label="the mic" /> to <strong className="text-fg">dictate</strong> (Chrome, Edge,
              Safari), and draw the design on the <strong className="text-fg">whiteboard</strong> tab: building blocks, technology logos, your own blocks, arrows that stay attached. Everything autosaves in this browser.
            </p>
          </div>
          <div className={row}>
            <Phone className={icon} aria-hidden />
            <p className="m-0">
              <strong className="text-fg">Talk to {who} out loud.</strong>{" "}
              {signedIn ? (
                <>Start a <strong className="text-fg">voice call</strong> in the &ldquo;live with {who}&rdquo; box: you speak, {who} answers out loud, follows up on what you actually said, and throws curveballs, like a real interviewer.</>
              ) : (
                <>Signed in (free), the &ldquo;live with {who}&rdquo; box becomes an AI interviewer you can talk to by voice call: you speak, {who} answers out loud and follows up on what you said.</>
              )}
            </p>
          </div>
          <div className={`${row} border border-line bg-raised p-3.5`}>
            <Sparkles className={icon} aria-hidden />
            <div className="flex flex-col gap-2">
              <p className="m-0">
                <strong className="text-fg">Live coach (AI).</strong> After each phase, a short read on how it went: what landed, the gaps as nudges (never the answer), and one thing to try next. A real interviewer wouldn&apos;t do
                this mid-round, so switch it off for a pure mock.
              </p>
              {coachAvailable ? (
                <label className="flex items-center gap-2 text-[14px] text-fg">
                  <input type="checkbox" checked={coach} onChange={(e) => setCoach(e.target.checked)} className="h-4 w-4 accent-[#FF6B2B]" />
                  Coach me after each phase
                </label>
              ) : (
                <span className="text-[13px] text-fg-3">{signedIn ? "Not available right now." : "Sign in (free) to turn it on."}</span>
              )}
            </div>
          </div>
          <div className={row}>
            <span className={`${icon} font-mono text-[13px]`} aria-hidden>
              ✓
            </span>
            <p className="m-0">
              <strong className="text-fg">At the end, the debrief:</strong> the model answer for every phase, a levelled rubric you score yourself on, a hire / no-hire verdict, your whiteboard, and an AI scorecard if you&apos;re
              signed in.
            </p>
          </div>
          <p className="m-0 border-l-2 border-signal pl-3 text-[14px] text-fg-3">
            Treat it like the real thing: think out loud, write your numbers down, and say which trade-off you are making and why.
          </p>
        </div>

        <div className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <label className="flex items-center gap-2 font-mono text-[12px] text-fg-3">
            <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} className="h-3.5 w-3.5 accent-[#FF6B2B]" />
            don&apos;t show this again
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="min-h-12 flex-1 border border-line-strong px-4 text-[15px] text-fg hover:border-fg-3 sm:flex-none">
              Not yet
            </button>
            <button
              ref={joinRef}
              type="button"
              onClick={() => {
                if (skip)
                  try {
                    window.localStorage.setItem(SKIP_KEY, "1");
                  } catch {
                    /* ignore */
                  }
                onJoin({ coach: coachAvailable ? coach : false });
              }}
              className="min-h-12 flex-[2] bg-signal px-5 text-[15px] font-semibold text-on-signal hover:opacity-90 sm:flex-none"
            >
              I&apos;m ready · start the clock
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
