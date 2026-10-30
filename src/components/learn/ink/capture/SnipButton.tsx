"use client";

/**
 * "Snip" for the reading tools, beside the notebook button: snip part of the page into the notebook (also S).
 * `dock` matches the desktop reading dock's buttons, `bar` the phone / tablet reading bar's square buttons.
 * Renders nothing on pages without a capture host.
 */
import { useSyncExternalStore } from "react";
import { Scissors } from "lucide-react";
import { activeHost, startSnip, subscribeHosts } from "./events";

export default function SnipButton({ variant = "dock", className = "" }: { variant?: "dock" | "bar"; className?: string }) {
  const ready = useSyncExternalStore(subscribeHosts, () => activeHost() !== null, () => false);
  if (!ready) return null;
  // opened from the keyboard (Enter / Space: no pointer position): start with a box to move with the arrows
  const go = (e: React.MouseEvent) => startSnip({ keyboard: e.detail === 0 });
  if (variant === "bar")
    return (
      <button type="button" onClick={go} aria-label="Snip part of the page into your notebook" aria-keyshortcuts="S" className={`grid h-11 w-10 shrink-0 place-items-center border border-line-strong text-fg ${className}`}>
        <Scissors className="h-4 w-4" aria-hidden />
      </button>
    );
  return (
    <button
      type="button"
      onClick={go}
      aria-label="Snip part of the page into your notebook"
      aria-keyshortcuts="S"
      title="Snip part of the page (S)"
      className={`flex min-h-[52px] min-w-14 flex-col items-center justify-center gap-[3px] border-r border-line px-1 text-fg hover:bg-surface-2 ${className}`}
    >
      <Scissors className="h-4 w-4" aria-hidden />
      <span className="font-mono text-[10px] tracking-[0.06em]">SNIP</span>
    </button>
  );
}
