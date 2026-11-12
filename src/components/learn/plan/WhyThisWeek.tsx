"use client";

/**
 * The living plan's optional "why this week" line (FEATURES "plan-coach", Haiku 5.5): one or two sentences on what this
 * week's sessions build toward and why any recaps come first. The dates and order are the planner's code; the line only
 * explains them. Made on request, then kept for the week (the server reuses it), so it shows by itself on later visits.
 * The page sends the week's plan entry ids; the server names them from the course.
 */
import { useMemo, useState } from "react";
import { userFetch } from "@/components/learn/progress/userFetch";
import { useAiStatus } from "@/components/learn/ai/useAiStatus";
import { daysBetween } from "@/lib/learn/plan/schedule";
import { weekOf } from "@/lib/learner/planning-model";
import { track } from "@/lib/track";
import type { PlanView } from "./usePlan";
import { refreshPlanning } from "./usePlanning";

export default function WhyThisWeek({ view, cached }: { view: PlanView; cached: { text: string; week: string } | null }) {
  const ai = useAiStatus();
  const week = weekOf(view.today);
  const [made, setMade] = useState<{ text: string; week: string } | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "err">("idle");
  const [err, setErr] = useState("");
  const entries = useMemo(() => {
    const end = new Date(Date.parse(`${week}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
    return view.live.days.filter((d) => d.date >= view.today && d.date < end).flatMap((d) => d.entries.filter((e) => !e.done).map((e) => e.id));
  }, [view, week]);
  const line = (made && made.week === week ? made : null) ?? (cached && cached.week === week ? cached : null);
  const aiOn = !!ai?.signedIn && !!ai.features["plan-coach"];
  if (!line && (!aiOn || !entries.length || view.live.problem)) return null;

  const ask = async () => {
    setState("loading");
    const res = await userFetch("/api/learn/planning", {
      method: "POST",
      body: JSON.stringify({ action: "why", plan: view.record.id, week, entries: [...new Set(entries)], standing: { status: view.drift.status, days: view.drift.days, left: daysBetween(view.today, view.settings.target) } }),
    }).catch(() => null);
    const b = (await res?.json().catch(() => null)) as { why?: { text: string; week: string }; error?: string } | null;
    if (res?.ok && b?.why) {
      setMade(b.why);
      setState("idle");
      refreshPlanning();
      track("plan_why", { recaps: entries.filter((e) => e.startsWith("recap:")).length });
    } else {
      setErr(b?.error || "That didn't come through. Try again in a moment.");
      setState("err");
    }
  };

  return (
    <p className="m-0 flex max-w-[860px] flex-wrap items-baseline gap-x-2 gap-y-1 text-[15px] leading-relaxed text-fg-2">
      <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">why this week</span>
      {line ? (
        <span className="min-w-0">{line.text}</span>
      ) : state === "loading" ? (
        <span aria-busy="true" className="inline-block h-4 w-60 animate-pulse bg-surface-2" />
      ) : (
        <>
          <button type="button" onClick={ask} className="min-h-8 font-semibold text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
            ask the coach (one line, AI)
          </button>
          {state === "err" && <span className="text-[13px] text-fg-3">{err}</span>}
        </>
      )}
    </p>
  );
}
