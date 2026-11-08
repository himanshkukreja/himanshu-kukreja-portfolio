"use client";

import { useDsaProgress } from "../progress/useDsaProgress";

/** A problem's solved tick in lists (icon plus words for screen readers; an empty box when unsolved). */
export default function SolvedMark({ id }: { id: string }) {
  const p = useDsaProgress();
  const solved = p.solved.has(id);
  return (
    <span className={`grid h-5 w-5 shrink-0 place-items-center border-2 ${solved ? "border-fg bg-fg text-bg" : "border-line-strong"}`}>
      {solved ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
          <path d="M4 12.5l5 5L20 6.5" />
        </svg>
      ) : null}
      <span className="sr-only">{solved ? "Solved" : "Not solved yet"}</span>
    </span>
  );
}
