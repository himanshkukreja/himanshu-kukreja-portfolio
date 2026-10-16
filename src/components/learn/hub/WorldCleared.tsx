"use client";

import Link from "next/link";
import Overlay from "./Overlay";
import ShareButton from "@/components/share/ShareButton";
import type { CourseWeek } from "@/lib/learn/types";
import { LEARN_XP } from "@/lib/learn/types";
import { hoursLabel } from "@/lib/learn/progress";

/** "World 02 cleared." recap. Shown once per newly cleared week (the hub keeps the flag). */
export default function WorldCleared({
  week,
  next,
  done,
  dueCount,
  onClose,
}: {
  week: CourseWeek;
  next: CourseWeek | null;
  done: Record<string, number>;
  dueCount: number;
  onClose: () => void;
}) {
  const parts = week.trial?.parts.length || 0;
  // Real XP earned in this world, from the game's done record (+ the world bonus being awarded now).
  const tw = week.trial?.week || week.key;
  const xp =
    Object.keys(done).reduce((sum, k) => {
      if (k.startsWith(`lesson:${week.key}/`)) return sum + LEARN_XP.lesson;
      if (k.startsWith(`stage:${week.key}/`)) return sum + LEARN_XP.stage;
      if (k.startsWith(`trial:${tw}/`) || (tw !== week.key && k.startsWith(`trial:${week.key}/`))) return sum + LEARN_XP.trial;
      if (k === `boss:${week.key}`) return sum + LEARN_XP.boss;
      return sum;
    }, 0) + LEARN_XP.world;
  const days = week.lessons.filter((l) => l.kind === "day-content").length;
  const recap = [
    days ? `${days} days` : `${week.lessons.length} parts`,
    week.boss ? "one boss" : null,
    parts ? `${parts} trial parts` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const firstNext = next ? next.lessons[0] || next.boss : null;
  const secondNext = next ? next.lessons[1] : null;

  return (
    <Overlay labelledBy="world-clear-h" onClose={onClose} className="max-w-[880px] border border-signal bg-surface">
      <div className="flex items-end justify-between gap-5 border-b border-line px-5 pb-5 pt-6 sm:px-7">
        <div className="flex min-w-0 flex-col gap-2.5">
          <span className="font-mono text-xs tracking-label text-signal-text">
            WORLD {week.code} · {week.title.toUpperCase()} · CLEARED
          </span>
          <h2 id="world-clear-h" className="font-display text-[clamp(40px,7vw,58px)] font-extrabold leading-[0.9] tracking-[-0.05em] text-fg">
            World {week.code} cleared<span className="text-signal-text">.</span>
          </h2>
          <span className="text-[15px] text-fg-2">{recap.charAt(0).toUpperCase() + recap.slice(1)}. Every node in this world is done.</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close recap" className="grid h-11 w-11 shrink-0 place-items-center border border-line-strong text-lg text-fg-3 hover:text-fg">
          ×
        </button>
      </div>

      <div className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-5">
        <div className="flex flex-col gap-1 bg-bg px-4 py-4">
          <span className="font-mono text-[26px] font-semibold text-fg">{hoursLabel(week.minutes).replace("~", "")}</span>
          <span className="text-xs text-fg-3">read across {week.lessons.length + (week.boss ? 1 : 0)} lessons</span>
        </div>
        <div className="flex flex-col gap-1 bg-bg px-4 py-4">
          <span className="font-mono text-[26px] font-semibold text-fg">
            {parts ? (
              <>
                {parts}
                <span className="text-sm text-fg-3">/{parts}</span>
              </>
            ) : (
              "—"
            )}
          </span>
          <span className={`text-xs ${parts ? "text-ok" : "text-fg-3"}`}>{parts ? "trial parts passed" : "no trial for this world yet"}</span>
        </div>
        <div className="flex flex-col gap-1 bg-bg px-4 py-4">
          <span className="font-mono text-[26px] font-semibold text-fg">{week.boss ? "◆" : "—"}</span>
          <span className="text-xs text-fg-3">{week.boss ? `boss · ${week.boss.title}` : "no boss in this world"}</span>
        </div>
        <div className="flex flex-col gap-1 bg-bg px-4 py-4">
          <span className="font-mono text-[26px] font-semibold text-signal-text">+{xp}</span>
          <span className="text-xs text-fg-3">XP this world · +{LEARN_XP.world} bonus</span>
        </div>
        <div className="col-span-2 flex items-center gap-3 bg-signal px-4 py-4 text-on-signal sm:col-span-1">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
            <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
          </svg>
          <span className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] tracking-label">BADGE UNLOCKED</span>
            <span className="text-base font-bold">{week.badge}</span>
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1 px-5 py-5 sm:px-7">
        <span className="pb-1.5 font-mono text-[11px] tracking-label text-fg-3">WHAT YOU CLEARED</span>
        {[...week.lessons, ...(week.boss ? [week.boss] : [])].map((l, i, arr) => (
          <div key={l.slug} className={`flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5 ${i < arr.length - 1 ? "border-b border-line" : ""}`}>
            <span className="w-[86px] shrink-0 whitespace-nowrap font-mono text-xs text-fg">✓ {l.code}</span>
            <span className="min-w-0 flex-1 text-sm text-fg-2">{l.kind === "week-preview" ? "Preview" : l.title}</span>
            <span className="font-mono text-xs text-fg-3">{l.minutes} min</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2.5 border-t border-line px-5 pb-6 pt-4 sm:px-7">
        {next && firstNext ? (
          <Link href={firstNext.href} onClick={onClose} className="inline-flex min-h-[52px] items-center bg-signal px-5 font-semibold text-on-signal">
            Enter World {next.code} · {next.title} →
          </Link>
        ) : (
          <Link href="/learn/dashboard" onClick={onClose} className="inline-flex min-h-[52px] items-center bg-signal px-5 font-semibold text-on-signal">
            See your profile →
          </Link>
        )}
        <ShareButton kind="world" achievement={`world-${week.code}`} title={week.code} detail={week.title} label="Share it" className="min-h-[52px] text-[14px]" />
        <Link href="/learn/review" onClick={onClose} className="inline-flex min-h-[52px] items-center border border-line-strong px-4 text-[15px] text-fg hover:bg-surface-2">
          {dueCount ? `Review ${dueCount} due card${dueCount === 1 ? "" : "s"}` : "Open the daily standup"}
        </Link>
        {next && firstNext && (
          <span className="basis-full font-mono text-xs text-fg-3">
            up next · {firstNext.kind === "week-preview" ? "Preview" : firstNext.label} {firstNext.minutes} min
            {secondNext ? `, then ${secondNext.label} · ${secondNext.minutes} min` : ""}
          </span>
        )}
      </div>
    </Overlay>
  );
}
