"use client";

/**
 * "Try a smaller version": after three failed submits, one short warm-up question on the same pattern (a reasoning or
 * dry-run question with an answer, not a judged problem), grounded in the concept lesson (FEATURES "weak-drill"). Signed-in
 * learners with AI on only; one quiet line until asked.
 */
import { useState } from "react";
import { useAiStatus } from "@/components/learn/ai/useAiStatus";
import DrillPanel from "@/components/learn/plan/DrillPanel";

export default function Warmup({ problem, concept }: { problem: string; concept: string }) {
  const ai = useAiStatus();
  const [open, setOpen] = useState(false);
  if (!ai?.signedIn || !ai.features["weak-drill"]) return null;
  if (open) return <DrillPanel problem={problem} label={concept} onClose={() => setOpen(false)} />;
  return (
    <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-[14px] text-fg-2">
      <span>Stuck on this one?</span>
      <button type="button" onClick={() => setOpen(true)} className="min-h-8 font-semibold text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
        Try a smaller version
      </button>
    </p>
  );
}
