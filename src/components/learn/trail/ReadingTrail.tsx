"use client";

/**
 * "Go deeper · reading trail" at the end of a lesson or side quest: 2-3 real write-ups (company
 * engineering blogs, papers, talks, postmortems) with how each connects to the lesson. The cards
 * ship with the page, so they render in a saved offline copy; only the links need a connection.
 */
import Link from "next/link";
import { useConnectivity } from "@/lib/offline/connectivity";
import type { TrailEntry } from "@/lib/learn/trail/types";
import TrailCard from "./TrailCard";
import { useTrailReads } from "./useTrailReads";

export default function ReadingTrail({ lesson, entries }: { lesson: string; entries: TrailEntry[] }) {
  const { offline } = useConnectivity();
  const { isRead, toggle, countRead } = useTrailReads();
  if (!entries.length) return null;
  const done = countRead(lesson);
  return (
    <section aria-labelledby="hk-trail-title" className="flex flex-col gap-2.5" data-hk-reading-trail="">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="hk-trail-title" className="m-0 font-mono text-xs font-normal uppercase tracking-label text-fg-3">
          Go deeper · reading trail
        </h2>
        <span className="flex items-center gap-3 font-mono text-xs text-fg-3">
          {done > 0 && (
            <span className="text-ok">
              {Math.min(done, entries.length)}/{entries.length} read
            </span>
          )}
          <Link href="/learn/reading" className="text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg">
            all reading →
          </Link>
        </span>
      </div>
      <p className="m-0 max-w-[760px] text-sm leading-normal text-fg-3">
        {offline
          ? "You're offline: the summaries are saved with this page, the articles open once you're back online."
          : "Real write-ups from the teams that built these systems. Each opens on the publisher's site in a new tab."}
      </p>
      <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
        {entries.map((e) => (
          <TrailCard key={e.id} entry={e} lesson={lesson} read={isRead(lesson, e.id)} onToggleRead={() => toggle(lesson, e.id)} offline={offline} surface="lesson" />
        ))}
      </div>
    </section>
  );
}
