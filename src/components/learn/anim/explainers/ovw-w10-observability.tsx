/**
 * Week 10, day 2 overview (observability): the whole lesson in four tabs. The 3:47 AM alert
 * (availability 98.2%) solved in five minutes from a dashboard, logs, traces, metrics and a 3:40
 * config change; the three pillars (metric types, RED/USE, cardinality; structured logs; a trace's
 * spans) and correlation ("my payment failed": log → trace abc-123 → bank timeout → 47 timeouts);
 * the stack (collect, store, Grafana), layered dashboards and symptom alerts; the debug workflow.
 */
import { Box, defineExplainer, ease, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;

/* ---------------------------------------------------------------- the alert */

function Alert({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.14, i * 0.14 + 0.3);
  if (step === 0) {
    const qs = narrow ? ["which endpoint?", "which users?", "since when?", "what changed?"] : ["Which endpoint is failing?", "Which users are affected?", "When did it start?", "What changed?"];
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start" tone="bad">
          3:47 AM · your phone buzzes
        </Txt>
        <Box x={20} y={44} w={560} h={56} label={narrow ? "SLO: availability 98.2%" : "ALERT: SLO violation · API availability dropped to 98.2%"} tone="bad" />
        {qs.map((q, i) => (
          <Txt key={q} x={narrow ? 20 + (i % 2) * 290 : 40} y={narrow ? 140 + Math.floor(i / 2) * 40 : 136 + i * 34} k="t" anchor="start" opacity={o(i + 1)}>
            {`? ${q}`}
          </Txt>
        ))}
        <Txt x={20} y={H - 16} anchor="start" tone="warn">
          {narrow ? "without it: guessing" : "without observability you're blind: guessing and hoping"}
        </Txt>
      </g>
    );
  }
  if (step === 1) {
    const ev: [string, string, string, Tone][] = [
      ["deploys", "config change", "3:40", "lit"],
      ["metrics", "payment-service-3 CPU 100%", "3:42", "warn"],
      ["traces", "calls to it time out", "", "warn"],
      ["logs", '"Connection refused"', "", "bad"],
      ["dashboard", "/api/payments 5xx", "", "bad"],
    ];
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          with observability
        </Txt>
        {ev.map(([a, b, c, tone], i) => (
          <g key={a} opacity={o(i)}>
            <Txt x={30} y={70 + i * 42} k="k" anchor="start" tone={tone === "lit" ? undefined : "mute"}>
              {a}
            </Txt>
            <Txt x={narrow ? 580 : 150} y={70 + i * 42} k={narrow ? "s" : "t"} anchor={narrow ? "end" : "start"} tone={tone}>
              {narrow ? b.replace("payment-service-3 ", "") : b}
            </Txt>
            {!narrow && (
              <Txt x={580} y={70 + i * 42} k="s" anchor="end">
                {i === 0 ? c : i === 1 ? "since 3:42" : ""}
              </Txt>
            )}
          </g>
        ))}
        <Txt x={20} y={H - 16} anchor="start" tone="ok" opacity={o(5)}>
          {narrow ? "root cause in 5 min · roll back" : "root cause in 5 minutes · roll back the config · done"}
        </Txt>
      </g>
    );
  }
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        you need both
      </Txt>
      <Box x={20} y={56} w={270} h={170} label="Monitoring" sub={narrow ? "known problems" : "known problems · pre-set alerts"} tone="sky" />
      <Box x={310} y={56} w={270} h={170} label="Observability" sub={narrow ? "new questions" : "ask questions you didn't plan"} tone="ok" />
      <Txt x={155} y={196} k="t" tone="sky" opacity={o(2)}>
        WHEN
      </Txt>
      <Txt x={445} y={196} k="t" tone="ok" opacity={o(3)}>
        WHY
      </Txt>
      <Txt x={20} y={H - 16} anchor="start">
        {narrow ? "monitoring: when · observability: why" : "monitoring says when it's wrong; observability helps you see why"}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- pillars */

const SPANS: [string, number, number, number][] = [
  ["api-gateway", 0, 12, 0],
  ["order-service", 12, 150, 0],
  ["payment-service", 30, 120, 1],
  ["bank-api-call", 40, 100, 2],
];

function Pillars({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.14, i * 0.14 + 0.3);
  const k = ease(seg(t, 0.05, 0.8));
  if (step === 0)
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          metrics · aggregated, cheap
        </Txt>
        {[
          ["counter", "only goes up"],
          ["gauge", "up or down"],
          ["histogram", "buckets add up"],
        ].map(([a, b], i) => (
          <g key={a} opacity={o(i)}>
            <Box x={20 + i * 190} y={50} w={180} h={64} label={a} sub={narrow ? undefined : b} tone="sky" />
          </g>
        ))}
        <Txt x={30} y={148} k="t" anchor="start" opacity={o(3)}>
          {narrow ? "RED for services" : "RED for services: rate, errors, duration"}
        </Txt>
        <Txt x={30} y={178} k="t" anchor="start" opacity={o(3)}>
          {narrow ? "USE for resources" : "USE for resources: utilization, saturation, errors"}
        </Txt>
        <Txt x={30} y={226} k="t" anchor="start" tone="bad" opacity={o(4)}>
          {narrow ? "user_id label: 10K → 10B series" : "a user_id label: 10,000 series × 1M users → 10 billion"}
        </Txt>
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "low-cardinality labels only" : "metrics tell you when and how bad · low-cardinality labels only"}
        </Txt>
      </g>
    );
  if (step === 1)
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          logs · what exactly happened
        </Txt>
        <rect className="ax-box" x={20} y={44} width={560} height={150} />
        {[
          ['"level": "INFO"', undefined],
          ['"trace_id": "abc-123-def-456"', "lit"],
          ['"message": "Processing payment"', undefined],
          ['"payment_id": "pay-12345"', undefined],
        ].map(([l, tone], i) => (
          <Txt key={l as string} x={40} y={76 + i * 32} k={narrow ? "s" : "t"} anchor="start" tone={tone as Tone} opacity={o(i)}>
            {l as string}
          </Txt>
        ))}
        <Txt x={30} y={230} k="t" anchor="start" tone="bad" opacity={o(4)}>
          {narrow ? "never: passwords, full cards" : "never log passwords, full card numbers or tokens"}
        </Txt>
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "structured JSON + trace_id" : "structured JSON with a trace_id, so logs join the rest"}
        </Txt>
      </g>
    );
  if (step === 2) {
    const x = (ms: number) => lerp(200, 510, ms / 162);
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          traces · where in the system
        </Txt>
        {SPANS.map(([n, a, d, lv], i) => (
          <g key={n} opacity={o(i)}>
            <Txt x={20 + lv * 12} y={74 + i * 44} k="s" anchor="start" tone={i === 3 ? "bad" : undefined}>
              {narrow ? n.split("-")[0] : n}
            </Txt>
            <rect className={`ax-fill ${i === 3 ? "bad" : "sky"}`} x={x(a)} y={60 + i * 44} width={(x(a + d) - x(a)) * k} height={20} />
            <Txt x={x(a) + (x(a + d) - x(a)) * k + 6} y={75 + i * 44} k="s" anchor="start" opacity={k} tone={i === 3 ? "bad" : undefined}>
              {`${d}ms`}
            </Txt>
          </g>
        ))}
        <Txt x={20} y={H - 16} anchor="start" tone="bad">
          {narrow ? "bank call: 100 of 162 ms" : "trace abc-123: the bank API call is 100 of 162 ms"}
        </Txt>
      </g>
    );
  }
  const hops: [string, string, string][] = [
    ["logs", "user-12345", "user-12345"],
    ["trace", "bank-api timeout 30 s", "bank timeout"],
    ["metrics", "47 timeouts / 10 min", "47 timeouts"],
  ];
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        {'correlation · "my payment failed"'}
      </Txt>
      {hops.map(([a, b, c], i) => (
        <g key={a} opacity={o(i * 1.5)}>
          <Box x={20 + i * 196} y={60} w={176} h={90} label={a} sub={narrow ? c : b} tone={i === 1 ? "bad" : "sky"} />
          {i < 2 && <Wire d={`M${196 + i * 196} 105H${216 + i * 196}`} tone="lit" arrow />}
        </g>
      ))}
      <Token x={lerp(108, 500, k)} y={105} s={10} tone="lit" opacity={1 - seg(t, 0.85, 1)} />
      <Txt x={20} y={232} k="t" anchor="start" tone="ok" opacity={o(5)}>
        {narrow ? "38 auto-retried · 9 manual" : "38 recovered by auto-retry · 9 need a person"}
      </Txt>
      <Txt x={20} y={H - 16} anchor="start">
        {narrow ? "hours become minutes" : "without correlation this takes hours; with it, minutes"}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- stack */

function Stack({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.14, i * 0.14 + 0.3);
  if (step === 0) {
    const cols: [string, [string, string][]][] = [
      ["app", [["metrics", "prometheus lib"], ["logs", "structlog"], ["traces", "OTel SDK"]]],
      ["collect", [["Prometheus", "scrape"], ["Fluentd", "ship"], ["OTel", "Collector"]]],
      ["store", [["Mimir", "metrics"], ["Loki", "logs"], ["Tempo", "traces"]]],
      ["see", [["dashboards", "Grafana"], ["explore", "Grafana"], ["alerts", "Grafana"]]],
    ];
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          the observability pipeline
        </Txt>
        {cols.map(([h, items], i) => (
          <g key={h} opacity={o(i)}>
            <Txt x={84 + i * 144} y={62} k="k">
              {h}
            </Txt>
            {items.map(([s, b], j) => (
              <Box key={s} x={20 + i * 144} y={76 + j * 58} w={128} h={46} label={s} sub={narrow ? undefined : b} tone={i === 3 ? "ok" : j === 0 ? "sky" : undefined} />
            ))}
            {i < 3 && <Wire d={`M${148 + i * 144} 157H${164 + i * 144}`} arrow />}
          </g>
        ))}
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "metrics · logs · traces → Grafana" : "each pillar: collected, stored, then seen in Grafana"}
        </Txt>
      </g>
    );
  }
  if (step === 1)
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          layered dashboards
        </Txt>
        {[
          ["executive", "availability · budget · business"],
          ["service", "RED · dependencies · deploys"],
          ["debug", "per endpoint · linked to logs, traces"],
        ].map(([a, b], i) => (
          <g key={a} opacity={o(i * 1.5)}>
            <Box x={20 + i * 40} y={50 + i * 66} w={560 - i * 80} h={54} label={a} sub={narrow ? undefined : b} tone={["ok", "sky", "lit"][i] as Tone} />
          </g>
        ))}
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "compare to yesterday, last week" : "golden signals first · compare to yesterday and last week"}
        </Txt>
      </g>
    );
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        alert on symptoms
      </Txt>
      <Box x={20} y={56} w={270} h={110} label={'"CPU > 80%"'} sub="a cause" tone="bad" />
      <Box x={310} y={56} w={270} h={110} label={'"p99 > 500 ms"'} sub="what users feel" tone="ok" />
      {["actionable", "urgent", "clear", "a runbook"].map((s, i) => (
        <g key={s} opacity={o(i + 2)}>
          <Token x={narrow ? 34 + (i % 2) * 290 : 34 + i * 142} y={narrow ? 196 + Math.floor(i / 2) * 34 : 206} s={10} tone="ok" />
          <Txt x={narrow ? 48 + (i % 2) * 290 : 48 + i * 142} y={narrow ? 201 + Math.floor(i / 2) * 34 : 211} k="t" anchor="start">
            {s}
          </Txt>
        </g>
      ))}
      <Txt x={20} y={H - 16} anchor="start">
        {narrow ? "every alert links a runbook" : "high CPU can be healthy; every alert needs a runbook"}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- debug workflow */

const FLOW = ["alert → dashboard", "find failing traces", "examine the spans", "read the logs", "match a change", "fix and verify"];
const FLOWN = ["dashboard", "traces", "spans", "logs", "changes", "fix, verify"];

function Debug({ step, t, narrow }: SceneProps) {
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        {step === 0 ? "the debug workflow · find it" : "the debug workflow · fix it"}
      </Txt>
      {FLOW.map((s, i) => {
        const on = step === 0 ? i < 3 && t > i * 0.3 : i < 3 || t > (i - 3) * 0.3;
        return (
          <g key={s}>
            <Box x={20 + (i % 3) * 190} y={60 + Math.floor(i / 3) * 100} w={180} h={70} label={`${i + 1}`} sub={narrow ? FLOWN[i] : s} tone={on ? (i === 5 ? "ok" : "lit") : undefined} dim={!on} />
          </g>
        );
      })}
      <Txt x={20} y={H - 16} anchor="start" tone="ok">
        {step === 0 ? (narrow ? "scope, then where" : "scope first, then where, then which span") : narrow ? "then confirm the fix" : "correlate with deploys, then fix it and verify"}
      </Txt>
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "pillars") return <Pillars {...p} />;
  if (p.variant === "stack") return <Stack {...p} />;
  if (p.variant === "debug") return <Debug {...p} />;
  return <Alert {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "alert",
      label: "3:47 AM",
      steps: [
        { caption: "3:47 AM: API availability has dropped to 98.2 percent. Which endpoint, which users, since when, what changed? Without observability, you're guessing.", tween: 1400, ms: 3400 },
        { caption: "With it: the dashboard shows 5xx on /api/payments, logs say connection refused, traces time out, payment-service-3's CPU is at 100 percent since 3:42, after a 3:40 config change. Root cause in five minutes.", tween: 1800, ms: 4000 },
        { caption: "Monitoring watches for known problems and tells you when something is wrong. Observability lets you ask new questions and understand why. You need both.", tween: 1200, ms: 3200 },
      ],
    },
    {
      id: "pillars",
      label: "Three pillars",
      steps: [
        { caption: "Metrics are cheap aggregates: counters, gauges and histograms, RED for services and USE for resources. One user_id label would turn 10,000 series into billions.", tween: 1600, ms: 3600 },
        { caption: "Logs record exactly what happened, as structured JSON with a trace ID. Never passwords, full card numbers or tokens.", tween: 1400, ms: 3200 },
        { caption: "A trace follows one request through its spans. In trace abc-123 the bank API call takes 100 of the 162 milliseconds.", tween: 1600, ms: 3200 },
        { caption: "Correlation is the glue. My payment failed: the log for user-12345 gives trace abc-123, the trace shows a bank timeout, and metrics show 47 timeouts in ten minutes.", tween: 1800, ms: 3800 },
      ],
    },
    {
      id: "stack",
      label: "The stack",
      steps: [
        { caption: "The app emits metrics, logs and traces; Prometheus, Fluentd and the OpenTelemetry Collector gather them; Mimir, Loki and Tempo store them; Grafana shows and alerts.", tween: 1600, ms: 3600 },
        { caption: "Dashboards come in layers: executive, service and debug, golden signals first, each compared with yesterday and last week, and linked to logs and traces.", tween: 1400, ms: 3400 },
        { caption: "Alert on symptoms, not causes: p99 over 500 milliseconds, not CPU over 80 percent. Every alert should be actionable, urgent, clear, and link a runbook.", tween: 1400, ms: 3400 },
      ],
    },
    {
      id: "debug",
      label: "Debug workflow",
      steps: [
        { caption: "When an alert fires, check the dashboard for scope, find the slow or failing traces, and examine their spans to locate the problem.", tween: 1400, ms: 3200 },
        { caption: "Then read the logs for details, correlate with changes like deploys, and fix it and verify the fix.", tween: 1400, ms: 3200 },
      ],
    },
  ],
  Scene,
});
