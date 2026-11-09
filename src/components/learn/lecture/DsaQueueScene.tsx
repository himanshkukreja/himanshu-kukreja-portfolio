"use client";

/**
 * DSA Mastery's `queue` scene: a queue or deque on the lecture stage (16:9, QueueScene) and the vertical short (9:16,
 * PQueue). The drawing is the step engine's (src/components/dsa/viz/QueueDraw.tsx) in the stage's own colours: a ring
 * buffer (cells, head and tail that wrap round), a linked list (nodes, front on the left) or the sliding-window maximum.
 *
 * The data model (dsa-mastery README, "Lectures and shorts"): scene `values` are the items by id (in a "window" scene,
 * the stream), `mode` is ring (default), list or window, `capacity` the ring's cells, `doubly`, `addresses` (a ring's
 * block starts at the first one; a list's one per item), `costUnit`. Every step sets `order` (the ids from the front to
 * the back; in a window scene the deque's indexes) and may set `head` (the ring cell holding the front), `lift` (an id
 * in flight) with `liftAt` and `liftCell`, `wrap` (a pointer that wrapped), `labels` ({ curr: id }), `mark`, `out`,
 * `capacity` (the ring's cells from this step on) and `cost`. A window step sets `window` [first, last], `cur`,
 * `results` and `drop`.
 */
import type { LectureScene, LectureStep } from "@/lib/learn/lecture/types";
import type { QueueItem, QueueState } from "@/lib/dsa/viz/types";
import QueueDraw, { type QueuePalette } from "@/components/dsa/viz/QueueDraw";
import { clamp, easeInOut } from "./anim";
import { ACC, accA, INK } from "./DsaScenes";

const PAL: QueuePalette = {
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

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** A step's data as the view's state. */
export function queueStateOf(s: LectureScene, st: LectureStep): QueueState {
  const values = s.values || [];
  const item = (id: number): QueueItem => ({ id, value: String(values[id]) });
  const order = st.order ?? [];
  const base: Omit<QueueState, "mode" | "items" | "cells" | "win"> = {
    doubly: !!s.doubly,
    head: 0,
    tail: 0,
    lifted: null,
    liftAt: st.liftAt ?? "back",
    liftCell: null,
    mark: st.mark ?? [],
    changed: [],
    wrapped: st.wrap ?? null,
    labels: st.labels ?? {},
    out: st.out ?? null,
    base: null,
    addrs: {},
  };
  if (s.mode === "window") {
    const stream = values.map(Number);
    const w = st.window ?? null;
    return {
      ...base,
      mode: "window",
      items: [],
      cells: null,
      win: {
        stream,
        window: w ? [w[0], w[1]] : null,
        cur: st.cur ?? null,
        deque: order,
        results: st.results ?? [],
        dropping: st.drop ?? null,
        k: s.k ?? (w ? w[1] - w[0] + 1 : 1),
      },
    };
  }
  const lifted = st.lift !== undefined && st.lift !== null ? item(st.lift) : null;
  const items = order.map(item);
  if (s.mode === "list") {
    return { ...base, mode: "list", items, cells: null, win: null, lifted, addrs: Object.fromEntries((s.addresses ?? []).map((a, id) => [id, a])), changed: lifted && (st.mark ?? []).includes(lifted.id) ? [lifted.id] : [] };
  }
  const cap = st.capacity ?? s.capacity ?? Math.max(4, order.length);
  const head = mod(st.head ?? 0, cap);
  const cells: (QueueItem | null)[] = Array.from({ length: cap }, () => null);
  items.forEach((it, i) => {
    cells[mod(head + i, cap)] = it;
  });
  const tail = mod(head + items.length, cap);
  const liftAt = st.liftAt ?? "back";
  return {
    ...base,
    mode: "ring",
    items,
    cells,
    win: null,
    head,
    tail,
    lifted,
    liftAt,
    liftCell: lifted ? (st.liftCell ?? (liftAt === "back" ? tail : mod(head - 1, cap))) : null,
    base: s.addresses?.length ? s.addresses[0] : null,
    changed: (st.mark ?? []).filter((id) => items.some((x) => x.id === id)),
  };
}

function QueueSvg({ s, st, prevSt, t, big }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; big: boolean }) {
  const state = queueStateOf(s, st);
  const prev = prevSt ? queueStateOf(s, prevSt) : null;
  const move = easeInOut(clamp(t / 0.7));
  return <QueueDraw state={state} prev={prev} t={move} pal={PAL} fs={big ? 1.1 : 1} style={big ? { width: "96cqw", height: "auto", maxHeight: "48cqh", display: "block" } : { width: "auto", height: "46cqh", maxWidth: "74cqw", display: "block" }} />;
}

function Counter({ s, st, k }: { s: LectureScene; st: LectureStep; k: number }) {
  if (st.cost === undefined) return null;
  return (
    <div className="flex items-baseline gap-[0.6em] font-mono uppercase tracking-[0.08em]" style={{ fontSize: `${1.25 * k}cqw`, color: "#a3a3a8" }}>
      <span className="font-display font-extrabold tabular-nums" style={{ fontSize: `${2.6 * k}cqw`, color: ACC }}>
        {st.cost}
      </span>
      {s.costUnit || "steps"}
    </div>
  );
}

export function QueueScene({ s, st, prevSt, t }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-[2.5cqh]">
      {s.heading && <h2 className="m-0 text-center font-display text-[3cqw] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#f3f2ee]">{s.heading}</h2>}
      <div className="rounded-sm px-[1.5cqw] py-[1cqh]" style={{ background: accA(0.04) }}>
        <QueueSvg s={s} st={st} prevSt={prevSt} t={t} big={false} />
      </div>
      <Counter s={s} st={st} k={1} />
    </div>
  );
}

export function PQueue({ s, st, prevSt, t }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-[3cqh]">
      {s.heading && <h2 className="m-0 w-full font-display text-[7.55cqw] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#f3f2ee]">{s.heading}</h2>}
      <QueueSvg s={s} st={st} prevSt={prevSt} t={t} big />
      <Counter s={s} st={st} k={2.6} />
    </div>
  );
}
