/**
 * Break it: utilisation vs queueing delay (week 10, day 4 · 4.2 / 4.3). The lesson's model and
 * numbers: single-server M/M/1, wait ≈ service time × ρ / (1 − ρ): 1× at 50%, 4× at 80%, 9× at
 * 90%, unbounded at 100%; never run critical resources above 70–80%; a 200 ms request (4.2).
 * Model: exactly that formula (random arrivals, random service times, one server); response time
 * = service ÷ (1 − ρ); requests queued = ρ² ÷ (1 − ρ). A model, not a measurement.
 */
import { defineExplainer, Token, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const C = { x0: 52, x1: 584, y0: 120, y1: 268, ymax: 20 };

const ms = (v: number) => (v >= 60000 ? `${+(v / 60000).toFixed(1)} min` : v >= 10000 ? `${Math.round(v / 1000)} s` : v >= 1000 ? `${+(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`);
const factor = (r: number) => r / (1 - r);

function Scene({ step, clock, narrow, values }: SceneProps) {
  const rho = (values.util ?? 50) / 100;
  const S = values.svc ?? 200;
  const k = factor(rho);
  const wait = S * k;
  const resp = S / (1 - rho);
  const lq = (rho * rho) / (1 - rho);
  const rho2 = rho * 1.1;
  const wait2 = rho2 < 1 ? S * factor(rho2) : Infinity;
  const tone: Tone = rho > 0.8 ? "bad" : rho > 0.7 ? "warn" : "ok";
  const xOf = (r: number) => C.x0 + r * (C.x1 - C.x0);
  const yOf = (f: number) => C.y1 - (Math.min(f, C.ymax) / C.ymax) * (C.y1 - C.y0);
  let d = "";
  for (let i = 0; i <= 99; i++) {
    const r = i / 100;
    d += `${i ? "L" : "M"}${xOf(r)} ${yOf(factor(r))}`;
  }
  const qn = Math.min(10, Math.round(lq));
  const stats: [string, string, Tone][] = [
    [narrow ? "queue wait" : "wait in queue", ms(wait), tone],
    [narrow ? "+10% load" : "with 10% more traffic", wait2 === Infinity ? "∞" : ms(wait2), wait2 === Infinity || rho2 > 0.8 ? "bad" : rho2 > 0.7 ? "warn" : "ok"],
    [narrow ? "queued" : "requests queued", lq >= 100 ? String(Math.round(lq)) : lq.toFixed(1), tone],
  ];
  return (
    <g>
      <Txt x={16} y={28} k="k" anchor="start">
        {narrow ? `${Math.round(rho * 100)}% busy` : `one server · ${Math.round(rho * 100)}% busy · ${S} ms per request`}
      </Txt>
      <Txt x={584} y={28} k="k" anchor="end" tone="mute">
        {narrow ? `resp ${ms(resp)}` : `response ${ms(resp)}`}
      </Txt>
      {stats.map(([kk, v, tn], i) => (
        <g key={i}>
          <Txt x={16 + i * 196} y={58} k="k" anchor="start" tone={tn}>
            {kk}
          </Txt>
          <Txt x={16 + i * 196} y={94} k="d" anchor="start" tone={tn}>
            {v}
          </Txt>
        </g>
      ))}
      {/* the danger zone and the curve */}
      <rect className="ql-zone" x={xOf(0.8)} y={C.y0} width={xOf(1) - xOf(0.8)} height={C.y1 - C.y0} />
      <Txt x={xOf(0.8) + 6} y={C.y1 - 8} k="s" anchor="start" tone="bad">
        {narrow ? "danger" : "danger zone"}
      </Txt>
      <line className="ql-ax" x1={C.x0} x2={C.x1} y1={C.y1} y2={C.y1} />
      {[1, 4, 9].map((f) => (
        <g key={f}>
          <line className="ql-g" x1={C.x0} x2={C.x1} y1={yOf(f)} y2={yOf(f)} />
          <Txt x={C.x0 - 6} y={yOf(f) + 4} k="s" anchor="end">
            {`${f}×`}
          </Txt>
        </g>
      ))}
      <path className="ql-l" d={d} />
      <line className={`ql-cur ${tone}`} x1={xOf(rho)} x2={xOf(rho)} y1={C.y1} y2={yOf(k)} />
      <rect className={`ql-pt ${tone}`} x={xOf(rho) - 6} y={yOf(k) - 6} width={12} height={12} />
      {k > C.ymax && (
        <Txt x={xOf(0.93)} y={C.y0 + 12} k="s" anchor="end" tone="bad">
          {`${Math.round(k)}× ↑`}
        </Txt>
      )}
      {/* the queue in front of the server */}
      {Array.from({ length: qn }, (_, i) => (
        <Token key={i} x={C.x0 + 16 + i * 14} y={C.y0 + 12} s={9} tone={tone === "ok" ? "sky" : tone} opacity={clock > 0 ? 0.6 + 0.4 * Math.sin(clock * 3 + i) : 1} />
      ))}
      {qn > 0 && (
        <Txt x={C.x0 + 16 + qn * 14} y={C.y0 + 16} k="s" anchor="start">
          queued
        </Txt>
      )}
      <Txt x={C.x0} y={C.y1 + 22} k="s" anchor="start">
        0%
      </Txt>
      <Txt x={xOf(0.5)} y={C.y1 + 22} k="s" tone={step === 0 ? "lit" : undefined}>
        {narrow ? "50%" : "utilisation 50%"}
      </Txt>
      <Txt x={C.x1} y={C.y1 + 22} k="s" anchor="end">
        100%
      </Txt>
      {!narrow && (
        <Txt x={xOf(0.5)} y={C.y1 + 42} k="s" tone="mute">
          model: M/M/1, wait = service × ρ/(1 − ρ), shown as × service time
        </Txt>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.ql-ax{stroke:var(--ax-line);stroke-width:1.5}.ql-g{stroke:var(--ax-line-soft);stroke-width:1}.ql-zone{fill:var(--ax-bad);opacity:.1}.ql-l{fill:none;stroke:var(--ax-accent);stroke-width:2.5}
.ql-cur{stroke-width:1.5;stroke-dasharray:3 4;stroke:var(--ax-ok)}.ql-cur.warn{stroke:var(--ax-amber)}.ql-cur.bad{stroke:var(--ax-bad)}.ql-pt{fill:var(--ax-ok)}.ql-pt.warn{fill:var(--ax-amber)}.ql-pt.bad{fill:var(--ax-bad)}`,
  controls: [
    { id: "util", label: "Utilisation", min: 10, max: 99, step: 1, value: 50, unit: "%" },
    { id: "svc", label: "Service time", min: 10, max: 1000, step: 10, value: 200, unit: "ms" },
  ],
  variants: [
    {
      id: "lab",
      label: "Lab",
      steps: [
        { caption: "50% busy: a request waits about one service time (200 ms) before it is served. Drag utilisation to 80%: the wait is 4×; at 90% it is 9×.", loop: true, ms: 7000 },
        { caption: "Watch the middle number: near the cliff, a little more traffic multiplies the wait. From 90% busy, 10% more load is 99% and the wait goes from 9× to 99×.", loop: true, ms: 7000 },
        { caption: "Hence the lesson's rule: keep critical resources under 70–80%. Change the service time: the whole curve scales with it, but the cliff stays in the same place.", loop: true, ms: 7000 },
      ],
    },
  ],
  Scene,
});
