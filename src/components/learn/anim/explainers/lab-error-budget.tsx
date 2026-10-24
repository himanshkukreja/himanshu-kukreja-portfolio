/**
 * Break it: error budget and burn rate (week 10, day 1 · 4.1 / 4.2 / 4.3). The lesson's numbers:
 * 99.9% over 30 days = 43.2 minutes; a 10-minute outage, 15 degraded minutes, a 20-minute outage;
 * statuses healthy > 50%, warning 20–50%, critical 0–20%, exhausted; burn-rate thresholds 14.4×,
 * 6×, 3×, 1×. Model: budget = (1 − SLO) × 43,200 min; incident minutes count in full (as in the
 * lesson's timeline); burn rate = current error rate ÷ (1 − SLO); at that rate the remaining
 * budget lasts remaining ÷ error rate minutes.
 */
import { defineExplainer, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const SLOS = [99, 99.5, 99.9, 99.95, 99.99, 99.999];
const WINDOW = 30 * 24 * 60;
const BAR = { x: 24, y: 64, w: 552, h: 26 };
const RULES: [number, string, string, string][] = [
  [14.4, "14.4×", "page now", "page now"],
  [6, "6×", "page, work hours", "work hrs"],
  [3, "3×", "ticket", "ticket"],
  [1, "1×", "weekly review", "review"],
];

const mins = (m: number) => {
  const a = Math.abs(m);
  const s = a >= 2880 ? `${+(a / 1440).toFixed(1)} days` : a >= 120 ? `${+(a / 60).toFixed(1)} h` : a >= 10 ? `${+a.toFixed(1)} min` : `${+a.toFixed(2)} min`;
  return m < 0 ? `−${s}` : s;
};

function Scene({ step, clock, narrow, values }: SceneProps) {
  const slo = SLOS[values.slo ?? 2] ?? 99.9;
  const used = values.inc ?? 25;
  const err = (values.err ?? 0.1) / 100;
  const allowed = 1 - slo / 100;
  const budget = allowed * WINDOW;
  const left = budget - used;
  const pct = (left / budget) * 100;
  const status: [string, Tone] = pct <= 0 ? ["exhausted · freeze", "bad"] : pct <= 20 ? ["critical", "bad"] : pct <= 50 ? ["warning", "warn"] : ["healthy", "ok"];
  const burn = err / allowed;
  const rule = RULES.find((r) => burn >= r[0]);
  const bTone: Tone = burn >= 6 ? "bad" : burn >= 1 ? "warn" : "ok";
  const lasts = left <= 0 ? 0 : err > 0 ? left / err : Infinity;
  const usedW = Math.min(1, used / budget) * BAR.w;
  // a marker sweeps the remaining budget; the faster the burn, the faster it moves
  const sweep = clock > 0 && left > 0 && burn > 0 ? (clock * Math.min(1.2, 0.08 * Math.sqrt(burn))) % 1 : -1;
  return (
    <g>
      <Txt x={BAR.x} y={30} k="k" anchor="start">
        {narrow ? `slo ${slo}% · 30 days` : `slo ${slo}% availability · 30-day window`}
      </Txt>
      <Txt x={BAR.x + BAR.w} y={30} k="k" anchor="end" tone="mute">
        {`budget ${mins(budget)}`}
      </Txt>
      <rect className="ax-meter" x={BAR.x} y={BAR.y} width={BAR.w} height={BAR.h} />
      <rect className="ax-fill bad" x={BAR.x} y={BAR.y} width={usedW} height={BAR.h} />
      {left > 0 && <rect className="ax-fill ok" x={BAR.x + usedW} y={BAR.y} width={BAR.w - usedW} height={BAR.h} opacity={0.55} />}
      {sweep >= 0 && <rect className="ax-fill warn" x={BAR.x + BAR.w - 4 - sweep * (BAR.w - usedW - 4)} y={BAR.y - 4} width={4} height={BAR.h + 8} />}
      <Txt x={BAR.x} y={BAR.y + BAR.h + 20} k="s" anchor="start" tone="bad">
        {narrow ? `${mins(used)} used` : `incidents: ${mins(used)} used`}
      </Txt>
      <Txt x={BAR.x + BAR.w} y={BAR.y + BAR.h + 20} k="s" anchor="end" tone={status[1]}>
        {left > 0 ? `${narrow ? "" : "left: "}${mins(left)} (${Math.round(pct)}%)` : `over by ${mins(-left)}`}
      </Txt>
      {/* status and burn */}
      <Txt x={24} y={150} k="k" anchor="start" tone={status[1]}>
        {narrow ? "budget left" : "budget remaining"}
      </Txt>
      <Txt x={24} y={186} k="d" anchor="start" tone={status[1]}>
        {mins(left)}
      </Txt>
      <Txt x={24} y={208} k="s" anchor="start" tone={status[1]}>
        {narrow && pct <= 0 ? "exhausted" : status[0]}
      </Txt>
      <Txt x={220} y={150} k="k" anchor="start" tone={bTone}>
        burn rate
      </Txt>
      <Txt x={220} y={186} k="d" anchor="start" tone={bTone}>
        {`${burn >= 10 ? Math.round(burn) : burn.toFixed(1)}×`}
      </Txt>
      <Txt x={220} y={208} k="s" anchor="start" tone={bTone}>
        {narrow ? `${(err * 100).toFixed(2)}% err` : `${(err * 100).toFixed(2)}% errors now`}
      </Txt>
      <Txt x={24} y={252} k="k" anchor="start" tone="mute">
        {narrow ? "gone in" : "at this rate, gone in"}
      </Txt>
      <Txt x={24} y={288} k="d" anchor="start" tone={lasts < 24 * 60 ? "bad" : lasts < 7 * 1440 ? "warn" : undefined}>
        {lasts === Infinity ? "never" : left <= 0 ? "already" : mins(lasts)}
      </Txt>
      {/* the lesson's burn-rate alert table */}
      {RULES.map(([th, label, action, short], i) => {
        const on = rule?.[0] === th;
        const y = 138 + i * 40;
        return (
          <g key={th} opacity={on ? 1 : 0.55}>
            <rect className={`ax-box${on ? (th >= 6 ? " bad" : " warn") : ""}`} x={392} y={y} width={184} height={32} />
            <Txt x={404} y={y + 21} k="t" anchor="start" tone={on ? (th >= 6 ? "bad" : "warn") : undefined}>
              {label}
            </Txt>
            <Txt x={566} y={y + 21} k="s" anchor="end" tone={on ? (th >= 6 ? "bad" : "warn") : undefined}>
              {narrow ? short : action}
            </Txt>
          </g>
        );
      })}
      <Txt x={392} y={129} k="k" anchor="start" tone={step === 2 ? "lit" : "mute"}>
        {narrow ? "alerts" : "burn-rate alerts"}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  controls: [
    { id: "slo", label: "SLO target", min: 0, max: SLOS.length - 1, step: 1, value: 2, format: (v) => `${SLOS[v] ?? 99.9}%` },
    { id: "inc", label: "Incident minutes so far", min: 0, max: 120, step: 1, value: 25, unit: "min" },
    { id: "err", label: "Error rate right now", min: 0, max: 3, step: 0.02, value: 0.1, format: (v) => `${v.toFixed(2)}%` },
  ],
  variants: [
    {
      id: "lab",
      label: "Lab",
      steps: [
        { caption: "99.9% over 30 days allows 43.2 minutes. The day-5 outage (10 min) and the slow deploy (15 min) leave 18.2. Drag incidents to 45 for the day-20 outage: −1.8 minutes, feature freeze.", loop: true, ms: 7500 },
        { caption: "Tighten the SLO to 99.99%: the budget shrinks to about 4.3 minutes and the same incidents blow straight through it. Each extra nine leaves ten times less room.", loop: true, ms: 7000 },
        { caption: "Now raise the error rate. At 1.44% on a 99.9% SLO you burn 14.4× normal, 2% of the budget an hour: page now. Around 0.6% it is 6×: page in business hours.", loop: true, ms: 7500 },
      ],
    },
  ],
  Scene,
});
