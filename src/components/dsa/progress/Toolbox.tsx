"use client";

/**
 * "Your toolbox" (the top of Progress, canvas board 18): the tools earned by finishing metro stations. A card per tool (icon, name,
 * earned date and "used in N problems"; locked ones greyed with "Earn at station X · k of n lessons"), the Earned / Locked filter,
 * the next tool with its Next stop button and the skill band. Everything comes from the same station states as the map
 * (src/lib/dsa/metro/model.ts, toolbox.ts); nothing here has its own idea of "done".
 */
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useGame } from "@/game/GameProvider";
import { buildMetro, currentStation, type ProblemRef } from "@/lib/dsa/metro/model";
import { LINE_NAME, LINE_TOKEN, type LineId } from "@/lib/dsa/metro/layout";
import { BANDS, TOOL_ICON_PATH, isFresh, toolbox, type Tool, type ToolIcon } from "@/lib/dsa/metro/toolbox";
import type { Outline } from "@/lib/dsa/outline";
import { useDsaProgress } from "./useDsaProgress";
import { BTN_PRIMARY, CARD, KICKER, MID, PAGE_H, SEG, seg } from "../ui/kit";

const tone = (l: LineId) => `var(${LINE_TOKEN[l]})`;
type Filter = "all" | "earned" | "locked";

export function ToolIconSvg({ icon, size = 21 }: { icon: ToolIcon; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={TOOL_ICON_PATH[icon]} />
    </svg>
  );
}

const dateOf = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function ToolCard({ t, now }: { t: Tool; now: number }) {
  const fresh = isFresh(t, now);
  const date = dateOf(t.earnedAt);
  const sub = t.earned
    ? [date ? `Earned ${date}` : "Earned", `Used in ${plural(t.usedIn, "problem")}`]
    : [`Earn at station ${t.station}`, t.lessonsDone > 0 ? `${t.lessonsDone} of ${t.lessons} lessons` : `Locked · ${plural(t.lessons, "lesson")}`];
  return (
    <li
      data-tool={t.id}
      data-earned={t.earned ? "" : undefined}
      className={`relative flex min-h-[138px] flex-col gap-1 overflow-hidden rounded-2xl px-4 pb-3.5 pt-[18px] ${t.earned ? `border bg-surface ${fresh ? "border-signal" : "border-line"}` : "border border-dashed border-line-strong bg-surface-2"}`}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: tone(t.line), opacity: t.earned ? 1 : 0 }} />
      <div className="flex items-center gap-2.5">
        <span className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] ${t.earned ? "bg-surface-2" : "bg-line"}`} style={t.earned ? { color: tone(t.line) } : undefined}>
          <span className={t.earned ? undefined : "text-fg-4"}>
            <ToolIconSvg icon={t.icon} />
          </span>
        </span>
        <span className={`text-[15px] font-semibold leading-[1.15] ${t.earned ? "text-fg" : "text-fg-3"}`}>{t.name}</span>
      </div>
      <p className="m-0 mt-1 text-[12.5px] leading-snug text-fg-3">
        <span className="sr-only">{t.earned ? "Earned tool. " : "Locked tool. "}</span>
        {sub[0]}
      </p>
      <p className="m-0 text-[12.5px] leading-snug text-fg-3">{sub[1]}</p>
      {fresh ? <span className="absolute bottom-3 right-3 rounded-full bg-signal px-2 py-0.5 text-[10.5px] font-semibold text-on-signal">New</span> : null}
    </li>
  );
}

export default function Toolbox({ outline, problems, intro }: { outline: Outline; problems: ProblemRef[]; intro?: ReactNode }) {
  const progress = useDsaProgress();
  const { done } = useGame();
  const [filter, setFilter] = useState<Filter>("all");
  const [clock] = useState(() => Date.now());
  const metro = useMemo(() => buildMetro(outline, progress, problems), [outline, progress, problems]);
  const here = useMemo(() => currentStation(outline, metro, progress), [outline, metro, progress]);
  const box = useMemo(() => toolbox(metro, done, here), [metro, done, here]);
  const lineTitle = (l: LineId) => metro.lines.find((x) => x.id === l)?.title || LINE_NAME[l];
  const shown = filter === "all" ? box.tools : filter === "earned" ? box.earned : box.locked;
  const ready = progress.ready;
  const n = (v: number | string) => (ready ? v : "–");
  const { band } = box;
  const nxt = box.next;
  const pct = box.total ? Math.round((box.earned.length / box.total) * 100) : 0;
  const filters: [Filter, string][] = [
    ["all", ready ? `All ${box.total}` : "All"],
    ["earned", ready ? `Earned ${box.earned.length}` : "Earned"],
    ["locked", ready ? `Locked ${box.locked.length}` : "Locked"],
  ];

  return (
    <section id="toolbox" aria-labelledby="toolbox-h" className="flex scroll-mt-24 flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="font-mono text-xs uppercase tracking-label text-signal-text">Progress</span>
          <h1 id="toolbox-h" className={PAGE_H}>
            Your toolbox<span className="text-signal-text">.</span>
          </h1>
        </div>
        <div role="group" aria-label="Filter tools" className={SEG}>
          {filters.map(([k, label]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={`${seg(filter === k)} !min-h-9 !px-3.5 !text-[13px] sm:!px-4`}>
              {label}
            </button>
          ))}
        </div>
      </header>
      {intro}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)_minmax(0,330px)]">
        <div className={`${CARD} flex flex-col justify-between gap-3 p-[18px_22px]`}>
          <p className={KICKER}>Tools earned</p>
          <p className="m-0 font-display text-[40px] font-extrabold leading-none tracking-[-0.03em] text-fg">
            {n(box.earned.length)} <span className="text-[22px] text-fg-3">of {n(box.total)}</span>
          </p>
          <div role="progressbar" aria-label="Tools earned" aria-valuemin={0} aria-valuemax={box.total} aria-valuenow={box.earned.length} className="h-1.5 rounded-full bg-line">
            <div className="h-full rounded-full bg-signal transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${ready ? pct : 0}%` }} />
          </div>
          <p className="m-0 text-[12.5px] text-fg-3">{ready ? `Used in ${plural(box.usedTotal, "solved problem")} so far` : "Counting your progress…"}</p>
        </div>

        <div className={`${CARD} flex flex-col gap-3 p-[18px_22px]`}>
          <p className="m-0 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className={KICKER}>Skill band</span>
            <span className="text-[15px] font-semibold text-fg">{ready ? band.band.label : "–"}</span>
            <span className="text-[12.5px] text-fg-3">{ready && band.next && band.nextAt != null ? `next band at ${band.nextAt} ${band.nextAt === 1 ? "tool" : "tools"}` : ready ? "top band reached" : ""}</span>
          </p>
          <ol className="m-0 grid list-none grid-cols-4 gap-1.5 p-0" aria-label="Skill bands">
            {BANDS.map((b, i) => (
              <li key={b.id} aria-current={ready && i === band.index ? "step" : undefined} className="flex min-w-0 flex-col gap-1.5">
                <span className={`h-2 rounded-full ${ready && i <= band.index ? (i === band.index ? "bg-signal" : "bg-fg-3") : "bg-line"}`} />
                <span className={`truncate text-[12px] ${ready && i === band.index ? "font-semibold text-fg" : "text-fg-3"}`}>{b.label}</span>
              </li>
            ))}
          </ol>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {box.lines.map((l) => (
              <li key={l.id} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[12px] text-fg-2">
                <span aria-hidden className="h-[5px] w-3.5 rounded-full" style={{ background: tone(l.id) }} />
                {lineTitle(l.id)} <span className="font-mono tabular-nums text-fg">{n(`${l.earned}/${l.total}`)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={`${CARD} flex flex-col justify-between gap-3 p-[18px_22px]`}>
          <p className={`${KICKER} !text-signal-text`}>Next tool</p>
          {nxt ? (
            <>
              <p className="m-0 font-display text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-fg">{nxt.name}</p>
              <p className="m-0 text-[12.5px] text-fg-3">
                {nxt.station} station · {plural(nxt.lessons - nxt.lessonsDone, "lesson")} to go
              </p>
              {nxt.href ? (
                <Link href={nxt.href} className={`${BTN_PRIMARY} ${MID} mt-1 w-full`}>
                  Next stop: {nxt.station}, lesson {nxt.nextLesson} →
                </Link>
              ) : null}
            </>
          ) : (
            <>
              <p className="m-0 font-display text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-fg">{ready ? "Every tool earned" : "–"}</p>
              <p className="m-0 text-[12.5px] text-fg-3">{ready ? "New tools arrive with new stations." : ""}</p>
            </>
          )}
        </div>
      </div>

      {!ready ? (
        <p role="status" className="m-0 rounded-2xl border border-dashed border-line-strong px-5 py-6 font-mono text-[13px] text-fg-3">Counting your progress…</p>
      ) : shown.length ? (
        <ul className="m-0 grid list-none grid-cols-2 gap-3.5 p-0 sm:grid-cols-3 lg:grid-cols-6" aria-label={filter === "all" ? "All tools" : filter === "earned" ? "Earned tools" : "Locked tools"}>
          {shown.map((t) => (
            <ToolCard key={t.id} t={t} now={clock} />
          ))}
        </ul>
      ) : (
        <p className="m-0 rounded-2xl border border-dashed border-line-strong px-5 py-6 text-[14px] text-fg-2">
          {filter === "earned" ? "No tools yet. Finish a station on the map to earn the first one." : "Every tool is earned."}
        </p>
      )}
    </section>
  );
}
