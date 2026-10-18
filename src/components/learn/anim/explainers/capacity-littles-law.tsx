/**
 * Little's Law and queueing (week 10, day 4 · 4.2 / 4.3): the lesson's API (100 req/s × 0.2 s =
 * 20 in flight on 10 pods × 2 workers = at capacity; 150 req/s needs 30, the queue grows and W
 * with it; the 500 req/s plan: 100 workers, 25 pods of 4, ≈ 36 with 30% headroom), then the M/M/1
 * curve wait ≈ service × ρ/(1 − ρ): 1× at 50%, 4× at 80%, 9× at 90%, unbounded at 100%.
 */
import { clamp, defineExplainer, ease, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;

/* ---------------------------------------------------------------- variant 1: Little's Law */

const SRC = { x: 20, y: 102, w: 84, h: 64 };
const Q = { x: 134, y: 120, w: 118, h: 28, max: 100 };
const WK = { x: 292, y: 104, col: 27, s: 18 };

function Little({ step, t, clock, narrow, reduced }: SceneProps) {
  const p = ease(t);
  const lambda = step === 0 ? 100 : step <= 2 ? (step === 1 ? lerp(100, 150, p) : 150) : 500;
  const queue = step === 0 ? 0 : step === 1 ? lerp(0, 10, seg(t, 0.4, 1)) : step === 2 ? lerp(10, 100, p) : 0;
  const busy = step === 0 ? Math.round(lerp(0, 20, p)) : 20;
  const plan = step === 3;
  const bad = step === 2;
  const qTone: Tone = queue >= 60 ? "bad" : queue > 0 ? "warn" : undefined;
  if (plan) return <Plan t={t} narrow={narrow} />;
  // arrivals: more tokens at 150/s than at 100/s
  const nTok = lambda > 120 ? 6 : 4;
  return (
    <g>
      <Txt x={20} y={32} k="k" anchor="start">
        {narrow ? "your API" : "your API · W = 0.2 s per request"}
      </Txt>
      <rect x={SRC.x} y={SRC.y} width={SRC.w} height={SRC.h} className={`ax-box${step >= 1 ? " lit" : ""}`} />
      <Txt x={SRC.x + SRC.w / 2} y={SRC.y + 28}>
        λ
      </Txt>
      <Txt x={SRC.x + SRC.w / 2} y={SRC.y + 50} k="s" tone={step >= 1 ? "lit" : undefined}>
        {`${Math.round(lambda)}/s`}
      </Txt>
      <Wire d={`M${SRC.x + SRC.w} ${Q.y + Q.h / 2}H${Q.x}`} arrow />
      {!reduced &&
        clock > 0 &&
        Array.from({ length: nTok }, (_, k) => {
          const u = (clock * 0.9 + k / nTok) % 1;
          return <Token key={k} x={lerp(SRC.x + SRC.w + 4, Q.x - 6, u)} y={Q.y + Q.h / 2} s={8} tone="sky" />;
        })}
      {/* the queue */}
      <Txt x={Q.x} y={Q.y - 12} k="k" anchor="start" tone={qTone || "mute"}>
        queue
      </Txt>
      <rect x={Q.x} y={Q.y} width={Q.w} height={Q.h} className="ll-q" />
      <rect x={Q.x} y={Q.y} width={Q.w * clamp(queue / Q.max)} height={Q.h} className={`ll-qf ${qTone || ""}`} />
      <Txt x={Q.x + Q.w} y={Q.y + Q.h + 22} k="t" anchor="end" tone={qTone}>
        {`${Math.round(queue)} waiting`}
      </Txt>
      <Wire d={`M${Q.x + Q.w} ${Q.y + Q.h / 2}H${WK.x - 8}`} arrow />
      {/* workers: 10 pods × 2 */}
      <Txt x={WK.x} y={WK.y - 14} k="k" anchor="start" tone="mute">
        {narrow ? "20 workers" : "10 pods × 2 workers = 20"}
      </Txt>
      {Array.from({ length: 10 }, (_, pod) => (
        <g key={pod}>
          <rect x={WK.x + pod * WK.col - 3} y={WK.y - 3} width={WK.s + 6} height={WK.s * 2 + 10} className="ll-pod" />
          {[0, 1].map((r) => {
            const i = pod * 2 + r;
            return <rect key={r} x={WK.x + pod * WK.col} y={WK.y + r * (WK.s + 4)} width={WK.s} height={WK.s} className={`ll-w${i < busy ? " busy" : ""}`} />;
          })}
        </g>
      ))}
      <Txt x={WK.x} y={WK.y + WK.s * 2 + 30} k="s" anchor="start">
        {narrow ? "max 100/s out" : "20 ÷ 0.2 s = 100 req/s max out"}
      </Txt>
      {/* L = λ × W */}
      <line x1={20} x2={W - 20} y1={214} y2={214} className="ll-rule" />
      <Txt x={20} y={252} k="d" anchor="start" tone={bad ? "bad" : step === 1 ? "warn" : undefined}>
        {step === 0 ? "L = 100 × 0.2 = 20" : step === 1 ? `L = ${Math.round(lambda)} × 0.2 = ${Math.round(lambda * 0.2)}` : "L = 150 × W↑"}
      </Txt>
      <Txt x={20} y={286} k="t" anchor="start" tone={bad ? "bad" : step === 1 ? "warn" : "lit"}>
        {step === 0
          ? narrow
            ? "20 needed = 20 workers"
            : "20 in flight = 20 workers: AT CAPACITY"
          : step === 1
            ? narrow
              ? "30 needed, 20 workers"
              : "30 needed, only 20 workers: requests queue"
            : narrow
              ? "+50/s queued: W↑ L↑"
              : "150 in, 100 out: queue +50/s, W↑ so L↑"}
      </Txt>
      {bad && (
        <Txt x={W - 20} y={252} k="k" anchor="end" tone="bad" opacity={seg(t, 0.5, 1)}>
          spiral
        </Txt>
      )}
    </g>
  );
}

/** step 4: the 500 req/s plan as pods (25 needed + headroom ≈ 36) */
function Plan({ t, narrow }: { t: number; narrow: boolean }) {
  const shown = Math.round(lerp(0, 36, ease(seg(t, 0, 0.8))));
  const S = 26;
  const G = 8;
  const X = 20;
  const Y = 96;
  return (
    <g>
      <Txt x={20} y={32} k="k" anchor="start">
        {narrow ? "plan for 500 req/s" : "capacity plan · 500 req/s at 0.2 s"}
      </Txt>
      <Txt x={20} y={70} k="t" anchor="start">
        {narrow ? "L = 500 × 0.2 = 100" : "L = 500 × 0.2 = 100 workers"}
      </Txt>
      {Array.from({ length: 36 }, (_, i) => {
        const col = i % 12;
        const row = Math.floor(i / 12);
        const head = i >= 25;
        return (
          <rect
            key={i}
            x={X + col * (S + G)}
            y={Y + row * (S + G)}
            width={S}
            height={S}
            opacity={i < shown ? 1 : 0.15}
            className={`ll-plan${head ? " head" : ""}`}
          />
        );
      })}
      <Txt x={20} y={226} k="t" anchor="start" tone="lit">
        {narrow ? "100 ÷ 4 = 25 pods" : "100 workers ÷ 4 per pod = 25 pods"}
      </Txt>
      <Txt x={20} y={256} k="t" anchor="start" tone="ok" opacity={seg(t, 0.6, 1)}>
        {narrow ? "25 ÷ 0.7 ≈ 36 pods" : "30% headroom: 25 ÷ 0.7 ≈ 36 pods"}
      </Txt>
      <rect x={20} y={278} width={14} height={14} className="ll-plan" />
      <Txt x={42} y={290} k="s" anchor="start">
        needed
      </Txt>
      <rect x={140} y={278} width={14} height={14} className="ll-plan head" />
      <Txt x={162} y={290} k="s" anchor="start">
        headroom
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- variant 2: utilization curve */

const UX0 = 70;
const UX1 = 560;
const UY0 = 262; // 0×
const UY1 = 60; // 12×
const YMAX = 12;
const ux = (rho: number) => lerp(UX0, UX1, rho);
const uy = (v: number) => lerp(UY0, UY1, clamp(v / YMAX));
const wait = (rho: number) => rho / (1 - rho);
const RHO_TOP = YMAX / (YMAX + 1); // where the curve leaves the chart
const POINTS = [
  { rho: 0.5, label: "1×" },
  { rho: 0.8, label: "4×" },
  { rho: 0.9, label: "9×" },
];

const rhoAt = (i: number) => POINTS[Math.min(i, POINTS.length - 1)].rho;

function curvePath(to: number) {
  const n = Math.max(2, Math.round(to * 120));
  let d = "";
  for (let i = 0; i <= n; i++) {
    const r = (to * i) / n;
    d += `${i ? "L" : "M"}${ux(r).toFixed(1)} ${uy(wait(r)).toFixed(1)}`;
  }
  return d;
}

function Util({ step, t, narrow }: SceneProps) {
  const p = ease(t);
  const prevRho = step === 0 ? 0 : rhoAt(step - 1);
  const target = step <= 2 ? POINTS[step].rho : RHO_TOP;
  const rho = lerp(prevRho, target, p);
  const v = wait(rho);
  const inf = step === 3 && p >= 1;
  return (
    <g>
      <Txt x={UX0} y={32} k={narrow ? "k" : "s"} anchor="start" tone={narrow ? undefined : "lit"}>
        {narrow ? "wait vs utilization" : "single-server queue: wait ≈ service time × ρ / (1 − ρ)"}
      </Txt>
      {/* danger zone above 70–80% */}
      <rect x={ux(0.7)} y={UY1} width={ux(1) - ux(0.7)} height={UY0 - UY1} className="ll-zone" />
      <Txt x={ux(0.7)} y={UY1 - 8} k="s" anchor="start" tone="warn">
        {narrow ? "danger" : "danger zone"}
      </Txt>
      <line x1={UX0} x2={UX0} y1={UY1} y2={UY0} className="ll-axis" />
      <line x1={UX0} x2={UX1} y1={UY0} y2={UY0} className="ll-axis" />
      <line x1={ux(1)} x2={ux(1)} y1={UY1} y2={UY0} className="ll-asym" />
      {/* reached points */}
      {POINTS.map((pt, i) => {
        const reached = step > i || (step === i && p >= 1);
        if (!reached) return null;
        const y = uy(wait(pt.rho));
        return (
          <g key={pt.label}>
            <line x1={ux(pt.rho)} x2={ux(pt.rho)} y1={y} y2={UY0} className="ll-guide" />
            <Txt x={ux(pt.rho) - 12} y={y + 4} k="s" anchor="end" tone={step === i ? "lit" : undefined}>
              {pt.label}
            </Txt>
          </g>
        );
      })}
      <path d={curvePath(Math.min(rho, RHO_TOP))} className="ll-curve" />
      {!inf && <rect x={ux(rho) - 6} y={uy(v) - 6} width={12} height={12} className="ll-dot" />}
      {inf && (
        <g>
          <Wire d={`M${ux(RHO_TOP) + 8} ${UY1 + 40}V${UY1 + 4}`} arrow tone="lit" />
          <Txt x={ux(RHO_TOP) + 20} y={UY1 + 30} k="t" anchor="start" tone="bad">
            ∞
          </Txt>
        </g>
      )}
      {/* x axis */}
      {[0, 0.5, 0.8, 0.9, 1].map((r) => (
        <Txt key={r} x={ux(r)} y={UY0 + 22} k="s" tone={POINTS.some((pt, i) => pt.rho === r && i === step) ? "lit" : undefined}>
          {r === 0 ? "0" : `${Math.round(r * 100)}%`}
        </Txt>
      ))}
      <Txt x={UX1} y={UY0 + 46} k="s" anchor="end">
        utilization ρ
      </Txt>
      {/* readout */}
      <Txt x={UX0 + 20} y={UY1 + 34} k="d" anchor="start" tone={inf ? "bad" : rho > 0.7 ? "warn" : undefined}>
        {inf ? "100%" : `${Math.round(rho * 100)}%`}
      </Txt>
      <Txt x={UX0 + 20} y={UY1 + 62} k="t" anchor="start" tone={inf ? "bad" : undefined}>
        {inf ? (narrow ? "queue never ends" : "infinite queue · fails") : `wait ≈ ${v < 10 ? v.toFixed(1) : Math.round(v)}× service`}
      </Txt>
      {step === 3 && (
        <Txt x={UX0 + 20} y={UY1 + 88} k="s" anchor="start" tone="lit" opacity={seg(t, 0.5, 1)}>
          {narrow ? "stay under 70–80%" : "rule: stay under 70–80% utilization"}
        </Txt>
      )}
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "util" ? <Util {...p} /> : <Little {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  css: `
.ll-q{fill:none;stroke:var(--ax-line);stroke-width:1.5}
.ll-qf{fill:var(--ax-sky)}.ll-qf.warn{fill:var(--ax-amber)}.ll-qf.bad{fill:var(--ax-bad)}
.ll-pod{fill:none;stroke:var(--ax-line-soft);stroke-width:1}
.ll-w{fill:var(--ax-box);stroke:var(--ax-line);stroke-width:1.5}
.ll-w.busy{fill:var(--ax-accent);stroke:var(--ax-accent)}
.ll-rule{stroke:var(--ax-line-soft);stroke-width:1}
.ll-plan{fill:var(--ax-accent);stroke:var(--ax-accent);stroke-width:1.5}
.ll-plan.head{fill:var(--ax-box);stroke:var(--ax-ok);stroke-dasharray:4 3}
.ll-zone{fill:var(--ax-amber);opacity:.1}
.ll-axis{stroke:var(--ax-line);stroke-width:1.5}
.ll-asym{stroke:var(--ax-bad);stroke-width:1;stroke-dasharray:3 5}
.ll-guide{stroke:var(--ax-fg4);stroke-width:1;stroke-dasharray:3 4}
.ll-curve{fill:none;stroke:var(--ax-accent);stroke-width:2.5}
.ll-dot{fill:var(--ax-accent)}
`,
  variants: [
    {
      id: "little",
      label: "Little's Law",
      steps: [
        { caption: "100 requests/s × 0.2 s = 20 requests in the system. 10 pods × 2 workers = 20: at capacity.", tween: 1600, ms: 2600, loop: true },
        { caption: "Traffic rises to 150/s: L = 150 × 0.2 = 30 concurrent requests, but only 20 workers. Requests queue.", tween: 1800, ms: 2600, loop: true },
        { caption: "Workers finish 100/s, so the queue grows 50/s. Queueing adds to W, W raises L: a spiral into failure.", tween: 3000, ms: 2600, loop: true },
        { caption: "Plan with it: 500/s × 0.2 s = 100 workers, 25 pods of 4, about 36 pods with 30% headroom.", tween: 2200, ms: 3200 },
      ],
    },
    {
      id: "util",
      label: "Utilization",
      steps: [
        { caption: "In a single-server queue, wait ≈ service time × ρ/(1−ρ). At 50% utilization, wait is about 1× service time.", tween: 1800, ms: 2600 },
        { caption: "At 80% utilization, wait is about 4× service time: four times the 50% level.", tween: 1600, ms: 2600 },
        { caption: "At 90%, about 9×. Each step toward full costs far more latency than the last.", tween: 1400, ms: 2600 },
        { caption: "At 100% the queue grows without bound and the system fails. Stay under 70–80% on critical resources.", tween: 1400, ms: 3400 },
      ],
    },
  ],
  Scene,
});
