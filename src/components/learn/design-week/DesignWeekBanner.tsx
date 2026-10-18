"use client";

/**
 * Slim "this week's challenge" banner, dismissible per challenge (localStorage). Shown on archive
 * pages; can be mounted anywhere else with the hub summary's `current`.
 */
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { canSubmitIn, canVoteIn, deadlineFor } from "@/lib/design-week/core";
import type { ChallengeCard } from "@/lib/design-week/views";
import { BASE, Countdown } from "./ui";

const KEY = "hk.dowBanner";
const EVT = "hk-dow-banner";
const sub = (cb: () => void) => {
  window.addEventListener(EVT, cb);
  return () => window.removeEventListener(EVT, cb);
};
const read = () => {
  try {
    return window.localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
};

export default function DesignWeekBanner({ current }: { current: ChallengeCard }) {
  const dismissed = useSyncExternalStore(sub, read, () => "");
  const live = canSubmitIn(current.phase) || canVoteIn(current.phase);
  const id = `${current.slug}:${current.phase}`;
  if (!live || dismissed === id) return null;
  const d = deadlineFor(current.phase, current);
  return (
    <div role="region" aria-label="This week's design challenge" className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-signal bg-signal/10 px-4 py-3">
      <span className="font-mono text-[11px] font-semibold uppercase tracking-label text-signal-text">{canVoteIn(current.phase) ? "voting open" : "this week"}</span>
      <Link href={`${BASE}`} className="min-w-0 flex-1 text-[15px] font-semibold text-fg underline decoration-line-strong underline-offset-4 hover:decoration-signal">
        {current.title}
      </Link>
      {d && <Countdown at={d.at} label={d.label} />}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          try {
            window.localStorage.setItem(KEY, id);
          } catch {
            /* storage blocked */
          }
          window.dispatchEvent(new Event(EVT));
        }}
        className="grid h-10 w-10 place-items-center font-mono text-fg-3 hover:text-fg"
      >
        ×
      </button>
    </div>
  );
}
