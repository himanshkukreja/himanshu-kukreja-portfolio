"use client";

/** Watch, Read or Listen: one segmented control (role="group"); the choice is remembered (learnPrefs). */
import type { LearnMode } from "./learnPrefs";
import { SEG, seg } from "../ui/kit";

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
    <div role="group" aria-label="Learn mode" className={`${SEG} grid w-full grid-cols-3 sm:inline-flex sm:w-auto`}>
      {OPTIONS.map((o) => {
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
            className={`${seg(on)} min-h-[38px] sm:min-h-[34px] ${off ? "!text-fg-4" : ""}`}
          >
            {o.name}
            {hint && !on ? <span className="hidden text-[11px] font-normal text-fg-4 xl:inline">{hint}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
