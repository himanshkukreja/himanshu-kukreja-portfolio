/**
 * The whole lesson, week 2 day 1 (Timeout Hell): why a silent call is the killer and slow is worse
 * than down; percentiles and the P99 × 2–3 rule; budgets, deadline propagation and adaptive
 * timeouts; and how one slow dependency cascades, the "bank is slow today" scenario and its fixes.
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

/** Your service → downstream, with a thread meter under the service */
function Stage({ ds, dsSub, dsTone, threads, tone, narrow, label = "Your service" }: { ds: string; dsSub?: string; dsTone?: Tone; threads: number; tone?: Tone; narrow: boolean; label?: string }) {
  return (
    <g>
      <Wire d="M170 92H410" arrow />
      <Box x={20} y={56} w={150} h={72} label={narrow && label === "Your service" ? "Service" : label} tone={tone} />
      <Meter x={32} y={108} w={126} h={10} value={threads} max={100} ticks={10} tone={threads > 80 ? "bad" : "ok"} />
      <Box x={410} y={64} w={170} h={56} label={ds} sub={dsSub} tone={dsTone} />
    </g>
  );
}

function Why({ step, t, narrow }: SceneProps) {
  const p = ease(seg(t, 0.1, 0.9));
  if (step === 0) {
    const cases: [string, Tone][] = [["1 · fast success", "ok"], ["2 · slow success?", "warn"], ["3 · clear error", "sky"], ["4 · nothing at all", "bad"]];
    return (
      <g>
        <Kick s="four outcomes of one call" />
        <Stage narrow={narrow} ds="Downstream" dsSub="?" threads={10} />
        <Token x={lerp(170, 290, p)} y={92} tone="warn" label={p > 0.9 ? "no response yet" : undefined} />
        {cases.map(([c, tone], i) => (
          <g key={c} opacity={fade(t, i * 0.12)}>
            <Box x={20 + (i % 2) * 284} y={150 + Math.floor(i / 2) * 50} w={272} h={40} label={c} tone={tone} />
          </g>
        ))}
        <Readout narrow={narrow} l={["case 4: slow? dead? request lost? response lost?", "you can't tell the difference"]} n={["case 4: slow? dead? lost?", "you can't tell the difference"]} tone="bad" />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Kick s="the real danger: threads" tone="bad" />
        <Stage narrow={narrow} ds="Downstream" dsSub={narrow ? "10 s" : "responds in 10 s"} dsTone="bad" threads={lerp(10, 100, p)} tone="bad" />
        <Txt x={20} y={164} k="s" anchor="start">{narrow ? "normal: 100 ms" : "normal day: 100 ms per call · 100 threads"}</Txt>
        <Meter x={20} y={172} w={400} h={16} value={10} max={100} ticks={10} tone="ok" />
        <Txt x={W - 20} y={186} anchor="end" tone="ok">1,000 req/s</Txt>
        <Txt x={20} y={220} k="s" anchor="start">{narrow ? "bad day: 10 s" : "bad day: 10 s per call · all 100 waiting"}</Txt>
        <Meter x={20} y={228} w={400} h={16} value={100 * p} max={100} ticks={10} tone="bad" />
        <Txt x={W - 20} y={242} anchor="end" tone="bad">10 req/s</Txt>
        <Readout narrow={narrow} l={["queue fills · your service rejects everything", "a slow downstream makes YOU look dead"]} tone="bad" />
      </g>
    );
  }
  return (
    <g>
      <Kick s="the golden rule" />
      <Box x={20} y={60} w={272} h={64} label="down" sub={narrow ? "error now · plan B" : "error at once · plan B · free"} tone="ok" />
      <Box x={308} y={60} w={272} h={64} label="slow" sub={narrow ? "threads stuck" : "threads stuck · slowly drowning"} tone="bad" />
      <g opacity={fade(t, 0.3)}>
        <Wire d="M444 124V170H156V130" tone="lit" arrow />
        <Txt x={300} y={194} tone="lit">{narrow ? "timeout: slow → down" : "a timeout converts slow into down"}</Txt>
      </g>
      <Readout narrow={narrow} l={["\"A service that's slow is worse than one that's down\"", "you get an error, fall back, and threads aren't blocked"]} n={["slow is worse than down", "a timeout turns slow into down"]} />
    </g>
  );
}

function Numbers({ step, t, narrow }: SceneProps) {
  const p = ease(seg(t, 0.1, 0.9));
  if (step === 0) {
    const rows = [["50 ms", 950], ["200 ms", 40], ["500 ms", 9], ["5000 ms", 1]] as const;
    const stats = narrow ? ["avg ~65", "P99 500", "P99.9 5000"] : ["avg ~65 ms", "P50 50", "P95 200", "P99 500", "P99.9 5000"];
    return (
      <g>
        <Kick s="percentiles matter, averages lie" />
        <Txt x={20} y={54} k="s" anchor="start">{narrow ? "1000 calls to A" : "Service A · 1000 requests · a long tail"}</Txt>
        {rows.map(([ms, n], i) => (
          <g key={ms}>
            <Txt x={20} y={84 + i * 34} k="s" anchor="start">{ms}</Txt>
            <Meter x={110} y={72 + i * 34} w={360} h={16} value={Math.max(n * p, 6 * p)} max={950} tone={i === 3 ? "bad" : i ? "warn" : "ok"} />
            <Txt x={W - 20} y={86 + i * 34} anchor="end">{`${n}`}</Txt>
          </g>
        ))}
        {stats.map((s, i) => (
          <Txt key={s} x={20 + (i * (W - 40)) / stats.length} y={226} k="s" anchor="start" tone={s.startsWith("P99 ") ? "lit" : undefined}>{s}</Txt>
        ))}
        <Readout narrow={narrow} l={["timeout = average: 5% of healthy calls time out", "timeout = P99: 1% · P99.9: threads wait 5 s"]} n={["average: 5% healthy calls fail", "P99: 1% · P99.9: 5 s waits"]} />
      </g>
    );
  }
  const segs = [["connect", 100], ["send", 40], ["wait", 230], ["read", 130]] as const;
  let x = 40;
  return (
    <g>
      <Kick s="fixed timeout · two timeouts" />
      <Box x={20} y={50} w={200} h={52} label="P99 200 ms" sub={narrow ? undefined : "measured"} />
      <Wire d="M220 76H380" arrow tone="lit" />
      <Txt x={300} y={68} k="s" tone="lit">× 2 to 3</Txt>
      <Box x={380} y={50} w={200} h={52} label="400–600 ms" sub={narrow ? undefined : "timeout"} tone="ok" />
      <g opacity={fade(t, 0.3)}>
        {segs.map(([s, w]) => {
          const x0 = x;
          x += w;
          return <Box key={s} x={x0} y={150} w={w} h={36} label={s === "send" ? "" : s} tone={s === "connect" ? "sky" : s === "send" ? undefined : "lit"} />;
        })}
        <Wire d="M40 200V210H140V200" tone="ok" />
        <Txt x={40} y={232} k="s" anchor="start" tone="sky">{narrow ? "connect: 1–5 s" : "connect timeout: short, 1–5 s"}</Txt>
        <Wire d="M180 200V210H540V200" tone="ok" />
        <Txt x={540} y={232} k="s" anchor="end" tone="lit">{narrow ? "read: per job" : "read timeout: depends on the work"}</Txt>
      </g>
      <Readout narrow={narrow} l={["simple, predictable · doesn't adapt to changes", "timeout=(3.0, 30.0): short connect, longer read"]} n={["simple, but doesn't adapt", "short connect, longer read"]} />
    </g>
  );
}

function Strategies({ step, t, narrow }: SceneProps) {
  const p = ease(seg(t, 0.1, 0.9));
  if (step === 0) {
    const deps = [["Fraud check", "600 ms", 600], ["Bank API", "3,500 ms", 3500], ["Notification", "300 ms", 300]] as const;
    let x = 20;
    return (
      <g>
        <Kick s="strategy · timeout budget" />
        <Box x={20} y={80} w={140} h={60} label={narrow ? "Payment" : "Payment svc"} tone="lit" />
        {deps.map(([l, ms], i) => (
          <g key={l}>
            <Wire d={`M160 110H200V${72 + i * 50}H300`} arrow />
            <Box x={300} y={52 + i * 50} w={280} h={40} label={narrow ? `${l.split(" ")[0]} ${ms}` : `${l} · ${ms}`} />
          </g>
        ))}
        {deps.map(([l, , ms], i) => {
          const w = (ms / 5000) * 560 * p;
          const x0 = x;
          x += w;
          return <rect key={l} className={`ax-fill ${i === 1 ? "" : "sky"}`} x={x0} y={222} width={Math.max(0, w - 2)} height={18} />;
        })}
        <rect className="ax-meter" x={20} y={222} width={560} height={18} />
        <Txt x={W - 20} y={214} k="s" anchor="end">{narrow ? "4,400 of 5 s" : "4,400 ms worst case · 5 s SLA · 500 ms buffer"}</Txt>
        <Readout narrow={narrow} l={["4.5 s budget · fast service gets less time", "each call checks the remaining budget"]} n={["4.5 s budget", "each call checks what's left"]} />
      </g>
    );
  }
  if (step === 1) {
    const hop = [["User", narrow ? ":05.000" : "deadline :05.000"], ["Gateway", "passes it"], ["Payment", narrow ? "3 s left" : "now :02, 3 s"], ["Bank", narrow ? "2.5 s" : "timeout 2.5 s"]];
    return (
      <g>
        <Kick s="strategy · deadline propagation" />
        {hop.map(([l, s], i) => (
          <g key={l}>
            {i > 0 && <Wire d={`M${i * 148 - 18} 98H${20 + i * 148}`} arrow tone="lit" />}
            <Box x={20 + i * 148} y={70} w={130} h={56} label={l} sub={s} tone={i === 3 ? "ok" : undefined} />
          </g>
        ))}
        <Token x={lerp(150, 464, p)} y={98} label={narrow ? undefined : "10:00:05.000"} opacity={p < 1 ? 1 : 0} />
        <g opacity={fade(t, 0.4)}>
          <Box x={20} y={160} w={272} h={56} label={narrow ? "5 s per hop" : "without: 5 s per hop"} sub={narrow ? "8 s total" : "could take 8 s"} tone="bad" />
          <Box x={308} y={160} w={272} h={56} label={narrow ? "pass the deadline" : "with: pass the deadline"} sub={narrow ? "keep 500 ms" : "keep a 500 ms buffer"} tone="ok" />
        </g>
        <Readout narrow={narrow} l={["the user gave up at 5 s · don't wait past it", "pass the deadline, not a duration"]} />
      </g>
    );
  }
  if (step === 2) {
    const hrs = [["hour 1", 100], ["hour 2", 500], ["hour 3", 80]] as const;
    return (
      <g>
        <Kick s="strategy · adaptive timeouts" />
        {hrs.map(([h, p99], i) => (
          <g key={h} opacity={fade(t, i * 0.2)}>
            <Txt x={20} y={70 + i * 56} k="s" anchor="start">{narrow ? `${h}: ${p99} → ${p99 * 3}` : `${h} · P99 ${p99} ms → timeout ${p99 * 3} ms`}</Txt>
            <Meter x={20} y={78 + i * 56} w={560} h={16} value={p99 * 3} max={1500} tone={i === 1 ? "warn" : "ok"} />
          </g>
        ))}
        <Readout narrow={narrow} l={["timeout = recent P99 × safety factor", "self-tuning · can oscillate · cold start"]} />
      </g>
    );
  }
  return (
    <g>
      <Kick s="the risk: hiding a bug" tone="bad" />
      <Box x={20} y={56} w={272} h={150} tone="ok" />
      <Txt x={36} y={84} k="k" anchor="start" tone="ok">fixed 500 ms</Txt>
      <Txt x={36} y={116} anchor="start">{narrow ? "timeouts fire" : "timeouts, alert fires"}</Txt>
      <Txt x={36} y={180} k="d" anchor="start" tone="ok">30 min</Txt>
      <Box x={308} y={56} w={272} h={150} tone="bad" />
      <Txt x={324} y={84} k="k" anchor="start" tone="bad">adaptive</Txt>
      <Txt x={324} y={116} anchor="start">{narrow ? "→ 2,000 ms" : "climbs to 2,000 ms"}</Txt>
      <Txt x={324} y={180} k="d" anchor="start" tone="bad" opacity={fade(t, 0.3)}>3 hours</Txt>
      <Readout narrow={narrow} l={["slow requests \"succeed\" · no alert fires", "fix: alert on the timeout value · set a hard max"]} n={["no alert fires", "alert on the value · hard max"]} />
    </g>
  );
}

function Cascades({ step, t, narrow }: SceneProps) {
  const p = ease(seg(t, 0.1, 0.9));
  if (step < 2) {
    const svc = step === 0 ? [["A", 100 * seg(t, 0.5, 1)], ["B", 100 * seg(t, 0.1, 0.5)], ["C", 0]] : [["Fraud", 20], ["Bank", 50], ["Notify", 10]];
    const cap = step === 0 ? [100, 100, 100] : [20, 50, 10];
    const used = step === 0 ? svc.map((s) => s[1] as number) : [4, 50 * p, 2];
    return (
      <g>
        <Kick s={step === 0 ? "how timeouts cause cascades" : "preventing cascades · bulkheads"} tone={step === 0 ? "bad" : "ok"} />
        {svc.map(([l], i) => (
          <g key={l}>
            {i > 0 && <Wire d={`M${i * 195 - 5} 98H${20 + i * 195}`} arrow />}
            <Box x={20 + i * 195} y={70} w={170} h={56} label={l} sub={step === 0 ? (i === 2 ? (narrow ? "50 ms → 10 s" : "P99 50 ms → 10 s") : "100 threads") : `pool ${cap[i]}`} tone={(step === 0 ? i < 2 || i === 2 : i === 1) ? "bad" : "ok"} />
            <Meter x={20 + i * 195} y={140} w={170} h={14} value={used[i]} max={cap[i]} ticks={step === 0 ? 10 : undefined} tone={used[i] >= cap[i] * 0.9 ? "bad" : "ok"} />
          </g>
        ))}
        {step === 0 ? (
          <Txt x={20} y={200} k="s" anchor="start">{narrow ? "s5: B full · s10: all slow" : "second 1: 50 of B's · second 5: all B's · second 10: A, B, C slow"}</Txt>
        ) : (
          <Txt x={20} y={200} k="s" anchor="start">{narrow ? "bank slow: only its 50" : "bank slow: only its 50 threads · fraud, notify still work"}</Txt>
        )}
        <Readout
          narrow={narrow}
          l={step === 0 ? ["the user only called A", "they don't even know C exists"] : ["timeouts · bulkheads · circuit breakers (day 3)", "load shedding: over the limit, return 503 at once"]}
          n={step === 0 ? undefined : ["timeouts, bulkheads, breakers", "shed load: 503 at once"]}
          tone={step === 0 ? "bad" : "ok"}
        />
      </g>
    );
  }
  const good = step === 3;
  const q = good ? 10 : lerp(20, 100, p);
  return (
    <g>
      <Kick s={good ? "what should happen" : "\"bank is slow today\""} tone={good ? "ok" : "bad"} />
      <Stage narrow={narrow} label="Payment" ds="Bank API" dsSub={narrow ? "P99 8 s" : "P99 2 s → 8 s"} dsTone="bad" threads={good ? 10 : lerp(40, 100, p)} tone={good ? "ok" : "bad"} />
      {good && <Box x={250} y={74} w={90} h={36} label="OPEN" tone="bad" />}
      {!good && p < 1 && [0, 1, 2].map((i) => <Token key={i} x={lerp(170, 400, seg(p, i * 0.2, i * 0.2 + 0.6))} y={92} tone="warn" />)}
      <Txt x={20} y={170} k="s" anchor="start">{good ? (narrow ? "queue · empty" : "request queue · stays empty") : narrow ? "queue · 1000" : "request queue · grows to 1000"}</Txt>
      <Meter x={20} y={178} w={560} h={16} value={q} max={100} ticks={10} tone={good ? "ok" : "bad"} />
      <Txt x={20} y={226} k="s" anchor="start" tone={good ? "ok" : "bad"}>
        {good ? (narrow ? "\"bank temporarily unavailable\"" : "fail fast: \"Bank temporarily unavailable\" · threads free") : narrow ? "min 3: 503s · looks down" : "min 1: 80% time out at 3.5 s · min 3: queue full, 503s"}
      </Txt>
      <Readout
        narrow={narrow}
        l={good ? ["5 minutes of \"please try again\"", "vs 15+ minutes of complete outage"] : ["timeout 3.5 s · users retry, making it worse", "min 5: bank recovers · you need 10 more minutes"]}
        tone={good ? "ok" : "bad"}
      />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "numbers") return <Numbers {...p} />;
  if (p.variant === "strategies") return <Strategies {...p} />;
  if (p.variant === "cascades") return <Cascades {...p} />;
  return <Why {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "why",
      label: "Why it's hard",
      steps: [
        { caption: "A call can succeed fast, succeed slowly, fail clearly, or return nothing. Case 4 is the killer: slow, dead, or lost, you can't tell the difference.", tween: 1400, ms: 3600 },
        { caption: "With 100 threads and 100 ms calls you serve 1,000 requests a second. When the downstream takes 10 seconds, you serve 10, and a slow downstream makes you look dead.", tween: 1600, ms: 3600 },
        { caption: "The golden rule: a service that's slow is worse than one that's down. Down gives an error and a Plan B; timeouts convert slow into down.", tween: 1200 },
      ],
    },
    {
      id: "numbers",
      label: "Numbers",
      steps: [
        { caption: "Averages lie: Service A averages about 65 ms, but P99 is 500 ms and P99.9 is 5,000 ms. A timeout at the average kills 5% of healthy requests; at P99, 1%.", tween: 1400, ms: 3800 },
        { caption: "A fixed timeout of P99 × 2 to 3 turns a 200 ms P99 into 400 to 600 ms. Keep the connection timeout short, 1 to 5 seconds, and size the read timeout to the work.", tween: 1400, ms: 3600 },
      ],
    },
    {
      id: "strategies",
      label: "Strategies",
      steps: [
        { caption: "A timeout budget splits the 5 s SLA: 4.5 s for calls, fraud 600 ms, bank 3,500 ms, notification 300 ms, and each call checks what's left.", tween: 1400 },
        { caption: "Deadline propagation passes the user's deadline down the chain. At 10:00:02 Payment knows it has 3 seconds left and gives the bank 2.5 s.", tween: 1600 },
        { caption: "Adaptive timeouts track recent P99 times a safety factor: 100 ms gives 300 ms, a degraded 500 ms gives 1,500 ms, a recovered 80 ms gives 240 ms.", tween: 1400 },
        { caption: "The risk: a bug slows the service and the adaptive timeout climbs to 2,000 ms. No alert fires; found in 3 hours instead of 30 minutes. Alert on the timeout value.", tween: 1200, ms: 3600 },
      ],
    },
    {
      id: "cascades",
      label: "Cascades",
      steps: [
        { caption: "A calls B calls C, each with 100 threads. C slows from 50 ms to 10 s: by second 5 all of B's threads wait on C, and by second 10 A, B and C are all slow.", tween: 1800, ms: 3600 },
        { caption: "Prevent cascades with timeouts, bulkheads and load shedding. With pools of 20, 50 and 10, a slow bank uses only its 50 threads and fraud check still works.", tween: 1400, ms: 3600 },
        { caption: "Bank is slow today: P99 jumps to 8 s against a 3.5 s timeout. 80% of calls time out, users retry, the queue hits 1,000 and you return 503s for 10 more minutes.", tween: 1600, ms: 3800 },
        { caption: "What should happen: a circuit breaker opens and calls fail fast with \"Bank temporarily unavailable\". Five minutes of \"please try again\" instead of a 15-minute outage.", tween: 1200, ms: 3600 },
      ],
    },
  ],
  Scene,
});
