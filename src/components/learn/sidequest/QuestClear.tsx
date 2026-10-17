"use client";

import { useEffect } from "react";
import { useLessonProgress } from "@/components/LessonProgressTracker";
import ShareButton from "@/components/share/ShareButton";
import { useGame } from "@/game/GameProvider";
import { LEARN_XP } from "@/lib/learn/types";
import { doneCount, numberedStages } from "../lesson/stageText";
import type { ReaderMeta } from "../lesson/types";
import { questBrand } from "./brands";
import QuestEmblem from "./QuestEmblem";
import { useQuestProgress } from "./useQuestProgress";

/**
 * End of a side quest: the "quest cleared" moment. Completing the lesson is what clears it (the
 * existing `lesson:` +60), and the side-quest bonus (`sidequest:<slug>`, +60, the key the course hub
 * already awards) is paid here at once instead of on the next hub visit. awardOnce is idempotent,
 * so the hub never pays it twice.
 */
export default function QuestClear({ meta }: { meta: ReaderMeta }) {
  const p = useLessonProgress();
  const q = useQuestProgress();
  const { done, hydrated, awardOnce } = useGame();
  const brand = questBrand(meta.slug);
  const { completed, complete, ready, canComplete, completeLeftMin } = p;
  const total = numberedStages(p.required).length;
  const nDone = doneCount(p);
  const bonusKey = `sidequest:${meta.slug}`;
  const bonusPaid = hydrated && !!done[bonusKey];

  useEffect(() => {
    if (!hydrated || !completed || done[bonusKey]) return;
    awardOnce(bonusKey, LEARN_XP.sideQuest - LEARN_XP.lesson, `Side quest cleared · ${meta.title}`);
  }, [hydrated, completed, done, bonusKey, awardOnce, meta.title]);

  const rows: { label: string; value: string; full: boolean }[] = [
    { label: "stages cleared", value: `${completed ? total : nDone}/${total}`, full: completed || nDone >= total },
    ...(q.checkpoints ? [{ label: `checkpoints answered${q.checkpointsKnew ? ` · ${q.checkpointsKnew} nailed` : ""}`, value: `${q.checkpointsDone}/${q.checkpoints}`, full: q.checkpointsDone >= q.checkpoints }] : []),
    ...(q.quizzes ? [{ label: `quick checks${q.quizzesAced ? ` · ${q.quizzesAced} aced first try` : ""}`, value: `${q.quizzesDone}/${q.quizzes}`, full: q.quizzesDone >= q.quizzes }] : []),
  ];

  return (
    <div
      className={`flex flex-col gap-5 border bg-surface p-4 sm:p-6 ${completed ? "border-line-strong" : "border-signal"}`}
      style={{ ["--quest-accent" as string]: brand.accent } as React.CSSProperties}
    >
      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          <QuestEmblem brand={brand} size={56} className={completed ? "" : "opacity-60 grayscale"} />
          {completed && <span className="absolute -bottom-2 -right-2 bg-signal px-1 font-mono text-[10px] font-semibold text-on-signal">✓</span>}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{completed ? "Quest cleared" : "Clear the quest"}</span>
          <span className="font-display text-[24px] font-bold leading-[1.05] tracking-[-0.02em] text-fg sm:text-[28px]">
            {completed ? `${brand.product} designed.` : `Finish ${brand.product}.`}
          </span>
          <span className="text-sm leading-normal text-fg-2">
            {completed
              ? bonusPaid
                ? `+${LEARN_XP.sideQuest} XP banked: the lesson's +${LEARN_XP.lesson} and the side-quest bonus. Completed stays completed.`
                : "Saving your clear…"
              : canComplete
                ? `Every phase read. Mark it complete for +${LEARN_XP.sideQuest} XP (lesson +${LEARN_XP.lesson}, side-quest bonus +${LEARN_XP.sideQuest - LEARN_XP.lesson}).`
                : `Stages clear as you read them. Marking complete unlocks after ~${completeLeftMin} more min of reading.`}
          </span>
        </div>
      </div>

      <ul className="m-0 grid list-none gap-px border border-line bg-line p-0 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
        {rows.map((r) => (
          <li key={r.label} className="flex flex-col gap-0.5 bg-bg px-4 py-3">
            <span className={`font-mono text-xl font-semibold ${r.full ? "text-fg" : "text-fg-2"}`}>
              {r.value}
              {r.full && <span className="ml-1.5 text-sm text-ok">✓</span>}
            </span>
            <span className="text-xs text-fg-3">{r.label}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <button
          type="button"
          onClick={complete}
          disabled={completed || !ready || !canComplete}
          className={`min-h-[52px] w-full px-5 text-[15px] font-semibold sm:w-auto ${
            completed ? "border border-line-strong bg-surface-2 text-fg-2" : canComplete ? "bg-signal text-on-signal hover:brightness-110" : "border border-dashed border-line-strong text-fg-2"
          } disabled:cursor-default`}
        >
          {completed ? "Quest cleared ✓" : canComplete ? `Clear the quest · +${LEARN_XP.sideQuest} XP` : `Keep reading · ~${completeLeftMin} min left`}
        </button>
        {completed && <ShareButton kind="lesson" title={meta.title} label="Share the clear" className="min-h-[52px] w-full sm:w-auto" />}
        {!completed && q.checkpoints > q.checkpointsDone && (
          <span className="text-[13px] text-fg-3">Checkpoints and quick checks are optional for the clear, but they are where the learning sticks.</span>
        )}
      </div>
    </div>
  );
}
