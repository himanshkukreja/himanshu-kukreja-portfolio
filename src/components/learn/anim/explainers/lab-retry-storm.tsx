/**
 * Break it: a retry storm (week 2, day 3 · 6.1, with the rate-based breaker from 2.x). The lesson's
 * numbers: 100 requests, 3 retries each → up to 400 attempts; exponential backoff 1 s, 2 s, 4 s;
 * breaker opens at 50% failures over at least 100 calls and stays open 30 s. Model: 100 req/s keep
 * arriving; each attempt fails with the chosen probability; retry k fires base × (2^k − 1) s after
 * the original; the chart shows attempts/s reaching the dependency in the first 10 s.
 */
import { defineExplainer, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const RPS = 100;
const C = { x0: 52, x1: 584, y0: 124, y1: 268, t: 10, max: 600 };

const n = (v: number) => Math.round(v).toLocaleString("en-US");

function Scene({ variant, clock, narrow, values }: SceneProps) {
  const f = (values.fail ?? 100) / 100;
  const R = values.retries ?? 3;
  const b = values.backoff ?? 1;
  const breaker = variant === "breaker";
  const delays = Array.from({ length: R + 1 }, (_, k) => b * (2 ** k - 1));
  const at = (t: number) => delays.reduce((a, d, k) => a + (t >= d ? RPS * f ** k : 0), 0);
  // rate-based breaker: opens once ≥100 calls have been seen with ≥50% failing
  let open = Infinity;
  if (breaker && f >= 0.5) {
    let seen = 0;
    for (let t = 0; t < C.t; t += 0.05) {
      seen += at(t) * 0.05;
      if (seen >= 100) {
        open = Math.round((t + 0.05) * 100) / 100;
        break;
      }
    }
  }
  const load = (t: number) => (t >= open - 1e-6 ? 0 : at(t));
  const steady = f >= 1 ? RPS * (R + 1) : (RPS * (1 - f ** (R + 1))) / (1 - f);
  const ts = Array.from(new Set([0, ...delays.filter((d) => d < C.t), ...(open < C.t ? [open] : []), C.t])).sort((a, c) => a - c);
  const xOf = (t: number) => C.x0 + (t / C.t) * (C.x1 - C.x0);
  const yOf = (v: number) => C.y1 - (Math.min(v, C.max) / C.max) * (C.y1 - C.y0);
  let d = "";
  ts.forEach((t, i) => {
    if (i === ts.length - 1) return;
    const v = load(t);
    d += `${i ? "L" : "M"}${xOf(t)} ${yOf(v)}H${xOf(ts[i + 1])}`;
  });
  const peak = Math.max(...ts.slice(0, -1).map(load));
  const amp = peak / RPS;
  const tone: Tone = amp >= 2 ? "bad" : amp > 1.2 ? "warn" : "ok";
  const cur = clock % C.t;
  const lastRetry = delays[R];
  const stats: [string, string, Tone][] = breaker
    ? [
        [narrow ? "peak" : "peak attempts", `${n(peak)}/s`, tone],
        [narrow ? "breaker" : "breaker opens", open < C.t ? `${open.toFixed(1)} s` : "never", open < C.t ? "ok" : "warn"],
        [narrow ? "after" : "after it opens", open < C.t ? "0/s" : `${n(steady)}/s`, open < C.t ? "ok" : tone],
      ]
    : [
        [narrow ? "amplified" : "amplification", `${amp.toFixed(amp >= 10 ? 0 : 1)}×`, tone],
        [narrow ? "peak" : "peak attempts", `${n(peak)}/s`, tone],
        [narrow ? "last retry" : "last retry at", R === 0 ? "none" : `+${+lastRetry.toFixed(2)} s`, "mute"],
      ];
  return (
    <g>
      <Txt x={16} y={28} k="k" anchor="start">
        {breaker ? (narrow ? "retry + breaker" : "retry + rate-based breaker") : narrow ? "retry, no breaker" : "retry with exponential backoff"}
      </Txt>
      <Txt x={584} y={28} k="k" anchor="end" tone="mute">
        {narrow ? `${R} retries` : `100 req/s · ${R} retries · ${Math.round(f * 100)}% fail`}
      </Txt>
      {stats.map(([k, v, tn], i) => (
        <g key={i}>
          <Txt x={16 + i * 196} y={58} k="k" anchor="start" tone={tn}>
            {k}
          </Txt>
          <Txt x={16 + i * 196} y={94} k="d" anchor="start" tone={tn === "mute" ? undefined : tn}>
            {v}
          </Txt>
        </g>
      ))}
      {/* chart: attempts per second reaching the dependency */}
      <line className="rs-ax" x1={C.x0} x2={C.x1} y1={C.y1} y2={C.y1} />
      {[200, 400, 600].map((v) => (
        <g key={v}>
          <line className="rs-g" x1={C.x0} x2={C.x1} y1={yOf(v)} y2={yOf(v)} />
          <Txt x={C.x0 - 6} y={yOf(v) + 4} k="s" anchor="end">
            {String(v)}
          </Txt>
        </g>
      ))}
      <path className={`rs-a ${tone}`} d={`${d}V${C.y1}H${C.x0}Z`} />
      <path className={`rs-l ${tone}`} d={d} />
      <line className="rs-in" x1={C.x0} x2={C.x1} y1={yOf(RPS)} y2={yOf(RPS)} />
      <Txt x={C.x0 - 6} y={yOf(RPS) + 4} k="s" anchor="end" tone="sky">
        100
      </Txt>
      {!narrow && (
        <Txt x={C.x1} y={yOf(RPS) - 6} k="s" anchor="end" tone="sky">
          offered: 100 req/s
        </Txt>
      )}
      {open < C.t && (
        <g>
          <line className="rs-open" x1={xOf(open)} x2={xOf(open)} y1={C.y0} y2={C.y1} />
          <Txt x={xOf(open) + 6} y={C.y0 + 12} k="s" anchor="start" tone="ok">
            {narrow ? "open" : "breaker open · fail fast"}
          </Txt>
        </g>
      )}
      {clock > 0 && <rect className="ax-tok" x={xOf(cur) - 4} y={yOf(load(cur)) - 4} width={8} height={8} />}
      <Txt x={C.x0} y={C.y1 + 22} k="s" anchor="start">
        0 s
      </Txt>
      <Txt x={(C.x0 + C.x1) / 2} y={C.y1 + 22} k="s" tone="mute">
        {narrow ? "attempts/s" : "attempts/s on the dependency"}
      </Txt>
      <Txt x={C.x1} y={C.y1 + 22} k="s" anchor="end">
        10 s
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.rs-ax{stroke:var(--ax-line);stroke-width:1.5}.rs-g{stroke:var(--ax-line-soft);stroke-width:1}.rs-in{stroke:var(--ax-sky);stroke-width:1.5;stroke-dasharray:5 5}.rs-open{stroke:var(--ax-ok);stroke-width:1.5;stroke-dasharray:3 4}
.rs-a{opacity:.22;fill:var(--ax-ok)}.rs-a.warn{fill:var(--ax-amber)}.rs-a.bad{fill:var(--ax-bad)}.rs-l{fill:none;stroke-width:2;stroke:var(--ax-ok)}.rs-l.warn{stroke:var(--ax-amber)}.rs-l.bad{stroke:var(--ax-bad)}`,
  controls: [
    { id: "fail", label: "Failure rate", min: 0, max: 100, step: 5, value: 100, unit: "%" },
    { id: "retries", label: "Max retries", min: 0, max: 5, step: 1, value: 3 },
    { id: "backoff", label: "Backoff base", min: 0, max: 2, step: 0.25, value: 1, format: (v) => (v ? `${v} s (×2 each)` : "0 (immediate)") },
  ],
  variants: [
    {
      id: "retry",
      label: "Retries only",
      steps: [
        { caption: "The dependency is overloaded and fails every call. 100 req/s with 3 retries each becomes up to 400 attempts/s: 4× the load on the service that is already struggling. Drag the failure rate down to see a blip instead.", loop: true, ms: 7500 },
        { caption: "Set the backoff to 0: every retry lands at once. Exponential backoff (1 s, 2 s, 4 s) spreads them out, but the load still climbs to the same 400: backoff buys time, it doesn't remove load.", loop: true, ms: 7500 },
      ],
    },
    {
      id: "breaker",
      label: "Circuit breaker",
      steps: [
        { caption: "Add the lesson's rate-based breaker: 50% failures over at least 100 calls opens it, and calls fail fast for 30 s. The dependency's load drops to zero within a second, giving it room to recover.", loop: true, ms: 7500 },
        { caption: "Drag the failure rate under 50%: the breaker stays closed and the retries flow as before. It stops calls only when the service is clearly failing.", loop: true, ms: 6500 },
      ],
    },
  ],
  Scene,
});
