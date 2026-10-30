"use client";

/**
 * "Annotate" for the reading tools, beside Notebook and Snip: write on the lesson itself (pen / highlighter).
 * `dock` matches the desktop reading dock's buttons, `bar` the phone / tablet reading bar's square buttons (shown from
 * tablet width up: on a phone the marks are view-only). Renders nothing where no annotation layer is mounted.
 */
import { PenLine } from "lucide-react";
import { toggleAnnotating, useAnnotate } from "./mode";

export default function AnnotateButton({ variant = "dock", className = "" }: { variant?: "dock" | "bar"; className?: string }) {
  const { on, ready } = useAnnotate();
  if (!ready) return null;
  const label = on ? "Annotate is on: finish annotating" : "Annotate: write on the lesson with a pen or the mouse";
  if (variant === "bar")
    return (
      <button
        type="button"
        onClick={toggleAnnotating}
        aria-pressed={on}
        aria-label={label}
        data-annot-ui
        className={`hidden h-11 w-10 shrink-0 place-items-center border sm:grid ${on ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg"} ${className}`}
      >
        <PenLine className="h-4 w-4" aria-hidden />
      </button>
    );
  return (
    <button
      type="button"
      onClick={toggleAnnotating}
      aria-pressed={on}
      aria-label={label}
      title="Annotate: write on the lesson"
      data-annot-ui
      className={`flex min-h-[52px] min-w-14 flex-col items-center justify-center gap-[3px] border-r border-line px-1 ${on ? "bg-signal text-on-signal" : "text-fg hover:bg-surface-2"} ${className}`}
    >
      <PenLine className="h-4 w-4" aria-hidden />
      <span className="font-mono text-[10px] tracking-[0.06em]">ANNOTATE</span>
    </button>
  );
}
