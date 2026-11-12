"use client";

/**
 * "Teach me": a switch beside the answer style under the chat's box (the course chat, DSA Mastery's chat and problem
 * tutor). On, the tutor guides with one question at a time and explains once the learner has tried or asks to see it
 * (lib/ai/teaching.ts). Remembered (useTeachMode: this browser, the account and the memory's prefs).
 */
import { GraduationCap } from "lucide-react";
import { useTeachMode } from "./useTeaching";

export default function TeachToggle({ from, className = "" }: { from: string; className?: string }) {
  const [on, set] = useTeachMode();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Teach me: guide me with questions before explaining"
      title={on ? "Teach me is on: the tutor asks one question at a time and explains once you've tried. Tap to turn off." : "Teach me: the tutor guides you with questions, one at a time, and explains once you've tried."}
      onClick={() => set(!on, from)}
      className={`inline-flex min-h-8 shrink-0 items-center gap-1.5 border px-2 font-mono text-[11.5px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal [@media(pointer:coarse)]:min-h-10 ${
        on ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg-3 hover:border-fg-3 hover:text-fg-2"
      } ${className}`}
    >
      <GraduationCap className={`h-3.5 w-3.5 ${on ? "" : "text-signal-text"}`} aria-hidden />
      <span>teach me</span>
      <span aria-hidden className={`font-semibold ${on ? "" : "text-fg-4"}`}>
        {on ? "on" : "off"}
      </span>
    </button>
  );
}
