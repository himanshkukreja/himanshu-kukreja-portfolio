"use client";

/**
 * DSA Mastery's `bits` scene (A8 Bits and maths): whole numbers as rows of bit cells, on the lecture stage (16:9, BitsScene) and the
 * vertical short (9:16, PBits). The drawing is the step engine's (src/components/dsa/viz/BitsDraw.tsx) in the stage's own colours.
 *
 * The data model (checked by dsa-mastery tools/lib/check/media.mjs, bitsErrors, and by scripts/lecture/check.mjs). A scene has
 * `bits: { width, signed?, names? }`: `width` is the number of bit cells (4 to 16; a short takes 8 or fewer), `signed: true` reads the
 * top bit as negative (two's complement), and `names` labels each bit (bit 0 first, 7 characters or fewer), such as permissions. A step
 * sets `rows` (1 to 4 rows of [label, whole number]; they stay until a later step sets them again), `op` (one of & | ^ ~ <<n >>n >>>n:
 * the last row is the result, and the checkers work it out), `hot` (bit positions, 0 at the right, framed in every row) and `out` (a chip).
 */
import type { LectureScene, LectureStep } from "@/lib/learn/lecture/types";
import type { BitsRow, BitsState } from "@/lib/dsa/viz/types";
import BitsDraw from "@/components/dsa/viz/BitsDraw";
import type { BitsPalette } from "@/components/dsa/viz/BitsDraw";
import { ACC, accA, INK } from "./DsaScenes";

const PAL: BitsPalette = {
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

/** A step's data as the view's state: the rows of the latest step at or before this one that set them. */
export function bitsStateOf(s: LectureScene, st: LectureStep): BitsState {
  const b = s.bits ?? { width: 8 };
  const at = s.steps.indexOf(st);
  let rows: [string, number][] = [];
  for (let i = at; i >= 0; i--) {
    const r = s.steps[i].rows;
    if (r) {
      rows = r;
      break;
    }
  }
  const out = st.op ? rows.length - 1 : -1;
  const shown: BitsRow[] = rows.map(([label, value], i) => ({ label, value, kind: i === out ? "out" : rows.length === 1 ? "plain" : "in" }));
  return {
    width: b.width,
    signed: b.signed === true,
    rows: shown,
    hot: st.hot ?? [],
    op: st.op ?? null,
    names: b.names ?? null,
    out: st.out ?? null,
  };
}

export function BitsScene({ s, st }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-[2.5cqh]">
      {s.heading && <h2 className="m-0 text-center font-display text-[3cqw] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#f3f2ee]">{s.heading}</h2>}
      <div className="flex w-full justify-center rounded-sm px-[1.5cqw] py-[1cqh]" style={{ background: accA(0.04) }}>
        <BitsDraw state={bitsStateOf(s, st)} pal={PAL} fs={1.1} style={{ width: "min(72cqw, 100%)", maxHeight: "58cqh" }} />
      </div>
    </div>
  );
}

export function PBits({ s, st }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-[3cqh]">
      {s.heading && <h2 className="m-0 w-full font-display text-[7.55cqw] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#f3f2ee]">{s.heading}</h2>}
      <BitsDraw state={bitsStateOf(s, st)} pal={PAL} fs={1.45} style={{ width: "96cqw" }} />
    </div>
  );
}
