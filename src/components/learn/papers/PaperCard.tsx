"use client";

/**
 * "Written paper" entry for a week or a side quest: on the course map's week panel (beside the trial), at the end of a
 * week's last lesson ("Next: written paper") and at the end of a side quest. Shows nothing unless that paper exists
 * (the paper index, /learn/papers/index.json), and the learner's best score once they have one.
 */
import Link from "next/link";
import { useGame } from "@/game/GameProvider";
import { BAND_LABEL, bandOf } from "@/lib/learn/papers/grade";
import { paperFlagKey, pct, readRecord } from "@/lib/learn/papers/types";
import { usePaperFor } from "./usePapers";

export default function PaperCard({ paperKey, variant = "hub" }: { paperKey: string; variant?: "hub" | "next" | "quest" }) {
  const p = usePaperFor(paperKey);
  const { flags, hydrated } = useGame();
  if (!p) return null;
  const rec = readRecord(flags[paperFlagKey(p.key)]);
  const best = hydrated ? rec.best : null;
  const band = best ? bandOf(best.score, best.max) : null;
  const status = !hydrated ? "" : rec.open ? `${rec.open.mode === "exam" ? "exam" : "practice"} in progress` : best ? `best ${best.score}/${best.max} · ${pct(best.score, best.max)}% · ${BAND_LABEL[band!]}` : "";

  if (variant === "hub")
    return (
      <Link href={p.href} className="flex items-center gap-3 border border-line-strong px-3.5 py-3 hover:bg-surface-2">
        <span aria-hidden className="grid h-[22px] w-[22px] shrink-0 place-items-center border-[1.5px] border-fg font-mono text-[11px] font-bold text-fg">
          ✎
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-mono text-[11px] tracking-label text-fg-3">
            WRITTEN PAPER · {p.questions} Q · {p.marks} MARKS · {p.minutes} MIN
          </span>
          <span className="text-[15px] font-semibold text-fg">Answer by hand, graded point by point</span>
          {status && <span className={`font-mono text-[11px] ${band === "not-yet" || rec.open ? "text-fg-3" : "text-ok"}`}>{status}</span>}
        </span>
        <span aria-hidden className="font-mono text-sm text-signal-text">
          ❯
        </span>
      </Link>
    );

  return (
    <Link href={p.href} className="flex flex-col gap-2.5 border border-line-strong bg-raised p-[18px] text-fg no-underline hover:border-fg-3">
      <span className="flex justify-between gap-2 font-mono text-xs tracking-[0.06em]">
        <span className="text-signal-text">{variant === "next" ? "NEXT · WRITTEN PAPER" : "WRITTEN PAPER"}</span>
        <span className="text-fg-3">
          {p.questions} Q · {p.marks} marks · {p.minutes} min
        </span>
      </span>
      <span className="font-display text-[26px] font-bold leading-[1.05] tracking-[-0.02em]">{variant === "quest" ? "Sit this quest's paper" : "Sit the week's paper"}</span>
      <span className="text-sm leading-normal text-fg-2">Explain, estimate and draw the design by hand, with a pencil, a finger or a mouse. Every answer is marked against the scheme, with the model answer.</span>
      {status && <span className={`font-mono text-[12px] ${band === "not-yet" || rec.open ? "text-fg-3" : "text-ok"}`}>{status}</span>}
      <span className="font-mono text-[13px] text-signal-text">Open the paper →</span>
    </Link>
  );
}
