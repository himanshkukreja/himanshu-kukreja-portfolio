"use client";

/**
 * DSA Mastery's `grid` scene: BFS or DFS on a grid, on the lecture stage (16:9, GridScene) and the vertical short
 * (9:16, PGrid). The scene names the grid (rows of `.#SG`) and the algorithm; each step shows the search after `upto`
 * cells were visited ("end" for the finished run, with its path; 0 for the start; no algorithm, or no `visited`, for the bare grid). The frames come
 * from the site's own step engine (src/lib/dsa/viz/grid.ts), so the lecture and the lesson's player always agree.
 * Same rules as DsaScenes.tsx: motion is a function of `t` (seconds into the step), sizes in container units, the
 * accent is --lec-accent.
 */
import { useMemo } from "react";
import type { LectureScene, LectureStep } from "@/lib/learn/lecture/types";
import { cellName, frameAtVisited, gridSearch, parseGrid, type GridState } from "@/lib/dsa/viz/grid";
import { clamp, prog } from "./anim";
import { ACC, accA, INK } from "./DsaScenes";

const W = "#f3f2ee";
const MUTED = "#8a8a90";
const BOX = "#141416";
const WALL = "#5c5c66";

function useGridFrame(s: LectureScene, st: LectureStep): { state: GridState | null; cost: number; unit: string; note: string } {
  const script = useMemo(() => {
    const g = parseGrid(s.grid || []).grid;
    if (!g) return null;
    return s.algorithm ? gridSearch(s.algorithm, g, { useGoal: s.grid?.some((r) => r.includes("G")) }) : null;
  }, [s.grid, s.algorithm]);
  const bare = useMemo(() => parseGrid(s.grid || []).grid, [s.grid]);
  if (!script || st.visited === undefined) return { state: bare ? { ...bare, search: null } : null, cost: 0, unit: "cells visited", note: "" };
  const f = script.frames[frameAtVisited(script, st.visited)];
  return { state: f.state, cost: f.cost, unit: script.costUnit, note: f.note };
}

function GridSvg({ state, t, big }: { state: GridState; t: number; big: boolean }) {
  const { rows, cols, walls, start, goal, search: se } = state;
  const CELL = 60;
  const width = cols * CELL;
  const height = rows * CELL;
  const appear = clamp(t / 0.5);
  const cx = (n: number) => (n % cols) * CELL + CELL / 2;
  const cy = (n: number) => Math.floor(n / cols) * CELL + CELL / 2;
  const path = se && se.path.length > 1 ? se.path.map((n, i) => `${i ? "L" : "M"}${cx(n)} ${cy(n)}`).join(" ") : "";
  return (
    <svg viewBox={`-4 -4 ${width + 8} ${height + 8}`} style={{ width: "100%", height: "auto", maxHeight: big ? "52cqh" : "54cqh", overflow: "visible" }} aria-hidden>
      {walls.map((wall, n) => {
        const x = (n % cols) * CELL;
        const y = Math.floor(n / cols) * CELL;
        const cur = se?.current === n;
        const onPath = !!se?.path.includes(n);
        const front = se?.status[n] === "frontier";
        const done = se?.status[n] === "done";
        const fresh = !!se?.fresh.includes(n);
        const fill = wall ? WALL : cur || onPath ? ACC : front || done ? accA(done ? 0.28 : 0.16) : BOX;
        const label = se && !wall && se.label[n] !== undefined ? String(se.label[n]) : "";
        const letter = n === start ? "S" : n === goal ? "G" : "";
        return (
          <g key={n} opacity={fresh ? 0.35 + 0.65 * appear : 1}>
            <rect x={x + 2} y={y + 2} width={CELL - 4} height={CELL - 4} fill={fill} stroke={front || fresh ? ACC : wall ? WALL : "#4a4a52"} strokeWidth={front || fresh ? 3 : 1.5} strokeDasharray={front && !fresh ? "6 4" : undefined} />
            {letter && (
              <text x={x + 8} y={y + 20} fontSize={16} fontWeight={800} fontFamily="ui-monospace, monospace" fill={cur || onPath ? INK : ACC}>
                {letter}
              </text>
            )}
            {label && (
              <text x={x + CELL / 2} y={y + CELL / 2 + 10} textAnchor="middle" fontSize={label.length > 2 ? 22 : 28} fontWeight={800} fontFamily="ui-monospace, monospace" fill={cur || onPath ? INK : W}>
                {label}
              </text>
            )}
          </g>
        );
      })}
      {path && <path d={path} fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - clamp(t / 1.2)} opacity={0.85} />}
    </svg>
  );
}

function Frontier({ state, k }: { state: GridState; k: number }) {
  const se = state.search;
  if (!se) return null;
  const bfs = se.algo === "bfs";
  const items = bfs ? se.frontier.slice(0, 8) : se.frontier.slice(-8);
  return (
    <div className="flex flex-wrap items-center justify-center gap-[0.5em] font-mono" style={{ fontSize: `${1.1 * k}cqw`, color: MUTED }}>
      <span className="uppercase tracking-[0.08em]">{bfs ? "Queue, front first" : "Call stack, top last"}</span>
      {items.length === 0 && <span>empty</span>}
      {!bfs && se.frontier.length > 8 && <span>+{se.frontier.length - 8}</span>}
      {items.map((n, i) => {
        const hot = bfs ? i === 0 : i === items.length - 1;
        return (
          <span key={`${n}-${i}`} className="px-[0.45em] py-[0.15em]" style={{ background: hot ? ACC : "#1e1e22", color: hot ? INK : W }}>
            {cellName(state.cols, n).replace(/\s/g, "")}
          </span>
        );
      })}
      {bfs && se.frontier.length > 8 && <span>+{se.frontier.length - 8}</span>}
    </div>
  );
}

function Counter({ cost, unit, k, max, algo }: { cost: number; unit: string; k: number; max: number | null; algo: string | null }) {
  return (
    <div className="flex flex-wrap items-baseline justify-center gap-x-[1.2em] gap-y-[0.3em] font-mono uppercase tracking-[0.08em]" style={{ fontSize: `${1.25 * k}cqw`, color: "#a3a3a8" }}>
      <span className="flex items-baseline gap-[0.5em]">
        <span className="font-display font-extrabold tabular-nums" style={{ fontSize: `${2.4 * k}cqw`, color: ACC }}>
          {cost}
        </span>
        {unit}
      </span>
      {max !== null && (
        <span>
          max {algo === "bfs" ? "queue" : "stack"} {max}
        </span>
      )}
    </div>
  );
}

export function GridScene({ s, st, t, first }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean }) {
  const { state, cost, unit } = useGridFrame(s, st);
  if (!state) return null;
  const e = first ? prog(t, 0, 0.45) : 1;
  return (
    <div className="flex w-full flex-col items-center gap-[2.6cqh]" style={{ opacity: e }}>
      {s.heading && <h2 className="m-0 text-center font-display text-[3cqw] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#f3f2ee]">{s.heading}</h2>}
      <div className="flex w-full items-center justify-center" style={{ maxWidth: `${Math.min(78, state.cols * 8)}cqw` }}>
        <GridSvg state={state} t={t} big={false} />
      </div>
      {state.search ? <Frontier state={state} k={1} /> : null}
      {state.search ? <Counter cost={cost} unit={unit} k={1} max={state.search.maxFrontier} algo={state.search.algo} /> : null}
    </div>
  );
}

export function PGrid({ s, st, t, first }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean }) {
  const { state, cost, unit } = useGridFrame(s, st);
  if (!state) return null;
  const e = first ? prog(t, 0, 0.45) : 1;
  return (
    <div className="flex w-full flex-col items-center gap-[3cqh]" style={{ opacity: e }}>
      {s.heading && <h2 className="m-0 w-full font-display text-[7.55cqw] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#f3f2ee]">{s.heading}</h2>}
      <div className="w-full">
        <GridSvg state={state} t={t} big />
      </div>
      {state.search ? <Frontier state={state} k={2.4} /> : null}
      {state.search ? <Counter cost={cost} unit={unit} k={2.4} max={state.search.maxFrontier} algo={state.search.algo} /> : null}
    </div>
  );
}
