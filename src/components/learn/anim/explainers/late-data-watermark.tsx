/**
 * Watermarks and late data (week 8, day 4 · 2.1 / 3.1–3.3): the lesson's arrival table (watermark =
 * max event time seen − 5 min bound), then a 1-hour tumbling window [14:00, 15:00) with 30 minutes
 * of allowed lateness: fire at 15:00, a late update, state cleanup at 15:30, side output after.
 */
import { defineExplainer, lerp, seg, tween, Txt, type SceneProps } from "../kit";

const W = 600;
const H = 320;
const AX = { x0: 60, x1: 556, y: 214 };

const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;

/* ------------------------------------------------------------ watermark progression */

// minutes after 9:00
const ARR = [
  { at: "10:01", ev: 58, step: 0 },
  { at: "10:02", ev: 55, step: 0 },
  { at: "10:03", ev: 61, step: 1 },
  { at: "10:04", ev: 59, step: 2 },
  { at: "10:05", ev: 63, step: 3 },
];
const MAX = [58, 61, 61, 63];
const PT = ["10:02", "10:03", "10:04", "10:05"];
const wx = (m: number) => AX.x0 + ((m - 50) * (AX.x1 - AX.x0)) / 15; // 9:50 → 10:05
const order = [...ARR].sort((a, b) => a.ev - b.ev).map((a) => a.ev);

function Marks({ step, t, narrow }: SceneProps) {
  const max = tween(step, t, MAX);
  const wm = max - 5;
  const settle = step === 0 ? 1 : seg(t, 0.35, 1);
  return (
    <g>
      <Txt x={24} y={34} k="k" anchor="start">
        {narrow ? `now ${PT[step]} · bound 5 min` : `processing time ${PT[step]} · out-of-orderness bound 5 min`}
      </Txt>
      {/* complete region */}
      <rect className="lw-done" x={AX.x0} y={50} width={Math.max(0, wx(wm) - AX.x0)} height={AX.y - 50} />
      <Txt x={AX.x0 + 8} y={68} k="s" anchor="start" tone="mute">
        {narrow ? "≤ W: done" : "≤ watermark: complete (probably)"}
      </Txt>
      {/* axis */}
      <line className="lw-axis" x1={AX.x0} x2={AX.x1} y1={AX.y} y2={AX.y} />
      {Array.from({ length: 16 }, (_, i) => (
        <line key={i} className="lw-axis" x1={wx(50 + i)} x2={wx(50 + i)} y1={AX.y - (i % 5 ? 3 : 7)} y2={AX.y + (i % 5 ? 3 : 7)} />
      ))}
      {[50, 65].map((m) => (
        <Txt key={m} x={wx(m)} y={AX.y + 24} k="s" tone="mute">
          {hm(540 + m)}
        </Txt>
      ))}
      <Txt x={AX.x1} y={AX.y + 64} k="s" anchor="end" tone="mute">
        event time →
      </Txt>
      {/* watermark + max */}
      <line className="lw-max" x1={wx(max)} x2={wx(max)} y1={102} y2={AX.y} />
      <Txt x={wx(max)} y={96} k="s" tone="sky">
        {`max ${hm(540 + Math.round(max))}`}
      </Txt>
      <line className="lw-wm" x1={wx(wm)} x2={wx(wm)} y1={134} y2={AX.y + 8} />
      <Txt x={wx(wm)} y={128} k="t" tone="lit">
        {`W ${hm(540 + Math.round(wm))}`}
      </Txt>
      <path className="lw-br" d={`M${wx(wm)} 152H${wx(max)}`} />
      <Txt x={(wx(wm) + wx(max)) / 2} y={170} k="s" tone="lit">
        − 5 min
      </Txt>
      {/* events */}
      {ARR.filter((a) => a.step <= step).map((a) => {
        const fresh = a.step === step && step > 0;
        const p = fresh ? seg(t, 0, 0.35) : 1;
        const y = lerp(64, AX.y - 12, p);
        const hi = order.indexOf(a.ev) % 2 === 1;
        const onTime = step === 2 && a.ev === 59;
        return (
          <g key={a.ev}>
            <rect className={`lw-ev${onTime ? " ok" : fresh || (step === 0 && a.step === 0) ? " new" : ""}`} x={wx(a.ev) - 6} y={y - 6} width={12} height={12} />
            <Txt x={wx(a.ev)} y={AX.y + (hi ? 44 : 24)} k="s" tone={onTime ? "ok" : undefined} opacity={p * settle}>
              {hm(540 + a.ev)}
            </Txt>
          </g>
        );
      })}
      <Txt x={24} y={H - 8} k="s" anchor="start" tone={step === 2 ? "ok" : "mute"}>
        {step === 2 ? (narrow ? "9:59 > W 9:56: on time" : "9:59 is above W 9:56: on time, max stays 10:01") : narrow ? "arrived · stamped below" : "squares: events that have arrived, at their event time"}
      </Txt>
    </g>
  );
}

/* ------------------------------------------------------------ late event, allowed lateness */

const LX = (min: number) => AX.x0 + ((min - 830) * (AX.x1 - AX.x0)) / 130; // 13:50 → 16:00, minutes since 0:00
const WMS = [890, 900, 910, 935, 940]; // watermark at the start of step 0, then at the end of each step

function Late({ step, t, narrow }: SceneProps) {
  const wm = lerp(WMS[step], WMS[step + 1], t);
  const fired = wm >= 900;
  const updated = step >= 1 && (step > 1 || seg(t, 0.5, 0.8) >= 1);
  const freed = step >= 2 && (step > 2 || wm >= 930);
  const status = freed ? "state cleaned up" : updated ? "result v2 · 1 late update" : fired ? "fired · result v1" : "open";
  const ev = step === 1 ? seg(t, 0.2, 0.6) : step === 3 ? seg(t, 0.2, 0.55) : 0;
  const side = step === 3 ? seg(t, 0.55, 1) : 0;
  return (
    <g>
      <Txt x={24} y={34} k="k" anchor="start">
        {narrow ? "1-hour window · 30 min lateness" : "1-hour tumbling window · allowed lateness 30 min"}
      </Txt>
      {/* allowed lateness band */}
      <rect className="lw-late" x={LX(900)} y={70} width={LX(930) - LX(900)} height={AX.y - 70} />
      <Txt x={LX(900) + 6} y={AX.y - 10} k="s" anchor="start" tone="warn">
        {narrow ? "+30 min" : "allowed lateness"}
      </Txt>
      {/* the window */}
      <rect className={`ax-box${freed ? "" : updated ? " lit" : fired ? " ok" : ""}`} x={LX(840)} y={100} width={LX(900) - LX(840)} height={64} opacity={freed ? 0.4 : 1} />
      <Txt x={(LX(840) + LX(900)) / 2} y={126}>
        [14:00, 15:00)
      </Txt>
      <Txt x={(LX(840) + LX(900)) / 2} y={148} k="s" tone={freed ? "mute" : updated ? "lit" : fired ? "ok" : undefined}>
        {narrow ? status.replace(" · 1 late update", "").replace("fired · ", "") : status}
      </Txt>
      {/* axis */}
      <line className="lw-axis" x1={AX.x0} x2={AX.x1} y1={AX.y} y2={AX.y} />
      {[840, 870, 900, 930, 960].map((m) => (
        <g key={m}>
          <line className="lw-axis" x1={LX(m)} x2={LX(m)} y1={AX.y - 7} y2={AX.y + 7} />
          <Txt x={LX(m)} y={AX.y + 26} k="s">
            {hm(m)}
          </Txt>
        </g>
      ))}
      {/* watermark */}
      <line className="lw-wm" x1={LX(wm)} x2={LX(wm)} y1={64} y2={AX.y + 8} />
      <Txt x={LX(wm)} y={58} k="t" tone="lit">
        {`W ${hm(Math.round(wm))}`}
      </Txt>
      {/* the late event: 14:30 into the window, or a later one to the side output */}
      {step === 1 && <rect className="lw-ev ok" x={LX(870) - 6} y={lerp(66, 184, ev) - 6} width={12} height={12} opacity={ev > 0 ? 1 : 0} />}
      {step === 1 && (
        <Txt x={LX(870) + 14} y={lerp(70, 188, ev)} k="s" anchor="start" tone="ok" opacity={ev}>
          14:30
        </Txt>
      )}
      {step === 1 && (
        <Txt x={24} y={H - 12} k="s" anchor="start" tone="ok" opacity={seg(t, 0.5, 0.9)}>
          {narrow ? "10 min late ≤ 30: update" : "lateness = W − window end = 10 min ≤ 30 min: update the result"}
        </Txt>
      )}
      {step === 2 && (
        <Txt x={24} y={H - 12} k="s" anchor="start" tone="mute" opacity={seg(t, 0.6, 1)}>
          {narrow ? "W > 15:30: state freed" : "W > window end + allowed lateness (15:30): free the window's state"}
        </Txt>
      )}
      {step === 3 && (
        <g>
          <rect className="lw-ev bad" x={lerp(LX(880), 422, side) - 6} y={lerp(lerp(66, 184, ev), 271, side) - 6} width={12} height={12} />
          <rect className="ax-box bad" x={404} y={246} width={172} height={50} opacity={0.4 + side * 0.6} />
          <Txt x={500} y={266} k="s" tone="bad">
            late_events
          </Txt>
          <Txt x={500} y={286} k="s" tone="mute">
            {narrow ? "40 min > 30" : "40 min late > 30"}
          </Txt>
          <Txt x={24} y={H - 12} k="s" anchor="start" tone="bad" opacity={side}>
            {narrow ? "kept out of result" : "kept out of the result"}
          </Txt>
        </g>
      )}
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "late" ? <Late {...p} /> : <Marks {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.lw-axis{stroke:var(--ax-line);stroke-width:1.5}
.lw-done{fill:var(--ax-ok);opacity:.08}
.lw-late{fill:var(--ax-amber);opacity:.12;stroke:var(--ax-amber);stroke-width:1.5;stroke-dasharray:4 4}
.lw-wm{stroke:var(--ax-accent);stroke-width:2.5}
.lw-max{stroke:var(--ax-sky);stroke-width:1.5;stroke-dasharray:4 4}
.lw-br{stroke:var(--ax-accent);stroke-width:1.5;fill:none}
.lw-ev{fill:var(--ax-fg3)}.lw-ev.new{fill:var(--ax-sky)}.lw-ev.ok{fill:var(--ax-ok)}.lw-ev.bad{fill:var(--ax-bad)}`,
  variants: [
    {
      id: "watermark",
      label: "Watermark",
      steps: [
        { caption: "Events stamped 9:58 and 9:55 arrive at 10:01 and 10:02. Max seen is 9:58, so the watermark is 9:53.", ms: 3400 },
        { caption: "At 10:03 an event stamped 10:01 arrives. The max jumps to 10:01, and the watermark to 9:56.", tween: 1600, ms: 3000 },
        { caption: "At 10:04 an older event, 9:59, arrives. It can't lower the max, and it is above the watermark: on time.", tween: 1400, ms: 3400 },
        { caption: "At 10:05, 10:03 arrives: watermark 9:58. It always trails the max seen by the 5-minute out-of-orderness bound.", tween: 1600, ms: 3400 },
      ],
    },
    {
      id: "late",
      label: "Late event",
      steps: [
        { caption: "Hourly window [14:00, 15:00) fires when the watermark passes 15:00. Its state is kept for 30 minutes of allowed lateness.", tween: 1600, ms: 3200 },
        { caption: "A 14:30 purchase arrives with the watermark at 15:10: 10 minutes late, within tolerance. The result updates.", tween: 1800, ms: 3200 },
        { caption: "When the watermark passes 15:30, window end plus allowed lateness, the window's state is cleaned up.", tween: 1800, ms: 3000 },
        { caption: "An event for that hour arriving now is beyond tolerance: it stays out of the result but goes to late_events.", tween: 1800, ms: 3400 },
      ],
    },
  ],
  Scene,
});
