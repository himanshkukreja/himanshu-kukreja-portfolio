"use client";

/**
 * The reader setting for hover definitions (term cards in lessons): on by default, stored per
 * browser in hk.terms.v1. "dock" matches the desktop reading dock's buttons; "row" is a labelled
 * switch for settings-style lists (concept map).
 */
import { useSyncExternalStore } from "react";
import { setTermsEnabled, subscribeTerms, termsEnabled } from "@/lib/concepts/dom";

const useTermsEnabled = () => useSyncExternalStore(subscribeTerms, termsEnabled, () => true);

export default function TermsToggle({ variant = "row" }: { variant?: "dock" | "row" }) {
  const on = useTermsEnabled();
  if (variant === "dock") {
    return (
      <button
        type="button"
        onClick={() => setTermsEnabled(!on)}
        aria-pressed={on}
        title={on ? "Hover cards for course terms are on" : "Hover cards for course terms are off"}
        className={`flex min-h-[52px] min-w-14 flex-col items-center justify-center gap-[3px] border-r border-line px-1 ${on ? "text-fg hover:bg-surface-2" : "text-fg-3 hover:bg-surface-2"}`}
      >
        <span aria-hidden className="font-display text-[15px] font-bold leading-none underline decoration-dotted decoration-[1.5px] underline-offset-[3px]">
          Ab
        </span>
        <span className="font-mono text-[10px] tracking-[0.06em]">{on ? "TERMS" : "TERMS OFF"}</span>
      </button>
    );
  }
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 border border-line bg-surface px-4 py-2.5">
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-semibold text-fg">Term cards in lessons</span>
        <span className="text-[12px] leading-snug text-fg-3">Dotted terms open a one-line definition and where it&apos;s taught.</span>
      </span>
      <span className="relative inline-flex shrink-0 items-center">
        <input type="checkbox" role="switch" checked={on} onChange={(e) => setTermsEnabled(e.target.checked)} className="peer sr-only" />
        <span aria-hidden className="block h-6 w-11 border border-line-strong bg-surface-2 transition-colors peer-checked:border-signal peer-checked:bg-signal peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-signal" />
        <span aria-hidden className="absolute left-1 top-1 h-4 w-4 bg-fg-3 transition-transform peer-checked:translate-x-5 peer-checked:bg-on-signal" />
      </span>
    </label>
  );
}
