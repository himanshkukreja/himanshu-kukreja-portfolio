"use client";

/** Watch, Read or Listen: one segmented control (role="group"); the choice is remembered (learnPrefs). */
import type { LearnMode } from "./learnPrefs";

const OPTIONS: { id: LearnMode; name: string }[] = [
  { id: "watch", name: "Watch" },
  { id: "read", name: "Read" },
  { id: "listen", name: "Listen" },
];

export default function LearnModes({
  mode,
  onPick,
  canWatch,
  canListen,
  watchMinutes,
  readMinutes,
}: {
  mode: LearnMode;
  onPick: (m: LearnMode) => void;
  canWatch: boolean;
  canListen: boolean;
  watchMinutes: number | null;
  readMinutes: number;
}) {
  return (
    <div role="group" aria-label="Learn mode" className="inline-flex border border-line-strong">
      {OPTIONS.map((o, k) => {
        const off = (o.id === "watch" && !canWatch) || (o.id === "listen" && !canListen);
        const on = mode === o.id;
        const hint = o.id === "watch" ? (canWatch && watchMinutes ? `${watchMinutes} min` : "soon") : o.id === "read" ? `${readMinutes} min` : "";
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onPick(o.id)}
            disabled={off}
            aria-pressed={on}
            title={off ? (o.id === "watch" ? "The lecture for this lesson is coming" : "Listening isn't available in this browser") : undefined}
            className={`inline-flex min-h-11 items-center gap-1.5 px-4 font-mono text-[13px] ${k ? "border-l border-line-strong" : ""} ${
              on ? "bg-signal font-semibold text-on-signal" : off ? "text-fg-4" : "text-fg-2 hover:bg-surface-2 hover:text-fg"
            }`}
          >
            {o.name}
            {hint && !on ? <span className="hidden text-[11px] text-fg-3 sm:inline">{hint}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
