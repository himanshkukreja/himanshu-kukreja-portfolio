"use client";

/**
 * "Reset problem" in the problem room: a fresh start that keeps the Bits already earned (rules and the list of what is
 * cleared: src/lib/dsa/reset.ts). A quiet button that opens the site's own dialog (never window.confirm). The room passes
 * `onDone` to put its own state back to a fresh problem.
 */
import { useState } from "react";
import { RotateCcw } from "lucide-react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useGame } from "@/game/GameProvider";
import { userFetch } from "@/components/learn/progress/userFetch";
import { GUEST_PROGRESS_KEY } from "@/components/learn/lesson/progress";
import { deviceKeysFor, guestLessonKeyFor } from "@/lib/dsa/reset";
import { track } from "@/lib/track";

function clearDevice(id: string) {
  try {
    for (const k of deviceKeysFor(id)) window.localStorage.removeItem(k);
    const raw = window.localStorage.getItem(GUEST_PROGRESS_KEY);
    if (raw) {
      const all = JSON.parse(raw) as Record<string, unknown>;
      delete all[guestLessonKeyFor(id)];
      window.localStorage.setItem(GUEST_PROGRESS_KEY, JSON.stringify(all));
    }
  } catch {
    /* storage blocked: nothing was kept there */
  }
}

export default function ResetProblem({ id, title, onDone }: { id: string; title: string; onDone: () => void }) {
  const { resetDsaProblem } = useGame();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    clearDevice(id);
    resetDsaProblem(id);
    // the account half (progress row, submissions, editorial reveal) first, so the lists re-read a clean account
    await userFetch(`/api/dsa/reset/${id}`, { method: "POST" }).catch(() => {});
    window.dispatchEvent(new CustomEvent("hk:lesson-progress", { detail: { key: guestLessonKeyFor(id) } }));
    track("dsa_reset_problem", { problem: id });
    setBusy(false);
    setOpen(false);
    onDone();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-10 items-center gap-1.5 px-2 text-[13px] text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        Reset problem
      </button>
      <ConfirmDialog
        isOpen={open}
        tone="notice"
        title="Start this problem fresh?"
        message={`This clears your code in every language, your submissions, hints, and the solved mark for "${title}", and locks the editorial again. The Bits you already earned stay, and solving it again won't add more.`}
        confirmText={busy ? "Resetting…" : "Reset problem"}
        cancelText="Keep it"
        onConfirm={() => {
          if (!busy) void confirm();
        }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
