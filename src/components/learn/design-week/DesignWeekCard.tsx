"use client";

/**
 * Course hub card: this week's design challenge (phase + countdown) and the last winner. Online
 * only (hidden offline); also applies any Design of the week XP the signed-in learner earned.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useConnectivity } from "@/lib/offline/connectivity";
import type { Award } from "@/lib/design-week/core";
import { deadlineFor } from "@/lib/design-week/core";
import type { HubSummary } from "@/lib/design-week/views";
import { dowJson, useApplyAwards, useViewer } from "./client";
import { AuthorChip, BASE, Countdown, LABEL, PhaseBadge } from "./ui";

export default function DesignWeekCard() {
  const { offline } = useConnectivity();
  const [data, setData] = useState<HubSummary | null>(null);
  const viewer = useViewer();
  const apply = useApplyAwards();

  useEffect(() => {
    if (offline) return;
    let off = false;
    fetch("/api/learn/design-week/summary")
      .then((r) => (r.ok ? (r.json() as Promise<HubSummary>) : null))
      .then((d) => {
        if (!off && d) setData(d);
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [offline]);

  // winners get their badge XP the next time they open the hub
  useEffect(() => {
    if (offline || !viewer.ready || !viewer.signedIn || !data?.available) return;
    let off = false;
    dowJson<{ awards: Award[] }>("/api/learn/design-week/awards")
      .then((r) => {
        if (!off) apply(r.awards);
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [offline, viewer.ready, viewer.signedIn, viewer.key, data?.available, apply]);

  if (offline || !data) return null;
  const c = data.current;
  const w = data.lastWinner;
  const d = c ? deadlineFor(c.phase, c) : null;

  return (
    <section aria-labelledby="dow-card-h" className="grid gap-px border border-line-strong bg-line lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-3 bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">Design of the week</span>
          {c && <PhaseBadge phase={c.phase} />}
        </div>
        {c ? (
          <>
            <h2 id="dow-card-h" className="m-0 font-display text-[26px] font-bold leading-[1.05] tracking-[-0.025em] text-fg sm:text-[30px]">
              <Link href={BASE} className="hover:text-signal-text">
                {c.title}
              </Link>
            </h2>
            {c.summary && <p className="m-0 line-clamp-2 max-w-[620px] text-[15px] leading-relaxed text-fg-2">{c.summary}</p>}
            <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
              {d && <Countdown at={d.at} label={d.label} />}
              {c.phase !== "upcoming" && (
                <span className="font-mono text-xs text-fg-3">
                  {c.submitted} design{c.submitted === 1 ? "" : "s"} in
                </span>
              )}
              <Link href={BASE} className="ml-auto inline-flex min-h-10 items-center font-mono text-sm text-signal-text">
                {c.phase === "open" ? "submit your design →" : c.phase === "voting" ? "vote now →" : "open →"}
              </Link>
            </div>
          </>
        ) : (
          <>
            <h2 id="dow-card-h" className="m-0 font-display text-[26px] font-bold leading-[1.05] tracking-[-0.025em] text-fg">
              {data.available ? "The next challenge opens soon." : "One open design problem a week. Coming soon."}
            </h2>
            <p className="m-0 text-[15px] text-fg-2">Write a design, vote on the community&apos;s, get featured with your profile.</p>
            <Link href={BASE} className="inline-flex min-h-10 items-center self-start font-mono text-sm text-signal-text">
              how it works →
            </Link>
          </>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-3 bg-bg p-5 sm:p-6">
        <span className={LABEL}>last winner</span>
        {w ? (
          <>
            <Link href={w.submission.href} className="group flex flex-col gap-1">
              <span className="font-display text-[20px] font-bold leading-[1.1] tracking-[-0.02em] text-fg group-hover:text-signal-text">{w.submission.title}</span>
              <span className="font-mono text-[11px] text-fg-3">{w.challengeTitle}</span>
            </Link>
            <div className="mt-auto pt-1">
              <AuthorChip author={w.submission.author} />
            </div>
          </>
        ) : (
          <p className="m-0 text-[14px] text-fg-3">The first winner will be featured here.</p>
        )}
      </div>
    </section>
  );
}
