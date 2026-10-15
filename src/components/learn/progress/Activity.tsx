"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { addDays, localDate } from "@/lib/learn/review";
import { timeAgo, type XpEntry } from "@/lib/learn/progress";
import { fmtDate, fmtMinutes, weekStart, type DayStat } from "./derive";
import { Label, SectionHead } from "./ui";

type Props = {
  days: Record<string, DayStat>;
  series: { start: string; minutes: number; activeDays: number }[];
  goalMinutes: number | null;
  streak: { current: number; best: number };
  rhythm: { bestDow: string | null; bestTime: string | null; sessions: number; daysThisWeek: number };
  estimated: boolean;
  log: XpEntry[];
};

const level = (d: DayStat | undefined) => {
  if (!d || (d.events <= 0 && d.minutes <= 0)) return 0;
  const m = d.minutes || d.events * 5;
  return m < 15 ? 1 : m < 40 ? 2 : m < 80 ? 3 : 4;
};
const FILL = ["bg-surface-2", "bg-signal/30", "bg-signal/55", "bg-signal/80", "bg-signal"];

export default function Activity(p: Props) {
  const today = localDate();
  const [pick, setPick] = useState<string | null>(null);

  const cols = useMemo(() => {
    const start = addDays(weekStart(today), -11 * 7);
    return Array.from({ length: 12 }, (_, w) =>
      Array.from({ length: 7 }, (_, k) => {
        const d = addDays(start, w * 7 + k);
        return { d, s: p.days[d], future: d > today };
      })
    );
  }, [p.days, today]);
  const active = cols.flat().filter((c) => level(c.s) > 0).length;
  const picked = pick ? { d: pick, s: p.days[pick] } : null;

  // weekly minutes chart
  const W = 360;
  const H = 132;
  const top = 18;
  const base = H - 22;
  const max = Math.max(30, p.goalMinutes || 0, ...p.series.map((s) => s.minutes));
  const nice = Math.ceil(max / 30) * 30;
  const bw = W / p.series.length;
  const y = (v: number) => base - ((base - top) * v) / nice;
  const [bar, setBar] = useState<number | null>(null);
  const shown = bar !== null ? p.series[bar] : p.series[p.series.length - 1];
  const total12 = p.series.reduce((a, s) => a + s.minutes, 0);

  return (
    <section aria-labelledby="activity-h" id="activity" className="flex scroll-mt-28 flex-col gap-4">
      <SectionHead id="activity-h" n="02" kicker="activity" title="Your rhythm" right={<span className="font-mono text-[12px] text-fg-3">last 12 weeks · {active} active days</span>} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* heatmap */}
        <div className="flex min-w-0 flex-col gap-3 border border-line bg-surface p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <Label>daily activity</Label>
            <span className="flex items-center gap-1 text-[11px] text-fg-3">
              less
              {FILL.map((f) => (
                <span key={f} aria-hidden className={`h-2.5 w-2.5 ${f}`} />
              ))}
              more
            </span>
          </div>
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
            <div className="grid grid-rows-7 gap-[3px] pt-[18px] font-mono text-[9px] leading-none text-fg-4 lg:auto-rows-[24px] lg:grid-rows-none">
              {["M", "", "W", "", "F", "", "S"].map((d, i) => (
                <span key={i} className="flex items-center">
                  {d}
                </span>
              ))}
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="grid grid-cols-12 gap-[3px] font-mono text-[9px] leading-[12px] text-fg-4">
                {cols.map((c, i) => {
                  const first = c.find((x) => x.d.endsWith("-01")) || (i === 0 && !c.some((x) => x.d.slice(8) < "08") ? c[0] : undefined);
                  return <span key={i}>{first ? new Date(first.d + "T00:00").toLocaleDateString("en-US", { month: "short" }) : ""}</span>;
                })}
              </div>
              <div role="group" aria-label={`Activity heatmap, 12 weeks, ${active} active days`} className="grid grid-cols-12 gap-[3px]">
                {cols.map((col, w) => (
                  <div key={w} className="grid grid-rows-7 gap-[3px]">
                    {col.map((c) =>
                      c.future ? (
                        <span key={c.d} className="aspect-square lg:aspect-auto lg:h-6" />
                      ) : (
                        <button
                          key={c.d}
                          type="button"
                          onClick={() => setPick(c.d === pick ? null : c.d)}
                          onMouseEnter={() => setPick(c.d)}
                          aria-label={`${fmtDate(c.d)}: ${c.s ? `${fmtMinutes(c.s.minutes)}, ${c.s.events} events` : "no activity"}`}
                          className={`aspect-square lg:aspect-auto lg:h-6 ${FILL[level(c.s)]} ${c.d === today ? "outline outline-1 outline-offset-1 outline-fg-3" : ""} ${pick === c.d ? "outline outline-2 outline-fg" : ""}`}
                        />
                      )
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <span className="min-h-5 text-[13px] text-fg-2" aria-live="polite">
            {picked
              ? `${fmtDate(picked.d, true)} · ${picked.s ? `${p.estimated ? "~" : ""}${fmtMinutes(picked.s.minutes)} · ${picked.s.events} event${picked.s.events === 1 ? "" : "s"}` : "no activity"}`
              : active
                ? "Tap a day for details."
                : "No activity yet. A finished stage, a lesson, a trial part or a review card lights up a day."}
          </span>
        </div>

        {/* weekly minutes */}
        <div className="flex min-w-0 flex-col gap-3 border border-line bg-surface p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <Label>minutes per week{p.estimated ? " · est." : ""}</Label>
            <span className="font-mono text-[11px] text-fg-3">{fmtMinutes(total12)} in 12 wks</span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="whitespace-nowrap font-display text-[30px] font-extrabold leading-none tracking-[-0.04em] text-fg">{fmtMinutes(shown?.minutes || 0)}</span>
            <span className="text-[13px] text-fg-3">
              week of {fmtDate(shown?.start || null)}
              {bar === null ? " · this week" : ""}
              {p.goalMinutes ? ` · goal ${fmtMinutes(p.goalMinutes)}` : ""}
            </span>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-auto h-auto w-full" role="img" aria-label={`Minutes per week, last 12 weeks: ${p.series.map((s) => `${fmtDate(s.start)} ${s.minutes}`).join(", ")}`} onMouseLeave={() => setBar(null)}>
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line x1={0} x2={W} y1={y(nice * f)} y2={y(nice * f)} className="stroke-line" strokeWidth={1} />
                {f > 0 && (
                  <text x={W} y={y(nice * f) - 4} textAnchor="end" className="fill-fg-4 font-mono text-[9px]">
                    {fmtMinutes(nice * f)}
                  </text>
                )}
              </g>
            ))}
            {p.goalMinutes ? (
              <g>
                <line x1={0} x2={W} y1={y(p.goalMinutes)} y2={y(p.goalMinutes)} className="stroke-fg-3" strokeWidth={1} strokeDasharray="4 3" />
                <text x={2} y={y(p.goalMinutes) - 4} className="fill-fg-3 font-mono text-[9px]">
                  goal
                </text>
              </g>
            ) : null}
            {p.series.map((s, i) => {
              const h = Math.max(s.minutes > 0 ? 3 : 0, base - y(s.minutes));
              const last = i === p.series.length - 1;
              const on = bar === i || (bar === null && last);
              return (
                <g key={s.start} onMouseEnter={() => setBar(i)} onClick={() => setBar(bar === i ? null : i)} className="cursor-pointer">
                  <rect x={i * bw} y={top} width={bw} height={base - top} fill="transparent" />
                  <rect x={i * bw + bw * 0.18} y={base - h} width={bw * 0.64} height={h} className={on ? "fill-signal" : "fill-fg-3"} opacity={on ? 1 : 0.55} />
                  {i % 3 === 0 || last ? (
                    <text x={i * bw + bw / 2} y={H - 6} textAnchor="middle" className={`font-mono text-[9px] ${last ? "fill-fg-2" : "fill-fg-4"}`}>
                      {last ? "now" : fmtDate(s.start)}
                    </text>
                  ) : null}
                </g>
              );
            })}
            <line x1={0} x2={W} y1={base} y2={base} className="stroke-line-strong" strokeWidth={1} />
          </svg>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
        {[
          { k: "current streak", v: `${p.streak.current}`, u: p.streak.current === 1 ? "day" : "days" },
          { k: "longest streak", v: `${p.streak.best}`, u: p.streak.best === 1 ? "day" : "days" },
          { k: "best day", v: p.rhythm.bestDow || "—", u: "" },
          { k: "best time", v: p.rhythm.bestTime || "—", u: "" },
          { k: "sessions this week", v: `${p.rhythm.sessions}`, u: "" },
          { k: "days this week", v: `${p.rhythm.daysThisWeek}`, u: "/7" },
        ].map((t) => (
          <div key={t.k} className="flex min-w-0 flex-col gap-1 bg-bg px-4 py-3.5">
            <Label>{t.k}</Label>
            <span className="truncate font-display text-[22px] font-extrabold capitalize tracking-[-0.03em] text-fg">
              {t.v}
              {t.u && <span className="ml-1 font-mono text-[11px] font-normal normal-case tracking-normal text-fg-3">{t.u}</span>}
            </span>
          </div>
        ))}
      </div>

      <details className="group border border-line bg-surface">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 sm:px-5">
          <Label>xp log · last {p.log.length}</Label>
          <span aria-hidden className="font-mono text-fg-3 transition-transform group-open:rotate-90">
            ›
          </span>
        </summary>
        {p.log.length ? (
          <ol className="flex flex-col px-4 pb-3 sm:px-5">
            {p.log.map((l) => (
              <li key={l.key} className="flex items-baseline gap-3 border-t border-line py-2.5">
                <span className="w-12 shrink-0 font-mono text-[12px] text-signal-text">+{l.xp}</span>
                {l.href ? (
                  <Link href={l.href} className="min-w-0 flex-1 text-sm leading-snug text-fg hover:underline">
                    {l.what}
                  </Link>
                ) : (
                  <span className="min-w-0 flex-1 text-sm leading-snug text-fg">{l.what}</span>
                )}
                <span className="whitespace-nowrap font-mono text-[11px] text-fg-3">{timeAgo(l.at)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="px-4 pb-4 text-sm text-fg-3 sm:px-5">Nothing earned yet. Finish a stage or a lesson to start the log.</p>
        )}
      </details>
    </section>
  );
}
