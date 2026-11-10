"use client";

/**
 * DSA Mastery's `chars` scene (A7 String basics): a string as a strip of letters, on the lecture stage (16:9, CharsScene) and the vertical
 * short (9:16, PChars). The drawing is the step engine's (src/components/dsa/viz/StringsDraw.tsx) in the stage's own colours.
 *
 * The data model (checked by dsa-mastery tools/lib/check/media.mjs, charsErrors, and by scripts/lecture/check.mjs). A scene has
 * `chars: { text, pattern?, counts? }`: `text` is the string (1 to 24 characters, drawn one cell each), `pattern` a second string drawn
 * under it (1 to 10 characters) and `counts: true` adds a 26-slot letter array. A step may set `shift` (the text index under the first
 * letter of the pattern), `mark` (text indexes that matched), `bad` (text indexes that differ), `window` ([first, last] of a finished
 * match, filled in the accent), `pointers` (named pointers on the text), `tally` (letter to count, each stays from then on), `slot` (the
 * letter slot in focus), `out` (a chip) and `cost`.
 */
import type { LectureScene, LectureStep } from "@/lib/learn/lecture/types";
import type { StringsState } from "@/lib/dsa/viz/types";
import StringsDraw from "@/components/dsa/viz/StringsDraw";
import type { StringsPalette } from "@/components/dsa/viz/StringsDraw";
import { ACC, accA, INK } from "./DsaScenes";

const PAL: StringsPalette = {
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

const ALPHABET = [..."abcdefghijklmnopqrstuvwxyz"];

/** A step's data as the view's state. */
export function charsStateOf(s: LectureScene, st: LectureStep): StringsState {
  const c = s.chars ?? { text: "" };
  const at = s.steps.indexOf(st);
  const values = ALPHABET.map(() => 0);
  if (c.counts) for (let i = 0; i <= at; i++) for (const [k, v] of Object.entries(s.steps[i].tally ?? {})) values[ALPHABET.indexOf(k)] = v;
  const slot = st.slot ? ALPHABET.indexOf(st.slot) : -1;
  return {
    text: [...c.text],
    pattern: c.pattern ? [...c.pattern] : null,
    shift: st.shift ?? 0,
    ok: st.mark ?? [],
    bad: st.bad ?? [],
    found: st.window ? [st.window[0], st.window[1] - st.window[0] + 1] : null,
    marks: st.pointers ?? {},
    counts: c.counts ? { letters: ALPHABET, values, hot: slot >= 0 ? slot : null } : null,
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
      {s.costUnit || "comparisons"}
    </div>
  );
}

export function CharsScene({ s, st }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-[2.5cqh]">
      {s.heading && <h2 className="m-0 text-center font-display text-[3cqw] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#f3f2ee]">{s.heading}</h2>}
      <div className="flex w-full justify-center rounded-sm px-[1.5cqw] py-[1cqh]" style={{ background: accA(0.04) }}>
        <StringsDraw state={charsStateOf(s, st)} pal={PAL} fs={1.1} style={{ width: "min(70cqw, 100%)", maxHeight: "54cqh" }} />
      </div>
      <Counter s={s} st={st} k={1} />
    </div>
  );
}

export function PChars({ s, st }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-[3cqh]">
      {s.heading && <h2 className="m-0 w-full font-display text-[7.55cqw] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#f3f2ee]">{s.heading}</h2>}
      <StringsDraw state={charsStateOf(s, st)} pal={PAL} fs={1.45} style={{ width: "96cqw" }} />
      <Counter s={s} st={st} k={2.6} />
    </div>
  );
}
