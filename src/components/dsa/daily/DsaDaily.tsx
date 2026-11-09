"use client";

/**
 * /dsa/daily: today's problem, the DSA daily streak (current, best, days solved) and the previous 13 days, each with
 * that day's problem (a past day's problem stays open as practice; only the day itself counts for the streak).
 */
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import DsaCrumbs from "../DsaCrumbs";
import { StreakDots, shortDate } from "./DailyCard";
import { useDsaDaily, useDsaStreak } from "./useDsaDaily";
import { useDsaProgress } from "../progress/useDsaProgress";

const LEVEL: Record<string, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex flex-col gap-1 bg-surface p-4">
      <span className="font-display text-[30px] font-extrabold leading-none tracking-[-0.03em] text-fg">{value}</span>
      <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{label}</span>
    </div>
  );
}

export default function DsaDaily() {
  const { data, loading, error } = useDsaDaily();
  const streak = useDsaStreak();
  const progress = useDsaProgress();
  const { user, loading: authLoading } = useAuth();
  const d = data?.daily;
  const today = data?.today;

  return (
    <div className="dsa-theme">
      <main className="mx-auto flex max-w-[1100px] flex-col gap-8 px-4 pb-24 pt-8 sm:px-6">
        <header className="flex flex-col gap-2">
          <DsaCrumbs items={[{ href: "/dsa", label: "DSA Mastery" }, { label: "Daily problem" }]} />
          <span className="font-mono text-xs uppercase tracking-label text-signal-text">Daily problem{d ? ` · #${d.number} · ${shortDate(d.date)}` : ""}</span>
          <h1 className="m-0 font-display text-[36px] font-extrabold leading-none tracking-[-0.03em] text-fg sm:text-[48px]">
            One problem a day<span className="text-signal-text">.</span>
          </h1>
          <p className="m-0 max-w-[680px] text-[16px] leading-relaxed text-fg-2">
            The same problem for everyone, new at midnight India time. Get it Accepted the same day to keep your daily streak going.
          </p>
        </header>

        <section aria-labelledby="today-h" className="grid gap-px border border-line bg-line lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-3 bg-surface p-5 sm:p-6">
            <h2 id="today-h" className="m-0 font-mono text-[11px] uppercase tracking-label text-fg-3">
              Today
            </h2>
            {loading ? (
              <div aria-busy="true" aria-label="Loading today's problem" className="h-[120px] animate-pulse bg-surface-2" />
            ) : error || !d ? (
              <p className="m-0 text-fg-2">Today&apos;s problem couldn&apos;t load. Please refresh in a minute.</p>
            ) : (
              <>
                <Link href={`/dsa/problems/${d.problem.id}`} className="font-display text-[26px] font-bold leading-tight tracking-[-0.02em] text-fg hover:underline hover:decoration-line-strong hover:underline-offset-4 sm:text-[32px]">
                  {d.problem.title}
                </Link>
                <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[12.5px] text-fg-2">
                  <span>{LEVEL[d.problem.level]}</span>
                  {d.problem.conceptTitle ? (
                    <Link href={`/dsa/concepts/${d.problem.concept}`} className="text-signal-text underline decoration-line-strong underline-offset-4">
                      {d.problem.conceptTitle}
                    </Link>
                  ) : null}
                  {d.problem.minutes ? <span>~{d.problem.minutes} min</span> : null}
                  {d.problem.patterns.slice(0, 2).map((x) => (
                    <span key={x} className="text-fg-3">
                      {x.replace(/-/g, " ")}
                    </span>
                  ))}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {streak?.today ? (
                    <span className="inline-flex min-h-11 items-center border-2 border-ok px-3.5 font-mono text-[13px] font-semibold uppercase tracking-label text-ok-text">✓ Solved today</span>
                  ) : (
                    <Link href={`/dsa/problems/${d.problem.id}`} className="inline-flex min-h-11 items-center bg-signal px-4 font-mono text-[14px] font-semibold text-on-signal hover:opacity-90">
                      Open the problem →
                    </Link>
                  )}
                  {progress.solved.has(d.problem.id) && !streak?.today ? (
                    <span className="font-mono text-[12px] text-fg-3">You&apos;ve solved this one before: submit it again today to count it.</span>
                  ) : null}
                </div>
              </>
            )}
          </div>
          <div className="grid grid-cols-3 gap-px bg-line lg:grid-cols-1">
            <Stat value={streak ? streak.current : "–"} label="day streak" />
            <Stat value={streak ? streak.best : "–"} label="best streak" />
            <Stat value={streak ? streak.days.size : "–"} label="days solved" />
          </div>
        </section>

        {!authLoading && !user ? (
          <p className="m-0 border-l-2 border-signal pl-3 text-[14px] text-fg-2">You&apos;re playing as a guest: your streak lives in this browser. Sign in to keep it on every device.</p>
        ) : null}

        <section aria-labelledby="past-h" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="past-h" className="m-0 font-display text-[22px] font-bold tracking-[-0.02em] text-fg">
              The last two weeks
            </h2>
            {streak && today ? <StreakDots days={streak.days} today={today} n={14} /> : null}
          </div>
          {loading ? (
            <div aria-busy="true" className="h-[240px] animate-pulse bg-surface-2" />
          ) : (
            <ul className="m-0 flex list-none flex-col gap-px border border-line bg-line p-0">
              {(data?.recent || []).map((x) => {
                const on = !!streak?.days.has(x.date);
                return (
                  <li key={x.date} className="bg-surface">
                    <Link href={`/dsa/problems/${x.problem.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface-2">
                      <span className="w-[92px] shrink-0 font-mono text-[12px] text-fg-3">
                        #{x.number} · {shortDate(x.date)}
                      </span>
                      <span className="min-w-0 flex-1 text-[15px] text-fg">{x.problem.title}</span>
                      <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{LEVEL[x.problem.level]}</span>
                      <span className={`w-[70px] text-right font-mono text-[11px] uppercase tracking-label ${on ? "text-ok-text" : "text-fg-4"}`}>{on ? "✓ solved" : "missed"}</span>
                    </Link>
                  </li>
                );
              })}
              {data && !data.recent.length ? <li className="bg-surface px-4 py-3 text-[14px] text-fg-3">The daily problem started today: past days show up here as they go by.</li> : null}
            </ul>
          )}
        </section>

        <details className="text-[13px] text-fg-3">
          <summary className="cursor-pointer font-mono text-[12px]">How the daily streak works</summary>
          <p className="m-0 mt-2 max-w-[680px] leading-relaxed">
            An Accepted submit on the day&apos;s problem, before midnight India time, counts that day ({"+"}15 XP once a day). Solving an old day&apos;s problem is practice and earns that problem&apos;s own XP. The daily streak is separate from your learning streak, which every lesson and solve keeps alive.
          </p>
        </details>
      </main>
    </div>
  );
}
