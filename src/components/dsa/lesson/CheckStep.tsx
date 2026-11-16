"use client";

/**
 * Check: the lesson's own closing beat (its quiz, explain-it-back, the 60-second answer and the review cards are in the
 * lesson HTML, shown by the step styles) with a short checklist above it and the way on below. The checklist reads the
 * same keys as before: the checkpoint quiz (`dsa:cpq:<node>`) and, for a visual lesson, its lab (`dsa:lab:<id>`).
 */
import Link from "next/link";
import { useGame } from "@/game/GameProvider";
import { dsaKeys, type ConceptCheckpoint } from "@/lib/dsa/types";
import { mapHref } from "@/lib/dsa/lesson-stops";
import { BTN_PRIMARY, BTN_SECONDARY, MID } from "../ui/kit";

type Item = { label: string; done: boolean; note?: string };

export default function CheckStep({ checkpoint, labId, hasQuiz }: { checkpoint: ConceptCheckpoint | null; labId: string | null; hasQuiz: boolean }) {
  const { done } = useGame();
  const items: Item[] = [];
  if (checkpoint && hasQuiz) items.push({ label: "Pass the checkpoint quiz", done: !!done[dsaKeys.checkpointQuiz(checkpoint.nodeId)], note: checkpoint.own === false ? "counts toward this section's checkpoint" : `${Math.round(checkpoint.pass * 100)}% to pass` });
  if (labId) items.push({ label: "Pass the lab", done: !!done[dsaKeys.lab(labId)], note: "also counts toward the checkpoint" });
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 max-w-[680px] text-[15px] leading-relaxed text-fg-2">Answer the questions, then say the idea back in your own words. Your tutor reads it and tells you what to tighten.</p>
      {items.length ? (
        <ul className="m-0 flex list-none flex-col gap-px overflow-hidden rounded-xl border border-line bg-line p-0" aria-label="What counts toward this check">
          {items.map((it) => (
            <li key={it.label} className="flex min-h-12 items-center gap-3 bg-surface px-4 py-2.5">
              <span aria-hidden className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 text-[11px] ${it.done ? "border-fg bg-fg text-bg" : "border-line-strong"}`}>
                {it.done ? "✓" : ""}
              </span>
              <span className="min-w-0 flex-1 text-[15px] text-fg">{it.label}</span>
              <span className="text-[13px] text-fg-3">{it.done ? "Done" : it.note}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The way on, below the lesson's closing beat. */
export function CheckEnd({ checkpoint, next, cheatsheet }: { checkpoint: ConceptCheckpoint | null; next: { href: string; title: string } | null; cheatsheet: string | null }) {
  return (
      <div id="check-end" className="flex flex-col gap-3 border-t border-line pt-6" data-check-end>
        <div className="flex flex-wrap gap-3">
          {next ? (
            <Link href={next.href} className={`${BTN_PRIMARY} ${MID}`}>
              Next lesson: {next.title} →
            </Link>
          ) : null}
          <Link href={mapHref(checkpoint)} className={`${BTN_SECONDARY} ${MID}`}>
            Back to the course
          </Link>
          {cheatsheet ? (
            <Link href={cheatsheet} className={`${BTN_SECONDARY} ${MID}`}>
              Cheat sheet
            </Link>
          ) : null}
        </div>
      </div>
  );
}
