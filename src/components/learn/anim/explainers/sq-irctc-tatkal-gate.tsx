/**
 * IRCTC Tatkal side quest (deep dive 1): at 10:00:00, ~280,000 requests a second running
 * `UPDATE pool … WHERE available_seats > 0` all queue on one row lock; the fix is a deliberately
 * dumb atomic counter (a Lua script on pool:12301:2026-08-10:3A:TQ, set to 500) that hands out 500
 * TICKET_TO_TRY results, rejects the other 1,999,500 instantly without durable storage, and lets
 * only the admitted reach a single-writer allocator; a retried attempt id is found in the
 * :admitted set and returns ALREADY_ADMITTED without a second decrement.
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 300;

type Pt = { x: number; y: number };
const mv = (a: Pt, b: Pt, p: number): Pt => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) });
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/* ------------------------------------------------------------------ one hot row */

const ROW = { x: 392, y: 104, w: 184, h: 76 };
const QCOLS = 14;
const QROWS = 6;

function RowScene({ step, t, clock, narrow, reduced }: SceneProps) {
  const n = step === 0 ? lerp(4, 24, ease(t)) : step === 1 ? lerp(24, QCOLS * QROWS, ease(t)) : QCOLS * QROWS;
  const timedOut = step === 2 ? Math.floor(QCOLS * QROWS * ease(seg(t, 0.1, 0.9))) : 0;
  const lat = step === 0 ? lerp(0.05, 0.2, t) : step === 1 ? lerp(0.2, 0.95, ease(t)) : 1;
  const queue = [];
  for (let i = 0; i < Math.floor(n); i++) {
    const c = i % QCOLS;
    const r = Math.floor(i / QCOLS);
    queue.push(<Token key={i} x={370 - c * 22} y={112 + r * 14} s={9} tone={i < timedOut ? "bad" : "warn"} />);
  }
  // decorative stream into the back of the queue
  const stream = [];
  if (!reduced)
    for (let k = 0; k < 3; k++) {
      const p = (clock * 1.2 + k / 3) % 1;
      stream.push(<Token key={k} x={lerp(10, 60, p)} y={140 + (k - 1) * 18} s={9} tone="lit" opacity={1 - p * 0.5} />);
    }
  return (
    <g>
      <Txt x={24} y={40} k="k" anchor="start">
        10:00:00
      </Txt>
      <Txt x={24} y={64} anchor="start">
        {narrow ? "280K req/s" : "~280,000 requests/s"}
      </Txt>
      {stream}
      {queue}
      <Box x={ROW.x} y={ROW.y} w={ROW.w} h={ROW.h} label="pool row" sub={narrow ? "12301 · 3A · TQ" : "train 12301 · 3A · TQ"} tone={step >= 1 ? "bad" : "warn"} />
      <Txt x={ROW.x + ROW.w / 2} y={ROW.y - 12} k="k" tone="bad">
        one row lock
      </Txt>
      <Txt x={ROW.x + ROW.w} y={ROW.y + ROW.h + 22} k="s" anchor="end">
        {narrow ? "UPDATE … seats > 0" : "UPDATE … WHERE available_seats > 0"}
      </Txt>
      <Txt x={24} y={232} k="k" anchor="start" tone="mute">
        {narrow ? "latency" : "latency per request"}
      </Txt>
      <Meter x={24} y={244} w={260} h={12} value={lat} max={1} tone={lat > 0.6 ? "bad" : "warn"} />
      <Txt x={24} y={284} k="s" anchor="start" tone={step === 2 ? "bad" : undefined}>
        {step === 2 ? (narrow ? "timeouts cascade" : "timeouts cascade, winners too") : step === 1 ? (narrow ? "lock queue churn" : "lock queue churn, not bookings") : narrow ? "all on one row" : "every request, same row"}
      </Txt>
      <Txt x={ROW.x + ROW.w} y={284} k="s" anchor="end" tone={step === 2 ? "bad" : "mute"}>
        {step === 2 ? (narrow ? "10 shards: 10 hot rows" : "10 shards = 10 hot rows") : ""}
      </Txt>
    </g>
  );
}

/* ------------------------------------------------------------------ the counter gate */

const LUA = { x: 150, y: 112, w: 160, h: 72 };
const TK = { x: 370, y: 28, w: 206, h: 50 };
const AL = { x: 370, y: 122, w: 206, h: 50 };
const SR = { x: 370, y: 218, w: 206, h: 54 };
const SEATS = 500;
const TOTAL = 2_000_000;

function GateScene({ step, t, clock, narrow, reduced }: SceneProps) {
  const counter = step === 0 ? SEATS - Math.round(3 * seg(t, 0.4, 1)) : step === 1 ? lerp(SEATS - 3, 0, ease(t)) : 0;
  const admitted = SEATS - counter;
  const rejected = step < 2 ? 0 : step === 2 ? (TOTAL - SEATS) * ease(seg(t, 0.15, 1)) : TOTAL - SEATS;
  const L: Pt = { x: LUA.x, y: LUA.y + LUA.h / 2 };
  const Rr: Pt = { x: LUA.x + LUA.w, y: LUA.y + LUA.h / 2 };
  const toTK: Pt = { x: TK.x, y: TK.y + TK.h / 2 };
  const toSR: Pt = { x: SR.x, y: SR.y + SR.h / 2 };
  const toks: (Pt & { tone: Tone; o?: number })[] = [];
  if (step === 0) {
    const a = seg(t, 0, 0.4);
    if (a > 0 && a < 1) toks.push({ ...mv({ x: 24, y: L.y }, L, ease(a)), tone: "lit" });
    const b = seg(t, 0.45, 0.85);
    if (b > 0 && b < 1) toks.push({ ...mv(Rr, toTK, ease(b)), tone: "ok" });
  }
  if (!reduced && (step === 1 || step === 2))
    for (let k = 0; k < 4; k++) {
      const p = (clock * 1.4 + k / 4) % 1;
      const inn = p < 0.5;
      const q = inn ? p * 2 : (p - 0.5) * 2;
      toks.push(inn ? { ...mv({ x: 24, y: L.y + (k - 1.5) * 10 }, L, q), tone: "lit" } : { ...mv(Rr, step === 1 ? toTK : toSR, q), tone: step === 1 ? "ok" : "bad" });
    }
  if (step === 3) {
    for (let k = 0; k < 3; k++) {
      const p = seg(t, 0.1 + k * 0.15, 0.5 + k * 0.15);
      if (p > 0 && p < 1) toks.push({ ...mv({ x: TK.x + TK.w / 2, y: TK.y + TK.h }, { x: AL.x + AL.w / 2, y: AL.y }, ease(p)), tone: "ok" });
    }
  }
  const sold = counter <= 0;
  return (
    <g>
      <Txt x={24} y={L.y - 18} k="s" anchor="start">
        {narrow ? "2M tries" : "2M attempts"}
      </Txt>
      <Wire d={`M24 ${L.y}H${L.x}`} arrow />
      <Wire d={`M${Rr.x} ${Rr.y}L${toTK.x} ${toTK.y}`} tone={step === 1 || step === 0 ? "ok" : undefined} arrow />
      <Wire d={`M${Rr.x} ${Rr.y}L${toSR.x} ${toSR.y}`} tone={step === 2 ? "bad" : undefined} arrow />
      <Wire d={`M${TK.x + TK.w / 2} ${TK.y + TK.h}V${AL.y}`} tone={step === 3 ? "ok" : undefined} opacity={step === 3 ? 1 : 0.35} arrow />
      <Txt x={LUA.x + LUA.w / 2} y={44} k="k" tone={sold ? "bad" : undefined}>
        pool counter
      </Txt>
      <Txt x={LUA.x + LUA.w / 2} y={84} k="d" tone={sold ? "bad" : "lit"}>
        {fmt(counter)}
      </Txt>
      <Box x={LUA.x} y={LUA.y} w={LUA.w} h={LUA.h} label={narrow ? "Lua script" : "atomic Lua"} sub={sold ? (narrow ? "0: reject" : "0 → reject") : narrow ? "> 0: DECR" : "> 0 → DECR"} tone="lit" />
      <Txt x={LUA.x + LUA.w / 2} y={LUA.y + LUA.h + 20} k="s">
        {narrow ? "in memory" : "Redis · in memory"}
      </Txt>
      <Box x={TK.x} y={TK.y} w={TK.w} h={TK.h} label="TICKET_TO_TRY" sub={`${fmt(admitted)} admitted`} tone={admitted > 0 ? "ok" : undefined} />
      <Box x={AL.x} y={AL.y} w={AL.w} h={AL.h} label={narrow ? "Allocator" : "Single writer"} sub={narrow ? "berths, 1 txn" : "assigns berths · one txn"} tone={step === 3 ? "ok" : undefined} dim={step !== 3} />
      <Box x={SR.x} y={SR.y} w={SR.w} h={SR.h} label="SOLD OUT" sub={narrow ? "SORRY_TRY_…" : "SORRY_TRY_ANOTHER_TRAIN"} tone={step >= 2 ? "bad" : undefined} dim={step < 2} />
      {toks.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={9} tone={k.tone} />
      ))}
      <Txt x={24} y={232} k="k" anchor="start" tone={rejected > 0 ? "bad" : "mute"}>
        rejected
      </Txt>
      <Txt x={24} y={266} anchor="start" tone={rejected > 0 ? "bad" : "mute"}>
        {fmt(rejected)}
      </Txt>
      <Txt x={24} y={288} k="s" anchor="start" tone="mute">
        {narrow ? "0 bytes stored" : "0 bytes of durable storage"}
      </Txt>
    </g>
  );
}

/* ------------------------------------------------------------------ an idempotent retry */

const CL = { x: 24, y: 112, w: 120, h: 64 };
const LU2 = { x: 214, y: 112, w: 150, h: 64 };
const CT = { x: 430, y: 40, w: 146, h: 64 };
const AD = { x: 430, y: 184, w: 146, h: 64 };

function RetryScene({ step, t, narrow }: SceneProps) {
  const cR: Pt = { x: CL.x + CL.w, y: CL.y + CL.h / 2 };
  const lL: Pt = { x: LU2.x, y: LU2.y + LU2.h / 2 };
  const lR: Pt = { x: LU2.x + LU2.w, y: LU2.y + LU2.h / 2 };
  const ct: Pt = { x: CT.x, y: CT.y + CT.h / 2 };
  const ad: Pt = { x: AD.x, y: AD.y + AD.h / 2 };
  const toks: (Pt & { tone: Tone })[] = [];
  const leg = (a: number, b: number, from: Pt, to: Pt, tone: Tone) => {
    const p = seg(t, a, b);
    if (p > 0 && p < 1) toks.push({ ...mv(from, to, ease(p)), tone });
  };
  let counter = 37;
  let inSet = false;
  let reply = "";
  let replyTone: Tone = undefined;
  if (step === 0) {
    leg(0, 0.25, cR, lL, "lit");
    leg(0.3, 0.5, lR, ct, "lit");
    leg(0.5, 0.7, lR, ad, "sky");
    leg(0.72, 0.95, lL, cR, "ok");
    counter = t >= 0.5 ? 36 : 37;
    inSet = t >= 0.7;
    reply = t >= 0.95 ? "PROCEED_TO_ALLOCATION" : "";
    replyTone = "ok";
  } else {
    leg(0, 0.25, cR, lL, "warn");
    leg(0.3, 0.55, lR, ad, "sky");
    leg(0.62, 0.9, lL, cR, "ok");
    inSet = true;
    counter = 36;
    reply = t >= 0.9 ? "ALREADY_ADMITTED" : "";
    replyTone = "ok";
  }
  const hit = step === 1 && t >= 0.55;
  return (
    <g>
      <Wire d={`M${cR.x} ${cR.y}H${lL.x}`} arrow />
      <Wire d={`M${lR.x} ${lR.y}L${ct.x} ${ct.y}`} tone={step === 0 ? "lit" : undefined} opacity={step === 1 ? 0.35 : 1} />
      <Wire d={`M${lR.x} ${lR.y}L${ad.x} ${ad.y}`} tone={hit ? "lit" : undefined} />
      <Box x={CL.x} y={CL.y} w={CL.w} h={CL.h} label="Priya" sub={step === 1 ? (narrow ? "retry a91" : "retry, same id") : narrow ? "a91" : "attempt a91"} tone={step === 1 ? "warn" : "lit"} />
      <Box x={LU2.x} y={LU2.y} w={LU2.w} h={LU2.h} label="atomic Lua" sub={step === 1 ? (hit ? (narrow ? "member: −3" : "member → −3") : "SISMEMBER?") : narrow ? "new: DECR" : "new id → DECR"} tone="lit" />
      <Box x={CT.x} y={CT.y} w={CT.w} h={CT.h} label="counter" sub={step === 1 ? (narrow ? "36 · same" : "36 · unchanged") : String(counter)} tone={step === 0 && t >= 0.5 ? "lit" : step === 1 ? "ok" : undefined} />
      <Box x={AD.x} y={AD.y} w={AD.w} h={AD.h} label=":admitted" sub={inSet ? "{…, a91}" : "{…}"} tone={hit ? "lit" : inSet ? "sky" : undefined} />
      {toks.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={10} tone={k.tone} />
      ))}
      <Txt x={CL.x} y={CL.y + CL.h + 30} anchor="start" tone={replyTone} opacity={reply ? 1 : 0}>
        {reply || "·"}
      </Txt>
      <Txt x={24} y={44} k="k" anchor="start" tone="mute">
        {narrow ? "same attempt id" : "same attempt id, one seat"}
      </Txt>
      <Txt x={24} y={284} k="s" anchor="start" tone="mute">
        {step === 1 ? (narrow ? "no second seat burned" : "a retry never burns a second seat") : narrow ? "id recorded with DECR" : "the id is recorded with the DECR"}
      </Txt>
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "row") return <RowScene {...p} />;
  if (p.variant === "retry") return <RetryScene {...p} />;
  return <GateScene {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "row",
      label: "One hot row",
      steps: [
        { caption: "10:00:00. About 280,000 requests a second run the same UPDATE … WHERE available_seats > 0 on one pool row.", tween: 1400, loop: true },
        { caption: "Every one queues for the same row lock. The database spends its time on lock churn, not bookings.", tween: 2600, loop: true },
        { caption: "Latency explodes and timeouts cascade, so even the 500 winners time out. Ten shards would just be ten hot rows.", tween: 2400, ms: 3400 },
      ],
    },
    {
      id: "gate",
      label: "Counter gate",
      steps: [
        { caption: "Before 10:00 the pool counter is set to 500. Each request runs one atomic Lua script: counter above 0? DECR.", tween: 1800 },
        { caption: "Each decrement is a TICKET_TO_TRY. In the first seconds of the burst the counter reaches 0.", tween: 2400, loop: true },
        { caption: "Everyone after is told sold out in milliseconds: 1,999,500 rejections, none touching durable storage.", tween: 2400, loop: true },
        { caption: "Only the 500 ticket holders reach the single-writer allocator, which assigns berths in an ordinary transaction.", tween: 2000, ms: 3400 },
      ],
    },
    {
      id: "retry",
      label: "Retry",
      steps: [
        { caption: "Priya's attempt a91 is admitted: the script decrements the counter and adds a91 to the :admitted set.", tween: 2200 },
        { caption: "Her app retries the same attempt. SISMEMBER finds a91: ALREADY_ADMITTED, and the counter doesn't move.", tween: 2000, ms: 3400 },
      ],
    },
  ],
  Scene,
});
