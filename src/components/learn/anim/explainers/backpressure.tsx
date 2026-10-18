/**
 * Backpressure (week 3, day 3 · 1.3 / 3.1–3.5): producer 1,000 msg/s, consumer 800 msg/s, the
 * three phases without flow control, then the four responses: shed, rate-limit, scale, spill.
 */
import { Box, defineExplainer, lerp, Meter, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const PROD = { x: 24, y: 112, w: 124, h: 64 };
const Q = { x: 200, y: 128, w: 210, h: 32 };
const CONS = { x: 456, w: 120 };
const LIMIT = 5; // million messages: the queue's memory limit

const fmt = (m: number) => (m >= 0.995 ? `${m.toFixed(1)}M` : `${Math.round(m * 1000)}K`);

type Frame = { depth: number; prod: number; cons: number[]; crashed?: boolean; drop?: boolean; spill?: number; limiter?: boolean; phase: string };

function frame(variant: string, step: number, t: number): Frame {
  switch (variant) {
    case "shed":
      return step === 0
        ? { depth: lerp(0.3, 1, t), prod: 1000, cons: [800], drop: t > 0.6, phase: "load shedding" }
        : { depth: 1, prod: 1000, cons: [800], drop: true, phase: "load shedding" };
    case "rate":
      return step === 0 ? { depth: 0.3, prod: Math.round(lerp(1000, 800, t)), cons: [800], limiter: true, phase: "rate-limit producer" } : { depth: 0.3, prod: 800, cons: [800], limiter: true, phase: "rate-limit producer" };
    case "scale":
      return step === 0 ? { depth: 0.3, prod: 1000, cons: t > 0.5 ? [800, 800] : [800], phase: "scale consumers" } : { depth: lerp(0.3, 0.004, t), prod: 1000, cons: [800, 800], phase: "scale consumers" };
    case "spill":
      return step === 0 ? { depth: lerp(0.3, 1, t), prod: 1000, cons: [800], spill: t > 0.6 ? 0.05 : 0, phase: "spillover" } : { depth: 1, prod: 1000, cons: [800], spill: lerp(0.05, 1.4, t), phase: "spillover" };
    default:
      if (step === 0) return { depth: lerp(0, 0.4, t), prod: 1000, cons: [800], phase: "phase 1 · absorption" };
      if (step === 1) return { depth: lerp(0.4, 4.6, t), prod: 1000, cons: [800], phase: "phase 2 · exhaustion" };
      return { depth: lerp(4.6, LIMIT, Math.min(1, t * 2)), prod: 1000, cons: [800], crashed: t > 0.5, phase: "phase 3 · collapse" };
  }
}

function Scene({ variant, step, t, clock, narrow }: SceneProps) {
  const f = frame(variant, step, t);
  const full = f.depth / LIMIT;
  const qTone: Tone = f.crashed ? "bad" : full > 0.6 ? "warn" : "sky";
  const inRate = f.prod / 1000;
  const consY = f.cons.length === 2 ? [70, 170] : [112];
  const out = f.cons.length * (f.crashed ? 0 : 1);
  return (
    <g>
      <Txt x={24} y={36} k="k" anchor="start" tone={f.crashed ? "bad" : undefined}>
        {f.phase}
      </Txt>
      <Box x={PROD.x} y={PROD.y} w={PROD.w} h={PROD.h} label="Producer" sub={`${f.prod.toLocaleString("en-US")}/s`} tone={f.limiter && f.prod < 1000 ? "lit" : undefined} />
      {f.limiter && (
        <g>
          <rect x={158} y={128} width={34} height={32} className="ax-box lit" />
          <Txt x={175} y={149} k="s" tone="lit">
            RL
          </Txt>
          <Txt x={PROD.x} y={PROD.y - 12} k="s" anchor="start" tone="lit">
            {narrow ? "slow down" : "\"slow down · wait 100ms\""}
          </Txt>
        </g>
      )}
      {/* the queue */}
      <Wire d={`M${PROD.x + PROD.w} ${Q.y + Q.h / 2}H${Q.x}`} arrow />
      <Meter x={Q.x} y={Q.y} w={Q.w} h={Q.h} value={f.depth} max={LIMIT} tone={qTone} ticks={5} />
      <Txt x={Q.x} y={Q.y - 30} k="k" anchor="start" tone={qTone === "sky" ? "mute" : qTone}>
        queue depth
      </Txt>
      <Txt x={Q.x + Q.w} y={Q.y - 12} k="d" anchor="end" tone={f.crashed ? "bad" : full > 0.6 ? "warn" : undefined}>
        {f.crashed ? "OOM" : fmt(f.depth)}
      </Txt>
      <Txt x={Q.x + Q.w} y={Q.y + Q.h + 18} k="s" anchor="end">
        {`limit ${LIMIT}M`}
      </Txt>
      {/* arrivals */}
      {!f.crashed &&
        [0, 1, 2].map((k) => {
          const p = (clock * 0.8 * inRate + k / 3) % 1;
          return <Token key={k} x={lerp(PROD.x + PROD.w + 4, Q.x - 6, p)} y={Q.y + Q.h / 2} s={8} tone="sky" />;
        })}
      {/* consumers */}
      {f.cons.map((r, i) => (
        <g key={i}>
          <Wire d={`M${Q.x + Q.w} ${Q.y + Q.h / 2}C${Q.x + Q.w + 24} ${Q.y + Q.h / 2} ${CONS.x - 24} ${consY[i] + 32} ${CONS.x} ${consY[i] + 32}`} arrow />
          <Box x={CONS.x} y={consY[i]} w={CONS.w} h={64} label={f.cons.length > 1 ? `Consumer ${i + 1}` : "Consumer"} sub={f.crashed ? "crashed ✗" : `${r}/s`} tone={f.crashed ? "bad" : f.cons.length > 1 ? "ok" : undefined} />
        </g>
      ))}
      {out > 0 &&
        f.cons.map((_, i) =>
          [0, 1].map((k) => {
            const p = (clock * 0.64 + k / 2 + i * 0.25) % 1;
            return <Token key={`${i}-${k}`} x={lerp(Q.x + Q.w + 6, CONS.x - 4, p)} y={lerp(Q.y + Q.h / 2, consY[i] + 32, p)} s={8} tone="ok" />;
          }),
        )}
      {/* gap readout */}
      <Txt x={Q.x + Q.w / 2} y={Q.y + Q.h + 52} k="t" tone={f.prod > f.cons.reduce((a, b) => a + b, 0) && !f.drop && !f.spill ? "warn" : "ok"}>
        {(() => {
          const c = f.cons.reduce((a, b) => a + b, 0);
          const gap = f.prod - c;
          if (f.drop) return narrow ? "200/s dropped" : "excess 200/s dropped";
          if (f.spill) return narrow ? "200/s spilled" : "excess 200/s → spill";
          return gap > 0 ? `+${gap}/s piling up` : gap < 0 ? `draining ${-gap}/s` : "in balance";
        })()}
      </Txt>
      {/* shed: dropped below the queue mouth */}
      {f.drop && (
        <g>
          <Wire d={`M${Q.x - 14} ${Q.y + Q.h / 2}V${Q.y + 128}`} arrow tone="bad" dash />
          {[0, 1].map((k) => (
            <Token key={k} x={Q.x - 14} y={lerp(Q.y + Q.h / 2, Q.y + 124, (clock * 0.9 + k / 2) % 1)} s={8} tone="bad" />
          ))}
          <Txt x={Q.x - 14} y={Q.y + 146} k="s" tone="bad">
            dropped (low priority first)
          </Txt>
        </g>
      )}
      {/* spill: overflow to S3 / disk */}
      {f.spill !== undefined && f.spill > 0 && (
        <g>
          <Wire d={`M${Q.x - 14} ${Q.y + Q.h / 2}V${Q.y + 112}`} arrow tone="lit" dash />
          {[0, 1].map((k) => (
            <Token key={k} x={Q.x - 14} y={lerp(Q.y + Q.h / 2, Q.y + 108, (clock * 0.9 + k / 2) % 1)} s={8} tone="lit" />
          ))}
          <Box x={Q.x - 60} y={Q.y + 114} w={130} h={46} label="S3 / disk" sub={`${fmt(f.spill)} · later`} tone="lit" />
        </g>
      )}
      {f.crashed && (
        <Txt x={W / 2} y={292} k="s" tone="bad">
          {narrow ? "crash → rebalance → more lag" : "OOM kills · consumers crash → rebalance → timeouts cascade upstream"}
        </Txt>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "none",
      label: "No flow control",
      steps: [
        { caption: "The producer sends 1,000 messages/s; the consumer handles 800/s. Phase 1: the queue absorbs the 200/s gap. Fine, for now.", tween: 2400, loop: true },
        { caption: "Phase 2: the gap never closes. Depth grows to 1M, 2M, 5M messages, memory climbs and consumer lag goes from minutes to hours.", tween: 3200, loop: true },
        { caption: "Phase 3: the queue hits its memory limit. OOM kills, consumers crash and rebalance, timeouts cascade upstream: collapse.", tween: 2000, ms: 3600 },
      ],
    },
    {
      id: "shed",
      label: "Shed",
      steps: [
        { caption: "Load shedding: past a depth threshold, drop the excess. Priority-based shedding drops best-effort messages first.", tween: 2000, loop: true },
        { caption: "Depth holds steady while about 200/s are dropped. Right for metrics and logs; wrong where every message matters.", loop: true, ms: 3400 },
      ],
    },
    {
      id: "rate",
      label: "Rate-limit",
      steps: [
        { caption: "Rate-limit the producer: a limiter (or a gateway answering 429) tells it to slow down.", tween: 2000, loop: true },
        { caption: "The producer settles at 800/s and the queue stops growing. Nothing is lost; the producer waits instead. Adaptive limits tighten as lag grows.", loop: true, ms: 3600 },
      ],
    },
    {
      id: "scale",
      label: "Scale",
      steps: [
        { caption: "Scale consumers: add a second one. In Kafka a group can't have more working consumers than partitions.", tween: 1600, loop: true },
        { caption: "1,600/s of capacity drains the backlog and then keeps up. Needs headroom: cost, partition count, database connections.", tween: 3000, loop: true, ms: 3000 },
      ],
    },
    {
      id: "spill",
      label: "Spill",
      steps: [
        { caption: "Spillover: once lag is detected, new overflow goes to S3 or local disk instead of the hot queue.", tween: 2000, loop: true },
        { caption: "The queue stays bounded and nothing is lost. The overflow is processed later, when consumers have caught up.", tween: 3000, loop: true, ms: 3000 },
      ],
    },
  ],
  Scene,
});
