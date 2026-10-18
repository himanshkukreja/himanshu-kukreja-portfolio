/**
 * Week 8 capstone (streaming analytics · Deep Dives 3 and 4): trending uses a 1-hour window that
 * slides every minute (HOP); the watermark trails the newest event time by 5 minutes, so window
 * 10:00–11:00 closes once an 11:05 event is seen, a 3-minute-late event still counts, and an event
 * over 5 minutes late goes to late_events. Late events are then versioned: real-time (provisional),
 * preliminary (T+1, 6 AM job, under 24 hours late) and final (T+7).
 */
import { Box, defineExplainer, ease, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 300;

/* ---------------------------------------------------------------- window + watermark */
const T0 = 40;
const T1 = 560;
const AY = 234;
const tx = (min: number) => T0 + (min / 70) * (T1 - T0); // minutes after 10:00
const hm = (min: number) => `${10 + Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
const SEEN = [12, 30, 47, 58];

function Windows({ step, t, narrow }: { step: number; t: number; narrow: boolean }) {
  const d = (x: number) => t >= x;
  const newest = step === 0 ? 58 : 65;
  const wm = newest - 5;
  const closed = step >= 1 && (step > 1 || d(0.6));
  const arrive = (min: number, from: number) => ({ x: tx(min), y: lerp(40, AY - 16, ease(seg(t, from, from + 0.4))) });
  const toks: { x: number; y: number; tone: Tone }[] = SEEN.map((m) => ({ x: tx(m), y: AY - 16, tone: "sky" as Tone }));
  if (step >= 1) toks.push(step === 1 ? { ...arrive(65, 0), tone: "sky" } : { x: tx(65), y: AY - 16, tone: "sky" });
  if (step >= 2) toks.push(step === 2 ? { ...arrive(62, 0.1), tone: "ok" } : { x: tx(62), y: AY - 16, tone: "ok" });
  let late: { x: number; y: number } | null = null;
  if (step === 3) {
    const a = ease(seg(t, 0, 0.45));
    const b = ease(seg(t, 0.5, 0.95));
    late = b > 0 ? { x: lerp(tx(52), 85, b), y: lerp(AY - 60, 61, b) } : { x: tx(52), y: lerp(40, AY - 60, a) };
  }
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        {narrow ? "HOP 1 h / 1 min" : "trending: HOP window, 1 hour, slides every minute"}
      </Txt>
      <rect className={`ax-box ${closed ? "ok" : "lit"}`} x={tx(0)} y={94} width={tx(60) - tx(0)} height={26} />
      <Txt x={tx(0) + 10} y={112} k="s" anchor="start" tone={closed ? "ok" : undefined}>
        {closed ? (narrow ? "10:00–11:00 closed" : "10:00–11:00 · closed, emitted") : narrow ? "10:00–11:00 open" : "10:00–11:00 · open"}
      </Txt>
      <rect className="ax-box cw-dash" x={tx(4)} y={130} width={tx(64) - tx(4)} height={26} />
      <Txt x={tx(4) + 10} y={148} k="s" anchor="start">
        {narrow ? "10:04–11:04 open" : "10:04–11:04 · open (one more each minute)"}
      </Txt>
      <line className="cw-axis" x1={T0} x2={T1} y1={AY} y2={AY} />
      {[0, 30, 60].map((m) => (
        <g key={m}>
          <line className="cw-axis" x1={tx(m)} x2={tx(m)} y1={AY} y2={AY + 6} />
          <Txt x={tx(m)} y={AY + 24} k="s">
            {hm(m)}
          </Txt>
        </g>
      ))}
      <line className="cw-wm" x1={tx(wm)} x2={tx(wm)} y1={84} y2={AY} />
      <Txt x={tx(wm) - 6} y={AY + 50} k="s" anchor="end" tone="lit">
        {narrow ? `wm ${hm(wm)}` : `watermark ${hm(wm)}`}
      </Txt>
      <line className="cw-new" x1={tx(newest)} x2={tx(newest)} y1={84} y2={AY} />
      <Txt x={tx(newest) - 4} y={78} k="s" anchor="end" tone="sky">
        {narrow ? hm(newest) : `newest ${hm(newest)}`}
      </Txt>
      {toks.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={10} tone={k.tone} />
      ))}
      {step === 2 && d(0.55) && (
        <Txt x={tx(62)} y={AY - 30} k="s" anchor="middle" tone="ok">
          11:02 ✓
        </Txt>
      )}
      {step === 3 && (
        <g>
          <Box x={20} y={40} w={130} h={42} label={narrow ? "late" : "late_events"} tone={t >= 0.95 ? "warn" : undefined} />
          {late && t < 0.97 && <Token x={late.x} y={late.y} s={11} tone="warn" />}
          {late && t < 0.5 && (
            <Txt x={late.x + 12} y={late.y + 5} k="s" anchor="start" tone="warn">
              10:52
            </Txt>
          )}
        </g>
      )}
    </g>
  );
}

/* ---------------------------------------------------------------- late-data tiers */
const EX = 20;
const EW = 230;
const EH = 44;
const EY = [44, 100, 156, 212];
const TX = 360;
const TW = 220;
const TH = 56;
const TY = [44, 122, 200];
const EVENTS = [
  { wide: "on time · 30 s", short: "on time", tier: 0 },
  { wide: "subway · 45 min", short: "45 min", tier: 1 },
  { wide: "airplane · 3 h", short: "3 h late", tier: 1 },
  { wide: "offline · 2 days", short: "2 days", tier: 2 },
];

function Tiers({ step, t, narrow }: { step: number; t: number; narrow: boolean }) {
  const active = [[0], [1, 2], [3], []][step];
  const before = [[], [0], [0, 1, 2], [0, 1, 2, 3]][step];
  const delivered = (i: number) => before.includes(i) || (active.includes(i) && t >= 0.8);
  const tierOn = (k: number) => k < step || (k === step && t >= 0.8) || step === 3;
  const tiers = [
    { label: "Real-time", sub: narrow ? "provisional" : "ClickHouse · provisional" },
    { label: "Preliminary", sub: narrow ? "T+1, 6 AM" : "T+1 job at 6 AM" },
    { label: "Final", sub: narrow ? "T+7" : "T+7 · official, immutable" },
  ];
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        {narrow ? "lateness = received − event" : "lateness = received_time − event_time"}
      </Txt>
      {EVENTS.map((e, i) => {
        const on = delivered(i);
        const live = active.includes(i);
        return (
          <g key={i}>
            <Wire d={`M${EX + EW} ${EY[i] + EH / 2}L${TX} ${TY[e.tier] + TH / 2}`} tone={on ? "ok" : undefined} opacity={on || live ? 1 : 0.25} />
            <Box x={EX} y={EY[i]} w={EW} h={EH} label={narrow ? e.short : e.wide} tone={live ? "lit" : on ? "ok" : undefined} dim={!on && !live} />
          </g>
        );
      })}
      {tiers.map((tr, k) => (
        <Box key={k} x={TX} y={TY[k]} w={TW} h={TH} label={tr.label} sub={tr.sub} tone={step === 3 ? (k === 2 ? "ok" : "lit") : tierOn(k) ? "ok" : undefined} dim={!tierOn(k)} />
      ))}
      {active.map((i) => {
        const p = seg(t, 0.1, 0.8);
        if (p <= 0 || p >= 1) return null;
        const a = { x: EX + EW, y: EY[i] + EH / 2 };
        const b = { x: TX, y: TY[EVENTS[i].tier] + TH / 2 };
        return <Token key={i} x={lerp(a.x, b.x, p)} y={lerp(a.y, b.y, p)} s={11} tone="lit" />;
      })}
      <Txt x={20} y={H - 16} anchor="start" tone={step === 3 ? "ok" : "lit"}>
        {
          [
            narrow ? "< 5 min: stream" : "< 5 min late: the stream",
            narrow ? "5 min – 24 h: T+1" : "5 min to 24 h late: preliminary",
            narrow ? "≥ 24 h: T+7" : "24 h or later: final only",
            narrow ? "every number labelled" : "every number says which version it is",
          ][step]
        }
      </Txt>
    </g>
  );
}

function Scene({ variant, step, t, narrow }: SceneProps) {
  return variant === "late" ? <Tiers step={step} t={t} narrow={narrow} /> : <Windows step={step} t={t} narrow={narrow} />;
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.cw-axis{stroke:var(--ax-line);stroke-width:1.5}.cw-dash{stroke-dasharray:5 5}.cw-wm{stroke:var(--ax-accent);stroke-width:2}.cw-new{stroke:var(--ax-sky);stroke-width:1.5;stroke-dasharray:4 4}`,
  variants: [
    {
      id: "window",
      label: "Window, watermark",
      steps: [
        { caption: "Trending counts unique viewers in a 1-hour window that slides every minute, so a window ends each minute.", tween: 1000 },
        { caption: "The watermark trails the newest event time by 5 minutes. An 11:05 event moves it to 11:00: 10:00–11:00 closes.", tween: 1600 },
        { caption: "An 11:02 event arriving 3 minutes behind is still on time: its windows are open, so it counts.", tween: 1400 },
        { caption: "A 10:52 event arriving after 11:05 is over 5 minutes late: it skips the stream for late_events.", tween: 2000, ms: 3400 },
      ],
    },
    {
      id: "late",
      label: "Late events",
      steps: [
        { caption: "Events under 5 minutes late update the real-time numbers in ClickHouse, marked provisional.", tween: 1400 },
        { caption: "Subway: 45 minutes late. Airplane: 3 hours late. Both wait for the T+1 preliminary job at 6 AM.", tween: 1600 },
        { caption: "An event 24 hours or more late is left for the T+7 final job, which recomputes with every event.", tween: 1400 },
        { caption: "Dashboards show which version each number is: real-time, preliminary (T+1) or final (T+7).", tween: 600, ms: 3400 },
      ],
    },
  ],
  Scene,
});
