"use client";

/**
 * What is inside a station: its lessons (number, title, status dot, minutes, each a link to the lesson; the one the learner
 * is on says "You are here") and the problems link to Practice filtered to the topic. Shared by the station card
 * (computers) and the phone strip's expanded stop. A long list scrolls inside its box so a card never grows the page.
 */
import { useId, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { track } from "@/lib/track";
import type { Station, StationLesson } from "@/lib/dsa/metro/model";
import type { OutlineBranch } from "@/lib/dsa/outline";

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-signal-text";

function StatusDot({ s }: { s: StationLesson["status"] }) {
  if (s === "done")
    return (
      <span aria-hidden className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-signal">
        <Check className="h-3 w-3 text-on-signal" strokeWidth={3} />
      </span>
    );
  if (s === "now") return <span aria-hidden className="h-[18px] w-[18px] shrink-0 rounded-full border-[4px] border-line-strong" style={{ borderTopColor: "var(--c-signal)" }} />;
  return <span aria-hidden className="h-[18px] w-[18px] shrink-0 rounded-full border-2 border-signal bg-surface" />;
}

const WORDS: Record<StationLesson["status"], string> = { done: "done", now: "in progress", todo: "not started" };

export function LessonList({ station, lessons, here, scroll = true, from }: { station: Station; lessons: StationLesson[]; /** the learner is at this station: its current lesson says "You are here" */ here: boolean; scroll?: boolean; from: string }) {
  if (!lessons.length) return null;
  return (
    <ol aria-label={`${station.label}: lessons`} className={`m-0 flex list-none flex-col gap-0.5 p-0 ${scroll ? "max-h-[236px] overflow-y-auto overscroll-contain pr-1" : ""}`} data-station-lessons>
      {lessons.map((l) => {
        const you = here && l.status === "now";
        const body = (
          <>
            <span className="w-5 shrink-0 text-right font-mono text-[11.5px] text-fg-3">{l.n}</span>
            <StatusDot s={l.status} />
            <span className="min-w-0 flex-1">
              <span className={`block text-[13.5px] leading-snug ${l.status === "done" ? "text-fg-2" : "text-fg"} ${you ? "font-semibold" : ""}`}>
                {l.title}
                <span className="sr-only"> ({WORDS[l.status]})</span>
              </span>
              {you ? <span className="mt-0.5 inline-block rounded-full bg-signal px-2 py-px text-[10.5px] font-semibold text-on-signal">You are here</span> : null}
            </span>
            <span className="shrink-0 font-mono text-[11.5px] text-fg-3">{l.href ? (l.minutes ? `${l.minutes} min` : "") : "Soon"}</span>
          </>
        );
        const cls = `flex min-h-9 items-center gap-2.5 rounded-[10px] px-2 py-1 ${you ? "bg-surface-2" : ""}`;
        return (
          <li key={l.conceptId}>
            {l.href ? (
              <Link href={l.href} onClick={() => track("dsa_station_lesson", { station: station.id, lesson: l.conceptId, from })} className={`${cls} hover:bg-surface-2 ${FOCUS}`}>
                {body}
              </Link>
            ) : (
              <div className={`${cls} opacity-70`}>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** "48 problems →": Practice filtered to the station's module (the bank's `step` filter). */
export function ProblemsLink({ station, moduleId, from }: { station: Station; moduleId: string; from: string }) {
  if (!station.problems) return null;
  return (
    <Link
      href={`/dsa/practice?step=${encodeURIComponent(moduleId)}`}
      onClick={() => track("dsa_station_problems", { station: station.id, from })}
      className={`rounded-md text-[13px] font-medium text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg ${FOCUS}`}
    >
      {station.problems} {station.problems === 1 ? "problem" : "problems"} →
    </Link>
  );
}

const KIND_WORD: Record<OutlineBranch["kind"], string> = { street: "Street", "camp-tent": "Camp", set: "Set" };
const SHOWN = 4;

/**
 * "More practice on this stop": the extra lessons (streets, camp tents, sets) of the station, each one link with its kind,
 * title, problem count and solved state. Optional practice beside the lessons: never numbered with them and never counted
 * in their done totals. Over four, the first four show and "Show all N" opens the rest in place.
 */
export function BranchList({ station, branches, from }: { station: Pick<Station, "id" | "label">; branches: (OutlineBranch & { done: boolean })[]; from: string }) {
  const [all, setAll] = useState(false);
  const id = useId();
  if (!branches.length) return null;
  const shown = all ? branches : branches.slice(0, SHOWN);
  return (
    <div className="flex flex-col gap-1" data-station-branches>
      <p className="m-0 font-mono text-[11px] tracking-[0.06em] text-fg-3">MORE PRACTICE ON THIS STOP</p>
      <ul id={id} aria-label={`${station.label}: more practice`} className="m-0 flex list-none flex-col gap-0.5 p-0">
        {shown.map((b) => (
          <li key={b.key}>
            <Link
              href={b.href}
              onClick={() => track("dsa_station_branch", { station: station.id, branch: b.key, from })}
              className={`flex min-h-9 items-center gap-2.5 rounded-[10px] px-2 py-1 text-[13.5px] hover:bg-surface-2 ${FOCUS}`}
            >
              {b.done ? (
                <span aria-hidden className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-signal">
                  <Check className="h-3 w-3 text-on-signal" strokeWidth={3} />
                </span>
              ) : (
                <span aria-hidden className="h-[18px] w-[18px] shrink-0 rounded-full border-2 border-signal bg-surface" />
              )}
              <span className="min-w-0 flex-1 text-fg">
                <span className="text-fg-3">{KIND_WORD[b.kind]}</span> · {b.title}
                <span className="sr-only"> ({b.done ? "done" : "not started"})</span>
              </span>
              <span className="shrink-0 font-mono text-[11.5px] text-fg-3">{b.problemCount ? `${b.problemCount} problems` : ""}</span>
              <span aria-hidden className="text-fg-3">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {branches.length > SHOWN ? (
        <button
          type="button"
          aria-expanded={all}
          aria-controls={id}
          onClick={() => setAll((v) => !v)}
          className={`self-start rounded-md px-2 py-1 text-[13px] font-medium text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg ${FOCUS}`}
        >
          {all ? "Show fewer" : `Show all ${branches.length}`}
        </button>
      ) : null}
    </div>
  );
}
