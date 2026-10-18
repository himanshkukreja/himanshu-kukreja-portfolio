/**
 * Case file "The Great ID Crisis": event_log's 32-bit auto-increment ID climbs at ~4 million events
 * a day for 18 months until it reaches 2,147,483,647; every INSERT then fails with a duplicate-key
 * error the fire-and-forget writer swallows. The BIGINT tab runs the same volume through 64 bits.
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const MAX32 = 2147483647;
const PER_DAY = 4_000_000;
const FULL_DAY = MAX32 / PER_DAY; // ≈ 537
const MX = 24;
const MW = 552;
const MY = 146;
const WR = { x: 24, y: 226, w: 160, h: 60 };
const TB = { x: 416, y: 226, w: 160, h: 60 };
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

function Scene({ variant, step, t, clock, narrow }: SceneProps) {
  const big = variant === "bigint";
  const e = ease(t);
  // days elapsed at the end of each step
  const days = big ? [90, FULL_DAY, FULL_DAY] : [90, 270, FULL_DAY, FULL_DAY];
  const d0 = step === 0 ? 0 : days[Math.min(step - 1, days.length - 1)];
  const d1 = days[Math.min(step, days.length - 1)];
  const day = lerp(d0, d1, e);
  const id = big ? day * PER_DAY : Math.min(MAX32, day * PER_DAY);
  const full = !big && id >= MAX32;
  const failing = full && step >= 2 && (step > 2 || t > 0.85);
  const frac = big ? id / 9.223372036854775807e18 : id / MAX32;
  const pct = frac * 100;
  const tone: Tone = big ? "ok" : pct >= 90 ? "bad" : pct >= 70 ? "warn" : pct >= 50 ? "warn" : "sky";
  const months = Math.round(day / 30);
  // inserts flowing writer → table (loop steps), or bouncing back when the table refuses them
  const toks = [0, 1, 2].map((i) => {
    const p = clock > 0 ? (clock * 0.6 + i / 3) % 1 : 0.2 + i * 0.3;
    const a = WR.x + WR.w;
    const b = TB.x;
    if (!failing) return { x: lerp(a, b, p), y: WR.y + WR.h / 2, tone: "lit" as Tone, o: clock > 0 ? 1 : 0 };
    const out = p < 0.6 ? p / 0.6 : 1 - (p - 0.6) / 0.4;
    return { x: lerp(a, b - 6, out), y: WR.y + WR.h / 2 + (p >= 0.6 ? 14 : 0), tone: "bad" as Tone, o: step === 3 ? 1 : 0 };
  });
  return (
    <g>
      <Txt x={24} y={34} k="k" anchor="start">
        {big ? (narrow ? "event_log.id · BIGINT" : "event_log.id · BIGINT (64-bit)") : narrow ? "event_log.id · INT" : "event_log.id · INT (32-bit signed)"}
      </Txt>
      <Txt x={W - 24} y={34} k="k" anchor="end" tone="mute">
        {step === 0 && t < 0.02 ? "day 0" : `day ${Math.round(day)}${months >= 1 ? ` · ~${months} mo` : ""}`}
      </Txt>
      <Txt x={W / 2} y={100} k="d" tone={full ? "bad" : undefined}>
        {fmt(id)}
      </Txt>
      <Txt x={W / 2} y={124} k="s">
        {big ? (narrow ? "max ~9.2 quintillion" : "max 9,223,372,036,854,775,807") : narrow ? "max 2,147,483,647" : "current max ID · ceiling 2,147,483,647"}
      </Txt>
      <Meter x={MX} y={MY} w={MW} h={18} value={frac} max={1} tone={tone} />
      {!big &&
        [50, 70, 90].map((p) => (
          <g key={p}>
            <line className="io-th" x1={MX + (MW * p) / 100} x2={MX + (MW * p) / 100} y1={MY - 6} y2={MY + 24} />
            <Txt x={MX + (MW * p) / 100} y={MY + 40} k="s" tone={pct >= p ? "warn" : "mute"}>
              {`${p}%`}
            </Txt>
          </g>
        ))}
      <Txt x={MX} y={MY + 40} k="s" anchor="start" tone={tone}>
        {big ? (narrow ? "~0% used" : `${pct.toFixed(10)}% used`) : `${pct.toFixed(pct >= 99.95 ? 0 : 1)}%`}
      </Txt>
      {!big && step === 1 && (
        <Txt x={W / 2} y={MY + 64} k="s" tone="warn">
          {narrow ? "no alert: unwatched" : "no alert fires: nobody tracks ID utilization"}
        </Txt>
      )}
      <Box x={WR.x} y={WR.y} w={WR.w} h={WR.h} label="Event writer" sub={narrow ? "4M/day" : "fire-and-forget"} />
      <Wire d={`M${WR.x + WR.w} ${WR.y + WR.h / 2}H${TB.x}`} arrow tone={failing ? "bad" : clock > 0 ? "lit" : undefined} />
      <Box x={TB.x} y={TB.y} w={TB.w} h={TB.h} label="event_log" sub={failing ? (narrow ? "dup key ✗" : "duplicate key ✗") : "INSERT ✓"} tone={failing ? "bad" : big && step === 2 ? "ok" : undefined} />
      {toks.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={10} tone={k.tone} opacity={k.o} />
      ))}
      {failing && (
        <g opacity={step === 3 ? seg(t, 0.2, 0.7) : 1}>
          <Txt x={(WR.x + WR.w + TB.x) / 2} y={WR.y + WR.h + 26} k="s" tone="bad">
            {narrow ? "error swallowed" : "error swallowed · event lost"}
          </Txt>
          <Txt x={(WR.x + WR.w + TB.x) / 2} y={WR.y - 12} k="s" tone="ok">
            {narrow ? "reads OK · looks healthy" : "reads answered · metrics stable"}
          </Txt>
        </g>
      )}
      {big && step === 1 && (
        <Txt x={W / 2} y={MY + 64} k="s" tone="sky">
          {narrow ? "the count that filled INT" : "the same count that filled INT"}
        </Txt>
      )}
      {big && step === 2 && (
        <Txt x={(WR.x + WR.w + TB.x) / 2} y={WR.y - 12} k="s" tone="ok">
          {narrow ? "8 bytes vs 4" : "8 bytes per row vs 4"}
        </Txt>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.io-th{stroke:var(--ax-fg3);stroke-width:1.5;stroke-dasharray:3 3}`,
  variants: [
    {
      id: "int",
      label: "INT (32-bit)",
      steps: [
        { caption: "Each of ~4 million events a day takes the next auto-increment ID. INT stops at 2,147,483,647.", tween: 1800, ms: 2800, loop: true },
        { caption: "Around day 270, half the ID space is gone. No alert fires: nobody is tracking ID utilization.", tween: 2200, ms: 3000, loop: true },
        { caption: "Month 18: the counter reaches 2,147,483,647 and can't advance, so MySQL hands out the same value again.", tween: 2400, ms: 3000 },
        { caption: "Every INSERT now fails with a duplicate-key error the writer swallows. Reads still work; events silently vanish.", tween: 1400, ms: 3800, loop: true },
      ],
    },
    {
      id: "bigint",
      label: "BIGINT (64-bit)",
      steps: [
        { caption: "Same table as BIGINT: 64 bits, about 9.2 quintillion IDs, at the same ~4 million events a day.", tween: 1800, ms: 2800, loop: true },
        { caption: "After 18 months, ~2.15 billion IDs are used and the meter hasn't visibly moved.", tween: 2400, ms: 3000, loop: true },
        { caption: "The price is 8 bytes per row instead of 4. Inserts keep succeeding.", tween: 900, ms: 3400, loop: true },
      ],
    },
  ],
  Scene,
});
