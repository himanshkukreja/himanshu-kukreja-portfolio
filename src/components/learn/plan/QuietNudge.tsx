"use client";

/**
 * The quiet nudge (owner-approved 12 Nov 2026, the AI audit's O7): ONE line, never a pop-up, on the progress page and the
 * course and DSA homes. A topic missed twice in 14 days comes first ("You missed Consistent hashing twice in the last two
 * weeks. 3-minute recap?"); else, when there is a study plan, how it stands ("2 study days behind your plan to 15 Dec").
 * At most one at a time; ✕ dismisses it and is remembered (game flag pref:nudges) until a new miss, or for the plan line
 * until next week. The recap opens in place: an on-demand AI recap grounded in the course's text for that topic
 * (FEATURES "concept-recap"), or the lesson section itself when AI is off. Signed-in learners only.
 */
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import type { CourseMap } from "@/lib/learn/types";
import type { LessonProgress } from "@/lib/learn/progress";
import { fmtDate } from "@/components/learn/progress/derive";
import { userFetch } from "@/components/learn/progress/userFetch";
import { useAiStatus } from "@/components/learn/ai/useAiStatus";
import { track } from "@/lib/track";
import { pickNudge, planLine, type PlanStanding, type StruggleCourse } from "@/lib/learner/planning-model";
import { computePlan, usePlanRecord, useToday } from "./usePlan";
import { usePlanning } from "./usePlanning";

/** How the learner's /plan stands today (null: no plan, or not loaded yet). */
export function usePlanStanding(map: CourseMap | null, lessons: Record<string, LessonProgress> | null, done: Record<string, number> | null): PlanStanding | null {
  const today = useToday();
  const { record } = usePlanRecord();
  return useMemo(() => {
    if (!map || !lessons || !done || !record || !today) return null;
    const v = computePlan(map, record, lessons, done, today);
    return { status: v.drift.status, days: v.drift.days, fits: v.live.fits, target: v.settings.target, past: v.live.problem === "past" };
  }, [map, lessons, done, record, today]);
}

/** **bold** and `code` in a recap, as elements (nothing else is markup). */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold text-fg">
            {p.slice(2, -2)}
          </strong>
        ) : p.startsWith("`") && p.endsWith("`") ? (
          <code key={i} className="font-mono text-[0.92em]">
            {p.slice(1, -1)}
          </code>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

export default function QuietNudge({ course, standing, className = "" }: { course?: StruggleCourse; standing?: PlanStanding | null; className?: string }) {
  const p = usePlanning();
  const ai = useAiStatus();
  const today = useToday();
  const [recap, setRecap] = useState<{ key: string; state: "loading" | "ok" | "err"; text?: string; href?: string; err?: string } | null>(null);
  const nudge = useMemo(() => {
    if (!p.signedIn || !p.ready || !today) return null;
    return pickNudge({ struggles: p.struggles, prefs: p.prefs, plan: planLine(standing ?? null, (d) => fmtDate(d)), today, course });
  }, [p.signedIn, p.ready, p.struggles, p.prefs, standing, today, course]);

  // an open recap takes the nudge's place (opening it marks the nudge done, so the next one waits until it is closed)
  const open = recap;
  if (!nudge && !open) return null;
  const aiOn = !!ai?.signedIn && !!ai.features["concept-recap"];

  const askRecap = async (key: string, href: string) => {
    p.opened(key);
    track("nudge_recap", { topic: key.split(":")[0], ai: aiOn });
    if (!aiOn) {
      window.location.assign(href);
      return;
    }
    setRecap({ key, state: "loading", href });
    const r = await userFetch("/api/learn/planning", { method: "POST", body: JSON.stringify({ action: "recap", key }) }).catch(() => null);
    const b = (await r?.json().catch(() => null)) as { recap?: { text: string; href: string }; error?: string; href?: string } | null;
    if (r?.ok && b?.recap) setRecap({ key, state: "ok", text: b.recap.text, href: b.recap.href });
    else setRecap({ key, state: "err", err: b?.error || "The recap didn't come through.", href: b?.href || href });
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {nudge && !open && (
        <p role="status" className="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[14px] leading-relaxed text-fg-2">
          <span aria-hidden className={`font-mono text-[11px] uppercase tracking-label ${nudge.kind === "plan" && nudge.tone === "ok" ? "text-fg-3" : "text-signal-text"}`}>
            {nudge.kind === "plan" ? "plan" : "heads-up"}
          </span>
          <span className="min-w-0">{nudge.text}</span>
          {nudge.kind === "struggle" ? (
            <button type="button" onClick={() => askRecap(nudge.key, nudge.href)} className="min-h-8 font-semibold text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
              3-minute recap?
            </button>
          ) : (
            <Link href={nudge.href} className="min-h-8 font-semibold text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
              open plan
            </Link>
          )}
          <button type="button" onClick={() => p.dismiss(nudge.key)} aria-label="Dismiss" title="Dismiss" className="-my-1 grid h-8 w-8 place-items-center text-fg-4 hover:text-fg">
            ✕
          </button>
        </p>
      )}
      {open && (
        <section aria-label="Recap" className="flex flex-col gap-3 border-l-2 border-signal bg-surface px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">3-minute recap{open.state === "ok" ? " · AI, from the lesson" : ""}</span>
            <button type="button" onClick={() => setRecap(null)} aria-label="Close the recap" className="-my-1 grid h-8 w-8 place-items-center text-fg-4 hover:text-fg">
              ✕
            </button>
          </div>
          {open.state === "loading" ? (
            <div aria-busy="true" className="h-[96px] animate-pulse bg-bg" />
          ) : open.state === "ok" ? (
            <div className="flex max-w-[760px] flex-col gap-2.5 text-[15px] leading-relaxed text-fg-2">
              {(open.text || "")
                .split(/\n{2,}/)
                .filter((x) => x.trim())
                .map((para, i) => (
                  <p key={i} className="m-0">
                    <Inline text={para.trim()} />
                  </p>
                ))}
            </div>
          ) : (
            <p className="m-0 text-[14px] text-fg-3">{open.err}</p>
          )}
          {open.href && (
            <Link href={open.href} className="self-start font-mono text-[13px] text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
              read the lesson section →
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
