"use client";

/**
 * DSA Mastery's `intervals` scene (greedy choices): talks as bars on an hour axis, on the lecture stage (16:9, IntervalsScene) and the
 * vertical short (9:16, PIntervals). The drawing is the step engine's (src/components/dsa/viz/IntervalsDraw.tsx) in the stage's own
 * colours.
 *
 * The data model (checked by dsa-mastery tools/lib/check/media.mjs, intervalsErrors, and by scripts/lecture/check.mjs): scene `spans` are the talks [start, end] in whole hours (2 to 8; talk 0 is A,
 * talk 1 is B, and so on), `costUnit` names the cost. A step may set `picked` and `skipped` (talk numbers: the talks taken and skipped so
 * far; a step without them keeps the last), `hot` (talks in focus), `current` (the talk being looked at), `lastEnd` (an hour: the end of
 * the last talk taken, drawn as a line; it stays until a later step sets it again), `out` (a chip) and `cost`.
 */
import type { LectureScene, LectureStep } from "@/lib/learn/lecture/types";
import type { IntervalsState } from "@/lib/dsa/viz/types";
import IntervalsDraw from "@/components/dsa/viz/IntervalsDraw";
import type { IntervalsPalette } from "@/components/dsa/viz/IntervalsDraw";
import { ACC, accA, INK } from "./DsaScenes";

const PAL: IntervalsPalette = {
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

/** The latest `picked`, `skipped` or `lastEnd` set by this or an earlier step of the scene. */
function stickyOf<K extends "picked" | "skipped" | "lastEnd">(s: LectureScene, st: LectureStep, key: K): LectureStep[K] | undefined {
  const at = s.steps.indexOf(st);
  for (let i = at; i >= 0; i--) if (s.steps[i][key] !== undefined) return s.steps[i][key];
  return undefined;
}

/** A step's data as the view's state. */
export function intervalsStateOf(s: LectureScene, st: LectureStep): IntervalsState {
  return {
    spans: (s.spans ?? []).map((t) => [t[0], t[1]] as [number, number]),
    picked: stickyOf(s, st, "picked") ?? [],
    skipped: stickyOf(s, st, "skipped") ?? [],
    lit: st.hot ?? [],
    current: st.current ?? null,
    lastEnd: stickyOf(s, st, "lastEnd") ?? null,
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
      {s.costUnit || "talks looked at"}
    </div>
  );
}

export function IntervalsScene({ s, st }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-[2.5cqh]">
      {s.heading && <h2 className="m-0 text-center font-display text-[3cqw] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#f3f2ee]">{s.heading}</h2>}
      <div className="flex w-full justify-center rounded-sm px-[1.5cqw] py-[1cqh]" style={{ background: accA(0.04) }}>
        <IntervalsDraw state={intervalsStateOf(s, st)} pal={PAL} fs={1.1} style={{ width: "min(62cqw, 100%)", maxHeight: "52cqh" }} />
      </div>
      <Counter s={s} st={st} k={1} />
    </div>
  );
}

export function PIntervals({ s, st }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-[3cqh]">
      {s.heading && <h2 className="m-0 w-full font-display text-[7.55cqw] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#f3f2ee]">{s.heading}</h2>}
      <IntervalsDraw state={intervalsStateOf(s, st)} pal={PAL} fs={1.45} style={{ width: "96cqw" }} />
      <Counter s={s} st={st} k={2.6} />
    </div>
  );
}
