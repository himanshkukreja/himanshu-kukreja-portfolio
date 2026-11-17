"use client";

/**
 * The skill radar: one axis per topic group, 0 to 100, from what the learner has done (src/lib/dsa/skill-radar.ts). An SVG with
 * a text alternative, and the same numbers as a table beside it (the table is the accessible version and shows the parts).
 */
import { useMemo } from "react";
import { useGame } from "@/game/GameProvider";
import { buildMetro, type ProblemRef } from "@/lib/dsa/metro/model";
import { radarPoint, skillRadar, type RadarAxis } from "@/lib/dsa/skill-radar";
import type { Outline } from "@/lib/dsa/outline";
import { useDsaProgress } from "./useDsaProgress";
import { CARD } from "../ui/kit";

const R = 104;
const CX = 180;
const CY = 150;
const RINGS = [25, 50, 75, 100];

/** Wrap a label into lines of about `max` characters. */
function lines(text: string, max = 14): string[] {
  const out: string[] = [];
  for (const w of text.split(" ")) {
    const last = out[out.length - 1];
    if (last && (last + " " + w).length <= max) out[out.length - 1] = `${last} ${w}`;
    else out.push(w);
  }
  return out;
}

function Radar({ axes }: { axes: RadarAxis[] }) {
  const n = axes.length;
  const poly = axes.map((a, i) => radarPoint(i, n, a.strength, R, CX, CY).map((v) => v.toFixed(1)).join(",")).join(" ");
  const summary = axes.map((a) => `${a.label} ${a.strength} of 100`).join(", ");
  return (
    <svg viewBox="0 24 360 252" role="img" aria-label={`Skill radar. ${summary}.`} className="mx-auto block h-auto w-full max-w-[420px]">
      {RINGS.map((r) => (
        <polygon key={r} points={axes.map((_, i) => radarPoint(i, n, r, R, CX, CY).map((v) => v.toFixed(1)).join(",")).join(" ")} fill="none" stroke="var(--c-line)" strokeWidth="1" />
      ))}
      {axes.map((a, i) => {
        const [x, y] = radarPoint(i, n, 100, R, CX, CY);
        return <line key={a.id} x1={CX} y1={CY} x2={x} y2={y} stroke="var(--c-line)" strokeWidth="1" />;
      })}
      <polygon points={poly} fill="var(--c-signal)" fillOpacity="0.22" stroke="var(--c-signal)" strokeWidth="2" strokeLinejoin="round" />
      {axes.map((a, i) => {
        const [px, py] = radarPoint(i, n, a.strength, R, CX, CY);
        const [lx, ly] = radarPoint(i, n, 100, R + 16, CX, CY);
        const anchor = lx < CX - 8 ? "end" : lx > CX + 8 ? "start" : "middle";
        const ls = lines(a.label);
        return (
          <g key={a.id}>
            <circle cx={px} cy={py} r="3.5" fill="var(--c-signal)" />
            <text x={lx} y={ly - ((ls.length - 1) * 12) / 2 + 4} textAnchor={anchor} fontSize="11" fill="var(--c-fg-2)" fontFamily="var(--font-body, inherit)">
              {ls.map((t, j) => (
                <tspan key={t} x={lx} dy={j ? 12 : 0}>
                  {t}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function SkillRadar({ outline, problems }: { outline: Outline; problems: ProblemRef[] }) {
  const progress = useDsaProgress();
  const { done } = useGame();
  const axes = useMemo(() => {
    const metro = buildMetro(outline, progress, problems);
    return skillRadar({ outline, metro, problems, concepts: progress.concepts, solved: progress.solved, checkpoints: progress.checkpoints, done });
  }, [outline, progress, problems, done]);
  const plot = axes.length >= 3;
  const any = axes.some((a) => a.strength > 0);

  return (
    <div className={`${CARD} flex flex-col gap-4 p-4 sm:p-5`}>
      <div className={`grid items-center gap-5 ${plot ? "md:grid-cols-[minmax(0,420px)_minmax(0,1fr)]" : ""}`}>
        {plot ? <Radar axes={axes} /> : null}
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[300px] border-collapse text-left text-[13.5px]">
            <caption className="sr-only">Strength by topic group, out of 100, with what it is made of</caption>
            <thead>
              <tr className="border-b border-line font-mono text-[11px] uppercase tracking-label text-fg-3">
                <th scope="col" className="py-2 pr-3 font-normal">Topic group</th>
                <th scope="col" className="py-2 pr-3 text-right font-normal">Strength</th>
                <th scope="col" className="py-2 pr-3 text-right font-normal">Problems</th>
                <th scope="col" className="py-2 pr-3 text-right font-normal">Lessons</th>
                <th scope="col" className="hidden py-2 pr-3 text-right font-normal sm:table-cell">Quizzes</th>
                <th scope="col" className="hidden py-2 text-right font-normal sm:table-cell">Exercises</th>
              </tr>
            </thead>
            <tbody>
              {axes.map((a) => (
                <tr key={a.id} className="border-b border-line last:border-b-0">
                  <th scope="row" className="py-2.5 pr-3 font-medium text-fg">{a.label}</th>
                  <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-fg">{a.strength}</td>
                  <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-fg-2">{a.problems.solved}/{a.problems.total}</td>
                  <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-fg-2">{a.lessons.done}/{a.lessons.total}</td>
                  <td className="hidden py-2.5 pr-3 text-right font-mono tabular-nums text-fg-2 sm:table-cell">{a.checkpoints.total ? `${a.checkpoints.passed}/${a.checkpoints.total}` : "–"}</td>
                  <td className="hidden py-2.5 text-right font-mono tabular-nums text-fg-2 sm:table-cell">{a.exercises}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!progress.ready ? <p role="status" className="m-0 pt-2 font-mono text-[12px] text-fg-3">Counting your progress…</p> : !any ? <p className="m-0 pt-2 text-[13.5px] text-fg-2">Learn a lesson or solve a problem and the shape starts to fill in.</p> : null}
        </div>
      </div>
      <p className="m-0 text-[12.5px] leading-snug text-fg-3">How it is worked out: solved problems count most, weighted Easy 1, Medium 2, Hard 3, then lessons learnt, checkpoint quizzes passed and in-lesson exercises solved. Parts with nothing to measure yet are left out.</p>
    </div>
  );
}
