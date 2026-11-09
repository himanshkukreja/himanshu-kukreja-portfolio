"use client";

/**
 * The hub's daily problem card: today's problem, the DSA daily streak and the last seven days. Paints in on the client
 * (the hub itself is cached for a week).
 */
import Link from "next/link";
import { useDsaDaily, useDsaStreak } from "./useDsaDaily";
import { addDays } from "@/lib/learn/arena/shared";

const LEVEL: Record<string, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

export const shortDate = (day: string) => new Date(`${day}T00:00:00.000Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** The last `n` days ending today, oldest first, ticked when the daily was solved. */
export function StreakDots({ days, today, n = 7 }: { days: Set<string>; today: string; n?: number }) {
  const list = Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));
  return (
    <ol aria-label={`Daily problems solved, last ${n} days`} className="m-0 flex list-none gap-1 p-0">
      {list.map((d) => {
        const on = days.has(d);
        return (
          <li
            key={d}
            title={`${shortDate(d)}: ${on ? "solved" : d === today ? "not yet" : "missed"}`}
            className={`h-3 w-3 sm:h-3.5 sm:w-3.5 ${on ? "bg-signal" : d === today ? "border border-dashed border-signal" : "border border-line-strong"}`}
          >
            <span className="sr-only">
              {shortDate(d)}: {on ? "solved" : d === today ? "not yet" : "missed"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function DailyCard() {
  const { data, loading, error } = useDsaDaily();
  const streak = useDsaStreak();
  const d = data?.daily;
  const solvedToday = !!streak?.today;
  return (
    <section aria-labelledby="daily-h" className="flex min-w-0 flex-col gap-3 border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="daily-h" className="m-0 font-mono text-[11px] uppercase tracking-label text-signal-text">
          Daily problem{d ? ` · #${d.number}` : ""}
        </h2>
        <Link href="/dsa/daily" className="font-mono text-[12px] text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg">
          streak &amp; past days →
        </Link>
      </div>
      {loading ? (
        <div aria-busy="true" aria-label="Loading today's problem" className="h-[74px] animate-pulse bg-surface-2" />
      ) : error || !d ? (
        <p className="m-0 text-[14px] text-fg-2">Today&apos;s problem couldn&apos;t load. Please refresh in a minute.</p>
      ) : (
        <Link href={`/dsa/problems/${d.problem.id}`} className="group flex flex-col gap-1">
          <span className="font-display text-[20px] font-bold leading-tight tracking-[-0.02em] text-fg group-hover:underline group-hover:decoration-line-strong group-hover:underline-offset-4">
            {d.problem.title}
          </span>
          <span className="font-mono text-[12px] text-fg-3">
            {LEVEL[d.problem.level]}
            {d.problem.conceptTitle ? ` · ${d.problem.conceptTitle}` : ""}
            {d.problem.minutes ? ` · ~${d.problem.minutes} min` : ""}
          </span>
        </Link>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[12px] text-fg-2">
            {streak ? (
              streak.current > 0 ? (
                <>
                  <span className="font-semibold text-signal-text">{streak.current}-day streak</span>
                  {streak.best > streak.current ? ` · best ${streak.best}` : ""}
                </>
              ) : (
                "No streak yet: solve today's to start one"
              )
            ) : (
              " "
            )}
          </span>
          {streak && data ? <StreakDots days={streak.days} today={data.today} /> : null}
        </div>
        {d ? (
          solvedToday ? (
            <span className="inline-flex min-h-10 items-center border-2 border-ok px-3 font-mono text-[12px] font-semibold uppercase tracking-label text-ok-text">✓ Solved today</span>
          ) : (
            <Link href={`/dsa/problems/${d.problem.id}`} className="inline-flex min-h-10 items-center bg-signal px-3.5 font-mono text-[13px] font-semibold text-on-signal hover:opacity-90">
              Solve today&apos;s →
            </Link>
          )
        ) : null}
      </div>
    </section>
  );
}
