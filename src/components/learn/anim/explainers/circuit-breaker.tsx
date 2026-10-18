/**
 * Circuit breaker (week 2, day 3 · 1.2 / 1.3): the lesson's bank-outage timeline. Threshold 5
 * failures in 60 s, 3.5 s timeouts, fail fast in ~10 ms while OPEN, a 30 s timer to HALF-OPEN,
 * one trial call: failure re-opens, success closes.
 */
import { Box, defineExplainer, lerp, polar, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const Y = 196; // the call path
const SVC = { x: 24, w: 132 };
const BANK = { x: 444, w: 132 };
const SW = { a: 270, b: 330 }; // breaker contacts

type St = "closed" | "open" | "half";

function stateAt(step: number, t: number): St {
  if (step <= 1) return "closed";
  if (step === 2) return t > 0.55 ? "open" : "closed";
  if (step === 3) return "open";
  if (step === 4) return t < 0.2 ? "open" : t < 0.8 ? "half" : "open";
  if (step === 5) return t < 0.75 ? "half" : "closed";
  return "closed";
}

const CHIPS: { id: St; label: string; tone: Tone; x: number }[] = [
  { id: "closed", label: "CLOSED", tone: "ok", x: 70 },
  { id: "open", label: "OPEN", tone: "bad", x: 240 },
  { id: "half", label: "HALF-OPEN", tone: "warn", x: 410 },
];

/** one call's trip: out along the path to `stop`, then back; returns the token position */
function trip(p: number, stop: number) {
  const from = SVC.x + SVC.w;
  if (p < 0.5) return lerp(from, stop, p / 0.5);
  return lerp(stop, from, (p - 0.5) / 0.5);
}

function Scene({ step, t, clock, narrow }: SceneProps) {
  const st = stateAt(step, t);
  const bankUp = step === 0 || step >= 5;
  // step 1: four calls in a row, each out to the bank, a timeout, back as a failure
  const fails = step === 0 || step === 6 || (step === 5 && t >= 0.75) ? 0 : step === 1 ? Math.min(4, Math.floor(t * 4 + 0.5)) : 5;
  const lever = st === "closed" ? 0 : st === "open" ? -38 : -16;
  const leverEnd = polar(SW.a, Y, SW.b - SW.a, 90 + lever);
  // tokens for this step
  const tokens: { x: number; tone: Tone; o?: number }[] = [];
  if (step === 0 || step === 6) {
    for (let k = 0; k < 3; k++) {
      const p = (clock * 0.55 + k / 3) % 1;
      tokens.push({ x: trip(p, BANK.x), tone: "ok" });
    }
  } else if (step === 1) {
    const k = Math.min(3, Math.floor(t * 4));
    const p = t >= 1 ? 1 : t * 4 - k;
    tokens.push({ x: trip(Math.min(1, p), BANK.x), tone: p > 0.5 ? "bad" : "warn", o: t >= 1 ? 0 : 1 });
  } else if (step === 2) {
    const p = seg(t, 0, 0.5);
    tokens.push({ x: trip(p, BANK.x), tone: p > 0.5 ? "bad" : "warn", o: p >= 1 ? 0 : 1 });
  } else if (step === 3) {
    for (let k = 0; k < 3; k++) {
      const p = (clock * 1.1 + k / 3) % 1;
      tokens.push({ x: trip(p, SW.a - 6), tone: "bad" });
    }
  } else if (step === 4) {
    const p = seg(t, 0.25, 0.8);
    if (p > 0 && p < 1) tokens.push({ x: trip(p, BANK.x), tone: p > 0.5 ? "bad" : "warn" });
  } else if (step === 5) {
    const p = seg(t, 0.15, 0.75);
    if (p > 0 && p < 1) tokens.push({ x: trip(p, BANK.x), tone: p > 0.5 ? "ok" : "warn" });
  }
  const timer = step === 3 ? Math.min(1, clock / 4) : step === 4 ? 1 : 0;
  const latency = step === 0 || step === 6 ? "100 ms" : step <= 2 ? "3.5 s timeout" : step === 3 ? "~10 ms" : "trial call";
  return (
    <g>
      {/* state machine strip */}
      {CHIPS.map((c, i) => {
        const on = c.id === st;
        return (
          <g key={c.id}>
            <rect x={c.x} y={22} width={120} height={36} className={`ax-box${on ? ` ${c.tone}` : ""}`} opacity={on ? 1 : 0.55} />
            {on && <rect x={c.x} y={22} width={120} height={36} className={`cb-glow ${c.tone}`} />}
            <Txt x={c.x + 60} y={45} tone={on ? c.tone : "mute"}>
              {c.label}
            </Txt>
            {i < 2 && <Wire d={`M${c.x + 124} 40H${c.x + 166}`} arrow tone={on && ((i === 0 && step === 2) || (i === 1 && step === 4)) ? "lit" : undefined} />}
          </g>
        );
      })}
      {/* the two ways out of HALF-OPEN */}
      <Wire d={`M440 58V74H310V62`} arrow dash tone={step === 4 && t >= 0.8 ? "lit" : undefined} opacity={0.85} />
      <Wire d={`M500 58V96H130V62`} arrow dash tone={step === 5 && t >= 0.75 ? "lit" : undefined} opacity={0.85} />
      {!narrow && (
        <>
          <Txt x={376} y={88} k="s" tone={step === 4 && t >= 0.8 ? "lit" : undefined}>
            trial fails
          </Txt>
          <Txt x={316} y={112} k="s" tone={step === 5 && t >= 0.75 ? "lit" : undefined}>
            trial succeeds · count reset
          </Txt>
        </>
      )}

      {/* the call path */}
      <Box x={SVC.x} y={Y - 30} w={SVC.w} h={60} label="Payments" sub="your service" />
      <Box x={BANK.x} y={Y - 30} w={BANK.w} h={60} label="Bank API" sub={bankUp ? "healthy" : "failing"} tone={bankUp ? "ok" : "bad"} />
      <Wire d={`M${SVC.x + SVC.w} ${Y}H${SW.a}`} />
      <Wire d={`M${SW.b} ${Y}H${BANK.x}`} tone={st === "closed" ? undefined : "mute"} />
      <rect x={SW.a - 4} y={Y - 4} width={8} height={8} className="cb-contact" />
      <rect x={SW.b - 4} y={Y - 4} width={8} height={8} className="cb-contact" />
      <line x1={SW.a} y1={Y} x2={leverEnd.x} y2={leverEnd.y} className={`cb-lever ${st}`} />
      <Txt x={(SW.a + SW.b) / 2} y={Y + 40} k="k" tone={st === "closed" ? "ok" : st === "open" ? "bad" : "warn"}>
        breaker
      </Txt>
      {tokens.map((k, i) => (
        <Token key={i} x={k.x} y={Y} s={11} tone={k.tone} opacity={k.o} />
      ))}

      {/* counters */}
      <Txt x={SVC.x} y={Y + 72} k="k" anchor="start" tone={fails >= 5 ? "bad" : "mute"}>
        failures
      </Txt>
      <Txt x={SVC.x} y={Y + 108} k="d" anchor="start" tone={fails >= 5 ? "bad" : undefined}>
        {`${fails}/5`}
      </Txt>
      <Txt x={W / 2} y={Y + 108} k="t" tone={step === 3 ? "lit" : undefined}>
        {latency}
      </Txt>
      {(step === 3 || step === 4) && (
        <g>
          <circle cx={BANK.x + BANK.w - 22} cy={Y + 88} r={16} className="cb-timer-bg" />
          <circle
            cx={BANK.x + BANK.w - 22}
            cy={Y + 88}
            r={16}
            className="cb-timer"
            strokeDasharray={`${(2 * Math.PI * 16 * timer).toFixed(1)} 200`}
            transform={`rotate(-90 ${BANK.x + BANK.w - 22} ${Y + 88})`}
          />
          <Txt x={BANK.x + BANK.w - 46} y={Y + 94} k="s" anchor="end">
            {`${Math.round(30 * (1 - timer))} s`}
          </Txt>
        </g>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `
.cb-contact{fill:var(--ax-fg3)}
.cb-lever{stroke-width:4;stroke-linecap:square;transition:none}
.cb-lever.closed{stroke:var(--ax-ok)}.cb-lever.open{stroke:var(--ax-bad)}.cb-lever.half{stroke:var(--ax-amber)}
.cb-glow{fill:none;stroke-width:6;opacity:.18}.cb-glow.ok{stroke:var(--ax-ok)}.cb-glow.bad{stroke:var(--ax-bad)}.cb-glow.warn{stroke:var(--ax-amber)}
.cb-timer-bg{fill:none;stroke:var(--ax-line);stroke-width:4}
.cb-timer{fill:none;stroke:var(--ax-accent);stroke-width:4}
`,
  variants: [
    {
      id: "outage",
      label: "Bank outage",
      steps: [
        { caption: "CLOSED is the happy path: calls pass straight through to the bank and come back in about 100 ms. The breaker quietly counts failures.", loop: true },
        { caption: "The bank starts failing. Every call now waits 3.5 s for its timeout, and the failure count climbs: 1, 2, 3, 4.", tween: 4000, ms: 1400 },
        { caption: "The fifth failure within 60 s crosses the threshold, and the breaker trips OPEN.", tween: 1800, ms: 2200 },
        { caption: "OPEN: calls fail fast in about 10 ms without touching the bank, so threads are freed and the bank gets breathing room. A 30 s timer runs.", ms: 3600, loop: true },
        { caption: "The timer expires and the breaker goes HALF-OPEN: one trial call reaches the bank. It is still down, so the trial fails and the breaker re-opens for another 30 s.", tween: 2600, ms: 2600 },
        { caption: "Minutes later the bank is healthy again. The next trial call succeeds, and HALF-OPEN closes the breaker.", tween: 2600, ms: 2200 },
        { caption: "CLOSED: normal 100 ms calls again. The outage still lasted ~10 minutes, but only the first 5 calls waited 3.5 s; every other call failed in ~10 ms.", ms: 4200, loop: true },
      ],
    },
  ],
  Scene,
});
