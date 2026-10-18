/**
 * Timeout budget (week 2, day 1 · 3.2 / 6.5 / 6.6 / 6.7): the payment service's three sequential
 * calls under a 5 s user SLA. Version 2's 5 s per call stacks to 15 s; the budget (4,500 ms total,
 * fraud 600 / bank 3,500 / notification 300 ms, each capped by what is left) ends by 4,400 ms.
 */
import { clamp, defineExplainer, ease, seg, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 300;
const X0 = 130;
const X1 = 576;
const BH = 28;
const AXIS = 238;
const ROWS = [
  { label: "Fraud check", short: "Fraud", y: 100 },
  { label: "Bank API", short: "Bank", y: 150 },
  { label: "Notification", short: "Notify", y: 200 },
];

type Bar = { start: number; win: number; used: number; show: number; tone: Tone; label: string; lit?: boolean };

const fmtMs = (ms: number) => `${Math.round(ms).toLocaleString("en-US")} ms`;

function Scene({ variant, step, t, narrow }: SceneProps) {
  const fixed = variant === "fixed";
  const span = fixed ? 15 : 5;
  const sx = (s: number) => X0 + ((X1 - X0) * s) / span;
  const appear = (i: number) => (step === 0 && fixed) || (step === 1 && !fixed) ? seg(t, i * 0.28, i * 0.28 + 0.3) : (fixed ? step > 0 : step > 1) ? 1 : 0;
  let bars: Bar[];
  let elapsed = 0; // seconds
  let remaining = 4500; // ms, budget variant
  let cursor = -1;
  if (fixed) {
    const e = ease(t);
    const f = step === 1 ? 5 * e : step >= 2 ? 5 : 0;
    const b = step >= 2 ? 5 * seg(t, 0, 0.5) : 0;
    const n = step >= 2 ? 5 * seg(t, 0.5, 1) : 0;
    elapsed = f + b + n;
    if (step >= 1 && elapsed < 15) cursor = elapsed;
    bars = [
      { start: 0, win: 5, used: f, show: appear(0), tone: "warn", label: narrow ? "5 s" : "timeout 5 s" },
      { start: 5, win: 5, used: b, show: appear(1), tone: "bad", label: narrow ? "5 s" : "timeout 5 s" },
      { start: 10, win: 5, used: n, show: appear(2), tone: "bad", label: narrow ? "5 s" : "timeout 5 s" },
    ];
  } else {
    const cur = step === 2 ? 4400 * t : step >= 3 ? 4400 : 0; // ms into the worst case
    remaining = 4500 - cur;
    elapsed = cur / 1000;
    if (step === 2 && t < 1) cursor = elapsed;
    const tone: Tone = step >= 3 ? "ok" : "sky";
    bars = [
      { start: 0, win: 0.6, used: clamp(cur, 0, 600) / 1000, show: appear(0), tone, label: "600 ms", lit: step === 2 && cur < 600 },
      { start: 0.6, win: 3.5, used: clamp(cur - 600, 0, 3500) / 1000, show: appear(1), tone, label: "3,500 ms", lit: step === 2 && cur >= 600 && cur < 4100 },
      { start: 4.1, win: 0.3, used: clamp(cur - 4100, 0, 300) / 1000, show: appear(2), tone, label: "300 ms", lit: step === 2 && cur >= 4100 && t < 1 },
    ];
  }
  const over = fixed && elapsed > 5;
  const slaX = sx(5);
  const ticks = fixed ? [0, 5, 10, 15] : [0, 1, 2, 3, 4, 5];
  const budgetIn = fixed ? 0 : step === 0 ? ease(t) : 1;
  return (
    <g>
      <Txt x={24} y={30} k="k" anchor="start" tone={fixed ? "bad" : "ok"}>
        {fixed ? (narrow ? "5 s per call" : "version 2 · 5 s per call") : narrow ? "budget 4,500 ms" : "timeout budget · 4,500 ms"}
      </Txt>
      <Txt x={X1} y={26} k="k" anchor="end" tone="mute">
        elapsed
      </Txt>
      <Txt x={X1} y={60} k="d" anchor="end" tone={over ? "bad" : !fixed && step >= 3 ? "ok" : undefined}>
        {fixed ? `${elapsed.toFixed(1)} s` : fmtMs(elapsed * 1000)}
      </Txt>
      {!fixed && (
        <Txt x={24} y={54} k="s" anchor="start" tone={remaining <= 100 ? "warn" : undefined}>
          {`${narrow ? "left" : "budget left"} ${fmtMs(remaining)}`}
        </Txt>
      )}

      {/* the budget bracket and the 500 ms buffer */}
      {!fixed && (
        <g opacity={budgetIn}>
          <rect className="tmb-band" x={sx(4.5)} y={84} width={X1 - sx(4.5)} height={AXIS - 84} />
          <path className="tmb-bracket" d={`M${X0} 86V77H${X0 + (sx(4.5) - X0) * budgetIn}V86`} />
          <Txt x={X1} y={286} k="s" anchor="end">
            {narrow ? "500 ms buffer" : "500 ms buffer for our own work"}
          </Txt>
        </g>
      )}

      {/* past the SLA (version 2) */}
      {fixed && <rect className="tmb-over" x={slaX} y={84} width={X1 - slaX} height={AXIS - 84} opacity={step === 0 ? 0 : step === 1 ? seg(t, 0.8, 1) : 1} />}

      {ROWS.map((r, i) => {
        const b = bars[i];
        const x = sx(b.start);
        const w = sx(b.start + b.win) - x;
        return (
          <g key={r.label}>
            <Txt x={24} y={r.y + 19} anchor="start" tone={b.lit ? "lit" : undefined}>
              {narrow ? r.short : r.label}
            </Txt>
            <line className="tmb-lane" x1={X0} x2={X1} y1={r.y + BH / 2} y2={r.y + BH / 2} />
            {b.show > 0 && (
              <g opacity={b.show}>
                <rect className={`tmb-win${b.lit ? " lit" : ""}`} x={x} y={r.y} width={w * b.show} height={BH} />
                <Txt x={x + 3} y={r.y - 6} k="s" anchor="start" tone={b.lit ? "lit" : undefined}>
                  {b.label}
                </Txt>
              </g>
            )}
            {b.used > 0 && <rect className={`ax-fill ${b.tone}`} x={x} y={r.y + 4} width={sx(b.start + b.used) - x} height={BH - 8} />}
          </g>
        );
      })}

      {/* now */}
      {cursor >= 0 && <line className="tmb-now" x1={sx(cursor)} x2={sx(cursor)} y1={86} y2={AXIS} />}

      {/* SLA line */}
      <line className={`tmb-sla${over ? " bad" : ""}`} x1={slaX} x2={slaX} y1={84} y2={AXIS + 6} />

      {/* axis */}
      <line className="tmb-axis" x1={X0} x2={X1} y1={AXIS} y2={AXIS} />
      {ticks.map((s) => {
        const sla = s === 5;
        const label = sla ? "SLA 5 s" : s === 0 ? "0" : `${s} s`;
        return (
          <g key={s}>
            <line className="tmb-axis" x1={sx(s)} x2={sx(s)} y1={AXIS} y2={AXIS + 5} />
            <Txt x={sx(s)} y={AXIS + 20} k="s" anchor={(sla && !fixed) || s === 15 ? "end" : s === 0 ? "start" : "middle"} tone={sla ? (over ? "bad" : "lit") : undefined}>
              {label}
            </Txt>
          </g>
        );
      })}
      {fixed && step >= 2 && (
        <Txt x={X1} y={286} k="s" anchor="end" tone="bad" opacity={seg(t, 0.6, 1)}>
          {narrow ? "3× the SLA" : "worst case 15 s: three times the SLA"}
        </Txt>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `
.tmb-lane{stroke:var(--ax-line-soft);stroke-width:1.5}
.tmb-win{fill:none;stroke:var(--ax-fg4);stroke-width:1.5;stroke-dasharray:5 4}
.tmb-win.lit{stroke:var(--ax-accent);stroke-width:2.5;stroke-dasharray:none}
.tmb-axis{stroke:var(--ax-line);stroke-width:1.5}
.tmb-sla{stroke:var(--ax-accent);stroke-width:2;stroke-dasharray:6 4}.tmb-sla.bad{stroke:var(--ax-bad)}
.tmb-over{fill:var(--ax-bad);opacity:.08}
.tmb-band{fill:var(--ax-fg4);opacity:.12}
.tmb-bracket{fill:none;stroke:var(--ax-accent);stroke-width:1.5}
.tmb-now{stroke:var(--ax-fg);stroke-width:1.5}
`,
  variants: [
    {
      id: "fixed",
      label: "5 s per call",
      steps: [
        { caption: "Version 2 gives each call a 5 s timeout. The user SLA is 5 s for the whole payment.", tween: 1800 },
        { caption: "Slow day: the fraud check takes the full 5 s. The bank call hasn't started and the SLA is gone.", tween: 2200 },
        { caption: "Timeouts add up along the chain: worst case 5+5+5 = 15 s, three times the SLA.", tween: 2600, ms: 3400 },
      ],
    },
    {
      id: "budget",
      label: "Timeout budget",
      steps: [
        { caption: "Timeout budget: 4,500 ms in total, leaving 500 ms of the 5 s SLA for our own processing.", tween: 1400 },
        { caption: "Each call gets a share sized to its P99: fraud 600 ms, bank 3,500 ms, notification 300 ms.", tween: 1800 },
        { caption: "Worst case: each call answers just inside its timeout. Budget left: 4,500 → 3,900 → 400 → 100 ms.", tween: 3600, ms: 2400 },
        { caption: "Done by about 4,400 ms, inside the 5 s SLA. Timeouts are capped by what's left of the budget.", ms: 3600 },
      ],
    },
  ],
  Scene,
});
