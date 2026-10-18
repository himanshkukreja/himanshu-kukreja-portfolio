/**
 * Token bucket vs leaky bucket (week 1, day 3 · 2.4 / 2.5). Numbers are the lesson's timelines:
 * token bucket 10 tokens/s, capacity 50; leaky bucket drains 10 requests/s, queue capacity 50.
 */
import { at, defineExplainer, lerp, seg, Token, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const B = { x: 262, y: 78, w: 96, h: 200 }; // the bucket: 50 units, 4px each
const UNIT = B.h / 50;

/* ---------------------------------------------------------------- token bucket */

const TB = {
  time: ["t = 0", "t = 0", "t = 1 s", "t = 2 s", "t = 3 s", "steady"],
  refill: [0, 0, 10, 10, 10, 0],
  arrive: [0, 30, 5, 0, 60, 0],
  allow: [0, 30, 5, 0, 45, 0],
  level: [50, 20, 25, 35, 0, 0],
};
const cum = (xs: number[], i: number) => xs.slice(0, i + 1).reduce((a, b) => a + b, 0);

function Lane({ n, allow, t, x0, sink }: { n: number; allow: number; t: number; x0: number; sink?: boolean }) {
  // n requests in a 10-wide grid; they fly into the bucket, then out (allowed) or down (rejected)
  const into = seg(t, 0.35, 0.7);
  const out = seg(t, 0.7, 1);
  return (
    <g>
      {Array.from({ length: n }, (_, j) => {
        const gx = x0 + (j % 10) * 15;
        const gy = 120 + Math.floor(j / 10) * 15;
        const ok = j < allow;
        const mx = lerp(gx, B.x + 12 + (j % 6) * 14, into);
        const my = lerp(gy, B.y - 14, into);
        const x = ok ? lerp(mx, 470 + (j % 6) * 14, out) : mx;
        const y = ok ? lerp(my, 120 + Math.floor(j / 6) * 13, out) : lerp(my, B.y + B.h + 26, out);
        const tone: Tone = into < 1 ? "mute" : ok ? "ok" : "bad";
        return <Token key={j} x={x} y={y} s={9} tone={sink ? "sky" : tone} opacity={sink ? 1 - into : out >= 1 ? 0 : 1} />;
      })}
    </g>
  );
}

function TokenScene({ step, t, narrow }: SceneProps) {
  const prev = at(step - 1, TB.level);
  const refill = at(step, TB.refill);
  const lvl = step === 0 ? 50 : (() => {
    const r = seg(t, 0, 0.35);
    const c = seg(t, 0.55, 0.95);
    const afterRefill = Math.min(50, prev + refill);
    return lerp(lerp(prev, afterRefill, r), at(step, TB.level), c);
  })();
  const allowedTotal = cum(TB.allow, step - 1) + (seg(t, 0.7, 1) >= 1 || step === 0 ? at(step, TB.allow) : 0);
  const rejectedTotal = cum(TB.arrive, step - 1) - cum(TB.allow, step - 1) + (seg(t, 0.7, 1) >= 1 ? at(step, TB.arrive) - at(step, TB.allow) : 0);
  const fillTone: Tone = lvl < 1 ? "bad" : "lit";
  return (
    <g>
      <Txt x={24} y={40} k="k" anchor="start">
        {at(step, TB.time)}
      </Txt>
      <Txt x={24} y={62} k="s" anchor="start">
        {narrow ? "10/s · max 50" : "refill 10 tokens/s · capacity 50"}
      </Txt>
      {/* refill drip */}
      {refill > 0 && (
        <g opacity={1 - seg(t, 0.35, 0.5)}>
          <Txt x={B.x + B.w / 2} y={B.y - 30} k="t" tone="lit">
            +10
          </Txt>
          <Token x={B.x + B.w / 2} y={lerp(B.y - 20, B.y + 10, seg(t, 0, 0.35))} s={8} tone="lit" />
        </g>
      )}
      {/* bucket */}
      <path className="tb-bucket" d={`M${B.x} ${B.y}V${B.y + B.h}H${B.x + B.w}V${B.y}`} />
      <rect className={`ax-fill ${fillTone}`} x={B.x + 4} y={B.y + B.h - lvl * UNIT} width={B.w - 8} height={lvl * UNIT} opacity={0.85} />
      {[10, 20, 30, 40, 50].map((m) => (
        <line key={m} className="tb-tick" x1={B.x + B.w} x2={B.x + B.w + 6} y1={B.y + B.h - m * UNIT} y2={B.y + B.h - m * UNIT} />
      ))}
      <Txt x={B.x + B.w + 10} y={B.y + 4} k="s" anchor="start">
        50
      </Txt>
      <Txt x={B.x + B.w / 2} y={B.y + B.h + 22} k="s">
        tokens
      </Txt>
      <Txt x={B.x + B.w / 2} y={Math.max(B.y + 34, B.y + B.h - lvl * UNIT - 8)} k="d" tone={lvl < 1 ? "bad" : undefined}>
        {Math.round(lvl)}
      </Txt>
      {/* arrivals */}
      <Txt x={24} y={100} k="s" anchor="start">
        {at(step, TB.arrive) ? `${at(step, TB.arrive)} requests` : "no requests"}
      </Txt>
      <Lane key={step} n={at(step, TB.arrive)} allow={at(step, TB.allow)} t={step === 0 ? 1 : t} x0={24} />
      {/* outcomes */}
      <Txt x={W - 24} y={100} k="k" anchor="end" tone="ok">
        allowed
      </Txt>
      <Txt x={W - 24} y={136} k="d" anchor="end" tone="ok">
        {allowedTotal}
      </Txt>
      <Txt x={W - 24} y={200} k="k" anchor="end" tone="bad">
        rejected
      </Txt>
      <Txt x={W - 24} y={236} k="d" anchor="end" tone={rejectedTotal ? "bad" : "mute"}>
        {rejectedTotal}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- leaky bucket */

const LB = {
  time: ["queue", "burst", "after 1 s", "after 2 s", "after 3 s", "full queue"],
  queue: [0, 30, 20, 10, 0, 50],
  done: [0, 0, 10, 20, 30, 30],
};

function LeakyScene({ step, t, clock, narrow, reduced }: SceneProps) {
  const q = step === 0 ? 0 : lerp(at(step - 1, LB.queue), at(step, LB.queue), step === 5 ? seg(t, 0, 0.6) : t);
  const done = step === 0 ? 0 : lerp(at(step - 1, LB.done), at(step, LB.done), t);
  const draining = step >= 1 && step <= 4 && q > 0.5;
  const overflow = step === 5;
  return (
    <g>
      <Txt x={24} y={40} k="k" anchor="start">
        {at(step, LB.time)}
      </Txt>
      <Txt x={24} y={62} k="s" anchor="start">
        {narrow ? "out 10/s · queue 50" : "drains 10 requests/s · queue holds 50"}
      </Txt>
      {/* arrivals of the burst */}
      {step === 1 && <Lane key="burst" n={30} allow={30} t={t * 0.7} x0={24} sink />}
      {overflow && (
        <g>
          <Lane key="over" n={10} allow={0} t={0.35 + seg(t, 0.3, 1) * 0.65} x0={24} />
          <Txt x={24} y={100} k="s" anchor="start" tone="bad">
            {narrow ? "51st+ rejected" : "arrivals beyond 50: rejected"}
          </Txt>
        </g>
      )}
      {/* the queue as a bucket with a hole */}
      <path className="tb-bucket" d={`M${B.x} ${B.y}V${B.y + B.h}H${B.x + B.w / 2 - 8}M${B.x + B.w / 2 + 8} ${B.y + B.h}H${B.x + B.w}V${B.y}`} />
      <rect className={`ax-fill ${overflow ? "bad" : "sky"}`} x={B.x + 4} y={B.y + B.h - q * UNIT} width={B.w - 8} height={q * UNIT} opacity={0.8} />
      <Txt x={B.x + B.w + 10} y={B.y + 4} k="s" anchor="start">
        50
      </Txt>
      <Txt x={B.x + B.w / 2} y={Math.max(B.y + 34, B.y + B.h - q * UNIT - 8)} k="d">
        {Math.round(q)}
      </Txt>
      <Txt x={B.x - 10} y={B.y + B.h - 6} k="s" anchor="end">
        waiting
      </Txt>
      {/* the steady drip out: one request every 1/10 s */}
      <path className="ax-wire" d={`M${B.x + B.w / 2} ${B.y + B.h}V${B.y + B.h + 20}H${W - 150}`} />
      {draining &&
        Array.from({ length: 4 }, (_, k) => {
          const p = reduced ? k / 4 : (clock * 0.9 + k / 4) % 1;
          return <Token key={k} x={lerp(B.x + B.w / 2, W - 150, p)} y={B.y + B.h + 20} s={8} tone="ok" />;
        })}
      <Txt x={W - 24} y={100} k="k" anchor="end" tone="ok">
        processed
      </Txt>
      <Txt x={W - 24} y={136} k="d" anchor="end" tone="ok">
        {Math.round(done)}
      </Txt>
      <Txt x={W - 24} y={160} k="s" anchor="end">
        at a steady 10/s
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.tb-bucket{fill:none;stroke:var(--ax-fg3);stroke-width:2.5}.tb-tick{stroke:var(--ax-fg4);stroke-width:1.5}`,
  variants: [
    {
      id: "token",
      label: "Token bucket",
      steps: [
        { caption: "The bucket starts full: 50 tokens. It refills at 10 tokens per second and never holds more than 50." },
        { caption: "Time 0: a burst of 30 requests. Each one takes a token, so all 30 are allowed at once and 20 tokens remain.", tween: 2400, ms: 2600 },
        { caption: "Time 1: the bucket refills 10 tokens to 30. Five requests arrive: 5 allowed, 25 tokens remain.", tween: 2400 },
        { caption: "Time 2: another 10 tokens, 35 in the bucket. No requests, so the tokens are saved for a later burst.", tween: 1400 },
        { caption: "Time 3: refilled to 45. A burst of 60 arrives: 45 are allowed, 15 are rejected, and the bucket is empty.", tween: 2800, ms: 3200 },
        { caption: "Over time throughput converges to the refill rate, 10 per second; the capacity decides how big a burst can get through.", ms: 3600 },
      ],
    },
    {
      id: "leaky",
      label: "Leaky bucket",
      steps: [
        { caption: "A leaky bucket is a queue that drains at a fixed rate: 10 requests per second, with room for 50." },
        { caption: "A burst of 30 requests arrives at once. All 30 wait in the queue; output starts at 10 per second.", tween: 1600, loop: true },
        { caption: "After 1 second: 10 processed, 20 still waiting.", tween: 1800, loop: true },
        { caption: "After 2 seconds: 20 processed, 10 waiting.", tween: 1800, loop: true },
        { caption: "After 3 seconds: all 30 processed and the queue is empty. Downstream saw a smooth 10/s, but the last requests waited 3 seconds.", tween: 1800, ms: 3800 },
        { caption: "A full queue rejects new arrivals. Smooth output, added latency: good for protecting a downstream service, not for user-facing limits.", tween: 2400, ms: 4000 },
      ],
    },
  ],
  Scene: (p) => (p.variant === "leaky" ? <LeakyScene {...p} /> : <TokenScene {...p} />),
});
