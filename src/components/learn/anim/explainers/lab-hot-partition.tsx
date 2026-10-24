/**
 * Break it: a hot partition (week 1, day 4 · 1.1 / 1.2 / 1.4). Zipf's law (the nth key gets ~1/n of
 * the top key's traffic) over 1,000 keys, 10,000 req/s, 10 partitions. Model: key k gets weight
 * 1/k^skew (skew 1 = pure Zipf, 0 = uniform), keys are placed on shards by a fixed hash, and each
 * shard is assumed to handle 2,500 req/s (that figure is the lab's assumption, not the lesson's).
 */
import { defineExplainer, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const KEYS = 1000;
const CAP = 2500;
const C = { x0: 44, x1: 584, y0: 124, y1: 268 };

const n = (v: number) => Math.round(v).toLocaleString("en-US");
/** fixed integer hash: key index → shard */
function hash(i: number) {
  let x = Math.imul(i + 1, 0x9e3779b1);
  x ^= x >>> 15;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  return x >>> 0;
}

function Scene({ step, clock, narrow, values }: SceneProps) {
  const skew = values.skew ?? 1;
  const N = values.shards ?? 10;
  const rps = values.rps ?? 10000;
  let total = 0;
  const w: number[] = [];
  for (let k = 0; k < KEYS; k++) {
    w.push(Math.pow(k + 1, -skew));
    total += w[k];
  }
  const load = new Array<number>(N).fill(0);
  for (let k = 0; k < KEYS; k++) load[hash(k) % N] += (w[k] / total) * rps;
  const topShard = hash(0) % N;
  const topKey = (w[0] / total) * rps;
  let hot = 0;
  for (let i = 1; i < N; i++) if (load[i] > load[hot]) hot = i;
  const peak = load[hot];
  const avg = rps / N;
  const tone: Tone = peak > CAP ? "bad" : peak > CAP * 0.7 ? "warn" : "ok";
  const top = Math.max(CAP * 1.25, peak * 1.08);
  const yOf = (v: number) => C.y1 - (v / top) * (C.y1 - C.y0);
  const colW = (C.x1 - C.x0) / N;
  const bw = Math.max(4, Math.min(40, colW * 0.62));
  const pulse = clock > 0 ? 0.75 + 0.25 * Math.sin(clock * 4) : 1;
  const stats: [string, string, Tone][] = [
    [narrow ? "hottest" : "hottest shard", `${Math.round((peak / CAP) * 100)}%`, tone],
    [narrow ? "vs avg" : "vs average shard", `${(peak / avg).toFixed(1)}×`, peak / avg > 2 ? "warn" : "ok"],
    [narrow ? "top key" : "top key alone", `${n(topKey)}/s`, topKey > CAP ? "bad" : topKey > CAP * 0.1 ? "warn" : "ok"],
  ];
  return (
    <g>
      <Txt x={16} y={28} k="k" anchor="start">
        {narrow ? `zipf skew ${skew.toFixed(1)}` : `1,000 keys · skew ${skew.toFixed(1)}`}
      </Txt>
      <Txt x={584} y={28} k="k" anchor="end" tone="mute">
        {narrow ? "cap 2,500/s" : "assumed 2,500/s per shard"}
      </Txt>
      {stats.map(([k, v, tn], i) => (
        <g key={i}>
          <Txt x={16 + i * 196} y={58} k="k" anchor="start" tone={tn}>
            {k}
          </Txt>
          <Txt x={16 + i * 196} y={94} k="d" anchor="start" tone={tn}>
            {v}
          </Txt>
        </g>
      ))}
      {!narrow && (
        <Txt x={16} y={112} k="s" anchor="start">
          {`${n(peak)} of ${n(rps)} req/s on shard ${hot} · average ${n(avg)}`}
        </Txt>
      )}
      <line className="hp-ax" x1={C.x0} x2={C.x1} y1={C.y1} y2={C.y1} />
      {load.map((v, i) => {
        const x = C.x0 + i * colW + (colW - bw) / 2;
        const isHot = i === hot;
        const keyPart = i === topShard ? Math.min(v, topKey) : 0;
        const tn = v > CAP ? "bad" : v > CAP * 0.7 ? "warn" : "sky";
        return (
          <g key={i} opacity={isHot ? pulse : 0.85}>
            <rect className={`ax-fill ${tn}`} x={x} y={yOf(v)} width={bw} height={C.y1 - yOf(v)} />
            {keyPart > 0 && <rect className="hp-key" x={x} y={yOf(keyPart)} width={bw} height={C.y1 - yOf(keyPart)} />}
          </g>
        );
      })}
      <line className="hp-cap" x1={C.x0} x2={C.x1} y1={yOf(CAP)} y2={yOf(CAP)} />
      <Txt x={C.x1} y={yOf(CAP) - 6} k="s" anchor="end" tone="bad">
        capacity
      </Txt>
      <Txt x={C.x0} y={C.y1 + 22} k="s" anchor="start">
        {`shard 0`}
      </Txt>
      <Txt x={C.x1} y={C.y1 + 22} k="s" anchor="end">
        {`shard ${N - 1}`}
      </Txt>
      <Txt x={(C.x0 + C.x1) / 2} y={C.y1 + 22} k="s" tone={step === 2 ? "lit" : "mute"}>
        {narrow ? "orange: key #1" : "orange: key #1's share"}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.hp-ax{stroke:var(--ax-line);stroke-width:1.5}.hp-cap{stroke:var(--ax-bad);stroke-width:1.5;stroke-dasharray:5 5}.hp-key{fill:var(--ax-accent);opacity:.85}`,
  controls: [
    { id: "skew", label: "Key skew (Zipf exponent)", min: 0, max: 1.6, step: 0.1, value: 1, format: (v) => (v === 0 ? "0 (uniform)" : v.toFixed(1)) },
    { id: "shards", label: "Shards", min: 1, max: 32, step: 1, value: 10 },
    { id: "rps", label: "Traffic", min: 1000, max: 50000, step: 1000, value: 10000, format: (v) => `${n(v)} req/s` },
  ],
  variants: [
    {
      id: "lab",
      label: "Lab",
      steps: [
        { caption: "1,000 keys under pure Zipf: key #1 alone takes about 13% of 10,000 req/s, so its shard runs well above the rest. Drag the skew to 0: every shard gets roughly the same 1,000 req/s.", loop: true, ms: 7000 },
        { caption: "Push the skew past 1, like viral content: the hottest shard crosses capacity. Now add shards: the others go quiet, the hot one doesn't, because one key lives on one shard.", loop: true, ms: 7000 },
        { caption: "The orange slice is key #1. When it alone nears a shard's capacity, more shards can't help: cache it, replicate it or split it into key:0 … key:9.", loop: true, ms: 6500 },
      ],
    },
  ],
  Scene,
});
