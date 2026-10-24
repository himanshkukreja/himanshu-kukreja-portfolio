/**
 * The whole lesson, week 2 day 4 (Webhook Delivery): push to systems you don't control, delivery
 * guarantees and the receiver's contract; the pipeline (Kafka, fan-out, partitioned queues,
 * workers, retries, DLQ); HMAC signatures and replay protection; and scale plus the 2-hour outage.
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
const timeline = (marks: [number, string, Tone?][], max: number, y: number) => (
  <g>
    <Wire d={`M20 ${y}H580`} />
    {marks.map(([s, l, tone], i) => {
      const x = 20 + (s / max) * 560;
      return (
        <g key={l}>
          <line className="ax-wire" x1={x} x2={x} y1={y - 8} y2={y + 8} />
          <Txt x={x} y={i % 2 ? y + 30 : y - 16} k="s" anchor={x > 500 ? "end" : x < 60 ? "start" : "middle"} tone={tone}>{l}</Txt>
        </g>
      );
    })}
  </g>
);

function Guarantees({ step, t, narrow }: SceneProps) {
  const p = ease(seg(t, 0.1, 0.9));
  if (step === 0) {
    const rx = ["Warehouse", "Accounting", "Analytics", "Partner"];
    return (
      <g>
        <Kick s="from synchronous to asynchronous" />
        <Box x={20} y={110} w={150} h={60} label={narrow ? "Orders" : "Your system"} sub="order #123" tone="lit" />
        {rx.map((r, i) => (
          <g key={r}>
            <Wire d={`M170 140H230V${76 + i * 46}H360`} arrow />
            <Box x={360} y={56 + i * 46} w={220} h={38} label={r} tone={i === 3 ? "bad" : undefined} />
          </g>
        ))}
        <Token x={lerp(170, 360, p)} y={lerp(140, 214, p)} opacity={p < 1 ? 1 : 0} />
        <Readout narrow={narrow} l={["POST https://partner.com/webhook · order.created", "outside your control: slow, down or misconfigured"]} n={["push, don't make them poll", "slow, down, misconfigured"]} />
      </g>
    );
  }
  if (step === 1) {
    const lanes: [string, string, Tone][] = [["at-most-once", narrow ? "send once: lost" : "send once, don't retry: may lose it", "warn"], ["at-least-once", narrow ? "retry: may dup" : "retry until a 2xx: may duplicate", "lit"]];
    return (
      <g>
        <Kick s="delivery guarantees" />
        {lanes.map(([l, s, tone], i) => (
          <g key={l}>
            <Box x={20} y={60 + i * 90} w={190} h={56} label={l} tone={tone} />
            <Txt x={230} y={93 + i * 90} k="s" anchor="start">{s}</Txt>
            {i === 1 && [0, 1].map((j) => <Token key={j} x={530 + j * 20} y={88 + i * 90} tone={j ? "warn" : "ok"} opacity={fade(t, j * 0.4)} />)}
            {i === 0 && <Token x={530} y={88} tone="mute" opacity={0.4} />}
          </g>
        ))}
        <Readout narrow={narrow} l={["at-most-once: analytics, logs, best effort", "at-least-once: payments, orders · the standard"]} n={["at-most-once: analytics", "at-least-once: the standard"]} />
      </g>
    );
  }
  if (step === 2) {
    return (
      <g>
        <Kick s="the duplicate is unavoidable" tone="warn" />
        {timeline([[0, "send"], [29, "200 OK", "ok"], [30, "timeout", "bad"], [60, narrow ? "retry: dup" : "retry: duplicate!", "warn"]], 60, 120)}
        <Box x={20} y={190} w={W - 40} h={50} label={narrow ? "receiver handles dups" : "the receiver MUST handle duplicates"} tone="warn" />
        <Readout narrow={narrow} l={["the 200 arrives after you gave up on the connection", "so you schedule a retry"]} n={["the 200 arrived too late", "so you retry"]} />
      </g>
    );
  }
  const c = narrow ? ["dedupe on event_id", "return a 2xx", "answer within 30 s", "verify signatures"] : ["dedupe on event_id", "return a 2xx to acknowledge", "respond within 30 seconds", "verify X-Webhook-Signature"];
  return (
    <g>
      <Kick s="exactly-once is a myth" />
      {c.map((x, i) => (
        <g key={x} opacity={fade(t, i * 0.12)}>
          <Box x={20 + (i % 2) * 284} y={60 + Math.floor(i / 2) * 64} w={272} h={52} label={x} tone={i === 0 ? "ok" : undefined} />
        </g>
      ))}
      <Readout narrow={narrow} l={["two generals: no number of ACKs is enough", "at-least-once + idempotent receivers"]} n={["no number of ACKs is enough", "at-least-once + idempotency"]} tone="ok" />
    </g>
  );
}

const PIPE = [["Sources", "Sources"], ["Kafka", "Kafka"], ["Dispatcher", "Fan-out"]];

function Arch({ step, t, narrow }: SceneProps) {
  const k = Math.min(step, 3);
  const p = ease(seg(t, 0.1, 0.9));
  if (k < 2) {
    const res: [string, string, Tone][] = [["sub_A", "200 OK", "ok"], ["sub_B", narrow ? "timeout" : "timeout → T+60s", "warn"], ["sub_C", narrow ? "500" : "500 → T+60s", "bad"]];
    return (
      <g>
        <Kick s={k ? "partitioned queues → workers" : "events in, fan out"} />
        {PIPE.map(([l, n], i) => (
          <g key={l}>
            {i > 0 && <Wire d={`M${15 + i * 105} 140H${20 + i * 105}`} arrow />}
            <Box x={20 + i * 105} y={110} w={100} h={60} label={narrow ? n : l} tone={i === 2 ? "lit" : undefined} />
          </g>
        ))}
        {res.map(([s, r, tone], i) => (
          <g key={s} opacity={k ? 1 : fade(t, i * 0.15)}>
            <Wire d={`M330 140H350V${76 + i * 64}H370`} arrow />
            <Box x={370} y={52 + i * 64} w={210} h={48} label={s} sub={k ? r : `queue P${[7, 2, 5][i]}`} tone={k ? tone : undefined} />
          </g>
        ))}
        {k === 0 && p < 1 && <Token x={lerp(20, 324, p)} y={140} label={narrow ? undefined : "evt_123"} />}
        <Readout
          narrow={narrow}
          l={k ? ["partition by subscription: a slow one blocks no one", "workers POST in parallel · failures scheduled to retry"] : ["one event becomes N delivery tasks", "producers don't know about webhooks"]}
          n={k ? ["slow subscriber blocks no one", "failures retry later"] : undefined}
        />
      </g>
    );
  }
  if (k === 2) {
    const sch = ["now", "1m", "5m", "15m", "1h", "2h", "4h", "8h", "24h"];
    return (
      <g>
        <Kick s="retry schedule, then DLQ" />
        {sch.map((s, i) => (
          <g key={s} opacity={fade(t, i * 0.06)}>
            <Box x={20 + i * 58} y={64} w={50} h={44} label={s} tone={i === 8 ? "warn" : "lit"} />
          </g>
        ))}
        <Wire d="M545 108V150" arrow tone="bad" />
        <Box x={430} y={150} w={150} h={50} label="DLQ" sub="+ alert" tone="bad" />
        <Txt x={20} y={150} k="s" anchor="start">{narrow ? "9 attempts · ~39 h" : "9 attempts over ~39 hours"}</Txt>
        <Txt x={20} y={176} k="s" anchor="start" tone="ok">{narrow ? "retry: 5xx, timeout" : "retry: timeouts, network, 5xx"}</Txt>
        <Txt x={20} y={202} k="s" anchor="start" tone="bad">{narrow ? "4xx: don't (but 429)" : "4xx: don't (429: honour Retry-After)"}</Txt>
        <Readout narrow={narrow} l={["early retries catch blips and deploys", "the 24 h final catches overnight outages"]} />
      </g>
    );
  }
  const ev = ["A", "B", "C"];
  return (
    <g>
      <Kick s="ordering: per entity" />
      <Box x={20} y={60} w={180} h={56} label="order_123" sub="one partition" tone="lit" />
      {ev.map((e, i) => (
        <g key={e}>
          <Token x={240 + i * 40} y={88} label={e} tone="ok" />
        </g>
      ))}
      <Wire d="M200 88H380" arrow tone="lit" />
      <Box x={380} y={60} w={200} h={56} label="1 worker" sub="in order" tone="ok" />
      <Box x={20} y={150} w={180} h={56} label="order_456" sub="another" />
      <Wire d="M200 178H380" arrow />
      <Box x={380} y={150} w={200} h={56} label="1 worker" sub="in parallel" />
      <Readout narrow={narrow} l={["retries and parallelism turn A → B → C into A → C → B", "partition by entity ID · add sequence numbers"]} n={["retries scramble order", "partition by entity + sequence"]} />
    </g>
  );
}

function Security({ step, t, narrow }: SceneProps) {
  const p = ease(seg(t, 0.1, 0.9));
  if (step === 0) {
    return (
      <g>
        <Kick s="sign every webhook" />
        <Box x={20} y={60} w={200} h={70} label="Sender" sub={narrow ? "HMAC-SHA256" : "HMAC-SHA256(secret)"} tone="lit" />
        <Wire d="M220 95H380" arrow tone="lit" />
        <Token x={lerp(220, 380, p)} y={95} opacity={p < 1 ? 1 : 0} />
        <Box x={380} y={60} w={200} h={70} label="Receiver" sub={narrow ? "recompute" : "recompute, compare"} tone="ok" />
        <Txt x={300} y={170} k="s">{narrow ? "signs timestamp + body" : "X-Webhook-Signature over timestamp + payload"}</Txt>
        <Readout narrow={narrow} l={["send exactly the bytes you signed", "constant-time comparison stops timing attacks"]} n={["send the bytes you signed", "compare in constant time"]} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Kick s="replay attack" tone="bad" />
        <Box x={20} y={60} w={200} h={70} label="Attacker" sub={narrow ? "6 months later" : "replays after 6 months"} tone="bad" />
        <Wire d="M220 95H380" arrow tone="bad" />
        <Txt x={300} y={84} k="s" tone="bad">order.refunded</Txt>
        <Box x={380} y={60} w={200} h={70} label="Receiver" sub={t > 0.5 ? (narrow ? "rejected" : "timestamp too old") : "…"} tone={t > 0.5 ? "ok" : undefined} />
        <Txt x={300} y={180} tone="ok" opacity={fade(t, 0.4)}>|now − timestamp| {">"} 5 min → reject</Txt>
        <Readout narrow={narrow} l={["without the timestamp, the refund runs again", "the timestamp is inside the signature"]} n={["or the refund runs again", "timestamp is signed"]} />
      </g>
    );
  }
  const m = narrow ? ["rotate: 24 h grace", "HTTPS only", "no private IPs", "IP allowlist"] : ["rotate secrets, 24 h grace", "HTTPS-only URLs", "SSRF: no 10.x, 192.168.x", "publish source IPs"];
  return (
    <g>
      <Kick s="more layers" />
      {m.map((x, i) => (
        <g key={x} opacity={fade(t, i * 0.12)}>
          <Box x={20 + (i % 2) * 284} y={60 + Math.floor(i / 2) * 64} w={272} h={52} label={x} tone="ok" />
        </g>
      ))}
      <Readout narrow={narrow} l={["old and new secrets both verify during the grace", "so valid webhooks never fail the check"]} n={["both secrets verify for 24 h", "valid webhooks never fail"]} />
    </g>
  );
}

function Scale({ step, t, narrow }: SceneProps) {
  const k = Math.min(step, 3);
  if (k === 0) {
    const c: [string, string][] = [["278/s", "1M events/hour"], ["833/s", "× 3 subscriptions"], ["1,250/s", "+ 50% retries"], ["2,500/s", "peak, 2×"]];
    return (
      <g>
        <Kick s="1M webhooks an hour" />
        {c.map(([v, s], i) => (
          <g key={v} opacity={fade(t, i * 0.15)}>
            {i > 0 && <Wire d={`M${i * 145 - 9} 118H${20 + i * 145}`} arrow />}
            <Box x={20 + i * 145} y={84} w={126} h={68} label={v} sub={narrow ? undefined : s} tone={i === 3 ? "lit" : undefined} />
          </g>
        ))}
        <Readout narrow={narrow} l={["500 ms per request: 1,250 sync workers", "async ×10: 125 · with 2× margin, deploy 250"]} n={["sync: 1,250 workers", "async: 125, deploy 250"]} />
      </g>
    );
  }
  if (k === 1) {
    const plain = ease(seg(t, 0.1, 0.9));
    return (
      <g>
        <Kick s="partner down 2:00 to 4:00 PM" tone="bad" />
        <Txt x={20} y={70} k="s" anchor="start">{narrow ? "10,000 events pile up" : "10,000 events pile up, each on its own backoff timer"}</Txt>
        <Txt x={20} y={112} k="s" anchor="start" tone="bad">{narrow ? "plain: until ~6:00 PM" : "plain backoff: stragglers until ~6:00 PM"}</Txt>
        <Meter x={20} y={120} w={560} h={18} value={120 * plain} max={120} tone="bad" />
        <Txt x={20} y={176} k="s" anchor="start" tone="ok">{narrow ? "health check: by 4:13 PM" : "health check every 30 s: all delivered by 4:13 PM"}</Txt>
        <Meter x={20} y={184} w={560} h={18} value={13 * plain} max={120} tone="ok" />
        <Readout narrow={narrow} l={["on recovery, move pending retries to the immediate queue", "capped by the endpoint's rate limit, ~13 per second"]} n={["move retries to now", "~13/s rate limit"]} tone="ok" />
      </g>
    );
  }
  const al: [string, string][] = [["failure rate", "> 10%"], ["queue backlog", "> 10,000"], ["DLQ depth", "> 100"], [narrow ? "consec. fails" : "endpoint failures", "> 10 in a row"]];
  return (
    <g>
      <Kick s={k === 2 ? "recover gently, keep the rest" : "watch it"} />
      {k === 2 ? (
        <g>
          <Txt x={20} y={70} k="s" anchor="start">{narrow ? "ramp up the rate" : "ramp the delivery rate up from slow to max"}</Txt>
          {[1, 2, 3, 4, 5].map((i) => (
            <rect key={i} className="ax-fill ok" x={20 + i * 70} y={160 - i * 16 * ease(seg(t, 0, 0.8))} width={50} height={i * 16 * ease(seg(t, 0, 0.8))} />
          ))}
          <Box x={430} y={80} w={150} h={80} label="DLQ" sub={narrow ? "retry" : "dashboard, retry"} tone="warn" />
          <Readout narrow={narrow} l={["a just-recovered endpoint can fall over again", "exhausted events go to the DLQ for manual retry"]} n={["don't flood the endpoint", "DLQ for manual retry"]} />
        </g>
      ) : (
        <g>
          {al.map(([l, s], i) => (
            <g key={l} opacity={fade(t, i * 0.12)}>
              <Box x={20 + (i % 2) * 284} y={56 + Math.floor(i / 2) * 70} w={272} h={56} label={l} sub={s} tone="warn" />
            </g>
          ))}
          <Readout narrow={narrow} l={["timeouts (day 1) · idempotent receivers (day 2)", "per-endpoint circuit breakers (day 3)"]} n={["timeouts · idempotency", "per-endpoint breakers"]} />
        </g>
      )}
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "arch") return <Arch {...p} />;
  if (p.variant === "security") return <Security {...p} />;
  if (p.variant === "scale") return <Scale {...p} />;
  return <Guarantees {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "guarantees",
      label: "Guarantees",
      steps: [
        { caption: "An order completes and the warehouse, accounting, analytics and partners need to know. Webhooks push an HTTP POST to their URL, but they're outside your control.", tween: 1400, ms: 3600 },
        { caption: "At-most-once sends once and may lose the event: fine for analytics. At-least-once retries until a 2xx and may duplicate: the standard for business events.", tween: 1400 },
        { caption: "The receiver answers 200 at 29 seconds, your 30-second timeout fires first, and you retry at 60 seconds. The duplicate is unavoidable.", tween: 1400 },
        { caption: "True exactly-once is impossible, so deliver at-least-once and make receivers idempotent: dedupe on event_id, return a 2xx, respond within 30 s, verify signatures.", tween: 1400, ms: 3600 },
      ],
    },
    {
      id: "arch",
      label: "Architecture",
      steps: [
        { caption: "Services publish events to Kafka. The dispatcher looks up subscriptions for order.created and fans evt_123 out into tasks for sub_A, sub_B and sub_C.", tween: 1600 },
        { caption: "Queues are partitioned by subscription, so a slow subscriber blocks no one. Workers POST in parallel: sub_A gets 200, sub_B and sub_C retry at T+60s.", tween: 1400 },
        { caption: "Retries back off over 9 attempts, from immediate to 24 hours, about 39 hours in all, then the task moves to the dead letter queue with an alert. Don't retry a 4xx, except 429.", tween: 1600, ms: 3600 },
        { caption: "Retries scramble order. Partition by entity ID with one worker per partition, and add sequence numbers so receivers can spot gaps.", tween: 1200 },
      ],
    },
    {
      id: "security",
      label: "Security",
      steps: [
        { caption: "Sign each webhook with HMAC-SHA256 over the timestamp and payload. The receiver recomputes it and compares in constant time.", tween: 1400 },
        { caption: "An attacker replays a captured order.refunded six months later. The receiver rejects any timestamp more than 5 minutes old.", tween: 1400 },
        { caption: "Rotate secrets with a 24-hour grace period, accept HTTPS URLs only, refuse private IPs to stop SSRF, and publish your source IPs for allowlists.", tween: 1200 },
      ],
    },
    {
      id: "scale",
      label: "Scale & outages",
      steps: [
        { caption: "1M events an hour is 278 a second; three subscriptions each make 833; with 50% retries about 1,250, and 2,500 requests a second at peak: 250 async workers.", tween: 1400, ms: 3600 },
        { caption: "A partner is down from 2 to 4 PM and 10,000 events pile up. Plain backoff trickles them in until about 6 PM; a 30-second health check delivers all by 4:13.", tween: 1600, ms: 3600 },
        { caption: "Ramp delivery up gradually so a recovered endpoint doesn't fall over again, and give events that exhaust their retries a DLQ with a dashboard for manual retry.", tween: 1400 },
        { caption: "Alert on failure rate above 10%, backlog over 10,000, a DLQ over 100 and endpoints failing 10 times in a row. Timeouts, idempotency and breakers all apply here.", tween: 1200, ms: 3600 },
      ],
    },
  ],
  Scene,
});
