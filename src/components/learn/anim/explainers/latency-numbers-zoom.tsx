/**
 * Latency numbers every programmer should know (week 0, part 3 · 1.3): one linear scale that keeps
 * zooming out, 100 ns → 150 μs → 10 ms → 150 ms, so each faster tier collapses to a sliver
 * (RAM = 200× L1, SSD random read = 1,500× RAM, HDD seek = 67× SSD, CA → NL → CA = 150 ms).
 */
import { defineExplainer, ease, seg, Txt, type SceneProps } from "../kit";

const W = 600;
const H = 360;
const BAR = { x: 204, w: 372 };
const TOP = 116;
const ROW = 40;

type Row = { name: string; short: string; ns: number; val: string; from: number };
const ROWS: Row[] = [
  { name: "L1 cache", short: "L1 cache", ns: 0.5, val: "0.5 ns", from: 0 },
  { name: "Main memory", short: "RAM", ns: 100, val: "100 ns", from: 0 },
  { name: "SSD 4 KB random", short: "SSD random", ns: 150_000, val: "150 μs", from: 1 },
  { name: "Datacenter RTT", short: "DC round trip", ns: 500_000, val: "0.5 ms", from: 2 },
  { name: "HDD seek", short: "HDD seek", ns: 10_000_000, val: "10 ms", from: 2 },
  { name: "CA → NL → CA", short: "CA→NL→CA", ns: 150_000_000, val: "150 ms", from: 3 },
];
const MAX = [100, 150_000, 10_000_000, 150_000_000];
const FOCUS = [1, 2, 4, 5];
const BIG = [
  { d: "200×", k: "RAM vs L1" },
  { d: "1,500×", k: "SSD vs RAM" },
  { d: "67×", k: "HDD vs SSD" },
  { d: "150 ms", k: "CA → NL → CA" },
];

const fmt = (ns: number) => {
  const r = (v: number) => (v >= 100 ? Math.round(v) : v >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100).toLocaleString("en-US");
  if (ns < 1000) return `${r(ns)} ns`;
  if (ns < 1_000_000) return `${r(ns / 1000)} μs`;
  return `${r(ns / 1_000_000)} ms`;
};

function Scene({ step, t, narrow }: SceneProps) {
  // zoom: interpolate the scale's maximum in log space, then let the newly revealed rows grow in
  const z = step === 0 ? 1 : ease(seg(t, 0, 0.6));
  const prev = MAX[Math.max(0, step - 1)];
  const max = Math.exp(Math.log(prev) + (Math.log(MAX[step]) - Math.log(prev)) * z);
  const grow = step === 0 ? ease(t) : ease(seg(t, 0.55, 1));
  const big = BIG[step];
  return (
    <g>
      <Txt x={24} y={30} k="k" anchor="start">
        {narrow ? "one linear scale" : "one linear scale · zooming out"}
      </Txt>
      <Txt x={W - 24} y={46} k="d" anchor="end" tone="lit">
        {big.d}
      </Txt>
      <Txt x={W - 24} y={68} k="s" anchor="end">
        {big.k}
      </Txt>
      {/* axis */}
      <line className="lz-axis" x1={BAR.x} x2={BAR.x + BAR.w} y1={TOP - 8} y2={TOP - 8} />
      {[0, 0.5, 1].map((f) => (
        <line key={f} className="lz-axis" x1={BAR.x + BAR.w * f} x2={BAR.x + BAR.w * f} y1={TOP - 13} y2={TOP + ROW * ROWS.length - 10} opacity={f === 0 ? 1 : 0.45} />
      ))}
      <Txt x={BAR.x} y={TOP - 18} k="s" anchor="start">
        0
      </Txt>
      {!narrow && (
        <Txt x={BAR.x + BAR.w / 2} y={TOP - 18} k="s">
          {fmt(max / 2)}
        </Txt>
      )}
      <Txt x={BAR.x + BAR.w} y={TOP - 18} k="s" anchor="end" tone="lit">
        {fmt(max)}
      </Txt>
      {ROWS.map((r, i) => {
        const y = TOP + i * ROW;
        const shown = r.from <= step;
        const fresh = r.from === step;
        const f = Math.min(1, r.ns / max) * (fresh ? grow : 1);
        const focus = FOCUS[step] === i;
        const w = shown ? Math.max(1.5, BAR.w * f) : 0;
        return (
          <g key={r.name} opacity={shown ? 1 : 0.38}>
            <Txt x={24} y={y + 13} k="t" anchor="start" tone={focus ? "lit" : undefined}>
              {narrow ? r.short : r.name}
            </Txt>
            <Txt x={24} y={y + 30} k="s" anchor="start">
              {r.val}
            </Txt>
            {shown ? (
              <rect className={focus ? "lz-bar lit" : "lz-bar"} x={BAR.x} y={y + 4} width={w} height={18} />
            ) : (
              <Txt x={BAR.x + 6} y={y + 18} k="s" anchor="start" tone="mute">
                {narrow ? "off scale →" : "off the scale →"}
              </Txt>
            )}
            {shown && f < 0.02 && (
              <Txt x={BAR.x + 8} y={y + 18} k="s" anchor="start" tone="mute">
                {narrow ? "≈ 0" : "a sliver"}
              </Txt>
            )}
          </g>
        );
      })}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.lz-axis{stroke:var(--ax-line);stroke-width:1.5}
.lz-bar{fill:var(--ax-sky);fill-opacity:.55;stroke:var(--ax-sky);stroke-width:1.5}
.lz-bar.lit{fill:var(--ax-accent);fill-opacity:.85;stroke:var(--ax-accent)}`,
  variants: [
    {
      id: "zoom",
      label: "Zoom out",
      steps: [
        { caption: "Main memory takes 100 ns: 200 times an L1 cache reference (0.5 ns), which is barely a sliver.", tween: 1400, ms: 2800 },
        { caption: "Zoom out to 150 μs: one random 4 KB SSD read is 1,500 times a memory reference.", tween: 2600, ms: 3000 },
        { caption: "At 10 ms, an HDD seek is 67 times an SSD read. A datacenter round trip takes 0.5 ms.", tween: 2600, ms: 3200 },
        { caption: "A packet CA → Netherlands → CA takes 150 ms. Everything else shrinks to a hair: minimize round trips.", tween: 2600, ms: 3600 },
      ],
    },
  ],
  Scene,
});
