"use client";

/**
 * Progress page · video lectures: watch time, lectures finished and started, what to pick up again
 * and what was finished recently. From the lecture progress the player keeps in the game flags
 * (`lec:<id>`, synced for signed-in learners).
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { useGame } from "@/game/GameProvider";
import { isWatched, readProgress, watchedPct, watchMinutes, type LectureProgress } from "@/lib/learn/lecture/progress";
import { SectionHead, Stat } from "./ui";

export type LectureLite = { slug: string; title: string; href: string; minutes: number; code: string; group: string };

const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${Math.round(m % 60)}` : `${Math.round(m)}`);

export default function LectureStats({ lectures }: { lectures: LectureLite[] }) {
  const { flags, hydrated } = useGame();
  const [now] = useState(() => Date.now());
  const rows = useMemo(() => {
    const out: { l: LectureLite; p: LectureProgress }[] = [];
    if (!hydrated) return out;
    for (const l of lectures) {
      const p = readProgress(flags, l.slug);
      if (p) out.push({ l, p });
    }
    return out;
  }, [lectures, flags, hydrated]);
  const minutes = rows.reduce((a, r) => a + watchMinutes(r.p), 0);
  const done = rows.filter((r) => isWatched(r.p));
  const going = rows.filter((r) => !isWatched(r.p) && watchedPct(r.p) >= 2).sort((a, b) => b.p.at - a.p.at);
  const recent = [...done].sort((a, b) => b.p.at - a.p.at).slice(0, 4);
  const week = rows.filter((r) => now - r.p.at < 7 * 86_400_000).length;

  return (
    <section aria-labelledby="videos" className="flex scroll-mt-32 flex-col gap-5">
      <SectionHead
        id="videos"
        n="▶"
        kicker="video lectures"
        title="What you've watched"
        right={
          <Link href="/learn/prep/lectures" className="inline-flex min-h-10 items-center font-mono text-[13px] text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
            all {lectures.length} lectures →
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
        <Stat label="watch time" value={hydrated ? fmtMin(minutes) : "–"} unit={minutes >= 60 ? "min" : "min"} accent />
        <Stat label="finished" value={hydrated ? done.length : "–"} unit={`/ ${lectures.length}`} />
        <Stat label="in progress" value={hydrated ? going.length : "–"} />
        <Stat label="watched this week" value={hydrated ? week : "–"} sub={hydrated ? "lectures opened in the last 7 days" : undefined} />
      </div>
      {hydrated && rows.length === 0 ? (
        <p className="m-0 border border-dashed border-line-strong p-5 text-[15px] text-fg-2">
          No lectures yet. Every lesson has an animated lecture: the &ldquo;watch it first&rdquo; card at the top of a lesson, or the{" "}
          <Link href="/learn/prep/lectures" className="text-signal-text underline underline-offset-4">
            playlist
          </Link>
          .
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-2">
            <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">continue watching</span>
            {going.length === 0 ? (
              <p className="m-0 text-sm text-fg-3">Nothing half-watched.</p>
            ) : (
              <ol className="m-0 flex list-none flex-col gap-2 p-0">
                {going.slice(0, 5).map(({ l, p }) => (
                  <li key={l.slug}>
                    <Link href={p.t > 5 ? `${l.href}?t=${p.t}` : l.href} className="group flex min-w-0 flex-col gap-1.5 border border-line bg-surface px-3.5 py-2.5 hover:border-signal">
                      <span className="flex min-w-0 items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-[14px] font-medium text-fg group-hover:text-signal-text">{l.title}</span>
                        <span className="shrink-0 font-mono text-[11px] text-fg-3">{watchedPct(p)}%</span>
                      </span>
                      <span className="block h-1 bg-surface-2">
                        <span className="block h-full bg-signal" style={{ width: `${watchedPct(p)}%` }} />
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-label text-fg-4">
                        {l.code} · {l.group}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">finished recently</span>
            {recent.length === 0 ? (
              <p className="m-0 text-sm text-fg-3">None finished yet: a lecture counts once you reach 90% of it.</p>
            ) : (
              <ol className="m-0 flex list-none flex-col gap-1 p-0">
                {recent.map(({ l, p }) => (
                  <li key={l.slug} className="flex min-w-0 items-baseline justify-between gap-3 border-b border-line py-2">
                    <Link href={l.href} className="min-w-0 truncate text-[14px] text-fg-2 hover:text-fg">
                      <span className="text-signal-text">✓</span> {l.title}
                    </Link>
                    <span className="shrink-0 font-mono text-[11px] text-fg-4">{new Date(p.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
