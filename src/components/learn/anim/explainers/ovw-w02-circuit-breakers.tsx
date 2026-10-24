/**
 * The whole lesson, week 2 day 3 (Circuit Breakers): Black Friday timeouts that still hurt, failing
 * fast, what counts as a failure; the outage math and fallbacks; the four ways breakers cause harm;
 * and how retry, circuit breaker and bulkhead layer together.
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 330;
type Lines = [string, string];
const fade = (t: number, a: number) => ease(seg(t, a, a + 0.4));

function Readout({ l, n, narrow, tone }: { l: Lines; n?: Lines; narrow: boolean; tone?: Tone }) {
  const x = narrow ? (n ?? [l[0].split(" · ")[0], l[1].split(" · ")[0]]) : l;
  return (
    <g>
      <Txt x={20} y={H - 38} k="s" anchor="start" tone={tone}>{x[0]}</Txt>
      <Txt x={20} y={H - 14} k="s" anchor="start">{x[1]}</Txt>
    </g>
  );
}
const Kick = ({ s, tone }: { s: string; tone?: Tone }) => <Txt x={20} y={30} k="k" anchor="start" tone={tone}>{s}</Txt>;

/** Payment service → [breaker] → Bank API, with a thread meter */
function Stage({ state, threads, bank, bankTone }: { state?: "CLOSED" | "OPEN"; threads: number; bank: string; bankTone?: Tone }) {
  return (
    <g>
      <Wire d="M170 92H410" arrow tone={state === "OPEN" ? "mute" : undefined} />
      <Box x={20} y={56} w={150} h={72} label="Payment" tone={threads > 80 ? "bad" : "ok"} />
      <Meter x={32} y={108} w={126} h={10} value={threads} max={100} ticks={10} tone={threads > 80 ? "bad" : "ok"} />
      {state && <Box x={236} y={72} w={120} h={40} label={state} tone={state === "OPEN" ? "bad" : "ok"} />}
      <Box x={410} y={64} w={170} h={56} label="Bank API" sub={bank} tone={bankTone} />
    </g>
  );
}

function Problem({ step, t, narrow }: SceneProps) {
  const p = ease(seg(t, 0.1, 0.9));
  if (step === 0) {
    return (
      <g>
        <Kick s="black friday, 10:00 AM" tone="bad" />
        <Stage threads={lerp(30, 100, p)} bank={narrow ? "50% fail" : "50% error rate"} bankTone="bad" />
        {p < 1 && [0, 1, 2].map((i) => <Token key={i} x={lerp(170, 404, seg(p, i * 0.2, i * 0.2 + 0.6))} y={92} tone="warn" />)}
        <Txt x={20} y={170} k="s" anchor="start">{narrow ? "each request" : "each request: call → 3.5 s timeout → retry → 3.5 s → fail"}</Txt>
        <Meter x={20} y={180} w={560} h={16} value={7 * p} max={7} ticks={2} tone="bad" />
        <Txt x={W - 20} y={222} anchor="end" tone="bad">7 s, then an error</Txt>
        <Readout narrow={narrow} l={["1000 concurrent requests · all threads blocked", "and the retries hammer an already struggling bank"]} n={["all threads blocked", "retries hammer the bank"]} tone="bad" />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Kick s="when it's clearly failing, stop calling it" tone="ok" />
        <Stage state="OPEN" threads={10} bank={narrow ? "recovering" : "breathing room"} bankTone="warn" />
        <Token x={lerp(170, 230, p)} y={92} tone="bad" opacity={p < 1 ? 1 : 0} />
        <Txt x={20} y={176} k="s" anchor="start">error after</Txt>
        <Txt x={20} y={222} k="d" anchor="start" tone="ok">10 ms</Txt>
        <Txt x={W - 20} y={222} k="d" anchor="end" tone="bad" opacity={0.5}>3,500 ms</Txt>
        <Readout narrow={narrow} l={["better a fast error than a slow error", "threads free · the bank gets time to recover"]} tone="ok" />
      </g>
    );
  }
  const yes = ["timeouts", "5xx errors", narrow ? "conn refused" : "connection refused"];
  const no = ["4xx errors", narrow ? "\"insufficient\"" : "\"insufficient funds\"", narrow ? "card declined" : "\"card declined\""];
  return (
    <g>
      <Kick s="what counts as a failure?" />
      <Txt x={20} y={64} k="k" anchor="start" tone="bad">counts</Txt>
      <Txt x={308} y={64} k="k" anchor="start" tone="ok">doesn&apos;t count</Txt>
      {yes.map((y, i) => (
        <g key={y} opacity={fade(t, i * 0.1)}>
          <Box x={20} y={76 + i * 52} w={272} h={42} label={y} tone="bad" />
        </g>
      ))}
      {no.map((y, i) => (
        <g key={y} opacity={fade(t, 0.3 + i * 0.1)}>
          <Box x={308} y={76 + i * 52} w={272} h={42} label={y} tone="ok" />
        </g>
      ))}
      <Readout narrow={narrow} l={["a declined payment means the service worked", "count business rejections and it opens for nothing"]} n={["a decline means it worked", "don't count rejections"]} />
    </g>
  );
}

function Math_({ step, t, narrow }: SceneProps) {
  const p = ease(seg(t, 0.1, 0.9));
  if (step < 2) {
    const cb = step === 1;
    return (
      <g>
        <Kick s={cb ? "with a circuit breaker" : "10-minute outage, 1,000 attempts"} tone={cb ? "ok" : "bad"} />
        <Txt x={20} y={70} k="s" anchor="start">{narrow ? "no breaker: 1,000 × 3.5 s" : "without: every attempt waits 3.5 s · 1,000 × 3.5 s"}</Txt>
        <Meter x={20} y={78} w={560} h={20} value={cb ? 3500 : 3500 * p} max={3500} tone="bad" />
        <Txt x={W - 20} y={126} anchor="end" tone="bad">3,500 s</Txt>
        <g opacity={cb ? 1 : 0.25}>
          <Txt x={20} y={162} k="s" anchor="start">{narrow ? "5 × 3.5 s + 995 × 10 ms" : "with: 5 slow failures × 3.5 s + ~995 fast ones × 10 ms"}</Txt>
          <Meter x={20} y={170} w={560} h={20} value={cb ? 27.5 * p : 0} max={3500} tone="ok" />
          <Txt x={W - 20} y={218} anchor="end" tone="ok">{cb ? "17.5 s + ~10 s" : "?"}</Txt>
        </g>
        <Readout
          narrow={narrow}
          l={cb ? ["the bank sees ~20 probes, one every 30 s", "the breaker didn't prevent failures, it cut their impact"] : ["users staring at a spinner", "and threads blocked the whole time"]}
          n={cb ? ["~20 probes reach the bank", "less impact, same outage"] : undefined}
          tone={cb ? "ok" : "bad"}
        />
      </g>
    );
  }
  const fb: [string, string, Tone][] = [["Fraud check", narrow ? "risk 0.5" : "medium risk 0.5", "ok"], ["Recommendations", "popular items", "ok"], ["Payment", narrow ? "no fallback" : "no fake payment", "bad"], ["Auth", narrow ? "no fallback" : "no fake login", "bad"]];
  return (
    <g>
      <Kick s="circuit open: fall back?" />
      {fb.map(([l, s, tone], i) => (
        <g key={l} opacity={fade(t, i * 0.12)}>
          <Box x={20 + (i % 2) * 284} y={56 + Math.floor(i / 2) * 76} w={272} h={60} label={l} sub={s} tone={tone} />
        </g>
      ))}
      <Readout narrow={narrow} l={["is a degraded experience better than none?", "tag it \"fallback\" so later code can add limits"]} n={["degraded better than none?", "tag every fallback"]} />
    </g>
  );
}

const TX = [30, 180, 330, 580];

function Harms({ step, t, narrow }: SceneProps) {
  const p = ease(seg(t, 0.1, 0.9));
  const k = Math.min(step, 3);
  if (k === 0) {
    return (
      <g>
        <Kick s="harm 1 · opening on a load spike" tone="bad" />
        {[["normal: 100 req/s", 0.05, "ok"], ["Black Friday: 10,000 req/s", 5, "bad"]].map(([l, f, tone], i) => (
          <g key={l as string}>
            <Txt x={20} y={70 + i * 70} k="s" anchor="start">{`${l} · 0.05% fail`}</Txt>
            <Meter x={20} y={78 + i * 70} w={560} h={18} value={(f as number) * p} max={6} tone={tone as Tone} />
            <Txt x={20} y={116 + i * 70} k="s" anchor="start" tone={tone as Tone}>{i ? "5 failures/s: OPENS" : "≈3 failures/min"}</Txt>
          </g>
        ))}
        <Wire d="M487 64V170" tone="lit" dash />
        <Txt x={487} y={56} k="s" tone="lit">{narrow ? "5" : "threshold 5"}</Txt>
        <Readout narrow={narrow} l={["count can't tell 5 of 100 from 5 of 10,000", "fix: rate · open at 50%, after 100 calls"]} n={["fix: rate, not count", "50% after 100 calls"]} tone="ok" />
      </g>
    );
  }
  if (k === 1) {
    const bars: [string, number, Tone][] = [["C", 1000, "ok"], ["C", 1000, "ok"], ["O", 0, "bad"], ["O", 0, "bad"], ["H", 1, "warn"], ["C", 5000, "bad"], ["O", 0, "bad"]];
    return (
      <g>
        <Kick s="harm 2 · thundering herd on recovery" tone="bad" />
        {bars.map(([s, v, tone], i) => {
          const h = Math.max(2, (v / 5000) * 170 * (i === 5 ? p : 1));
          return (
            <g key={i}>
              <rect className={`ax-fill ${tone}`} x={30 + i * 78} y={228 - h} width={50} height={h} />
              <Txt x={55 + i * 78} y={250} k="s">{s}</Txt>
            </g>
          );
        })}
        <Txt x={W - 20} y={50} k="s" anchor="end" tone="bad">{narrow ? "5000 req/s" : "5000 req/s of backed-up demand"}</Txt>
        <Readout narrow={narrow} l={["C closed · O open · H half-open: repeats forever", "fix: gradual ramp-up of allowed traffic"]} n={["closes, floods, re-opens", "fix: gradual ramp-up"]} tone="ok" />
      </g>
    );
  }
  if (k === 2) {
    return (
      <g>
        <Kick s="harm 3 · inconsistent state" tone="bad" />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <Wire d={`M192 ${80 + i * 64}H260V140H420`} arrow tone={i ? "bad" : "mute"} />
            <Box x={20} y={58 + i * 64} w={110} h={44} label={`Server ${i + 1}`} />
            <Box x={130} y={58 + i * 64} w={62} h={44} label={i ? "C" : "O"} tone={i ? "ok" : "bad"} />
          </g>
        ))}
        <Box x={420} y={112} w={160} h={56} label="Bank API" sub="broken" tone="bad" />
        <g opacity={fade(t, 0.4)}>
          <Box x={300} y={212} w={280} h={40} label={narrow ? "shared: Redis" : "shared state in Redis"} tone="sky" />
        </g>
        <Readout narrow={narrow} l={["only Server 1 protects itself", "local is fastest · shared agrees · hybrid syncs"]} n={["only server 1 is protected", "share state in Redis"]} tone="bad" />
      </g>
    );
  }
  const tl: [string, string, Tone][] = [["10:00", "bad deploy", "bad"], ["10:01", narrow ? "opens" : "opens, errors drop", "warn"], ["11:15", narrow ? "looked at" : "someone looks", "mute"], ["11:25", "recovered", "ok"]];
  return (
    <g>
      <Kick s="harm 4 · hiding real problems" tone="bad" />
      <Wire d="M20 120H580" />
      {tl.map(([tm, l, tone], i) => (
        <g key={tm} opacity={fade(t, i * 0.15)}>
          <line className="ax-wire" x1={TX[i]} x2={TX[i]} y1={110} y2={130} />
          <Txt x={TX[i]} y={98} k="s" anchor={i === 3 ? "end" : "start"}>{tm}</Txt>
          <Txt x={TX[i]} y={154} k="s" anchor={i === 3 ? "end" : "start"} tone={tone}>{l}</Txt>
        </g>
      ))}
      <Txt x={20} y={214} k="d" anchor="start" tone="bad">1 h 15 min</Txt>
      {!narrow && <Txt x={250} y={214} anchor="start">to detection</Txt>}
      <Readout narrow={narrow} l={["the error rate drops because calls are prevented", "fix: alert when a circuit opens · always investigate"]} n={["error rate drops: alert clears", "fix: alert on state changes"]} tone="ok" />
    </g>
  );
}

function Together({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    const p3: [string, string, string][] = [["Retry", "transient", "backoff + jitter"], ["Breaker", "persistent", "stop calling"], ["Bulkhead", "isolate", "pool per dep"]];
    return (
      <g>
        <Kick s="retry vs breaker vs bulkhead" />
        {p3.map(([l, s, h], i) => (
          <g key={l} opacity={fade(t, i * 0.2)}>
            <Box x={20 + i * 194} y={64} w={172} h={70} label={l} sub={s} tone={i === 1 ? "lit" : "sky"} />
            {!narrow && <Txt x={106 + i * 194} y={160} k="s">{h}</Txt>}
          </g>
        ))}
        <Readout narrow={narrow} l={["100 clients × 3 retries = up to 400 requests", "they're layers of defense, not alternatives"]} n={["retries amplify load", "layers, not alternatives"]} />
      </g>
    );
  }
  if (step === 1) {
    const ch: [string, string][] = [["Idem.", "day 2"], ["Breaker", "day 3"], ["Bulkhead", "slot"], ["Timeout", "day 1"]];
    return (
      <g>
        <Kick s="the order matters" />
        {ch.map(([l, s], i) => (
          <g key={l} opacity={fade(t, i * 0.15)}>
            {i > 0 && <Wire d={`M${i * 146 - 6} 110H${20 + i * 146}`} arrow tone="lit" />}
            <Box x={20 + i * 146} y={80} w={120} h={60} label={l} sub={s} tone={i === 1 ? "lit" : undefined} />
          </g>
        ))}
        <Txt x={20} y={190} k="s" anchor="start">{narrow ? "breaker first: cheapest" : "breaker first: cheapest check, just reads state"}</Txt>
        <Txt x={20} y={216} k="s" anchor="start">{narrow ? "then a slot, retry inside" : "then a bulkhead slot · retry within it, each retry updates the breaker"}</Txt>
        <Readout narrow={narrow} l={["Pay → idempotency → breaker → request with timeout", "→ record the result"]} n={["idempotency → breaker", "→ timeout → record"]} />
      </g>
    );
  }
  const a = ["failure rate, not count", "don't count \"card declined\"", "backup payment processor", "\"try again in 60 seconds\""];
  return (
    <g>
      <Kick s="if it opens on black friday" tone="ok" />
      {a.map((x, i) => (
        <g key={x} opacity={fade(t, i * 0.15)}>
          <Box x={20} y={50 + i * 50} w={W - 40} h={40} label={`${i + 1} · ${x}`} tone="ok" />
        </g>
      ))}
      <Readout narrow={narrow} l={["", "save the cart · offer an alternative payment"]} n={["", "save cart · alternative"]} />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "math") return <Math_ {...p} />;
  if (p.variant === "harms") return <Harms {...p} />;
  if (p.variant === "together") return <Together {...p} />;
  return <Problem {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "problem",
      label: "Why",
      steps: [
        { caption: "Black Friday, 10:00 AM: the bank fails half its calls. Each request waits 3.5 s, retries, waits again, then fails; threads block and retries hammer the bank.", tween: 1600, ms: 3600 },
        { caption: "When a service is clearly failing, stop calling it. The user gets an error in 10 ms instead of 3,500 ms, and the bank gets room to recover.", tween: 1200 },
        { caption: "Timeouts, 5xx errors and refused connections count as failures. 4xx errors and business rejections like insufficient funds don't: the service worked.", tween: 1400 },
      ],
    },
    {
      id: "math",
      label: "The math",
      steps: [
        { caption: "A 10-minute outage at 100 payment attempts a minute: without a breaker, 1,000 attempts × 3.5 s is 3,500 seconds of spinners and blocked threads.", tween: 1400 },
        { caption: "With one, only 5 attempts wait 3.5 s, about 17.5 s; the other ~995 fail in 10 ms. The bank sees about 20 probes. Failures still happen; their impact shrinks.", tween: 1400, ms: 3600 },
        { caption: "When open, fall back where a degraded answer beats none: a 0.5 fraud score, popular items. Never for payments or login, which can't be faked.", tween: 1400 },
      ],
    },
    {
      id: "harms",
      label: "When it harms",
      steps: [
        { caption: "On Black Friday, 10,000 req/s at the same 0.05% gives 5 failures a second, and a 5-failure breaker opens on healthy traffic. Use a rate: 50% after 100 calls.", tween: 1400, ms: 3600 },
        { caption: "On recovery, one probe closes the breaker and 5,000 req/s of backed-up demand crash the bank again: open, half-open, closed, open, forever. Ramp traffic up gradually.", tween: 1400, ms: 3600 },
        { caption: "Breakers kept in memory disagree: Server 1 is open while Servers 2 and 3 still hammer the bank. Share state in Redis, or sync local state.", tween: 1400 },
        { caption: "Open breakers hide problems: errors drop, the alert clears, and a bad deploy at 10:00 went unnoticed until 11:15. Alert whenever a circuit opens.", tween: 1400 },
      ],
    },
    {
      id: "together",
      label: "Together",
      steps: [
        { caption: "Retry handles transient failures, a circuit breaker persistent ones, a bulkhead isolates one slow dependency. Retries amplify load: 100 clients can become 400 requests.", tween: 1400, ms: 3600 },
        { caption: "In production they layer: idempotency check, then the breaker (the cheapest check), then a bulkhead slot, then the request with its timeout and retries.", tween: 1400 },
        { caption: "If it opens on Black Friday: use failure rate, don't count declines, try a backup processor, and tell users to try again in 60 seconds with their cart saved.", tween: 1400, ms: 3600 },
      ],
    },
  ],
  Scene,
});
