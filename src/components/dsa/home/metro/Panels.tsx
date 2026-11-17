"use client";

/**
 * The metro home's cards: the route card (the one obvious Next stop button, the goal picker), the always-visible legend, the
 * station card, and the Map | List switch with its "How this map works" link. Theme tokens only.
 */
import Link from "next/link";
import { useId, useState } from "react";
import { ArrowRight, HelpCircle, RotateCcw } from "lucide-react";
import { track } from "@/lib/track";
import { LINE_TOKEN, type LineId } from "@/lib/dsa/metro/layout";
import { interchangeText, type StationLesson, type GoalKind, type GoalPref, type Metro, type RouteInfo, type Station } from "@/lib/dsa/metro/model";
import type { NextStep } from "@/lib/dsa/continue";
import { fmtDuration, type OutlineBranch } from "@/lib/dsa/outline";
import { BIG, BTN_PRIMARY, FILL, KICKER, SEG, TRACK, seg } from "../../ui/kit";
import type { HomeView } from "./useMetroPrefs";
import { BranchList, LessonList, ProblemsLink } from "./StationLessons";

const tone = (l: LineId) => `var(${LINE_TOKEN[l]})`;
const PANEL = "rounded-[18px] border border-line bg-surface shadow-[0_10px_30px_color-mix(in_srgb,var(--c-fg)_8%,transparent)]";
const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text";

/** Map | List, and (map view) the "How this map works" link. */
export function HomeBar({ kicker, view, onView, onHow, onRedo }: { kicker: string; view: HomeView; onView: (v: HomeView) => void; onHow?: () => void; onRedo?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="m-0 font-mono text-[11px] uppercase tracking-label text-fg-3 sm:text-[12px]">{kicker}</p>
      <div className="flex items-center gap-3">
        {onHow ? (
          <button type="button" onClick={onHow} className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-fg ${FOCUS}`}>
            <HelpCircle className="h-4 w-4" aria-hidden />
            <span className="sr-only sm:not-sr-only">How this map works</span>
          </button>
        ) : null}
        {onRedo ? (
          <button type="button" onClick={onRedo} className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-fg ${FOCUS}`}>
            <RotateCcw className="h-4 w-4" aria-hidden />
            <span className="sr-only sm:not-sr-only">Redo the welcome tour</span>
          </button>
        ) : null}
        <div role="group" aria-label="Course view" className={SEG} data-tour="toggle">
          {(["map", "list"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => onView(v)} className={`${seg(view === v)} !min-h-9 !px-4 !text-[13px]`}>
              {v === "map" ? "Map" : "List"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Where the primary button goes and says. One button, always: Start here / Next stop, or a caught-up fallback. */
export function primaryOf(next: NextStep | null, station: Station | undefined, isNew = false): { href: string; label: string; first: boolean } | null {
  if (!next) return null;
  if (next.state === "empty") return { href: "/dsa/practice", label: "Open Practice", first: false };
  if (next.state === "caught-up" && !station?.href) return { href: "/dsa/practice?list=core-150", label: "Practise more", first: false };
  if (station?.href) {
    // the station's first unfinished lesson; when Continue points at that very lesson its button also knows the step
    const same = next.state !== "caught-up" && next.regionCode === station.regionCode && next.n === station.nextLesson;
    return { href: same ? next.href : station.href, label: `${isNew ? "Start here" : "Next stop"}: ${station.label}, lesson ${station.nextLesson}`, first: isNew };
  }
  if (next.state === "caught-up") return { href: "/dsa/practice?list=core-150", label: "Practise more", first: false };
  return { href: next.href, label: `${next.state === "start" ? "Start here" : "Next stop"}: ${next.moduleTitle}, lesson ${next.n}`, first: next.state === "start" };
}

const GOALS: { kind: GoalKind; title: string; hint: string }[] = [
  { kind: "scratch", title: "Learn from scratch", hint: "Follow the course in order, one milestone at a time." },
  { kind: "topic", title: "A specific topic", hint: "Pick a station and the route runs there." },
  { kind: "interview", title: "Interview prep", hint: "Aim for Dynamic programming, the interview staple." },
];

export function GoalPicker({ metro, goal, onSave, onClose }: { metro: Metro; goal: GoalPref | null; onSave: (g: GoalPref) => void; onClose: () => void }) {
  const id = useId();
  const [kind, setKind] = useState<GoalKind>(goal?.kind || "scratch");
  const [station, setStation] = useState(goal?.station && metro.byId.has(goal.station) ? goal.station : "s4-trees-and-bst");
  const options = metro.stations.filter((s) => !s.planned);
  return (
    <form
      className="mt-3 flex flex-col gap-3 border-t border-line pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ kind, station: kind === "topic" ? station : undefined });
        track("dsa_goal", { kind });
        onClose();
      }}
    >
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1.5 p-0 text-[13px] font-semibold text-fg">Choose your goal</legend>
        {GOALS.map((g) => (
          <label key={g.kind} className={`flex cursor-pointer gap-2.5 rounded-xl border px-3 py-2.5 ${kind === g.kind ? "border-signal bg-bg" : "border-line"}`}>
            <input type="radio" name={`${id}-goal`} checked={kind === g.kind} onChange={() => setKind(g.kind)} className="mt-1 accent-[var(--c-signal)]" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13.5px] font-semibold text-fg">{g.title}</span>
              <span className="text-[12px] text-fg-3">{g.hint}</span>
              {g.kind === "topic" && kind === "topic" ? (
                <select aria-label="Topic" value={station} onChange={(e) => setStation(e.target.value)} className="mt-1.5 min-h-10 rounded-lg border border-line-strong bg-surface px-2 text-[13px] text-fg">
                  {options.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              ) : null}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex gap-2">
        <button type="submit" className={`${BTN_PRIMARY} min-h-10 rounded-[10px] px-4 text-[13.5px]`}>
          Set goal
        </button>
        <button type="button" onClick={onClose} className={`min-h-10 rounded-[10px] px-3 text-[13.5px] font-medium text-fg-2 hover:text-fg ${FOCUS}`}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function RouteChips({ metro, ids }: { metro: Metro; ids: string[] }) {
  const names = ids.map((id) => metro.byId.get(id)?.label || id);
  return (
    <ol aria-label={`Your route: ${names.join(", then ")}`} className="m-0 flex list-none flex-wrap items-center gap-x-1 gap-y-1.5 p-0 text-[12px] font-semibold">
      {names.map((n, i) => (
        <li key={ids[i]} className="flex items-center gap-1">
          {i > 0 ? (
            <span aria-hidden className="text-fg-3">
              →
            </span>
          ) : null}
          <span className={`rounded-full px-2.5 py-[5px] ${i === 0 ? "bg-signal text-on-signal" : "bg-surface-2 text-fg"}`}>{n}</span>
        </li>
      ))}
    </ol>
  );
}

export function routeHeading(metro: Metro, info: RouteInfo): string {
  const goal = metro.byId.get(info.goal)?.label || "your goal";
  return `${info.stops} ${info.stops === 1 ? "stop" : "stops"} to ${goal}`;
}

export function RouteCard({
  metro,
  info,
  hereStation,
  next,
  ready,
  isNew,
  goal,
  onGoal,
  className = "",
  compact = false,
}: {
  className?: string;
  /** computers, two-column band: the short form (the station card says where you are) */
  compact?: boolean;
  metro: Metro;
  info: RouteInfo;
  hereStation: Station | undefined;
  next: NextStep | null;
  ready: boolean;
  isNew: boolean;
  goal: GoalPref | null;
  onGoal: (g: GoalPref) => void;
}) {
  const [picking, setPicking] = useState(false);
  const main = ready ? primaryOf(next, hereStation, isNew) : null;
  const goalName = metro.byId.get(info.goal)?.label || "";
  return (
    <section aria-label="Your route" className={`${PANEL} flex flex-col ${compact ? "gap-3 p-5" : "gap-3.5 p-6"} ${className}`}>
      <p className={`${KICKER} !text-signal-text`}>Your route</p>
      {ready ? (
        <>
          <h2 className={`m-0 font-display font-extrabold ${compact ? "text-[28px]" : "text-[32px]"} leading-[1.05] tracking-[-0.02em] text-fg`}>{routeHeading(metro, info)}</h2>
          <RouteChips metro={metro} ids={info.ids} />
          <p className={`m-0 text-[13px] leading-normal text-fg-3 ${compact ? "hidden" : ""}`}>
            {info.lessons ? `${info.lessons} ${info.lessons === 1 ? "lesson" : "lessons"}${info.minutes ? ` and about ${fmtDuration(info.minutes)}` : ""} away. ` : ""}{compact ? "Nothing is locked." : "Everything off your route is dimmed, but nothing is locked."}
          </p>
          <div className={`mt-auto flex flex-col gap-2.5 border-t border-line ${compact ? "pt-3" : "pt-3.5"}`}>
            {hereStation && !compact ? (
              <>
                <span className="text-[12px] text-fg-3">
                  You are here · {hereStation.label} · {hereStation.done} of {hereStation.total} lessons done
                </span>
                <span aria-hidden className={`${TRACK} grid h-[5px]`} style={{ gridTemplateColumns: `repeat(${Math.max(1, hereStation.total)}, minmax(0, 1fr))`, gap: 4, background: "transparent" }}>
                  {Array.from({ length: Math.max(1, hereStation.total) }, (_, i) => (
                    <span key={i} className={`h-[5px] rounded-full ${i < hereStation.done ? "bg-signal" : "bg-line dark:bg-line-strong"}`} />
                  ))}
                </span>
              </>
            ) : null}
            <div data-tour="route">
              {main ? (
                <Link
                  href={main.href}
                  onClick={() => track("dsa_continue", { from: "metro", first: main.first })}
                  className={`${BTN_PRIMARY} ${BIG} w-full !min-h-[50px] justify-center`}
                >
                  <span className="min-w-0 truncate">{main.label}</span>
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                </Link>
              ) : null}
            </div>
            <span className="text-center text-[12.5px] text-fg-3">
              Goal: {goalName} ·{" "}
              <button type="button" aria-expanded={picking} onClick={() => setPicking((v) => !v)} className={`min-h-8 text-fg underline underline-offset-2 ${FOCUS}`}>
                {isNew && !goal ? "Choose your goal" : "change goal"}
              </button>
            </span>
          </div>
          {picking ? <GoalPicker metro={metro} goal={goal} onSave={onGoal} onClose={() => setPicking(false)} /> : null}
        </>
      ) : (
        <div aria-hidden aria-busy="true" className="min-h-[250px]" />
      )}
    </section>
  );
}

/** Always visible: what the colours and the dots mean, in plain words. */
export function Legend({ metro, className = "", wide = false }: { metro: Metro; className?: string; wide?: boolean }) {
  return (
    <section aria-label="Map legend" data-tour="lines" className={`${PANEL} flex flex-col gap-3 px-5 py-4 text-[12.5px] text-fg ${wide ? "lg:flex-row lg:items-center lg:gap-6" : ""} ${className}`}>
      <p className={`m-0 text-[12px] text-fg-3 ${wide ? "lg:max-w-[150px]" : ""}`}>Each coloured line is one part of the course.</p>
      <ul className={`m-0 grid list-none gap-x-3.5 gap-y-2.5 p-0 ${wide ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2"}`}>
        {metro.lines.map((l) => (
          <li key={l.id} className="flex items-center gap-2">
            <span aria-hidden className="h-1.5 w-[22px] shrink-0 rounded-full" style={{ background: tone(l.id) }} />
            {l.title}
          </li>
        ))}
      </ul>
      <ul className={`m-0 flex list-none flex-wrap items-center gap-x-3.5 gap-y-2 border-t border-line p-0 pt-3 text-fg-2 ${wide ? "lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0" : ""}`}>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-3 rounded-full bg-signal" />
          Done
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-3 rounded-full border-[3px] border-line-strong" style={{ borderTopColor: "var(--c-signal)" }} />
          In progress
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-3 rounded-full border-2 border-signal bg-surface" />
          Not started
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-signal">
            <span className="h-1 w-1 rounded-full bg-signal" />
          </span>
          You are here
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-flex items-center">
            <span className="h-px w-2 bg-fg-3" />
            <span className="h-2 w-2 rounded-full border-[1.5px] border-fg-3 bg-surface" />
          </span>
          Side branch (optional)
        </li>
      </ul>
    </section>
  );
}

export function StationCard({
  station,
  lineTitle,
  isHere,
  inRoute,
  content,
  fill = false,
}: {
  station: Station | undefined;
  lineTitle: (l: LineId) => string;
  isHere: boolean;
  inRoute: boolean;
  /** the station's lessons (the same outline the List view reads) and its module id for the Practice filter */
  content?: { lessons: StationLesson[]; moduleId: string; branches?: (OutlineBranch & { done: boolean })[] } | null;
  /** grow to the height the row gives it (the lesson list takes the room) */
  fill?: boolean;
}) {
  if (!station) return null;
  const pct = station.total ? Math.round((station.done / station.total) * 100) : 0;
  const note = station.lines.length > 1 ? interchangeText(station, lineTitle) : station.planned ? "The lessons for this topic are on their way." : station.state === "done" ? "Finished. Nice work." : station.state === "prog" ? "You are partway through this station." : "Open any time; nothing is locked.";
  const tiles = [
    { k: "Lessons", v: `${station.done} / ${station.total}` },
    { k: "Problems", v: `${station.solved} / ${station.problems}` },
    { k: "Reading time", v: station.minutes ? fmtDuration(station.minutes) : "Soon" },
  ];
  const lessons = content?.lessons ?? [];
  return (
    <section aria-label="Station card" className={`${PANEL} flex flex-col gap-2.5 px-5 py-4 ${fill ? "min-h-0 flex-1" : ""}`} data-tour-card>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] tracking-[0.06em] text-fg-3">STATION</span>
        {station.lines.map((l) => (
          <span key={l} className="rounded-full px-2.5 py-[3px] text-[11px] font-semibold" style={{ background: tone(l), color: "var(--c-m-on)" }}>
            {lineTitle(l)}
          </span>
        ))}
        {isHere ? <span className="rounded-full bg-signal px-2.5 py-[3px] text-[11px] font-semibold text-on-signal">You are here</span> : inRoute ? <span className="rounded-full bg-surface-2 px-2.5 py-[3px] text-[11px] font-semibold text-fg">On your route</span> : null}
      </div>
      <div aria-live="polite" className="flex flex-col gap-1.5">
        <h3 className="m-0 font-display text-[28px] font-extrabold leading-none tracking-[-0.02em] text-fg">{station.label}</h3>
        {station.lines.length > 1 || station.planned ? <p className="m-0 text-[13px] text-fg-2">{note}</p> : null}
      </div>
      <dl className="m-0 flex flex-wrap gap-x-4 gap-y-0.5 text-[12.5px]">
        {tiles.map((t) => (
          <div key={t.k} className="flex items-baseline gap-1.5">
            <dt className="text-fg-3">{t.k === "Reading time" ? "Reading" : t.k}</dt>
            <dd className="m-0 font-semibold text-fg">{t.v}</dd>
          </div>
        ))}
      </dl>
      {lessons.length ? (
        <div className="flex flex-col gap-1 border-t border-line pt-2">
          <div className="relative">
            <div className="max-h-[168px] overflow-y-auto overscroll-contain pr-1">
              <LessonList station={station} lessons={lessons} here={isHere} scroll={false} from="card" />
            </div>
            {lessons.length > 4 ? <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-surface to-transparent" /> : null}
          </div>
        </div>
      ) : null}
      {content?.branches?.length ? (
        <div className="border-t border-line pt-2">
          <BranchList station={station} branches={content.branches} from="card" />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {station.href ? (
          <Link href={station.href} onClick={() => track("dsa_station_open", { station: station.id })} className={`${BTN_PRIMARY} min-h-11 rounded-[10px] px-5 text-[14px]`}>
            {station.state === "prog" || isHere ? `Continue: lesson ${station.nextLesson}` : "Start"}
          </Link>
        ) : (
          <span className="inline-flex min-h-11 items-center rounded-[10px] bg-surface-2 px-5 text-[14px] font-medium text-fg-3">Soon</span>
        )}
        {content ? <ProblemsLink station={station} moduleId={content.moduleId} from="card" /> : null}
        <span className="text-[12.5px] text-fg-3">{station.planned ? `${station.all} lessons planned` : station.state === "done" ? "All lessons done" : `${station.total - station.done} ${station.total - station.done === 1 ? "lesson" : "lessons"} to go`}</span>
      </div>
    </section>
  );
}
