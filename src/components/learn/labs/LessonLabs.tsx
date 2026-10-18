"use client";

/** "Try it in code": the code labs that practise this lesson, at the end of the lesson. */
import Link from "next/link";
import { Code2 } from "lucide-react";
import { useGame } from "@/game/GameProvider";
import { useLabProgress } from "@/lib/learn/labs/progress";
import { DIFFICULTY_LABEL, labKey, type LessonLabLink } from "@/lib/learn/labs/types";

export default function LessonLabs({ labs }: { labs: LessonLabLink[] }) {
  const { done, hydrated } = useGame();
  const progress = useLabProgress();
  if (!labs.length) return null;
  return (
    <div className="flex flex-col gap-2.5" data-hk-lesson-labs="">
      <span className="flex items-center justify-between gap-2 font-mono text-xs uppercase tracking-label text-fg-3">
        <span>Try it in code</span>
        <Link href="/learn/labs" className="normal-case tracking-normal text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg">
          all labs →
        </Link>
      </span>
      <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
        {labs.map((l) => {
          const cleared = (hydrated && !!done[labKey(l.id)]) || !!progress[l.id]?.passedAt;
          return (
            <Link key={l.id} href={l.href} className="flex flex-col gap-2.5 border border-line-strong bg-raised p-[18px] text-fg no-underline hover:border-fg-3">
              <span className="flex justify-between gap-2 font-mono text-xs tracking-[0.06em]">
                <span className="inline-flex items-center gap-1.5 text-signal-text">
                  <Code2 className="h-3.5 w-3.5" aria-hidden /> CODE LAB · {DIFFICULTY_LABEL[l.difficulty].toUpperCase()}
                </span>
                <span className={cleared ? "text-ok" : "text-fg-3"}>{cleared ? "CLEARED ✓" : `~${l.minutes} MIN`}</span>
              </span>
              <span className="font-display text-[24px] font-bold leading-[1.05] tracking-[-0.02em]">{l.title}</span>
              {l.summary && <span className="text-sm leading-normal text-fg-2">{l.summary}</span>}
              <span className="font-mono text-[13px] text-fg">
                Implement it in Python · {l.tests.visible + l.tests.hidden} tests{cleared ? "" : ` · +${l.xp} XP`} →
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
