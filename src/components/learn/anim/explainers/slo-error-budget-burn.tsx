/**
 * Error budget and burn rate (week 10, day 1 · 4.1 / 4.2 / 4.3): the lesson's 30-day month on a
 * 99.9% SLO (43.2 min budget; day 5 −10, day 12 −15, day 20 −20 → −1.8, feature freeze), with the
 * policy bands (> 50% healthy, 20–50% warning, 0–20% critical), then Google's burn-rate ladder
 * (1x lasts the window, 6x: 5% in 6 h / empty in ~5 days, 14.4x: 2% in 1 h / empty in ~50 h).
 */
import { defineExplainer, ease, lerp, seg, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const X0 = 70;
const X1 = 560;
const DAYS = 30;
const dx = (d: number) => X0 + ((X1 - X0) * d) / DAYS;

/* ---------------------------------------------------------------- variant 1: the month */

const BUDGET = 43.2;
const YT = 96; // 43.2 min
const YZ = 246; // 0 min
const my = (m: number) => YZ - ((YZ - YT) * m) / BUDGET;
const EVENTS = [
  { day: 5, cost: 10, label: "outage", short: "outage" },
  { day: 12, cost: 15, label: "slow deploy", short: "deploy" },
  { day: 20, cost: 20, label: "3rd-party outage", short: "3rd party" },
];
const remainingAt = (n: number) => BUDGET - EVENTS.slice(0, n).reduce((a, e) => a + e.cost, 0);
const fmtMin = (m: number) => `${m < 0 ? "−" : ""}${Math.abs(m).toFixed(1)} min`;

function status(m: number): { label: string; tone: Tone } {
  const p = m / BUDGET;
  if (p <= 0) return { label: "EXHAUSTED", tone: "bad" };
  if (p <= 0.2) return { label: "CRITICAL", tone: "bad" };
  if (p <= 0.5) return { label: "WARNING", tone: "warn" };
  return { label: "HEALTHY", tone: "ok" };
}

function Month({ step, t, narrow }: SceneProps) {
  // cursor travels to the step's event (first 60% of the tween), then the budget drops
  const done = step; // events already applied after this step's drop
  const prevDay = step <= 1 ? 0 : EVENTS[step - 2].day;
  const day = step === 0 ? 0 : lerp(prevDay, EVENTS[step - 1].day, ease(seg(t, 0, 0.6)));
  const drop = step === 0 ? 0 : ease(seg(t, 0.6, 1));
  const before = remainingAt(Math.max(0, done - 1));
  const now = step === 0 ? BUDGET * ease(t) : lerp(before, remainingAt(done), drop);
  const st = step === 0 ? status(BUDGET) : status(now);
  // the burn-down line: flat runs and drops up to the cursor
  let d = `M${dx(0)} ${my(BUDGET)}`;
  for (let i = 0; i < done; i++) {
    const e = EVENTS[i];
    const isCur = i === done - 1;
    const endRem = remainingAt(i + 1);
    const startRem = remainingAt(i);
    d += `H${dx(isCur ? day : e.day)}`;
    if (!isCur || drop > 0) d += `V${my(isCur ? lerp(startRem, endRem, drop) : endRem)}`;
  }
  const freeze = step === 3 && drop >= 1;
  return (
    <g>
      <Txt x={X0} y={30} k="k" anchor="start">
        {narrow ? "SLO 99.9% · 30 days" : "error budget · SLO 99.9% over 30 days"}
      </Txt>
      <Txt x={X0} y={62} k="t" anchor="start" tone={st.tone}>
        {st.label}
      </Txt>
      {!narrow && (
        <Txt x={X0 + 112} y={62} k="s" anchor="start">
          {st.label === "HEALTHY" ? "> 50% left · ship freely" : st.label === "WARNING" ? "20–50% left · more caution" : st.label === "CRITICAL" ? "< 20% left" : "feature freeze"}
        </Txt>
      )}
      <Txt x={X1} y={narrow ? 56 : 64} k="d" anchor="end" tone={now < 0 ? "bad" : undefined}>
        {fmtMin(now)}
      </Txt>
      <Txt x={X1} y={narrow ? 86 : 84} k="s" anchor="end">
        {step === 0 ? "0.1% × 30 days" : "budget left"}
      </Txt>
      {/* bands: 50% and 20% of the budget, and zero */}
      {[
        { m: BUDGET * 0.5, l: "50%" },
        { m: BUDGET * 0.2, l: "20%" },
      ].map((b) => (
        <g key={b.l}>
          <line x1={X0} x2={X1} y1={my(b.m)} y2={my(b.m)} className="eb-band" />
          <Txt x={X0 - 8} y={my(b.m) + 4} k="s" anchor="end">
            {b.l}
          </Txt>
        </g>
      ))}
      <line x1={X0} x2={X1} y1={YZ} y2={YZ} className="eb-axis" />
      <Txt x={X0 - 8} y={YZ + 4} k="s" anchor="end">
        0
      </Txt>
      <Txt x={X0 - 8} y={YT + 4} k="s" anchor="end">
        {narrow ? "43" : "43.2"}
      </Txt>
      {freeze && <rect x={dx(20)} y={YZ + 1} width={dx(30) - dx(20)} height={my(-1.8) - YZ + 10} className="eb-freeze" />}
      <path d={d} className="eb-line" />
      {step > 0 && !freeze && <rect x={dx(day) - 1} y={YT - 8} width={2} height={YZ - YT + 16} className="eb-cursor" />}
      {/* event labels */}
      {EVENTS.slice(0, done).map((e, i) => {
        const shown = i < done - 1 || drop > 0.5;
        if (!shown) return null;
        const y = my(remainingAt(i + 1)) + (i === 2 ? 26 : 20);
        return (
          <Txt key={e.day} x={dx(e.day) + 6} y={y} k="s" anchor="start" tone={i === done - 1 ? "lit" : undefined}>
            {`${narrow ? e.short : e.label} −${e.cost}`}
          </Txt>
        );
      })}
      {freeze && (
        <Txt x={dx(30)} y={YT + 40} k="t" anchor="end" tone="bad">
          {narrow ? "FEATURE FREEZE" : "BUDGET EXCEEDED · FEATURE FREEZE"}
        </Txt>
      )}
      {/* x axis */}
      {[0, 5, 12, 20, 30].map((v) => (
        <Txt key={v} x={dx(v)} y={300} k="s" tone={EVENTS.some((e, i) => e.day === v && i < done) ? "lit" : undefined}>
          {v === 0 ? "day 0" : v === 30 ? "30" : String(v)}
        </Txt>
      ))}
    </g>
  );
}

/* ---------------------------------------------------------------- variant 2: burn rate */

const BY0 = 96; // 100%
const BY1 = 246; // 0%
const RATES: { r: number; name: string; spent: string; spentN: string; empty: string; hit: string; action: string; actionN: string; tone: Tone }[] = [
  { r: 1, name: "1x", spent: "10% in 3 days", spentN: "10% in 3 d", empty: "30 days", hit: "30 d", action: "REVIEW WEEKLY", actionN: "REVIEW WEEKLY", tone: "mute" },
  { r: 6, name: "6x", spent: "5% in 6 hours", spentN: "5% in 6 h", empty: "~5 days", hit: "5 d", action: "PAGE · BIZ HOURS", actionN: "PAGE (BIZ HRS)", tone: "warn" },
  { r: 14.4, name: "14.4x", spent: "2% in 1 hour", spentN: "2% in 1 h", empty: "~50 hours", hit: "50 h", action: "PAGE NOW", actionN: "PAGE NOW", tone: "bad" },
];
const BOX = { x: 340, y: 40, w: X1 - 340, h: 116 };

function Burn({ step, t, narrow }: SceneProps) {
  const p = ease(t);
  const by = (pct: number) => lerp(BY1, BY0, pct);
  const cur = RATES[Math.min(step, RATES.length - 1)];
  return (
    <g>
      <Txt x={X0} y={30} k="k" anchor="start">
        {narrow ? "budget left" : "budget remaining · 30-day window"}
      </Txt>
      <line x1={X0} x2={X0} y1={BY0} y2={BY1} className="eb-axis" />
      <line x1={X0} x2={X1} y1={BY1} y2={BY1} className="eb-axis" />
      <Txt x={X0 - 8} y={BY0 + 4} k="s" anchor="end">
        100%
      </Txt>
      <Txt x={X0 - 8} y={BY1 + 4} k="s" anchor="end">
        0
      </Txt>
      <Txt x={X0} y={300} k="s" anchor="start">
        day 0
      </Txt>
      <Txt x={X1} y={300} k="s" anchor="end">
        day 30
      </Txt>
      {RATES.slice(0, step + 1).map((r, i) => {
        const endDay = DAYS / r.r;
        const isCur = i === step;
        const f = isCur ? p : 1;
        const xEnd = lerp(dx(0), dx(endDay), f);
        const yEnd = by(1 - f);
        const far = xEnd > 450;
        return (
          <g key={r.name} opacity={isCur ? 1 : 0.45}>
            <line x1={dx(0)} y1={by(1)} x2={xEnd} y2={yEnd} className={`eb-rate${isCur ? " on" : ""}`} />
            {isCur && <rect x={xEnd - 5} y={yEnd - 5} width={10} height={10} className="eb-dot" />}
            {isCur && (
              <Txt x={far ? xEnd - 12 : xEnd + 12} y={far ? yEnd - 14 : yEnd - 8} k="t" anchor={far ? "end" : "start"} tone="lit">
                {r.name}
              </Txt>
            )}
            {f >= 1 && (
              <Txt x={dx(endDay)} y={BY1 + 20} k="s" tone={isCur ? r.tone : undefined}>
                {r.hit}
              </Txt>
            )}
          </g>
        );
      })}
      {/* readout */}
      <rect x={BOX.x} y={BOX.y} width={BOX.w} height={BOX.h} className="ax-box" />
      <Txt x={BOX.x + 14} y={BOX.y + 38} k="d" anchor="start" tone={cur.tone === "mute" ? undefined : cur.tone}>
        {cur.name}
      </Txt>
      <Txt x={BOX.x + BOX.w - 12} y={BOX.y + 34} k="s" anchor="end">
        burn
      </Txt>
      <Txt x={BOX.x + 14} y={BOX.y + 62} k="s" anchor="start">
        {narrow ? cur.spentN : cur.spent}
      </Txt>
      <Txt x={BOX.x + 14} y={BOX.y + 82} k="s" anchor="start">
        {`empty in ${cur.empty}`}
      </Txt>
      <Txt x={BOX.x + 14} y={BOX.y + 106} k="t" anchor="start" tone={p > 0.5 ? cur.tone : "mute"}>
        {narrow ? cur.actionN : cur.action}
      </Txt>
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "burn" ? <Burn {...p} /> : <Month {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  css: `
.eb-line{fill:none;stroke:var(--ax-accent);stroke-width:2.5;stroke-linejoin:miter}
.eb-axis{stroke:var(--ax-line);stroke-width:1.5}
.eb-band{stroke:var(--ax-line);stroke-width:1;stroke-dasharray:4 6}
.eb-cursor{fill:var(--ax-fg4)}
.eb-freeze{fill:var(--ax-bad);opacity:.16}
.eb-rate{stroke:var(--ax-fg3);stroke-width:2}
.eb-rate.on{stroke:var(--ax-accent);stroke-width:2.5}
.eb-dot{fill:var(--ax-accent)}
`,
  variants: [
    {
      id: "month",
      label: "30-day budget",
      steps: [
        { caption: "SLO 99.9% over 30 days allows 0.1% bad time: 43.2 minutes. That is the error budget.", tween: 1400, ms: 2600 },
        { caption: "Day 5: a 10-minute outage. 33.2 minutes remain, still above 50%: healthy, ship freely.", tween: 2200, ms: 2600 },
        { caption: "Day 12: a slow deployment, 15 minutes degraded. 18.2 minutes remain: under 50%, warning.", tween: 2200, ms: 2600 },
        { caption: "Day 20: a 20-minute third-party outage. −1.8 minutes: budget exceeded. Feature freeze until it recovers.", tween: 2200, ms: 3400 },
      ],
    },
    {
      id: "burn",
      label: "Burn rate",
      steps: [
        { caption: "Burn rate 1x spends the budget exactly over the 30-day window. 10% in 3 days: review weekly.", tween: 1800, ms: 2600 },
        { caption: "6x: 5% gone in 6 hours, the whole budget in about 5 days. Page during business hours.", tween: 1600, ms: 2800 },
        { caption: "14.4x: 2% gone in one hour, the whole budget in about 50 hours. Page immediately.", tween: 1400, ms: 3200 },
      ],
    },
  ],
  Scene,
});
