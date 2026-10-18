/**
 * Incident lifecycle and its clocks (week 10, day 5 · 1.2 key metrics, timeline from the 4.2
 * postmortem template): v2.3.1 deploys 14:30, errors from 14:35, detected 14:42 (TTD 7 min),
 * engaged 14:45 (TTE 3 min), rollback 14:55, mitigated 15:00 (TTM 18 min from detection),
 * resolved 15:15 (40 min in all). The error-rate curve's height is illustrative.
 */
import { defineExplainer, ease, lerp, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const T0 = 20; // 14:20
const T1 = 78; // 15:18
const CX0 = 40;
const CX1 = 370;
const CY0 = 182; // baseline error rate
const CYT = 82; // peak
const tx = (m: number) => lerp(CX0, CX1, (m - T0) / (T1 - T0));
const hhmm = (m: number) => `${m >= 60 ? 15 : 14}:${String(m % 60).padStart(2, "0")}`;

const EVENTS: { m: number; wide: string; short: string; tone?: Tone }[] = [
  { m: 30, wide: "deploy v2.3.1", short: "deploy" },
  { m: 35, wide: "errors rise", short: "errors ↑", tone: "bad" },
  { m: 42, wide: "DETECTED", short: "DETECTED", tone: "lit" },
  { m: 45, wide: "ENGAGED", short: "ENGAGED", tone: "lit" },
  { m: 50, wide: "deploy linked", short: "cause" },
  { m: 55, wide: "rollback", short: "rollback" },
  { m: 60, wide: "MITIGATED", short: "MITIGATED", tone: "ok" },
  { m: 75, wide: "RESOLVED", short: "RESOLVED", tone: "ok" },
];
// the cursor (minutes past 14:00) at the start and end of each step
const SPAN: [number, number][] = [
  [T0, 41],
  [41, 45],
  [45, 60],
  [60, 75],
];
const CLOCKS: { a: number; b: number; name: string; wide: string }[] = [
  { a: 35, b: 42, name: "TTD 7m", wide: "TTD 7 min" },
  { a: 42, b: 45, name: "TTE 3m", wide: "TTE 3 min" },
  { a: 42, b: 60, name: "TTM 18m", wide: "TTM 18 min" },
  { a: 35, b: 75, name: "total 40m", wide: "40 min total" },
];
const PHASES = ["DETECT", "RESPOND", "MITIGATE", "RESOLVE"];

/** error rate 0 → 1 (illustrative shape): normal, climbing from 14:35, high, falling 14:55 → 15:00 */
function err(m: number) {
  if (m < 35) return 0.06;
  if (m < 41) return lerp(0.06, 1, (m - 35) / 6);
  if (m < 55) return 1;
  if (m < 60) return lerp(1, 0.06, (m - 55) / 5);
  return 0.06;
}
const ey = (m: number) => lerp(CY0, CYT, err(m));

function Scene({ step, t, narrow }: SceneProps) {
  const [a, b] = SPAN[Math.min(step, SPAN.length - 1)];
  const now = lerp(a, b, ease(t));
  // the curve and the impact area up to the cursor
  let line = "";
  let area = `M${tx(35)} ${CY0}`;
  for (let m = T0; m <= now + 0.001; m += 0.5) {
    line += `${line ? "L" : "M"}${tx(m).toFixed(1)} ${ey(m).toFixed(1)}`;
    if (m >= 35 && m <= 60) area += `L${tx(m).toFixed(1)} ${ey(m).toFixed(1)}`;
  }
  line += `L${tx(now).toFixed(1)} ${ey(now).toFixed(1)}`;
  const areaEnd = Math.min(now, 60);
  if (now > 35) area += `L${tx(areaEnd).toFixed(1)} ${ey(areaEnd).toFixed(1)}L${tx(areaEnd).toFixed(1)} ${CY0}Z`;
  const phaseOn = (i: number) => (i === 0 ? now >= 42 : i === 1 ? now >= 45 : i === 2 ? now >= 60 : now >= 75);
  const current = step === 0 ? -1 : step === 1 ? (now >= 45 ? 1 : 0) : step;
  return (
    <g>
      {/* lifecycle */}
      {PHASES.map((p, i) => {
        const on = i === current;
        const done = phaseOn(i) && !on;
        const tone: Tone = on ? "lit" : done ? "ok" : undefined;
        return (
          <g key={p}>
            <rect x={20 + i * 140} y={12} width={130} height={32} className={`ax-box${tone ? ` ${tone}` : ""}`} opacity={on || done ? 1 : 0.5} />
            <Txt x={85 + i * 140} y={33} tone={tone || "mute"}>
              {p}
            </Txt>
          </g>
        );
      })}
      <Txt x={CX0} y={68} k="k" anchor="start" tone={step === 0 && now > 37 ? "bad" : "mute"}>
        {step === 0 && now > 37 ? (narrow ? "nobody knows yet" : "users hurt · nobody knows yet") : "error rate"}
      </Txt>
      {/* chart */}
      <line x1={CX0} x2={CX1} y1={CY0 + 1} y2={CY0 + 1} className="ir-axis" />
      {EVENTS.filter((e) => e.m <= now).map((e) => (
        <line key={e.m} x1={tx(e.m)} x2={tx(e.m)} y1={CYT - 6} y2={CY0} className={`ir-mark ${e.tone || ""}`} />
      ))}
      <path d={area} className="ir-impact" />
      <path d={line} className="ir-line" />
      <rect x={tx(now) - 1} y={CYT - 10} width={2} height={CY0 - CYT + 14} className="ir-now" />
      <Txt x={tx(now)} y={CY0 + 20} k="s" tone="lit">
        {hhmm(Math.floor(now))}
      </Txt>
      {/* the clocks */}
      {CLOCKS.map((c, i) => {
        if (now <= c.a) return null;
        const y = 216 + i * 24;
        const end = Math.min(now, c.b);
        const full = now >= c.b;
        const label = narrow ? c.name : c.wide;
        const lw = label.length * (narrow ? 10.4 : 7.8);
        const right = tx(c.b) + 8 + lw <= CX1 + 6;
        const tone: Tone = i === 3 ? "lit" : i === 2 ? "ok" : "sky";
        return (
          <g key={c.name}>
            <line x1={tx(c.a)} x2={tx(end)} y1={y} y2={y} className={`ir-clock ${tone}`} />
            <line x1={tx(c.a)} x2={tx(c.a)} y1={y - 6} y2={y + 6} className={`ir-clock ${tone}`} />
            {full && <line x1={tx(c.b)} x2={tx(c.b)} y1={y - 6} y2={y + 6} className={`ir-clock ${tone}`} />}
            {full && (
              <Txt x={right ? tx(c.b) + 8 : tx(c.a) - 8} y={y + 5} k="s" anchor={right ? "start" : "end"} tone={tone}>
                {label}
              </Txt>
            )}
          </g>
        );
      })}
      {/* the incident log */}
      <rect x={392} y={56} width={188} height={210} className="ax-box" />
      <Txt x={404} y={78} k="k" anchor="start">
        timeline (UTC)
      </Txt>
      {EVENTS.map((e, i) => {
        const shown = e.m <= now;
        return (
          <Txt key={e.m} x={404} y={104 + i * 21} k="s" anchor="start" tone={shown ? e.tone : "mute"} opacity={shown ? 1 : 0.3}>
            {`${hhmm(e.m)} ${shown ? (narrow ? e.short : e.wide) : ""}`}
          </Txt>
        );
      })}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `
.ir-axis{stroke:var(--ax-line);stroke-width:1.5}
.ir-line{fill:none;stroke:var(--ax-bad);stroke-width:2.5}
.ir-impact{fill:var(--ax-bad);opacity:.14}
.ir-now{fill:var(--ax-accent)}
.ir-mark{stroke:var(--ax-line);stroke-width:1;stroke-dasharray:3 4}
.ir-mark.lit{stroke:var(--ax-accent)}.ir-mark.ok{stroke:var(--ax-ok)}.ir-mark.bad{stroke:var(--ax-bad)}
.ir-clock{stroke-width:2.5;stroke:var(--ax-fg3)}
.ir-clock.sky{stroke:var(--ax-sky)}.ir-clock.ok{stroke:var(--ax-ok)}.ir-clock.lit{stroke:var(--ax-accent)}
`,
  variants: [
    {
      id: "timeline",
      label: "Incident timeline",
      steps: [
        { caption: "14:30 v2.3.1 deploys; from 14:35 errors climb. Users are already hurting, but nobody knows yet.", tween: 3000, ms: 2400 },
        { caption: "14:42 the alert fires: detected, TTD 7 minutes. 14:45 on-call acknowledges: engaged, TTE 3 minutes.", tween: 1800, ms: 2800 },
        { caption: "Linked to the deploy at 14:50, rollback at 14:55. 15:00 errors normal: mitigated, TTM 18 minutes from detection.", tween: 2600, ms: 3000 },
        { caption: "15:15 service confirmed fully restored: resolved, 40 minutes in all. Mitigate first; find the root cause after.", tween: 2000, ms: 3400 },
      ],
    },
  ],
  Scene,
});
