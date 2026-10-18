/**
 * Webhook retries after a long outage (week 2, day 4 · 3.1 / 3.4 / 6.1–6.3): the endpoint is down
 * 2:00–4:00 PM. With the plain backoff schedule (1m, 5m, 15m, 1h, 2h…) each event waits on its own
 * timer, so deliveries trickle in until ~6:00 PM; with health-based acceleration all 10,000 pending
 * retries move to the immediate queue at 4:00 and finish by 4:13 at ~13/s.
 */
import { clamp, defineExplainer, ease, lerp, seg, Token, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 290;
const X0 = 86;
const X1 = 576;
const SPAN = 240; // minutes, 2:00 → 6:00 PM
const TOP = 102;
const AXIS = 250;
const sx = (m: number) => X0 + ((X1 - X0) * m) / SPAN;

/** the lesson's sample events: created at, failed attempts, next scheduled retry (minutes after 2:00) */
const EVENTS = [
  { label: "2:00", fails: [0, 1, 6, 21, 81], next: 201 },
  { label: "2:30", fails: [30, 31, 36, 51, 111], next: 231 },
  { label: "3:30", fails: [90, 91, 96, 111], next: 171 },
  { label: "3:55", fails: [115, 116], next: 121 },
];
const rowY = (i: number) => 122 + i * 34;

const clockOf = (m: number) => {
  const tot = 120 + Math.round(m); // minutes after noon
  const h = Math.floor(tot / 60);
  return `${h}:${String(tot % 60).padStart(2, "0")} PM`;
};

function Scene({ variant, step, t, narrow }: SceneProps) {
  const fast = variant === "fast";
  const e = ease(t);
  let cur: number;
  if (!fast) cur = step === 0 ? lerp(0, 85, e) : step === 1 ? lerp(85, 120, e) : step === 2 ? 120 : lerp(120, 240, e);
  else cur = step === 0 ? lerp(0, 120, e) : step === 1 ? 120 : lerp(120, 133, e);
  const up = step >= 1 && cur >= 119.5;
  const rowOn = (i: number) => (fast || i === 0 ? 1 : step < 2 ? 0 : step === 2 ? seg(t, 0, 0.6) : 1);
  const arrowOn = (i: number) => (fast ? 1 : i === 0 ? (step === 0 ? 0 : step === 1 ? seg(t, 0.3, 0.9) : 1) : rowOn(i));
  let rightK = "endpoint";
  let rightD = up ? "UP" : "DOWN";
  let rightTone: Tone = up ? "ok" : "bad";
  if (!fast && step === 3) {
    rightK = "last delivery";
    rightD = "~6 PM";
    rightTone = "warn";
  }
  let delivered = 0;
  if (fast) {
    if (step === 0) {
      rightK = "pending";
      rightD = Math.round((10000 * cur) / 120).toLocaleString("en-US");
      rightTone = "warn";
    } else {
      delivered = step === 1 ? 0 : Math.round((10000 * (cur - 120)) / 13);
      rightK = step === 1 ? "to immediate" : "delivered";
      rightD = step === 1 ? "10,000" : delivered.toLocaleString("en-US");
      rightTone = step === 2 && t >= 1 ? "ok" : step === 1 ? "lit" : undefined;
    }
  }
  return (
    <g>
      <Txt x={24} y={24} k="k" anchor="start" tone="mute">
        now
      </Txt>
      <Txt x={24} y={60} k="d" anchor="start">
        {clockOf(cur)}
      </Txt>
      <Txt x={X1} y={24} k="k" anchor="end" tone={rightTone === "bad" ? "bad" : "mute"}>
        {rightK}
      </Txt>
      <Txt x={X1} y={60} k="d" anchor="end" tone={rightTone}>
        {rightD}
      </Txt>

      {/* the outage and the recovery */}
      <rect className="wh-down" x={sx(0)} y={TOP} width={sx(120) - sx(0)} height={AXIS - TOP} />
      <Txt x={sx(60)} y={TOP - 8} k="k" tone="bad">
        endpoint down
      </Txt>
      {up && (
        <g>
          <line className="wh-up" x1={sx(120)} x2={sx(120)} y1={TOP} y2={AXIS} />
          <Txt x={sx(120) + 6} y={TOP - 8} k="k" anchor="start" tone="ok">
            up 4:00
          </Txt>
        </g>
      )}
      {fast && step === 2 && <rect className="wh-fast" x={sx(120)} y={TOP} width={sx(cur) - sx(120)} height={AXIS - TOP} />}

      {/* events */}
      {EVENTS.map((ev, i) => {
        const y = rowY(i);
        const o = rowOn(i);
        const last = ev.fails[ev.fails.length - 1];
        // accelerated: the pending retry jumps to the immediate queue at 4:00
        const moved = fast && step >= 1 ? (step === 1 ? ease(seg(t, 0.15 + i * 0.08, 0.7 + i * 0.08)) : 1) : 0;
        const nextAt = fast ? lerp(ev.next, 120.5, moved) : ev.next;
        const deliverAt = fast ? 120 + (13 * (i + 1)) / 4 : ev.next;
        const done = fast ? step === 2 && cur >= deliverAt : step === 3 && cur >= ev.next;
        const waiting = cur >= last;
        return (
          <g key={ev.label} opacity={o}>
            <Txt x={24} y={y + 5} anchor="start">
              {ev.label}
            </Txt>
            <line className="wh-lane" x1={X0} x2={X1} y1={y} y2={y} />
            {waiting && arrowOn(i) > 0 && (
              <path className={`wh-wait${done ? " ok" : ""}`} d={`M${sx(last) + 6} ${y}H${lerp(sx(last) + 6, sx(nextAt) - 6, arrowOn(i))}`} />
            )}
            {ev.fails.map((m) => (cur >= m ? <Token key={m} x={sx(m)} y={y} s={8} tone="bad" /> : null))}
            {waiting && arrowOn(i) >= 1 &&
              (done ? <Token x={sx(nextAt)} y={y} s={10} tone="ok" /> : <rect className="wh-next" x={sx(nextAt) - 5} y={y - 5} width={10} height={10} />)}
            {!fast && !narrow && waiting && arrowOn(i) >= 1 && (
              <Txt x={sx(nextAt)} y={y - 9} k="s" tone={done ? "ok" : "warn"}>
                {clockOf(ev.next).replace(" PM", "")}
              </Txt>
            )}
          </g>
        );
      })}

      {/* axis */}
      <line className="wh-axis" x1={X0} x2={X1} y1={AXIS} y2={AXIS} />
      {[0, 60, 120, 180, 240].map((m, k) => (
        <g key={m}>
          <line className="wh-axis" x1={sx(m)} x2={sx(m)} y1={AXIS} y2={AXIS + 5} />
          <Txt x={sx(m)} y={AXIS + 22} k="s" anchor={k === 0 ? "start" : k === 4 ? "end" : "middle"}>
            {`${2 + k} PM`}
          </Txt>
        </g>
      ))}
      {fast && step === 2 && (
        <Txt x={sx(150)} y={rowY(3) + 4} k="s" anchor="start" tone="ok" opacity={clamp(t * 2 - 1)}>
          {narrow ? "13 min" : "13 min, not ~2 h"}
        </Txt>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `
.ax-d.warn{fill:var(--ax-amber)}
.wh-down{fill:var(--ax-bad);opacity:.09}
.wh-fast{fill:var(--ax-ok);opacity:.14}
.wh-up{stroke:var(--ax-ok);stroke-width:2}
.wh-lane{stroke:var(--ax-line-soft);stroke-width:1.5}
.wh-axis{stroke:var(--ax-line);stroke-width:1.5}
.wh-wait{fill:none;stroke:var(--ax-amber);stroke-width:1.5;stroke-dasharray:4 4}.wh-wait.ok{stroke:var(--ax-ok)}
.wh-next{fill:var(--ax-box);stroke:var(--ax-amber);stroke-width:2}
`,
  variants: [
    {
      id: "default",
      label: "Plain backoff",
      steps: [
        { caption: "2:00 PM: the partner's endpoint goes down. Event 1 retries at 2:01, 2:06, 2:21 and 3:21: all fail.", tween: 3200 },
        { caption: "4:00 PM the endpoint recovers, but Event 1's next retry waits 2 hours after 3:21: 5:21 PM.", tween: 2000 },
        { caption: "Every event sits at its own backoff stage: 2:30's next try is 5:51, 3:30's is 4:51, 3:55's is 4:01.", tween: 1600, ms: 3600 },
        { caption: "Deliveries trickle in from 4:01 until about 6:00 PM: two hours after the endpoint came back.", tween: 3200, ms: 3400 },
      ],
    },
    {
      id: "fast",
      label: "Accelerated retry",
      steps: [
        { caption: "Same outage: from 2:00 to 4:00 PM, 10,000 events pile up, each waiting on its own backoff timer.", tween: 3200 },
        { caption: "4:00 PM: the 30-second health check sees the endpoint is up and moves all 10,000 retries to the immediate queue.", tween: 2000, ms: 3400 },
        { caption: "Workers deliver at the endpoint's rate limit, about 13 per second: all 10,000 done by 4:13 PM.", tween: 2600, ms: 3600 },
      ],
    },
  ],
  Scene,
});
