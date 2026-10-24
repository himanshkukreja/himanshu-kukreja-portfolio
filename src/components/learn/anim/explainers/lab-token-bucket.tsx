/**
 * Break it: token bucket vs a burst (week 1, day 3 · 2.4). The lesson's bucket: 10 tokens/s,
 * capacity 50; requests 30, 5, 0 and 60 at t0–t3 (30 pass, then 45 pass and 15 are rejected).
 * Model: the same per-second simulation as the lesson's timeline, extended with a steady 10 req/s
 * for t4–t7: each second the bucket refills (capped at capacity), then serves what it can.
 */
import { defineExplainer, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const C = { x0: 52, x1: 392, y0: 64, y1: 248 };
const SECS = 8;

type Sec = { arr: number; ok: number; rej: number; before: number };

function simulate(cap: number, rate: number, burst: number): Sec[] {
  const arrivals = [30, 5, 0, burst, 10, 10, 10, 10];
  let tokens = cap;
  return arrivals.map((arr, i) => {
    if (i > 0) tokens = Math.min(cap, tokens + rate);
    const before = tokens;
    const ok = Math.min(arr, Math.floor(tokens));
    tokens -= ok;
    return { arr, ok, rej: arr - ok, before };
  });
}

function Scene({ step, clock, narrow, values }: SceneProps) {
  const cap = values.cap ?? 50;
  const rate = values.rate ?? 10;
  const burst = values.burst ?? 60;
  const s = simulate(cap, rate, burst);
  const top = Math.max(60, cap, ...s.map((x) => x.arr)) * 1.1;
  const colW = (C.x1 - C.x0) / SECS;
  const yOf = (v: number) => C.y1 - (v / top) * (C.y1 - C.y0);
  const cur = (3 + Math.floor(clock * 0.7)) % SECS;
  const ok = s.reduce((a, x) => a + x.ok, 0);
  const rej = s.reduce((a, x) => a + x.rej, 0);
  const all = ok + rej;
  const rejTone: Tone = rej === 0 ? "ok" : rej / Math.max(1, all) > 0.2 ? "bad" : "warn";
  const line = s.map((x, i) => `${i ? "L" : "M"}${C.x0 + i * colW + 4} ${yOf(x.before)}H${C.x0 + (i + 1) * colW - 4}`).join("");
  const c = s[cur];
  return (
    <g>
      <Txt x={C.x0 - 28} y={30} k="k" anchor="start">
        {narrow ? "token bucket" : `token bucket · ${rate}/s, capacity ${cap}`}
      </Txt>
      {/* per-second bars: allowed (green) under rejected (red) */}
      <line className="tb-ax" x1={C.x0} x2={C.x1} y1={C.y1} y2={C.y1} />
      {s.map((x, i) => {
        const bx = C.x0 + i * colW + colW / 2 - 13;
        return (
          <g key={i} opacity={i === cur ? 1 : 0.78}>
            {i === cur && <rect className="tb-cur" x={C.x0 + i * colW + 1} y={C.y0 - 18} width={colW - 2} height={C.y1 - C.y0 + 18} />}
            <rect className="ax-fill ok" x={bx} y={yOf(x.ok)} width={26} height={C.y1 - yOf(x.ok)} />
            {x.rej > 0 && <rect className="ax-fill bad" x={bx} y={yOf(x.arr)} width={26} height={yOf(x.ok) - yOf(x.arr)} />}
            <Txt x={bx + 13} y={yOf(x.arr) - 6} k="s" tone={x.rej ? "bad" : undefined}>
              {String(x.arr)}
            </Txt>
            <Txt x={bx + 13} y={C.y1 + 20} k="s" tone={i === cur ? "lit" : undefined}>
              {`t${i}`}
            </Txt>
          </g>
        );
      })}
      {/* tokens in the bucket at the start of each second (after refill) */}
      <path className="tb-tok" d={line} />
      {!narrow && (
        <Txt x={C.x0} y={C.y1 + 42} k="s" anchor="start">
          bars: allowed · red: rejected · orange line: tokens available
        </Txt>
      )}
      {/* the bucket, at the highlighted second */}
      <Txt x={420} y={52} k="k" anchor="start" tone={step === 1 ? "lit" : "mute"}>
        {`bucket t${cur}`}
      </Txt>
      <rect className="ax-meter" x={420} y={70} width={50} height={160} />
      <rect className="ax-fill lit" x={420} y={230 - 160 * Math.min(1, c.before / cap)} width={50} height={160 * Math.min(1, c.before / cap)} />
      <Txt x={445} y={250} k="s">
        {`${Math.floor(c.before)}/${cap}`}
      </Txt>
      <Txt x={445} y={272} k="s" tone={c.rej ? "bad" : "ok"}>
        {c.rej ? `−${c.rej}` : "all in"}
      </Txt>
      <Txt x={494} y={86} k="k" anchor="start" tone="ok">
        allowed
      </Txt>
      <Txt x={494} y={122} k="d" anchor="start" tone="ok">
        {String(ok)}
      </Txt>
      <Txt x={494} y={170} k="k" anchor="start" tone={rejTone}>
        {narrow ? "429s" : "rejected"}
      </Txt>
      <Txt x={494} y={206} k="d" anchor="start" tone={rejTone}>
        {String(rej)}
      </Txt>
      <Txt x={494} y={230} k="s" anchor="start">
        {`${all ? Math.round((rej / all) * 100) : 0}% of ${all}`}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.tb-ax{stroke:var(--ax-line);stroke-width:1.5}.tb-cur{fill:var(--ax-fg);opacity:.06}.tb-tok{fill:none;stroke:var(--ax-accent);stroke-width:2.5}`,
  controls: [
    { id: "cap", label: "Bucket capacity", min: 5, max: 200, step: 5, value: 50, unit: "tokens" },
    { id: "rate", label: "Refill rate", min: 1, max: 50, step: 1, value: 10, unit: "tokens/s" },
    { id: "burst", label: "Burst at t3", min: 0, max: 200, step: 5, value: 60, unit: "requests" },
  ],
  variants: [
    {
      id: "lab",
      label: "Lab",
      steps: [
        { caption: "The lesson's bucket: 10 tokens/s, capacity 50. The 30 requests at t0 all pass; the burst of 60 at t3 finds 45 tokens, so 45 pass and 15 are rejected. Drag the burst up.", loop: true, ms: 7000 },
        { caption: "Now shrink the capacity: the bucket absorbs less of any burst, so more is rejected at once even though the average rate allowed is the same.", loop: true, ms: 6500 },
        { caption: "Drop the refill rate below the steady 10 req/s that follows the burst: the bucket never refills and requests are rejected every second. Capacity is burst room; the refill rate is the long-run limit.", loop: true, ms: 7500 },
      ],
    },
  ],
  Scene,
});
