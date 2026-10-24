/**
 * Whole-lesson overview (week 6, day 5: operations, monitoring & interview mastery), "a system you
 * can't observe is a system you can't trust". Observe: metrics, dashboards per persona, structured
 * logs, one trace. Alert & runbook: symptoms over causes, the low-delivery and queue-backlog
 * runbooks. Deploy: timing, canary and rolling, safe migrations. Interview: the 45-minute framework,
 * the estimate, the design and the deep dives.
 */
import { at, Box, defineExplainer, lerp, Meter, seg, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const XS = [6, 112, 230, 348, 470];
const WS = [84, 96, 96, 100, 124];
const PY = 44;
const PH = 42;
const STAGES: [string, string][] = [
  ["API", "API"],
  ["Kafka", "Kafka"],
  ["Router", "Router"],
  ["Workers", "Workers"],
  ["Providers", "Provider"],
];

function Pipe({ narrow, tones }: { narrow: boolean; tones: Tone[] }) {
  return (
    <g>
      {STAGES.map(([w, n], i) => (
        <g key={w}>
          {i > 0 && <Wire d={`M${XS[i - 1] + WS[i - 1]} ${PY + PH / 2}H${XS[i]}`} arrow />}
          <Box x={XS[i]} y={PY} w={WS[i]} h={PH} label={narrow ? n : w} tone={tones[i]} />
        </g>
      ))}
    </g>
  );
}

function Chip({ x, y, w, label, tone, h = 28, o = 1 }: { x: number; y: number; w: number; label: string; tone?: Tone; h?: number; o?: number }) {
  return (
    <g opacity={o}>
      <rect className={`ax-box${tone ? ` ${tone}` : ""}`} x={x} y={y} width={w} height={h} />
      <Txt x={x + w / 2} y={y + h / 2 + 5} k="s" tone={tone}>
        {label}
      </Txt>
    </g>
  );
}

/** rows of [label, short label, tone]; two columns when `cols` is 2 */
function Grid({ rows, narrow, t, y0 = 116, cols = 1, gap = 36 }: { rows: [string, string, Tone][]; narrow: boolean; t: number; y0?: number; cols?: number; gap?: number }) {
  const w = cols === 2 ? 274 : 560;
  return (
    <g>
      {rows.map(([l, n, tone], i) => (
        <Chip key={l} x={20 + (i % cols) * 286} y={y0 + Math.floor(i / cols) * gap} w={w} label={narrow ? n : l} tone={tone} o={seg(t, i * 0.12, i * 0.12 + 0.3)} />
      ))}
    </g>
  );
}

const SPANS: [string, string, number, number][] = [
  ["receive_notification", "receive", 5, 0],
  ["validate", "validate", 10, 0],
  ["write_to_outbox", "outbox", 15, 0],
  ["route", "route", 25, 0],
  ["push-worker deliver", "push", 150, 1],
  ["  send_to_fcm", "  fcm", 125, 2],
  ["email-worker deliver", "email", 500, 1],
  ["  send_to_sendgrid", "  sendgrid", 490, 2],
];

function Observe({ step, t, narrow }: SceneProps) {
  const p = seg(t, 0.1, 0.9);
  return (
    <g>
      <Txt x={W / 2} y={26} k="k">
        {narrow ? "observability" : "part I · the three pillars"}
      </Txt>
      <Pipe narrow={narrow} tones={at<Tone[]>(step, [["lit", "lit", "lit", "lit", "lit"], [], [undefined, undefined, undefined, "lit"], ["sky", "sky", "sky", "sky", "sky"]])} />
      {step === 0 && (
        <Grid
          narrow={narrow}
          t={t}
          rows={[
            ["counter · only goes up · notifications_received_total", "counter: only goes up", "lit"],
            ["gauge · up and down · kafka_consumer_lag", "gauge: up and down", "sky"],
            ["histogram · latency percentiles · p95, p99", "histogram: latency", "ok"],
          ]}
          y0={124}
          gap={44}
        />
      )}
      {step === 1 &&
        [
          ["On-call", "is it healthy?", "success rate", "queue depth"],
          ["Product", "users getting them?", "delivery rate", "e2e latency"],
          ["Finance", "what do we spend?", "SMS × $0.01", "email × $0.0001"],
        ].map(([who, q, a, b], i) => (
          <g key={who} opacity={seg(t, i * 0.25, i * 0.25 + 0.35)}>
            <rect className="ax-box" x={20 + i * 190} y={112} width={180} height={180} />
            <Txt x={110 + i * 190} y={140} k="t" tone="lit">
              {who}
            </Txt>
            {!narrow && (
              <Txt x={110 + i * 190} y={166} k="s">
                {q}
              </Txt>
            )}
            <Chip x={30 + i * 190} y={196} w={160} label={narrow ? a.split(" ")[0] : a} tone="sky" />
            <Chip x={30 + i * 190} y={236} w={160} label={narrow ? b.split(" ")[0] : b} tone="sky" />
          </g>
        ))}
      {step === 2 && (
        <g>
          <rect className="ax-box" x={20} y={112} width={560} height={180} />
          {[
            ["level", "INFO"],
            ["service", "push-worker"],
            ["message", "Delivery attempted"],
            ["provider", "fcm"],
            ["trace_id", "abc-123"],
          ].map(([k, v], i) => (
            <g key={k} opacity={seg(t, i * 0.12, i * 0.12 + 0.3)}>
              <Txt x={narrow ? 36 : 60} y={144 + i * 32} k="s" anchor="start">
                {`"${k}":`}
              </Txt>
              <Txt x={narrow ? 210 : 220} y={144 + i * 32} k="t" anchor="start" tone={k === "trace_id" ? "lit" : undefined}>
                {`"${v}"`}
              </Txt>
            </g>
          ))}
        </g>
      )}
      {step === 3 &&
        SPANS.map(([n, sn, ms, d], i) => {
          const y = 104 + i * 25;
          const x0 = narrow ? 200 : 230;
          return (
            <g key={n}>
              <Txt x={20} y={y + 15} k="s" anchor="start" tone={d === 2 ? undefined : "sky"}>
                {narrow ? sn : n}
              </Txt>
              <rect className={`ax-fill ${ms > 100 ? (d === 2 ? "warn" : "sky") : "ok"}`} x={x0} y={y + 4} width={Math.max(3, ((narrow ? 300 : 280) * ms * p) / 500)} height={14} />
              {!narrow && (
                <Txt x={580} y={y + 15} k="s" anchor="end">
                  {`${ms} ms`}
                </Txt>
              )}
            </g>
          );
        })}
    </g>
  );
}

function Ops({ step, t, narrow }: SceneProps) {
  const p = seg(t, 0.1, 0.9);
  return (
    <g>
      <Txt x={W / 2} y={26} k="k">
        {narrow ? "alerts & runbooks" : "parts II–III · alerts and runbooks"}
      </Txt>
      <Pipe narrow={narrow} tones={at<Tone[]>(step, [[undefined, undefined, undefined, undefined, "bad"], [undefined, undefined, undefined, "warn", "bad"], [undefined, "warn"], [undefined, "bad"]])} />
      {step === 0 && (
        <g>
          <Txt x={160} y={120} k="k" tone="bad">
            {narrow ? "page" : "critical · page"}
          </Txt>
          <Txt x={456} y={120} k="k" tone="warn">
            warning
          </Txt>
          <Grid
            narrow={narrow}
            t={t}
            cols={2}
            y0={134}
            rows={[
              ["delivery < 95% for 5m", "delivery < 95%", "bad"],
              ["a circuit open for 5m", "circuit open", "warn"],
              ["all providers down, 2m", "all down", "bad"],
              ["provider p95 > 2 s", "p95 > 2 s", "warn"],
              ["lag > 1M for 10m", "lag > 1M", "bad"],
              ["DLQ growing", "DLQ growing", "warn"],
            ]}
          />
          <Txt x={W / 2} y={262} k="s" opacity={seg(t, 0.7, 1)}>
            {narrow ? "symptoms over causes" : "page on symptoms; failover may already absorb a cause"}
          </Txt>
        </g>
      )}
      {step === 1 && (
        <Grid
          narrow={narrow}
          t={t}
          rows={[
            ["1 · which channel? success rate by channel", "1 · which channel?", "lit"],
            ["2 · provider status pages, circuit states", "2 · status, circuits", "lit"],
            ["outage → PRIMARY_PROVIDER=ses", "outage → SES", "ok"],
            ["UNREGISTERED → run token cleanup", "tokens → cleanup", "ok"],
            ["429s → SEND_RATE_LIMIT=500", "429 → rate 500", "ok"],
            ["not fixed in 15 min → escalate", "15 min → escalate", "warn"],
          ]}
          y0={106}
          gap={34}
        />
      )}
      {step >= 2 && (
        <g>
          {[
            ["notifications.critical", "critical", 0.05],
            ["notifications.high", "high", 0.08],
            ["notifications.low", "low", step === 2 ? lerp(0.1, 0.92, p) : lerp(0.92, 0, p)],
          ].map(([n, sn, v], i) => (
            <g key={n as string}>
              <Txt x={20} y={134 + i * 40} k="s" anchor="start" tone={i === 2 ? "warn" : "ok"}>
                {narrow ? sn : n}
              </Txt>
              <Meter x={narrow ? 170 : 250} y={122 + i * 40} w={narrow ? 410 : 330} h={16} value={v as number} max={1} tone={i === 2 ? (step === 3 ? "bad" : "warn") : "ok"} />
            </g>
          ))}
          <Txt x={W / 2} y={262} k="t" tone={step === 2 ? "ok" : "bad"}>
            {step === 2 ? (narrow ? "campaign: monitor" : "campaign lag: expected, just monitor") : narrow ? "reset to latest" : "--reset-offsets --to-latest"}
          </Txt>
          <Txt x={W / 2} y={290} k="s" tone={step === 2 ? undefined : "bad"}>
            {step === 2 ? (narrow ? "critical still flowing" : "confirm critical and high still flow") : narrow ? "non-critical only" : "non-critical only: the backlog is never sent"}
          </Txt>
        </g>
      )}
    </g>
  );
}

function Deploy({ step, t, narrow }: SceneProps) {
  const p = seg(t, 0.1, 0.9);
  const hx = (h: number) => 20 + (560 * h) / 24;
  return (
    <g>
      <Txt x={W / 2} y={26} k="k">
        {narrow ? "safe deployments" : "part IV · safe deployments"}
      </Txt>
      <Pipe narrow={narrow} tones={at<Tone[]>(step, [[], ["lit", undefined, undefined, "lit"], ["sky", undefined, "sky", "sky"]])} />
      {step === 0 && (
        <g>
          <Meter x={20} y={150} w={560} h={30} value={0} max={1} ticks={24} />
          {[
            [9, 11],
            [14, 16],
          ].map(([a, b]) => (
            <g key={a}>
              <rect className="ax-fill bad" x={hx(a)} y={150} width={(hx(b) - hx(a)) * seg(t, 0.2, 0.7)} height={30} />
              <Txt x={(hx(a) + hx(b)) / 2} y={140} k="s" tone="bad">
                {narrow ? `${a}–${b}` : `${a}:00–${b}:00`}
              </Txt>
            </g>
          ))}
          {[0, 6, 12, 18, 24].map((h) => (
            <Txt key={h} x={hx(h)} y={200} k="s" anchor={h === 0 ? "start" : h === 24 ? "end" : "middle"}>
              {`${h}h`}
            </Txt>
          ))}
          <Grid narrow={narrow} t={seg(t, 0.4, 1)} cols={2} y0={222} rows={[["not during a campaign", "no campaign", "warn"], ["not Friday afternoon", "not Friday PM", "warn"]]} />
        </g>
      )}
      {step === 1 && (
        <g>
          <Txt x={20} y={124} k="t" anchor="start">
            API canary
          </Txt>
          <Meter x={20} y={134} w={560} h={22} value={lerp(0, 0.1, p)} max={1} tone="lit" />
          <Txt x={580} y={124} k="s" anchor="end" tone="lit">
            {narrow ? "10% · 15 min" : "10% for 15 min · errors < 1% · p99 < 500 ms"}
          </Txt>
          <Txt x={20} y={204} k="t" anchor="start">
            Workers
          </Txt>
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} className={`ax-box${p > (i + 1) * 0.22 ? " ok" : ""}`} x={20 + i * 142} y={214} width={134} height={22} />
          ))}
          <Txt x={580} y={204} k="s" anchor="end" tone="ok">
            {narrow ? "rolling 25%" : "rolling · 25% unavailable at most"}
          </Txt>
          <Txt x={W / 2} y={276} k="s">
            {narrow ? "fails → roll back" : "a failing canary rolls back before the other 90%"}
          </Txt>
        </g>
      )}
      {step === 2 && (
        <g>
          {["stop reading", "stop writing", "drop column"].map((s, i) => (
            <g key={s} opacity={seg(t, i * 0.25, i * 0.25 + 0.3)}>
              {i > 0 && <Wire d={`M${10 + i * 196} 152H${20 + i * 196}`} arrow tone="sky" />}
              <Box x={20 + i * 196} y={128} w={170} h={48} label={narrow ? ["stop read", "stop write", "drop"][i] : s} sub={narrow ? undefined : `phase ${i + 1}`} tone="sky" />
            </g>
          ))}
          <Chip x={20} y={204} w={560} label={narrow ? "CREATE INDEX CONCURRENTLY" : "CREATE INDEX CONCURRENTLY · no write lock"} tone="ok" o={seg(t, 0.7, 1)} />
          <Txt x={W / 2} y={270} k="s">
            {narrow ? "old and new code side by side" : "old and new code run side by side: stay backward compatible"}
          </Txt>
        </g>
      )}
    </g>
  );
}

const PHASES: [string, string, number][] = [
  ["require", "req", 5],
  ["estimate", "est", 5],
  ["design", "design", 15],
  ["deep dives", "deep", 15],
  ["wrap", "wrap", 5],
];

function Interview({ step, t, narrow }: SceneProps) {
  const p = seg(t, 0.1, 0.9);
  const cur = at(step, [-1, 1, 2, 3]);
  return (
    <g>
      <Txt x={W / 2} y={26} k="k">
        {narrow ? "the 45-minute interview" : "part V · the 45-minute interview"}
      </Txt>
      <Pipe narrow={narrow} tones={step === 2 ? ["lit", "lit", "lit", "lit", "lit"] : step === 3 ? ["ok", "ok", undefined, "ok", "warn"] : []} />
      {PHASES.map(([n, sn, m], i) => {
        const start = PHASES.slice(0, i).reduce((a, q) => a + q[2], 0);
        const x = 20 + (560 * start) / 45;
        const w = (560 * m) / 45;
        const lit = cur === i || (step === 0 && p * 45 >= start);
        return (
          <g key={n}>
            <rect className={`ax-box${lit ? " lit" : ""}`} x={x} y={106} width={w - 4} height={30} opacity={step === 0 || cur === i ? 1 : 0.4} />
            <Txt x={x + (w - 4) / 2} y={126} k="s" tone={lit ? "lit" : undefined}>
              {narrow || m === 5 ? sn : n}
            </Txt>
          </g>
        );
      })}
      {step === 0 &&
        [0, 5, 10, 25, 40, 45].map((m) => (
          <Txt key={m} x={20 + (560 * m) / 45} y={154} k="s" anchor={m === 0 ? "start" : m === 45 ? "end" : "middle"}>
            {narrow && (m === 5 || m === 40) ? "" : `${m}`}
          </Txt>
        ))}
      {step === 0 && (
        <Grid
          narrow={narrow}
          t={seg(t, 0.4, 1)}
          cols={2}
          y0={178}
          rows={[
            ["multi-channel delivery", "multi-channel", "sky"],
            ["reliability: retry, DLQ", "reliability", "sky"],
            ["scale: campaigns, hot users", "scale", "sky"],
            ["user preferences", "preferences", "sky"],
          ]}
        />
      )}
      {step === 1 &&
        [
          ["5,800/s", "average"],
          ["17K/s", "campaign peak"],
          ["18 TB", narrow ? "90 days" : "90 days × 400 B"],
        ].map(([d, s], i) => (
          <g key={d} opacity={seg(t, i * 0.25, i * 0.25 + 0.35)}>
            <Txt x={110 + i * 190} y={210} k="d" tone={i === 1 ? "lit" : undefined}>
              {d}
            </Txt>
            <Txt x={110 + i * 190} y={236} k="s">
              {s}
            </Txt>
          </g>
        ))}
      {step === 1 && (
        <Txt x={W / 2} y={282} k="s">
          {narrow ? "push free · SMS sparingly" : "push is free · email ~$150K–375K/month · SMS sparingly"}
        </Txt>
      )}
      {step === 2 && (
        <g>
          <Txt x={W / 2} y={190} k="t" tone="lit">
            {narrow ? "separate ingestion" : "separate ingestion from delivery"}
          </Txt>
          <Txt x={W / 2} y={218} k="s">
            {narrow ? "from delivery" : "API returns at once · Kafka absorbs spikes · callbacks confirm"}
          </Txt>
          <Grid narrow={narrow} t={seg(t, 0.4, 1)} cols={2} y0={242} rows={[["PostgreSQL: prefs, status", "PostgreSQL", "sky"], ["Redis: cache, rate limits", "Redis", "sky"]]} />
        </g>
      )}
      {step === 3 && (
        <Grid
          narrow={narrow}
          t={t}
          cols={2}
          y0={160}
          gap={40}
          rows={[
            ["transactional outbox", "outbox", "ok"],
            ["idempotency keys", "idempotency", "ok"],
            ["DLQ after 3 failures", "DLQ after 3", "ok"],
            ["circuit: 5 fails, 30 s", "circuit 5/30s", "warn"],
            ["delivery > 98%", "deliver > 98%", "lit"],
            ["page below 95%", "page < 95%", "bad"],
          ]}
        />
      )}
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "observe" ? <Observe {...p} /> : p.variant === "ops" ? <Ops {...p} /> : p.variant === "deploy" ? <Deploy {...p} /> : <Interview {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "observe",
      label: "Observe",
      steps: [
        { caption: "Make it operable at 3 AM. First, metrics at every stage: counters only go up, gauges like Kafka lag move both ways, histograms give latency.", tween: 1400 },
        { caption: "Dashboards per persona: on-call asks if the system is healthy, product if users get notified, finance what it's spending.", tween: 1400 },
        { caption: "Logs are structured JSON with the service, the provider and a trace_id, so a log aggregator can parse and join them.", tween: 1200 },
        { caption: "A trace follows one notification, abc-123. The push worker takes 150 ms, 125 of it inside FCM; email takes 500 ms, 490 in SendGrid.", tween: 1800 },
      ],
    },
    {
      id: "ops",
      label: "Alerts & runbooks",
      steps: [
        { caption: "Alert on symptoms. Delivery under 95% for 5 minutes pages someone; one open circuit is only a warning, since failover may hide it.", tween: 1400 },
        { caption: "The low-delivery runbook: find the channel, check status pages and circuits, then fail over email to SES, clean tokens or cut the send rate.", tween: 1600 },
        { caption: "Queue backlog over 1M? If only notifications.low lags during a campaign, that's expected: confirm critical still flows and monitor.", tween: 1600 },
        { caption: "Last resort, non-critical topics only: reset the consumer group to the latest offset. That backlog is skipped and never sent.", tween: 1400 },
      ],
    },
    {
      id: "deploy",
      label: "Deploy",
      steps: [
        { caption: "Deploy at quiet times: never in peak hours, 9 to 11 AM and 2 to 4 PM, never during a known campaign, never on a Friday afternoon.", tween: 1400 },
        { caption: "The API goes canary: 10% of traffic for 15 minutes, errors under 1%, p99 under 500 ms. Workers roll out 25% at a time.", tween: 1800 },
        { caption: "Migrations stay backward compatible: remove a column in three phases, stop reading, stop writing, then drop; build indexes CONCURRENTLY.", tween: 1400 },
      ],
    },
    {
      id: "interview",
      label: "Interview",
      steps: [
        { caption: "The 45-minute interview: 5 minutes of requirements, 5 of estimation, 15 of high-level design, 15 of deep dives, 5 to wrap up.", tween: 2000 },
        { caption: "Estimate out loud: 500M a day is about 5,800/sec, maybe 17K at campaign peak; 90 days at 400 bytes each is about 18 TB.", tween: 1400 },
        { caption: "The design: API → Kafka → router → channel workers → providers, with callbacks. The key insight: separate ingestion from delivery.", tween: 1200 },
        { caption: "Deep dives: outbox, idempotency keys, a DLQ after 3 failures, circuit breakers, and monitoring that pages when delivery drops below 95%.", tween: 1400 },
      ],
    },
  ],
  Scene,
});
