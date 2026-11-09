"use client";

/**
 * DSA Mastery's `stack` scene: a stack on the lecture stage (16:9, StackScene) and the vertical short (9:16, PStack).
 * Items are plates stacked bottom to top with a `top` pointer on the newest. Three ways to draw it, set by the scene's
 * `mode`: "array" (numbered cells, the free ones dashed above, up to `capacity`), "list" (nodes with a next arrow down,
 * head = top) and "calls" (the call stack: wide frames, each may show the value it returns). A step puts an item in
 * flight above the top (`lift`: about to be pushed, or just popped); items and the pointer glide from the previous
 * step. Same rules as DsaScenes.tsx: every motion is a function of `t` (seconds into the step, settled by 1.6 s),
 * sizes in container units, the accent is --lec-accent.
 *
 * The data model (dsa-mastery README, "Lectures and shorts"): scene `values` are the items by id, `mode`, `capacity`,
 * `addresses`, `costUnit`; every step sets `order` (the ids in the stack, bottom to top) and may set `lift` (an id above
 * the top), `ret` (calls: an id's returned value), `labels` ({ curr: id }), `mark` (lit ids), `out` (a result chip) and
 * `cost` (the running count).
 */
import type { LectureScene, LectureStep } from "@/lib/learn/lecture/types";
import { clamp, easeInOut, lerp, prog } from "./anim";
import { ACC, accA, INK } from "./DsaScenes";

const W = "#f3f2ee";
const MUTED = "#8a8a90";
const LINE = "#5a5a62";
const BOX = "#141416";

type Mode = "array" | "list" | "calls";
const modeOf = (s: LectureScene): Mode => (s.mode === "list" || s.mode === "calls" ? s.mode : "array");
const orderOf = (st: LectureStep | null): number[] => st?.order ?? [];

/** The most rows any step of the scene needs, so the drawing never changes size between steps. */
export function stackRows(s: LectureScene): number {
  let r = s.capacity ?? 0;
  for (const st of s.steps) r = Math.max(r, orderOf(st).length + (st.lift !== undefined && st.lift !== null ? 1 : 0));
  return Math.max(3, r);
}

function StackSvg({ s, st, prevSt, t, first, big, style }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean; big: boolean; style: React.CSSProperties }) {
  const mode = modeOf(s);
  const values = s.values || [];
  const k = big ? 1.22 : 1;
  const H = 44 * k;
  const NW = (mode === "calls" ? 280 : 220) * k;
  const GAP = (mode === "list" ? 26 : 8) * k;
  const LEFT = 64 * k;
  const TOPPAD = 46 * k;
  const RIGHT = 150 * k;
  const pitch = H + GAP;
  const rows = stackRows(s);
  const width = LEFT + NW + RIGHT;
  const height = TOPPAD + rows * pitch + 12;
  const slotY = (n: number) => TOPPAD + (rows - 1 - n) * pitch;
  const now = orderOf(st);
  const was = prevSt ? orderOf(prevSt) : now;
  const liftNow = st.lift ?? null;
  const liftWas = prevSt ? (prevSt.lift ?? null) : liftNow;
  const move = easeInOut(clamp(t / 0.7));
  const yOf = (order: number[], lift: number | null, id: number): number | null => {
    const i = order.indexOf(id);
    if (i >= 0) return slotY(i);
    if (lift === id) return slotY(order.length) - (mode === "list" ? 0 : 10 * k);
    return null;
  };
  const xOf = (lift: number | null, id: number) => (lift === id && mode !== "list" ? LEFT + 30 * k : LEFT);
  const Y = (id: number) => {
    const a = yOf(was, liftWas, id);
    const b = yOf(now, liftNow, id);
    if (b === null) return a ?? slotY(0);
    if (a === null) return b - (1 - move) * 20;
    return lerp(a, b, move);
  };
  const X = (id: number) => {
    const a = xOf(liftWas, id);
    const b = xOf(liftNow, id);
    return lerp(a, b, move);
  };
  const shown = [...now, ...(liftNow !== null ? [liftNow] : [])];
  const mark = st.mark ?? [];
  const FS = (mode === "calls" ? 21 : 25) * k;
  const cap = s.capacity ?? 0;
  const free: number[] = [];
  for (let n = now.length; n < cap; n++) free.push(n);
  const enter = (n: number) => (first ? prog(t, 0.05 + n * 0.07, 0.35) : 1);
  const topId = now.length ? now[now.length - 1] : null;
  const topWas = was.length ? was[was.length - 1] : null;
  const curr = st.labels?.curr;
  const currWas = prevSt?.labels?.curr;
  const pillY = (id: number | null | undefined, order: number[], lift: number | null, peerCurr: number | null | undefined, kind: "top" | "curr") => {
    const base = (id === null || id === undefined ? slotY(0) : (yOf(order, lift, id) ?? slotY(0))) + H / 2;
    const same = peerCurr !== undefined && peerCurr !== null && id === peerCurr && topOf(order) === id;
    return base + (same ? (kind === "top" ? -13 : 13) * k : 0);
  };
  const topOf = (order: number[]) => (order.length ? order[order.length - 1] : null);

  const pill = (kind: "top" | "curr", id: number | null | undefined, idWas: number | null | undefined, label: string) => {
    const to = pillY(id, now, liftNow, kind === "top" ? curr : topId, kind);
    const from = prevSt ? pillY(idWas, was, liftWas, kind === "top" ? currWas : topWas, kind) : to;
    const y = lerp(from, to, move);
    const tw = label.length * 12 * k + 20;
    const hot = kind === "curr";
    return (
      <g key={kind} transform={`translate(${LEFT + NW + 16 * k} ${y - 12 * k})`} opacity={first ? prog(t, 0.4, 0.4) : 1}>
        <path d={`M${-13 * k} ${12 * k} L0 ${12 * k}`} stroke={hot ? ACC : W} strokeWidth={3} markerStart="url(#sk-l-ah)" fill="none" />
        <rect width={tw} height={24 * k} rx={3} fill={hot ? ACC : W} />
        <text x={tw / 2} y={17 * k} textAnchor="middle" fontSize={15 * k} fontWeight={700} fontFamily="ui-monospace, monospace" fill={INK}>
          {label}
        </text>
      </g>
    );
  };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ display: "block", overflow: "visible", ...style }} aria-hidden>
      <defs>
        <marker id="sk-l-ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={LINE} />
        </marker>
        <marker id="sk-l-ah-hot" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={ACC} />
        </marker>
      </defs>
      <line x1={LEFT - 12} x2={LEFT + NW + 12} y1={slotY(0) + H + (mode === "list" ? 6 : 3)} y2={slotY(0) + H + (mode === "list" ? 6 : 3)} stroke={MUTED} strokeWidth={4} />
      {free.map((n) => (
        <g key={`f${n}`}>
          {mode === "array" && (
            <text x={LEFT - 14} y={slotY(n) + H / 2 + 6} textAnchor="end" fontSize={16 * k} fontFamily="ui-monospace, monospace" fill={MUTED}>
              {n}
            </text>
          )}
          <rect x={LEFT} y={slotY(n)} width={NW} height={H} fill="none" stroke={LINE} strokeWidth={2} strokeDasharray="6 6" opacity={0.8} />
        </g>
      ))}
      {mode === "list" &&
        now.map((id, i) => {
          if (i === 0) return null;
          const x = LEFT + NW - 18 * k;
          return <line key={`a${id}`} x1={x} x2={x} y1={Y(id) + H} y2={Y(now[i - 1]) - 3} stroke={LINE} strokeWidth={3} markerEnd="url(#sk-l-ah)" />;
        })}
      {mode === "list" && liftNow !== null && now.length > 0 && prevSt && (st.mark ?? []).includes(liftNow) && (
        <line x1={LEFT + NW - 18 * k} x2={LEFT + NW - 18 * k} y1={Y(liftNow) + H} y2={Y(now[now.length - 1]) - 3} stroke={ACC} strokeWidth={4} markerEnd="url(#sk-l-ah-hot)" />
      )}
      {shown.map((id, n) => {
        const y = Y(id);
        const x = X(id);
        const idx = now.indexOf(id);
        const lifted = liftNow === id;
        const lit = mark.includes(id) && !lifted;
        const fresh = prevSt !== null && yOf(was, liftWas, id) === null;
        const op = fresh ? prog(t, 0, 0.4) : enter(n);
        const addr = s.addresses?.[id];
        const ret = st.ret?.[String(id)];
        const isList = mode === "list";
        const ink = lit ? INK : W;
        const sub = lit ? INK : MUTED;
        return (
          <g key={id} opacity={op}>
            {mode === "array" && !lifted && idx >= 0 && (
              <text x={LEFT - 14} y={y + H / 2 + 6} textAnchor="end" fontSize={16 * k} fontFamily="ui-monospace, monospace" fill={MUTED}>
                {idx}
              </text>
            )}
            <rect x={x} y={y} width={NW} height={H} fill={lit ? ACC : lifted ? accA(0.16) : BOX} stroke={lit || lifted ? ACC : "#6a6a72"} strokeWidth={3} strokeDasharray={lifted ? "7 5" : undefined} />
            {isList && <line x1={x + NW - 36 * k} x2={x + NW - 36 * k} y1={y} y2={y + H} stroke={lit ? INK : "#4a4a52"} strokeWidth={2} />}
            <text x={x + (isList ? (NW - 36 * k) / 2 : mode === "calls" ? 16 * k : NW / 2)} y={y + H / 2 + FS * 0.36} textAnchor={mode === "calls" ? "start" : "middle"} fontSize={FS} fontWeight={800} fontFamily="ui-monospace, monospace" fill={ink}>
              {String(values[id])}
            </text>
            {isList &&
              (idx === 0 || (lifted && !(prevSt && mark.includes(id))) ? (
                <text x={x + NW - 18 * k} y={y + H / 2 + 5} textAnchor="middle" fontSize={13 * k} fontFamily="ui-monospace, monospace" fill={sub}>
                  null
                </text>
              ) : (
                <circle cx={x + NW - 18 * k} cy={y + H / 2} r={5} fill={lit ? INK : W} />
              ))}
            {addr !== undefined && (
              <text x={x + NW - (isList ? 42 * k : 10 * k)} y={y + H - 7} textAnchor="end" fontSize={12 * k} fontFamily="ui-monospace, monospace" fill={sub}>
                @{addr}
              </text>
            )}
            {ret !== undefined && (
              <text x={x + NW - 14 * k} y={y + H / 2 + 6} textAnchor="end" fontSize={17 * k} fontWeight={800} fontFamily="ui-monospace, monospace" fill={lit ? INK : ACC}>
                {ret}
              </text>
            )}
          </g>
        );
      })}
      {now.length === 0 && liftNow === null && (
        <text x={LEFT + NW / 2} y={slotY(0) + H / 2 + 6} textAnchor="middle" fontSize={20 * k} fontFamily="ui-monospace, monospace" fill={MUTED}>
          {mode === "list" ? "top is null: empty" : "the stack is empty"}
        </text>
      )}
      {pill("top", topId, topWas, mode === "list" ? "top (head)" : "top")}
      {curr !== undefined && curr !== null && pill("curr", curr, currWas, "curr")}
      {st.out && (
        <g opacity={prevSt ? prog(t, 0.2, 0.4) : 1}>
          <rect x={LEFT} y={6} width={Math.max(100, st.out.length * 12 * k + 24)} height={30 * k} rx={3} fill={st.out === "stack overflow" || st.out === "empty" ? "#ef4444" : W} />
          <text x={LEFT + 12} y={6 + 21 * k} fontSize={17 * k} fontWeight={800} fontFamily="ui-monospace, monospace" fill={st.out === "stack overflow" || st.out === "empty" ? W : INK}>
            {st.out}
          </text>
        </g>
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
      {s.costUnit || "steps"}
    </div>
  );
}

export function StackScene({ s, st, prevSt, t, first }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-[2.5cqh]">
      {s.heading && <h2 className="m-0 text-center font-display text-[3cqw] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#f3f2ee]">{s.heading}</h2>}
      <div className="rounded-sm px-[1.5cqw] py-[1cqh]" style={{ background: accA(0.04) }}>
        <StackSvg s={s} st={st} prevSt={prevSt} t={t} first={first} big={false} style={{ width: "auto", height: "52cqh", maxWidth: "68cqw" }} />
      </div>
      <Counter s={s} st={st} k={1} />
    </div>
  );
}

export function PStack({ s, st, prevSt, t, first }: { s: LectureScene; st: LectureStep; prevSt: LectureStep | null; t: number; first: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-[3cqh]">
      {s.heading && <h2 className="m-0 w-full font-display text-[7.55cqw] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#f3f2ee]">{s.heading}</h2>}
      <StackSvg s={s} st={st} prevSt={prevSt} t={t} first={first} big style={{ width: "96cqw", height: "auto", maxHeight: "48cqh" }} />
      <Counter s={s} st={st} k={2.6} />
    </div>
  );
}
