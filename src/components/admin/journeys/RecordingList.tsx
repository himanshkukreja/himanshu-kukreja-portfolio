"use client";

import { useState } from "react";
import { Badge, EmptyState, fmtDate, useNow } from "@/components/admin/ui";
import type { Recording } from "@/lib/analytics/journeys";
import { Who, clock, cx, personHref } from "./bits";
import ReplayPlayer from "./ReplayPlayer";

/** Recordings with an inline player that opens under the row. */
export default function RecordingList({ recordings, showWho = true, empty }: { recordings: Recording[]; showWho?: boolean; empty?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const now = useNow();
  if (!recordings.length) return <EmptyState title={empty || "No recordings"} hint="Replays appear here a minute or two after a session starts." />;
  return (
    <ul className="flex flex-col gap-2">
      {recordings.map((r) => {
        const on = open === r.id;
        const ageDays = (now - new Date(r.start).getTime()) / 86400_000;
        return (
          <li key={r.id} className={cx("border bg-surface", on ? "border-signal" : "border-line")}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:flex-nowrap">
              <button
                type="button"
                onClick={() => setOpen(on ? null : r.id)}
                aria-expanded={on}
                aria-label={on ? "Close replay" : `Play recording from ${fmtDate(r.start, true)}`}
                className={cx(
                  "grid h-11 w-11 shrink-0 place-items-center border font-mono text-sm",
                  on ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg hover:border-signal hover:text-signal-text"
                )}
              >
                {on ? "■" : "▶"}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-mono text-xs text-fg">{fmtDate(r.start, true)}</span>
                  {r.ongoing && <Badge tone="solid">live</Badge>}
                  {!r.viewed && <Badge tone="signal">new</Badge>}
                  {r.rage > 0 && <Badge tone="bad">{r.rage} rage</Badge>}
                  {r.dead > 0 && <Badge tone="bad">{r.dead} dead</Badge>}
                  {r.errors > 0 && <Badge tone="bad">{r.errors} errors</Badge>}
                  {ageDays > 25 && <Badge tone="muted">expires soon</Badge>}
                </div>
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] text-fg-3">
                  {showWho && (r.personId ? <Who who={r.who} identified={r.identified} href={personHref(r.personId)} className="!text-[11px]" /> : <span>{r.who}</span>)}
                  <span>
                    {r.pageviews || r.pages.length} page{(r.pageviews || r.pages.length) === 1 ? "" : "s"}
                  </span>
                  <span>{r.clicks} clicks</span>
                </div>
                {r.pages.length > 0 && (
                  <div className="mt-1 truncate font-mono text-[11px] text-fg-4" title={r.pages.join(" → ")}>
                    {r.pages.join(" → ")}
                  </div>
                )}
              </div>
              <div className="ml-auto shrink-0 text-right">
                <div className="font-display text-xl font-extrabold leading-none tracking-tight text-fg">{clock(r.duration)}</div>
                <div className="mt-1 font-mono text-[10px] text-fg-4">{clock(r.active)} active</div>
              </div>
            </div>
            {on && (
              <div className="border-t border-line p-2 sm:p-3">
                <ReplayPlayer id={r.id} title={r.startUrl || undefined} onClose={() => setOpen(null)} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
