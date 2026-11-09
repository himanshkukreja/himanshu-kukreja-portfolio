"use client";

import { ChevronDown } from "lucide-react";
import { useDsaFull } from "../simple/view";

/** "Browse everything": every lesson and problem, folded in the simple view and open in the full view. */
export default function BrowseEverything({ count, children }: { count: number; children: React.ReactNode }) {
  const full = useDsaFull();
  return (
    // a new element when the view changes, so the switch opens or folds it; the learner's own toggle wins after that
    <details key={full ? "full" : "simple"} open={full} className="group border-t border-line pt-2">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 font-mono text-[13px] uppercase tracking-label text-fg-2 hover:text-fg [&::-webkit-details-marker]:hidden">
        <span>
          Browse everything <span className="text-fg-3">· {count} lessons and problems, lectures, shorts, cheat sheets</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="flex flex-col gap-10 pt-6">{children}</div>
    </details>
  );
}
