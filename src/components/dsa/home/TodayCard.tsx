"use client";

/**
 * Today: the daily goal (from the onboarding's pace answer; "one lesson step" until they pick one), two goal pips, the
 * streak, the review cards due and today's problem. Merges the old TodayLine, HubToday, DailyCard and ReviseCard. On phones
 * the same numbers are two small tiles (cards due, streak) under Continue.
 */
import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { useGame } from "@/game/GameProvider";
import { useReviewCards } from "@/lib/learn/useReviewDue";
import { localDay } from "@/lib/dsa/revise";
import { useDsaDaily, useDsaStreak } from "../daily/useDsaDaily";
import { useActivityStreak } from "../progress/useActivityStreak";
import { useResolves } from "../revise/useResolves";
import { useOnboardingRecord } from "../onboarding/useOnboarding";
import { CARD_H, SIDE_CARD } from "../ui/kit";

const STEP_KEYS = ["dsa:s:", "dsa:cpq:", "dsa:lab:"];

/** Goal units done today: a lesson step (a beat, a quiz or a lab) counts 2, a solved problem 1 (so "one step or two problems"). */
export function goalUnitsToday(done: Record<string, number>, today: string): number {
  let units = 0;
  for (const [k, at] of Object.entries(done)) {
    if (!k.startsWith("dsa:") || !at || localDay(at) !== today) continue;
    if (k.startsWith("dsa:p:")) units += 1;
    else if (STEP_KEYS.some((p) => k.startsWith(p))) units += 2;
  }
  return units;
}

export function goalOf(minutes: number | null | undefined): { text: string; pips: number } {
  if (minutes === 60) return { text: "two lesson steps or four problems", pips: 4 };
  if (minutes === 30) return { text: "one lesson step or two problems", pips: 2 };
  if (minutes === 15) return { text: "one lesson step or two problems", pips: 2 };
  return { text: "one lesson step", pips: 2 };
}

function useToday() {
  const { done, hydrated } = useGame();
  const rec = useOnboardingRecord();
  const streak = useDsaStreak();
  const main = useActivityStreak();
  const { data } = useDsaDaily();
  const r = useResolves();
  const { due, ready } = useReviewCards("dsa");
  const goal = goalOf(rec?.pace.minutes);
  // the learner's local day, known only in the browser
  const today = useSyncExternalStore(
    () => () => {},
    () => localDay(Date.now()),
    () => "",
  );
  const units = useMemo(() => (hydrated && today ? goalUnitsToday(done, today) : 0), [done, hydrated, today]);
  const n = r.due.length + due.length;
  return { days: main?.current ?? 0, goal, units: Math.min(goal.pips, units), streak, daily: data?.daily ?? null, n, cardsReady: r.ready && ready, hydrated };
}

const CARD = `${SIDE_CARD} !gap-3.5`;

export default function TodayCard() {
  const t = useToday();
  const days = t.days;
  return (
    <section aria-labelledby="dsa-today-h" className={CARD}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="dsa-today-h" className={CARD_H}>
          Today
        </h2>
        <span className="font-mono text-[12px] text-fg-3">{days > 0 ? `${days}-day streak` : "No streak yet"}</span>
      </div>
      <p className="m-0 text-[14px] text-fg-2">Goal: {t.goal.text}</p>
      <div
        className="flex gap-1.5"
        role="img"
        aria-label={t.units >= t.goal.pips ? "Goal met today" : `${t.units} of ${t.goal.pips} goal points today (a lesson step is 2, a problem is 1)`}
        title={t.units >= t.goal.pips ? "Goal met today" : "A lesson step is 2 points, a problem is 1"}
      >
        {Array.from({ length: t.goal.pips }, (_, i) => (
          <span key={i} className={`h-2 flex-1 rounded-full ${i < t.units ? "bg-signal" : "bg-line dark:bg-line-strong"}`} />
        ))}
      </div>
      <Link href="/dsa/review" className="flex min-h-11 items-center justify-between gap-3 rounded-[10px] bg-bg px-3.5 py-3 text-[14px] font-medium text-fg hover:bg-surface-2">
        <span>{!t.cardsReady ? "Review cards" : t.n ? `${t.n} review ${t.n === 1 ? "card" : "cards"} due` : "Nothing due to review"}</span>
        <span className="shrink-0 text-fg-3">{t.cardsReady && t.n ? `${Math.max(1, Math.round(t.n * 0.6))} min →` : "Open →"}</span>
      </Link>
      {t.daily ? (
        <Link href={`/dsa/problems/${t.daily.problem.id}`} className="flex min-h-11 flex-col justify-center gap-0.5 text-[14px] text-fg hover:text-signal-text">
          <span className="flex items-center gap-1.5 font-mono text-[11.5px] uppercase tracking-[0.06em] text-fg-3">
            {t.streak?.today ? <Check className="h-3.5 w-3.5 shrink-0 text-ok-text" aria-label="solved today" /> : null}
            Today&apos;s problem{t.streak?.today ? " · solved" : ""}
          </span>
          <span className="min-w-0 font-medium">{t.daily.problem.title}</span>
        </Link>
      ) : null}
    </section>
  );
}

/** The phone's two small tiles under Continue: cards due, and the streak with the goal. */
export function TodayTiles() {
  const t = useToday();
  const days = t.days;
  return (
    <div className="grid grid-cols-2 gap-2.5 lg:hidden">
      <Link href="/dsa/review" className="flex min-h-[68px] flex-col justify-center gap-1 rounded-[14px] border border-line bg-surface p-3.5 hover:bg-surface-2">
        <span className="text-[15px] font-semibold text-fg">{!t.cardsReady ? "Cards" : t.n ? `${t.n} ${t.n === 1 ? "card" : "cards"} due` : "None due"}</span>
        <span className="text-[13px] text-fg-3">Review{t.cardsReady && t.n ? ` · ${Math.max(1, Math.round(t.n * 0.6))} min` : ""}</span>
      </Link>
      <Link href="/dsa/practice?list=daily" className="flex min-h-[68px] flex-col justify-center gap-1 rounded-[14px] border border-line bg-surface p-3.5 hover:bg-surface-2">
        <span className="text-[15px] font-semibold text-fg">{days > 0 ? `${days}-day streak` : "No streak yet"}</span>
        <span className="text-[13px] text-fg-3">
          {t.units >= t.goal.pips ? "Goal met today" : `Goal ${t.units} of ${t.goal.pips} today`}
        </span>
      </Link>
    </div>
  );
}
