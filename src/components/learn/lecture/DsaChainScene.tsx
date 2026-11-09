"use client";

/**
 * DSA Mastery's `chain` scene: a linked list on the lecture stage (16:9, ChainScene) and the vertical short (9:16,
 * PChain). Nodes are boxes (value | next slot, plus a prev slot when doubly linked), next pointers are arrows, labels
 * (head, tail, curr, prev, slow, fast) sit on nodes, and an optional address over each node draws the memory picture.
 * A step may reorder the nodes, re-point arrows and move labels: nodes and labels glide from the previous step, and an
 * arrow that changed draws itself in, in the accent. Same rules as DsaScenes.tsx: every motion is a function of `t`
 * (seconds into the step, settled by 1.6 s), sizes in container units, the accent is --lec-accent.
 *
 * The data model (dsa-mastery README, "Lectures and shorts"): scene `values` are the nodes by id; a step sets `order`
 * (ids left to right; default all, in id order), `next` / `prev` (per id: an id or null; default the following one
 * in `order`), `labels`, `mark` (lit ids) and `cost` (the running pointer-hop count).
 */
import type { LectureScene, LectureStep } from "@/lib/learn/lecture/types";
import { clamp, easeInOut, lerp, prog } from "./anim";
import { ACC, accA, INK } from "./DsaScenes";

const W = "#f3f2ee";
const MUTED = "#8a8a90";
const LINE = "#5a5a62";
const BOX = "#141416";
const ABOVE = new Set(["head", "tail", "new"]);
const ORDER = ["head", "tail", "new", "prev", "curr", "next", "slow", "fast"];

type Chain = { order: number[]; next: (number | null)[]; prev: (number | null)[] | null; labels: Record<string, number | null>; mark: number[]; cost?: number };

function chainOf(s: LectureScene, st: LectureStep | null): Chain {
  const n = (s.values || []).length;
  const order = st?.order ?? Array.from({ length: n }, (_, i) => i);
  const next: (number | null)[] = Array(n).fill(null);
  const prev: (number | null)[] = Array(n).fill(null);
  order.forEach((id, i) => {
    next[id] = i + 1 < order.length ? order[i + 1] : null;
    prev[id] = i > 0 ? order[i - 1] : null;
  });
  return { order, next: st?.next ?? next, prev: s.doubly ? (st?.prev ?? prev) : null, labels: st?.labels ?? {}, mark: st?.mark ?? [], cost: st?.cost };
}

/** The chain as SVG (viewBox units); `scale` sizes text for the 9:16 short. */
function ChainSvg({ s, st, prevSt, t, first, maxW }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean; maxW: number }) {
  const values = s.values || [];
  const now = chainOf(s, st);
  const was = prevSt ? chainOf(s, prevSt) : now;
  const doubly = !!s.doubly;
  const VAL = 62;
  const SLOT = 36;
  const NW = VAL + SLOT + (doubly ? SLOT : 0);
  const NH = 56;
  const GAP = 52;
  const PAD = 70;
  const TOPY = s.addresses ? 96 : 66;
  const count = Math.max(now.order.length, was.order.length, 1);
  const width = PAD * 2 + count * NW + (count - 1) * GAP;
  const height = TOPY + NH + 112;
  const move = easeInOut(clamp(t / 0.7));
  const xOf = (c: Chain, id: number) => {
    const i = c.order.indexOf(id);
    return i < 0 ? null : PAD + i * (NW + GAP);
  };
  const X = (id: number) => {
    const a = xOf(was, id);
    const b = xOf(now, id);
    if (b === null) return a ?? PAD;
    if (a === null) return b;
    return lerp(a, b, move);
  };
  const shown = now.order;
  const enter = (k: number) => (first ? prog(t, 0.05 + k * 0.08, 0.35) : 1);
  const changed = (id: number) => prevSt !== null && was.next[id] !== now.next[id];
  const draw = clamp((t - 0.15) / 0.6);
  const arrow = (from: number, to: number | null, kind: "next" | "prev") => {
    if (to === null || !shown.includes(to)) return null;
    const a = X(from);
    const b = X(to);
    const off = doubly ? (kind === "next" ? -9 : 9) : 0;
    const y = TOPY + NH / 2 + off;
    const hot = kind === "next" && changed(from);
    const forward = kind === "next" ? b > a : b < a;
    const adjacent = Math.abs(b - a) <= NW + GAP + 1;
    let d: string;
    if (forward && adjacent) d = kind === "next" ? `M${a + NW - SLOT / 2} ${y} L${b - 4} ${y}` : `M${a + SLOT / 2} ${y} L${b + NW + 4} ${y}`;
    else if (kind === "next" && adjacent && !doubly) d = `M${a} ${y} L${b + NW + 4} ${y}`; // a turned arrow (reverse): straight back across the gap
    else {
      const sx = kind === "next" ? a + NW - SLOT / 2 : a + SLOT / 2;
      const ex = b + NW / 2;
      const lift = kind === "next" ? -(34 + Math.min(50, Math.abs(b - a) * 0.12)) : 34;
      const yy = kind === "next" ? TOPY : TOPY + NH;
      d = `M${sx} ${yy + (kind === "next" ? 6 : -6)} C${sx} ${yy + lift}, ${ex} ${yy + lift}, ${ex} ${yy + (kind === "next" ? -3 : 3)}`;
    }
    return (
      <path
        key={`${kind}${from}`}
        d={d}
        fill="none"
        stroke={hot ? ACC : LINE}
        strokeWidth={hot ? 4 : 3}
        strokeDasharray={kind === "prev" ? "6 5" : hot ? "1" : undefined}
        pathLength={hot ? 1 : undefined}
        strokeDashoffset={hot ? 1 - draw : undefined}
        markerEnd={`url(#ch-${hot ? "hot" : "cold"})`}
        opacity={first ? prog(t, 0.3, 0.4) : 1}
      />
    );
  };
  const labelPos = (c: Chain, k: string, x: (id: number) => number) => {
    const id = c.labels[k];
    if (id === null || id === undefined || !c.order.includes(id)) return k === "prev" ? PAD - 46 : PAD + c.order.length * (NW + GAP) - GAP * 0.4;
    return x(id) + NW / 2;
  };
  const labels = ORDER.filter((k) => k in now.labels);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: `${maxW * Math.min(1, width / 700)}cqw`, height: "auto", overflow: "visible" }} aria-hidden>
      <defs>
        <marker id="ch-cold" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={LINE} />
        </marker>
        <marker id="ch-hot" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={ACC} />
        </marker>
      </defs>
      {shown.map((id) => arrow(id, now.next[id], "next"))}
      {doubly && now.prev && shown.map((id) => arrow(id, now.prev![id], "prev"))}
      {shown.map((id, k) => {
        const x = X(id);
        const lit = now.mark.includes(id);
        const e = enter(k);
        const fresh = prevSt !== null && !was.order.includes(id);
        const op = fresh ? prog(t, 0, 0.4) : e;
        const vx = x + (doubly ? SLOT : 0);
        const nextNull = now.next[id] === null;
        return (
          <g key={id} opacity={op} transform={`translate(0 ${(1 - e) * 14})`}>
            {s.addresses && (
              <text x={x + NW / 2} y={TOPY - 12} textAnchor="middle" fontSize={17} fontFamily="ui-monospace, monospace" fill={MUTED}>
                @{s.addresses[id]}
              </text>
            )}
            <rect x={x} y={TOPY} width={NW} height={NH} fill={lit ? ACC : BOX} stroke={lit ? ACC : "#6a6a72"} strokeWidth={3} />
            {doubly && <line x1={x + SLOT} x2={x + SLOT} y1={TOPY} y2={TOPY + NH} stroke={lit ? INK : "#4a4a52"} strokeWidth={2} />}
            <line x1={vx + VAL} x2={vx + VAL} y1={TOPY} y2={TOPY + NH} stroke={lit ? INK : "#4a4a52"} strokeWidth={2} />
            <text x={vx + VAL / 2} y={TOPY + NH / 2 + 10} textAnchor="middle" fontSize={28} fontWeight={800} fontFamily="ui-monospace, monospace" fill={lit ? INK : W}>
              {String(values[id])}
            </text>
            {nextNull ? (
              <text x={vx + VAL + SLOT / 2} y={TOPY + NH / 2 + 5} textAnchor="middle" fontSize={13} fontFamily="ui-monospace, monospace" fill={lit ? INK : MUTED}>
                null
              </text>
            ) : (
              <circle cx={vx + VAL + SLOT / 2} cy={TOPY + NH / 2 + (doubly ? -9 : 0)} r={5} fill={lit ? INK : changed(id) ? ACC : W} />
            )}
          </g>
        );
      })}
      {labels.map((k) => {
        const above = ABOVE.has(k);
        const to = labelPos(now, k, X);
        const from = prevSt && k in was.labels ? labelPos(was, k, (id) => xOf(was, id) ?? PAD) : to;
        const x = lerp(from, to, move);
        const peers = labels.filter((q) => ABOVE.has(q) === above && now.labels[q] === now.labels[k]);
        const stack = peers.indexOf(k);
        const y = above ? TOPY - (s.addresses ? 62 : 36) - stack * 28 : TOPY + NH + 14 + stack * 28;
        const tw = k.length * 11 + 18;
        const hot = !above;
        return (
          <g key={k} transform={`translate(${x - tw / 2} ${y})`} opacity={prevSt && !(k in was.labels) ? prog(t, 0.1, 0.35) : first ? prog(t, 0.35, 0.4) : 1}>
            <rect width={tw} height={25} rx={3} fill={hot ? ACC : W} />
            <text x={tw / 2} y={17.5} textAnchor="middle" fontSize={15} fontWeight={700} fontFamily="ui-monospace, monospace" fill={INK}>
              {k}
            </text>
          </g>
        );
      })}
      {now.order.length === 0 && (
        <text x={PAD} y={TOPY + NH / 2} fontSize={24} fontFamily="ui-monospace, monospace" fill={MUTED}>
          head → null
        </text>
      )}
    </svg>
  );
}

function Counter({ s, st, k }: { s: LectureScene; st: LectureStep; k: number }) {
  if (st.cost === undefined) return null;
  return (
    <div className="flex items-baseline gap-[0.6em] font-mono uppercase tracking-[0.08em]" style={{ fontSize: `${1.25 * k}cqw`, color: "#a3a3a8" }}>
      <span className="font-display font-extrabold tabular-nums" style={{ fontSize: `${2.6 * k}cqw`, color: ACC }}>
        {st.cost}
      </span>
      {s.costUnit || "pointer hops"}
    </div>
  );
}

export function ChainScene({ s, st, prevSt, t, first }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-[4cqh]">
      {s.heading && <h2 className="m-0 text-center font-display text-[3cqw] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#f3f2ee]">{s.heading}</h2>}
      <div className="rounded-sm px-[1.5cqw] py-[1.5cqh]" style={{ background: accA(0.04) }}>
        <ChainSvg s={s} st={st} prevSt={prevSt} t={t} first={first} maxW={80} />
      </div>
      <Counter s={s} st={st} k={1} />
    </div>
  );
}

export function PChain({ s, st, prevSt, t, first }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-[5cqh]">
      {s.heading && <h2 className="m-0 w-full font-display text-[7.55cqw] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#f3f2ee]">{s.heading}</h2>}
      <ChainSvg s={s} st={st} prevSt={prevSt} t={t} first={first} maxW={92} />
      <Counter s={s} st={st} k={2.6} />
    </div>
  );
}
