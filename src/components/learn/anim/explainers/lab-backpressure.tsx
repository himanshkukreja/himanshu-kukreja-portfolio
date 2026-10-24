/**
 * Break it: backpressure, backlog and lag (week 3, day 3 · 1.3 / 2.1). The lesson's numbers:
 * producer 1,000 msg/s, consumer 800/s (a 200/s gap); alerts at depth > 100,000 and lag > 5 min.
 * Model: constant rates, an empty queue at t = 0, backlog grows by (producer − consumers × rate)
 * per second and never goes below zero; a new message waits backlog ÷ total consumer throughput.
 */
import { defineExplainer, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const T = 1800; // 30 minutes
const DEPTH_ALERT = 100000;
const LAG_ALERT = 300; // seconds
const C = { x0: 56, x1: 584, y0: 128, y1: 268 };

const n = (v: number) => Math.round(v).toLocaleString("en-US");
const big = (v: number) => (v >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : v >= 1e4 ? `${Math.round(v / 1000)}K` : n(v));
const dur = (s: number) => (s >= 3600 ? `${+(s / 3600).toFixed(1)} h` : s >= 60 ? `${+(s / 60).toFixed(1)} min` : s >= 1 ? `${Math.round(s)} s` : `${Math.round(s * 1000)} ms`);

/** round up to a tidy axis maximum */
function nice(v: number) {
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 1.5, 2, 3, 4, 5, 6, 8, 10].find((m) => v <= m * p) ?? 10) * p;
}

function Scene({ step, clock, narrow, values }: SceneProps) {
  const prod = values.prod ?? 1000;
  const cons = values.cons ?? 1;
  const rate = values.rate ?? 800;
  const out = cons * rate;
  const gap = prod - out;
  const growing = gap > 0;
  const backlog = (t: number) => Math.max(0, gap * t);
  const end = backlog(T);
  const wait = end / out + 0.05;
  // first alert: queue depth over 100,000 or lag over 5 min
  const tDepth = growing ? DEPTH_ALERT / gap : Infinity;
  const tLag = growing ? (LAG_ALERT * out) / gap : Infinity;
  const tAlert = Math.min(tDepth, tLag);
  const top = nice(Math.max(150000, end * 1.08));
  const xOf = (t: number) => C.x0 + (t / T) * (C.x1 - C.x0);
  const yOf = (v: number) => C.y1 - (Math.min(v, top) / top) * (C.y1 - C.y0);
  const tone: Tone = !growing ? "ok" : tAlert < T ? "bad" : "warn";
  const lagLine = LAG_ALERT * out;
  const close = Math.abs(yOf(lagLine) - yOf(DEPTH_ALERT)) < 22;
  const cur = clock > 0 ? ((clock * 0.1) % 1) * T : T;
  const stats: [string, string, Tone][] = [
    [narrow ? "backlog" : "backlog at 30 min", big(end), tone],
    [narrow ? "new msg waits" : "a new message waits", dur(wait), wait > LAG_ALERT ? "bad" : wait > 5 ? "warn" : "ok"],
    growing ? [narrow ? "alert at" : "first alert at", tAlert < T ? dur(tAlert) : "> 30 min", tAlert < T ? "bad" : "warn"] : [narrow ? "spare" : "spare capacity", `${n(-gap)}/s`, "ok"],
  ];
  return (
    <g>
      <Txt x={16} y={28} k="k" anchor="start">
        {narrow ? `${n(prod)}/s in · ${n(out)}/s out` : `producer ${n(prod)}/s · ${cons} consumer${cons > 1 ? "s" : ""} × ${n(rate)}/s = ${n(out)}/s`}
      </Txt>
      <Txt x={584} y={28} k="k" anchor="end" tone={growing ? "warn" : "ok"}>
        {growing ? `+${n(gap)}/s` : gap < 0 ? "keeping up" : "in balance"}
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
      {/* chart: queue depth over 30 minutes */}
      <line className="bp-ax" x1={C.x0} x2={C.x1} y1={C.y1} y2={C.y1} />
      <line className="bp-al" x1={C.x0} x2={C.x1} y1={yOf(DEPTH_ALERT)} y2={yOf(DEPTH_ALERT)} />
      <Txt x={C.x0 + 4} y={yOf(DEPTH_ALERT) - 6} k="s" anchor="start" tone={step === 0 ? "bad" : "mute"}>
        {narrow ? "depth 100K" : "alert: depth > 100,000"}
      </Txt>
      {lagLine < top && (
        <g>
          <line className="bp-lag" x1={C.x0} x2={C.x1} y1={yOf(lagLine)} y2={yOf(lagLine)} />
          <Txt x={close ? C.x1 : C.x0 + 4} y={yOf(lagLine) - 6} k="s" anchor={close ? "end" : "start"} tone={step === 2 ? "warn" : "mute"}>
            {narrow ? "lag 5 min" : `alert: lag > 5 min (${big(lagLine)})`}
          </Txt>
        </g>
      )}
      <path className={`bp-a ${tone}`} d={`M${C.x0} ${C.y1}L${xOf(cur)} ${yOf(backlog(cur))}V${C.y1}Z`} />
      <path className={`bp-l ${tone}`} d={`M${C.x0} ${yOf(0)}L${xOf(T)} ${yOf(end)}`} opacity={0.35} />
      <path className={`bp-l ${tone}`} d={`M${C.x0} ${yOf(0)}L${xOf(cur)} ${yOf(backlog(cur))}`} />
      {tAlert < T && <rect className="ax-tok bad" x={xOf(tAlert) - 4} y={yOf(backlog(tAlert)) - 4} width={8} height={8} />}
      {[0, 10, 20, 30].map((m) => (
        <Txt key={m} x={xOf(m * 60)} y={C.y1 + 22} k="s" anchor={m === 0 ? "start" : m === 30 ? "end" : "middle"}>
          {`${m} min`}
        </Txt>
      ))}
      <Txt x={C.x0 - 6} y={C.y0 + 4} k="s" anchor="end">
        {big(top)}
      </Txt>
      <Txt x={C.x0 - 6} y={C.y1} k="s" anchor="end">
        0
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.bp-ax{stroke:var(--ax-line);stroke-width:1.5}.bp-al{stroke:var(--ax-bad);stroke-width:1.5;stroke-dasharray:5 5}.bp-lag{stroke:var(--ax-amber);stroke-width:1.5;stroke-dasharray:2 4}
.bp-a{opacity:.22;fill:var(--ax-ok)}.bp-a.warn{fill:var(--ax-amber)}.bp-a.bad{fill:var(--ax-bad)}.bp-l{fill:none;stroke-width:2.5;stroke:var(--ax-ok)}.bp-l.warn{stroke:var(--ax-amber)}.bp-l.bad{stroke:var(--ax-bad)}`,
  controls: [
    { id: "prod", label: "Producer rate", min: 100, max: 3000, step: 50, value: 1000, unit: "msg/s" },
    { id: "cons", label: "Consumers", min: 1, max: 8, step: 1, value: 1 },
    { id: "rate", label: "Each consumer handles", min: 100, max: 1500, step: 50, value: 800, unit: "msg/s" },
  ],
  variants: [
    {
      id: "lab",
      label: "Lab",
      steps: [
        { caption: "Producer 1,000 msg/s, one consumer at 800/s: 200/s pile up. After about 8 minutes the queue passes the lesson's 100,000-message alert, and every new message waits longer. Add a consumer.", loop: true, ms: 7500 },
        { caption: "Two consumers (1,600/s) keep up and the backlog stays at zero. Now push the producer past what they can handle: any gap, however small, grows without limit.", loop: true, ms: 7000 },
        { caption: "Lag in time is backlog ÷ consumer throughput. Slow each consumer down (a slow database, a GC pause): the lag line drops, the same backlog now means a longer wait, and the 5-minute alert fires sooner.", loop: true, ms: 7000 },
      ],
    },
  ],
  Scene,
});
