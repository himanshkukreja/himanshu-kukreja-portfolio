/**
 * Week 10 preview overview: the whole final week in three tabs. From designing systems to
 * operating them (the junior → mid → senior ladder); the five days under a shared day track
 * (metric → SLI → SLO → SLA → 43.2-minute error budget, metrics/logs/traces, a 1% → 100% canary,
 * the headroom table with Elasticsearch as the 2x bottleneck, the incident lifecycle); and the
 * real-time bidding capstone and the production mindset.
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const DAYS = ["D1", "D2", "D3", "D4", "D5", "Cap"];
const DAYN = ["SLOs", "observe", "deploy", "capacity", "incidents", "capstone"];

function Track({ on, narrow }: { on: number; narrow: boolean }) {
  return (
    <g>
      {DAYS.map((d, i) => (
        <g key={d}>
          <rect className={`ax-box ${i === on ? "lit" : i < on ? "ok" : ""}`} x={20 + i * 95} y={14} width={85} height={30} />
          <Txt x={62 + i * 95} y={34} k="s" tone={i === on ? "lit" : i < on ? undefined : "mute"}>
            {narrow ? d : DAYN[i]}
          </Txt>
        </g>
      ))}
    </g>
  );
}

/* ---------------------------------------------------------------- the shift */

function Shift({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.14, i * 0.14 + 0.3);
  if (step === 0) {
    const qs = ["How do you know it's working?", "How do you deploy without breaking things?", "How do you handle 10x traffic?", "What happens when it breaks at 3am?", "How do you stop it breaking again?"];
    const qn = ["is it working?", "deploy safely?", "10x traffic?", "3am breakage?", "never again?"];
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          {narrow ? "weeks 1–9 built it" : "weeks 1–9: you designed systems · week 10: you operate them"}
        </Txt>
        {qs.map((q, i) => (
          <g key={q} opacity={o(i)}>
            <Txt x={30} y={76 + i * 46} k="d" anchor="start" tone="lit">
              ?
            </Txt>
            <Txt x={64} y={72 + i * 46} k="t" anchor="start">
              {narrow ? qn[i] : q}
            </Txt>
          </g>
        ))}
      </g>
    );
  }
  const ladder: [string, string, string, Tone][] = [
    ["Junior", "it works on my machine", "my machine", "bad"],
    ["Mid", "it passed the tests", "tests pass", "warn"],
    ["Senior", "operate · debug · know it's healthy · have a plan", "operate · debug · plan", "ok"],
  ];
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        {'"I built it, and…"'}
      </Txt>
      {ladder.map(([a, b, c, tone], i) => (
        <g key={a} opacity={o(i * 1.5)}>
          <Box x={20 + i * 60} y={56 + i * 74} w={560 - i * 60} h={60} label={a} sub={narrow ? c : b} tone={tone} />
        </g>
      ))}
    </g>
  );
}

/* ---------------------------------------------------------------- the week */

function Week({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.14, i * 0.14 + 0.3);
  const k = ease(seg(t, 0.1, 0.9));
  const notes: [string, string][] = [
    ["0.1% of 43,200 min = 43.2 min, then fix reliability", "43.2 min of budget"],
    ["one trace ID ties the spans, metrics and logs together", "trace_id: abc-123"],
    ["if unhealthy: automatic rollback to v1.2.3", "unhealthy → roll back"],
    ["at 2x traffic, Elasticsearch breaks first", "ES is the 2x bottleneck"],
    ["mitigate first: restore service, then find the root cause", "restore first"],
  ];
  return (
    <g>
      <Track on={step} narrow={narrow} />
      {step === 0 &&
        ["metric", "SLI", "SLO", "SLA", "budget"].map((s, i) => (
          <g key={s} opacity={o(i)}>
            <Box x={20 + i * 115} y={80} w={105} h={60} label={s} sub={narrow ? undefined : ["latency", "measure", "target", "promise", "43.2 min"][i]} tone={i === 4 ? "lit" : i === 2 ? "ok" : undefined} />
            {i < 4 && <Wire d={`M${125 + i * 115} 110H${135 + i * 115}`} arrow />}
          </g>
        ))}
      {step === 0 && (
        <Txt x={300} y={186} k="t" tone="ok" opacity={o(5)}>
          {narrow ? "p99 < 200 ms, 99.9%" : "SLO: p99 < 200 ms in 99.9% of windows, 30 days"}
        </Txt>
      )}
      {step === 1 && (
        <g>
          {["Gateway", "User svc", "Postgres"].map((s, i) => (
            <Box key={s} x={20 + i * 200} y={64} w={160} h={50} label={s} />
          ))}
          <Wire d="M180 89H220" arrow />
          <Wire d="M380 89H420" arrow />
          <rect className="ax-fill lit" x={100} y={136} width={lerp(0, 300, k)} height={16} />
          <Txt x={100} y={130} k="s" anchor="start">
            span 45 ms
          </Txt>
          <rect className="ax-fill sky" x={300} y={176} width={lerp(0, 120, k)} height={16} />
          <Txt x={300} y={170} k="s" anchor="start">
            span 12 ms
          </Txt>
          {["metrics", "logs", "traces"].map((s, i) => (
            <Box key={s} x={20 + i * 200} y={210} w={160} h={40} label={s} tone="ok" opacity={o(i + 3)} />
          ))}
        </g>
      )}
      {step === 2 && (
        <g>
          {[1, 10, 50, 100].map((p, i) => (
            <g key={p} opacity={o(i)}>
              <Txt x={60 + i * 160} y={100} k="d" tone={i === 3 ? "ok" : "lit"}>
                {`${p}%`}
              </Txt>
              {i < 3 && <Wire d={`M${110 + i * 160} 90H${170 + i * 160}`} tone="lit" arrow />}
            </g>
          ))}
          <Txt x={60} y={134} k="s" opacity={o(0)}>
            v1.2.4
          </Txt>
          <Meter x={60} y={170} w={480} h={20} value={[1, 10, 50, 100][Math.min(3, Math.floor(k * 4))]} max={100} tone="ok" />
          <Txt x={300} y={224} k="s" opacity={o(4)}>
            {narrow ? "15 min · error, latency" : "watch error rate, latency and business metrics vs baseline"}
          </Txt>
        </g>
      )}
      {step === 3 &&
        [
          ["API", 400, 600],
          ["PostgreSQL", 2000, 3000],
          ["Redis", 50, 100],
          ["Elasticsearch", 200, 400],
        ].map(([n, v, m], i) => {
          const twice = t > 0.6;
          const load = twice ? (v as number) * 2 : (v as number);
          const verdict: Tone = ["ok", "warn", "ok", "bad"][i] as Tone;
          return (
            <g key={n as string}>
              <Txt x={20} y={84 + i * 44} k="t" anchor="start">
                {narrow && n === "Elasticsearch" ? "ES" : narrow && n === "PostgreSQL" ? "PG" : (n as string)}
              </Txt>
              <Meter x={170} y={70 + i * 44} w={300} h={18} value={Math.min(load, m as number)} max={m as number} tone={twice ? verdict : "ok"} />
              <Txt x={580} y={84 + i * 44} k="s" anchor="end" tone={twice ? verdict : undefined}>
                {twice ? (n === "Elasticsearch" ? "BOTTLENECK" : n === "API" ? "scale out" : n === "Redis" ? "add memory" : "replicas") : `${Math.round((1 - (v as number) / (m as number)) * 100)}% free`}
              </Txt>
            </g>
          );
        })}
      {step === 4 &&
        ["detect", "triage", "declare", "mitigate", "resolve", "postmortem"].map((s, i) => (
          <g key={s} opacity={o(i)}>
            <Box x={20 + (i % 3) * 190} y={64 + Math.floor(i / 3) * 84} w={180} h={64} label={s} sub={narrow ? undefined : ["error > 5%, 5 min", "5 minutes", "SEV1 · roles", "restore service", "root cause fixed", "within 48 hours"][i]} tone={i === 3 ? "lit" : i === 5 ? "ok" : undefined} />
          </g>
        ))}
      <Txt x={20} y={H - 16} anchor="start" tone="ok">
        {notes[step][narrow ? 1 : 0]}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- capstone */

function Capstone({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.14, i * 0.14 + 0.3);
  return (
    <g>
      <Track on={5} narrow={narrow} />
      {step === 0 && (
        <g>
          <Box x={20} y={64} w={160} h={60} label={narrow ? "request" : "bid request"} />
          <Box x={220} y={64} w={160} h={60} label="auction" sub={narrow ? undefined : "query DSPs"} tone="lit" />
          <Box x={420} y={64} w={160} h={60} label="winner" tone="ok" />
          <Wire d="M180 94H220" arrow />
          <Wire d="M380 94H420" arrow />
          <Token x={lerp(180, 420, ease(t))} y={94} s={11} tone="lit" />
          {["budget: never overspend", "fraud detection", "audit trail for billing"].map((s, i) => (
            <Txt key={s} x={30} y={170 + i * 30} k="t" anchor="start" tone="warn" opacity={o(i + 2)}>
              {narrow ? s.split(":")[0].split(" for")[0] : s}
            </Txt>
          ))}
        </g>
      )}
      {step === 1 &&
        [
          ["10B", "ad requests / day"],
          ["500K", "requests / s peak"],
          ["100 ms", "p99, end to end"],
          ["99.99%", "availability"],
        ].map(([a, b], i) => (
          <g key={b} opacity={o(i)}>
            <Txt x={160 + (i % 2) * 280} y={110 + Math.floor(i / 2) * 100} k="d">
              {a}
            </Txt>
            <Txt x={160 + (i % 2) * 280} y={136 + Math.floor(i / 2) * 100} k="s">
              {b}
            </Txt>
          </g>
        ))}
      {step === 2 && (
        <g>
          <Box x={150} y={58} w={300} h={44} label={narrow ? "build it so that…" : "How do I build this SO THAT…"} tone="lit" />
          {[
            ["tell", "when healthy"],
            ["deploy", "safely, any time"],
            ["scale", "without panic"],
            ["fix", "without panic"],
          ].map(([a, b], i) => (
            <g key={a} opacity={o(i)}>
              <Wire d={`M300 102L${92 + i * 140} 150`} />
              <Box x={20 + i * 140} y={150} w={132} h={70} label={a} sub={narrow ? undefined : b} tone="ok" />
            </g>
          ))}
        </g>
      )}
      <Txt x={20} y={H - 16} anchor="start">
        {[narrow ? "real-time bidding, 6 continents" : "design a real-time bidding platform across 6 continents", narrow ? "think like an SRE" : "think like an SRE: design for operability, not just function", narrow ? "senior vs junior" : "this is what separates senior from junior engineers"][step]}
      </Txt>
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "week") return <Week {...p} />;
  if (p.variant === "capstone") return <Capstone {...p} />;
  return <Shift {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "shift",
      label: "The shift",
      steps: [
        { caption: "For nine weeks you designed systems. Now you run them: how do you know it's working, deploy without breaking it, handle 10x traffic, and survive 3am?", tween: 1600, ms: 3600 },
        { caption: "A junior says it works on my machine; a mid-level engineer, it passed the tests. A senior can operate it, debug it, knows when it's healthy, and has a plan for when it breaks.", tween: 1600, ms: 3800 },
      ],
    },
    {
      id: "week",
      label: "The week",
      steps: [
        { caption: "Day 1: a metric becomes an SLI, an SLO target, an SLA promise, and an error budget: 0.1 percent of a 30-day month is 43.2 minutes.", tween: 1600, ms: 3400 },
        { caption: "Day 2, observability: metrics, logs and traces. One trace ID follows the request through a 45 millisecond gateway span and a 12 millisecond database span.", tween: 1600, ms: 3400 },
        { caption: "Day 3, deployment: a canary takes 1 percent of traffic, then 10, 50 and 100, watched against the baseline, with automatic rollback if it's unhealthy.", tween: 2000, ms: 3400 },
        { caption: "Day 4, capacity: API and PostgreSQL have 33 percent headroom, Redis and Elasticsearch 50. At twice the traffic, Elasticsearch is the bottleneck.", tween: 1600, ms: 3600 },
        { caption: "Day 5, incidents: detect, triage, declare with roles, mitigate to restore service, resolve, and a blameless postmortem within 48 hours.", tween: 1600, ms: 3400 },
      ],
    },
    {
      id: "capstone",
      label: "Capstone",
      steps: [
        { caption: "The final interview is a real-time bidding platform: take a bid request, query the bidders, run the auction, return the winner, without overspending budgets, with fraud checks and an audit trail.", tween: 1400, ms: 3800 },
        { caption: "10 billion ad requests a day, 500,000 a second at peak, 100 milliseconds end to end at p99, and 99.99 percent availability.", tween: 1400, ms: 3400 },
        { caption: "The production mindset: build it so that you can tell when it's healthy, deploy safely at any time, and scale it or fix it without panic.", tween: 1400, ms: 3400 },
      ],
    },
  ],
  Scene,
});
