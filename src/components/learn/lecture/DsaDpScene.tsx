"use client";

/**
 * DSA Mastery's `dp` scene (dynamic programming): a table filled cell by cell, or a recursion tree, on the lecture stage (16:9, DpScene)
 * and the vertical short (9:16, PDp). The drawing is the step engine's (src/components/dsa/viz/DpDraw.tsx) in the stage's own colours.
 *
 * The data model (checked by dsa-mastery tools/lib/check/media.mjs, dpErrors, and by scripts/lecture/check.mjs). A table scene has
 * `dp: { cols, rows?, base?, blocked? }`: `cols` are the column labels, `rows` the row labels of a 2-D table (leave it out for a 1-D table,
 * whose cells are [0, column]), `base` the base-case cells (drawn dashed) and `blocked` the closed cells. A step may set `put` (cells
 * [row, column, text]: they stay filled from then on), `now` (the cell being filled), `reads` (the cells it reads from, joined to it by
 * lines), `out` (a chip) and `cost`. A tree scene has `dp: { calls }`: each call as [label, parent call or -1], in the order the calls are
 * made. A step may set `shown` (how many calls are drawn), `hit` (calls answered from the memo) and `repeat` (calls that repeat an
 * earlier call) which stay until a later step sets them again, `hot` (calls in focus), `ret` (the value each call has returned, by call
 * number; each stays), `out` and `cost`.
 */
import type { LectureScene, LectureStep } from "@/lib/learn/lecture/types";
import type { DpState } from "@/lib/dsa/viz/types";
import DpDraw from "@/components/dsa/viz/DpDraw";
import type { DpPalette } from "@/components/dsa/viz/DpDraw";
import { ACC, accA, INK } from "./DsaScenes";

const PAL: DpPalette = {
  ink: "#f3f2ee",
  sub: "#8a8a90",
  surface: "#141416",
  stroke: "#6a6a72",
  faint: "#5a5a62",
  sig: ACC,
  hl: accA(0.16),
  onSig: INK,
  pillBg: "#f3f2ee",
  pillInk: INK,
  bad: "#ef4444",
  badInk: "#f3f2ee",
};

/** The latest `shown`, `hit` or `repeat` set by this or an earlier step of the scene. */
function stickyOf<K extends "shown" | "hit" | "repeat">(s: LectureScene, st: LectureStep, key: K): LectureStep[K] | undefined {
  const at = s.steps.indexOf(st);
  for (let i = at; i >= 0; i--) if (s.steps[i][key] !== undefined) return s.steps[i][key];
  return undefined;
}

/** A step's data as the view's state. */
export function dpStateOf(s: LectureScene, st: LectureStep): DpState {
  const d = s.dp ?? {};
  const at = s.steps.indexOf(st);
  if (d.calls) {
    const vals: Record<number, string> = {};
    for (let i = 0; i <= at; i++) for (const [k, v] of Object.entries(s.steps[i].ret ?? {})) vals[Number(k)] = v;
    return {
      table: null,
      tree: { calls: d.calls.map(([label, parent]) => ({ label, parent })), shown: stickyOf(s, st, "shown") ?? 0, vals, hot: st.hot ?? [], repeat: stickyOf(s, st, "repeat") ?? [], hit: stickyOf(s, st, "hit") ?? [] },
      out: st.out ?? null,
    };
  }
  const R = d.rows ? d.rows.length : 1;
  const C = (d.cols ?? []).length;
  const cells: (string | null)[][] = Array.from({ length: R }, () => Array(C).fill(null));
  for (let i = 0; i <= at; i++) for (const [r, c, v] of s.steps[i].put ?? []) if (cells[r]) cells[r][c] = v;
  return {
    table: { cols: d.cols ?? [], rows: d.rows ?? null, cells, base: d.base ?? [], blocked: d.blocked ?? [], now: st.now ?? null, reads: st.reads ?? [] },
    tree: null,
    out: st.out ?? null,
  };
}

function Counter({ s, st, k }: { s: LectureScene; st: LectureStep; k: number }) {
  if (st.cost === undefined) return null;
  return (
    <div className="flex items-baseline gap-[0.6em] font-mono uppercase tracking-[0.08em]" style={{ fontSize: `${1.25 * k}cqw`, color: "#a3a3a8" }}>
      <span className="font-display font-extrabold tabular-nums" style={{ fontSize: `${2.6 * k}cqw`, color: ACC }}>
        {st.cost}
      </span>
      {s.costUnit || (s.dp?.calls ? "calls" : "cells filled")}
    </div>
  );
}

export function DpScene({ s, st }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-[2.5cqh]">
      {s.heading && <h2 className="m-0 text-center font-display text-[3cqw] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#f3f2ee]">{s.heading}</h2>}
      <div className="flex w-full justify-center rounded-sm px-[1.5cqw] py-[1cqh]" style={{ background: accA(0.04) }}>
        <DpDraw state={dpStateOf(s, st)} pal={PAL} fs={1.1} style={{ width: "min(66cqw, 100%)", maxHeight: "54cqh" }} />
      </div>
      <Counter s={s} st={st} k={1} />
    </div>
  );
}

export function PDp({ s, st }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-[3cqh]">
      {s.heading && <h2 className="m-0 w-full font-display text-[7.55cqw] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#f3f2ee]">{s.heading}</h2>}
      <DpDraw state={dpStateOf(s, st)} pal={PAL} fs={1.45} style={{ width: "96cqw" }} />
      <Counter s={s} st={st} k={2.6} />
    </div>
  );
}
