"use client";

/**
 * The metro map on phones (below 768 px): one vertical "next stops" strip along your route instead of the map (the approved
 * MetroPhone board). The current stop is open, with its lessons and Open; tap any stop to see the same. Finished stops fold
 * into one line; the stops off your route are counted, not drawn. The Next stop button stays at the bottom of the screen.
 */
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { track } from "@/lib/track";
import { LINE_TOKEN, type LineId } from "@/lib/dsa/metro/layout";
import type { GoalPref, Metro, RouteInfo, Station, StationLesson } from "@/lib/dsa/metro/model";
import type { NextStep } from "@/lib/dsa/continue";
import { BIG, BTN_PRIMARY } from "../../ui/kit";
import { GoalPicker, Legend, RouteChips, primaryOf, routeHeading } from "./Panels";
import { stateWords } from "./MetroMap";
import { BranchList, LessonList, ProblemsLink } from "./StationLessons";
import type { OutlineBranch } from "@/lib/dsa/outline";

const tone = (l: LineId) => `var(${LINE_TOKEN[l]})`;

function Dot({ s, here }: { s: Station; here: boolean }) {
  const c = tone(s.line);
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full ${here ? "h-7 w-7" : "h-[22px] w-[22px]"}`}
      style={{ background: s.state === "done" ? c : "var(--c-surface)", border: `${s.state === "prog" ? 4 : 3}px solid ${s.state === "done" ? c : s.state === "prog" ? "var(--c-line-strong)" : c}`, borderTopColor: s.state === "prog" ? c : undefined, boxShadow: here ? `0 0 0 4px var(--c-bg), 0 0 0 6px ${c}` : undefined }}
    >
      {s.state === "done" ? <Check className="h-3 w-3" style={{ color: "var(--c-m-on)" }} strokeWidth={3} /> : null}
    </span>
  );
}

export default function MetroPhone({
  metro,
  info,
  hereId,
  next,
  ready,
  goal,
  isNew,
  onGoal,
  lineTitle,
  lessonsOf,
}: {
  metro: Metro;
  info: RouteInfo;
  hereId: string;
  next: NextStep | null;
  ready: boolean;
  goal: GoalPref | null;
  isNew: boolean;
  onGoal: (g: GoalPref) => void;
  lineTitle: (l: LineId) => string;
  lessonsOf: (s: Station) => { lessons: StationLesson[]; moduleId: string; branches?: (OutlineBranch & { done: boolean })[] } | null;
}) {
  // undefined = the stop the learner is at is open; null = all folded; one stop open at a time
  const [open, setOpen] = useState<string | null | undefined>(undefined);
  const [showDone, setShowDone] = useState(false);
  const [picking, setPicking] = useState(false);
  const route = info.ids.map((id) => metro.byId.get(id)).filter((s): s is Station => !!s);
  const onRoute = new Set(info.ids);
  const doneOff = metro.stations.filter((s) => s.state === "done" && !onRoute.has(s.id));
  const rest = metro.stations.filter((s) => s.state !== "done" && !onRoute.has(s.id));
  const sel = open === undefined ? hereId : open;
  const main = ready ? primaryOf(next, metro.byId.get(hereId), isNew) : null;
  const goalName = metro.byId.get(info.goal)?.label || "";

  return (
    <div className="flex flex-col gap-4">
      {ready ? (
        <>
          <div className="flex flex-col gap-2.5">
            <h2 className="m-0 font-display text-[28px] font-extrabold leading-[1.05] tracking-[-0.02em] text-fg">{routeHeading(metro, info)}</h2>
            <RouteChips metro={metro} ids={info.ids} />
            <span className="text-[12.5px] text-fg-3">
              Goal: {goalName} ·{" "}
              <button type="button" aria-expanded={picking} onClick={() => setPicking((v) => !v)} className="min-h-8 text-fg underline underline-offset-2">
                {isNew && !goal ? "Choose your goal" : "change goal"}
              </button>
            </span>
            {picking ? <GoalPicker metro={metro} goal={goal} onSave={onGoal} onClose={() => setPicking(false)} /> : null}
          </div>

          <ol aria-label="Your next stops" className="relative m-0 flex list-none flex-col gap-2.5 p-0">
            {doneOff.length ? (
              <li className="flex items-center justify-between gap-3 pl-[42px] text-[13px] text-fg-2">
                <span>
                  {doneOff.length} {doneOff.length === 1 ? "stop" : "stops"} done
                </span>
                <button type="button" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)} className="min-h-9 px-1 text-[13px] text-fg-3 underline underline-offset-2">
                  {showDone ? "Hide" : "Show"}
                </button>
              </li>
            ) : null}
            {showDone
              ? doneOff.map((s) => (
                  <li key={s.id} className="pl-[42px] text-[13px] text-fg-3">
                    {s.label}
                  </li>
                ))
              : null}
            {route.map((s, i) => {
              const here = s.id === hereId;
              const expanded = s.id === sel;
              const isGoal = s.id === info.goal && route.length > 1;
              return (
                <li key={s.id} className="relative flex items-start gap-3" data-tour={here ? "station" : undefined}>
                  <span className="relative flex w-7 shrink-0 justify-center">
                    {i < route.length - 1 ? <span aria-hidden className="absolute -bottom-[33px] left-1/2 w-1.5 -translate-x-1/2" style={{ background: tone(s.line), top: here ? 26 : 23 }} /> : null}
                    <span className="relative z-10 mt-3">
                      <Dot s={s} here={here} />
                    </span>
                  </span>
                  <div className={`min-w-0 flex-1 rounded-[14px] border ${expanded ? "border-signal bg-surface" : "border-line bg-surface"} ${here && expanded ? "bg-bg" : ""}`}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={`stop-${s.id}`}
                      onClick={() => setOpen(s.id === sel ? null : s.id)}
                      className="flex min-h-12 w-full items-center gap-2 px-4 py-3 text-left"
                    >
                      <span className="text-[16px] font-semibold text-fg">{s.label}</span>
                      {here ? <span className="rounded-full bg-signal px-2 py-0.5 text-[11px] font-semibold text-on-signal">You are here</span> : null}
                      {isGoal ? <span className="rounded-full bg-fg px-2 py-0.5 text-[11px] font-semibold text-bg">Goal</span> : null}
                      {s.branches.length ? (
                        <span data-badge={s.id} className="ml-auto flex items-center gap-1.5">
                          <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-fg-3" />
                          <span className="sr-only">{s.branches.length} more practice {s.branches.length === 1 ? "lesson" : "lessons"}</span>
                        </span>
                      ) : null}
                      <span className={`${s.branches.length ? "" : "ml-auto "}text-[12.5px] text-fg-3`}>{s.planned ? "Soon" : `${s.done}/${s.total}`}</span>
                    </button>
                    {expanded ? (
                      <div id={`stop-${s.id}`} className="flex flex-col gap-2.5 px-4 pb-4">
                        <span className="text-[13px] text-fg-2">
                          {s.branches.length ? <span className="mr-1 font-mono text-[12px] font-bold text-fg-3">+{s.branches.length} more practice {s.branches.length === 1 ? "lesson" : "lessons"}. </span> : null}
                          {s.lines.length > 1 ? `On two lines: ${s.lines.map(lineTitle).join(" and ")}. ` : `${lineTitle(s.line)} line. `}
                          {stateWords(s)}.
                        </span>
                        {(() => {
                          const c = lessonsOf(s);
                          return c ? <LessonList station={s} lessons={c.lessons} here={here} from="phone" /> : null;
                        })()}
                        {(() => {
                          const c = lessonsOf(s);
                          return c?.branches?.length ? <BranchList station={s} branches={c.branches} from="phone" /> : null;
                        })()}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          {s.href ? (
                            <Link href={s.href} onClick={() => track("dsa_station_open", { station: s.id, from: "phone" })} className={`${BTN_PRIMARY} min-h-11 rounded-[10px] px-5 text-[14px]`}>
                              {s.state === "prog" || here ? `Continue: lesson ${s.nextLesson}` : "Start"}
                            </Link>
                          ) : null}
                          {(() => {
                            const c = lessonsOf(s);
                            return c ? <ProblemsLink station={s} moduleId={c.moduleId} from="phone" /> : null;
                          })()}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
            {rest.length ? (
              <li className="pl-[42px] text-[13px] text-fg-3">
                {rest.length} more {rest.length === 1 ? "stop" : "stops"} after this, on other lines
              </li>
            ) : null}
          </ol>

          {/* the one obvious button, kept on screen above the dock */}
          <div className="sticky bottom-[84px] z-20 -mx-1 bg-gradient-to-t from-bg via-bg to-transparent px-1 pb-2 pt-4" data-tour="route">
            {main ? (
              <Link href={main.href} onClick={() => track("dsa_continue", { from: "metro-phone", first: main.first })} className={`${BTN_PRIMARY} ${BIG} w-full !min-h-[52px] justify-center shadow-[0_10px_30px_color-mix(in_srgb,var(--c-fg)_18%,transparent)]`}>
                <span className="min-w-0 truncate">{main.label}</span>
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
              </Link>
            ) : null}
          </div>

          <Legend metro={metro} />

        </>
      ) : (
        <div aria-hidden aria-busy="true" className="min-h-[360px]" />
      )}

    </div>
  );
}
