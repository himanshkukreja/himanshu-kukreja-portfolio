/**
 * The whole lesson, week 2 preview (Failure-First Design): assume everything fails and ask how;
 * the seven concepts (timeouts, retries, idempotency, circuit breakers, delivery guarantees,
 * leader election); the three systems (payments, webhooks, cron); the four pitfalls.
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 330;
type Lines = [string, string];
const fade = (t: number, a: number) => ease(seg(t, a, a + 0.4));
const cut = (s: string, narrow: boolean) => (narrow ? s.split(" · ")[0] : s);

function Readout({ l, narrow, tone }: { l: Lines; narrow: boolean; tone?: Tone }) {
  return (
    <g>
      <Txt x={20} y={H - 38} k="s" anchor="start" tone={tone}>{cut(l[0], narrow)}</Txt>
      <Txt x={20} y={H - 14} k="s" anchor="start">{cut(l[1], narrow)}</Txt>
    </g>
  );
}
const Kick = ({ s, tone }: { s: string; narrow?: boolean; tone?: Tone }) => (
  <Txt x={20} y={30} k="k" anchor="start" tone={tone}>{s}</Txt>
);

function Pipe({ y, tone, sub }: { y: number; tone?: Tone; sub?: string }) {
  return (
    <g>
      <Wire d={`M124 ${y + 28}H170`} arrow />
      <Wire d={`M302 ${y + 28}H350`} arrow />
      <Box x={20} y={y} w={104} h={56} label="Users" />
      <Box x={170} y={y} w={132} h={56} label="Service" tone={tone} />
      <Box x={350} y={y} w={230} h={56} label="Database" sub={sub} tone={tone} />
    </g>
  );
}

function Mindset({ step, t, narrow }: SceneProps) {
  if (step === 2) {
    const modes = [
      ["Crash", "restart, failover", false],
      ["Omission", "timeout + retry", true],
      ["Timing", "timeout + fallback", true],
      ["Byzantine", narrow ? "validation" : "validation, checksums", false],
    ] as const;
    return (
      <g>
        <Kick s="1 · four failure modes" narrow={narrow} />
        {modes.map(([l, s, wk], i) => (
          <g key={l} opacity={fade(t, i * 0.12)}>
            <Box x={20 + (i % 2) * 284} y={60 + Math.floor(i / 2) * 76} w={272} h={60} label={l} sub={s} tone={wk ? "lit" : undefined} dim={!wk && t > 0.7} />
          </g>
        ))}
        <Readout narrow={narrow} l={["this week: omission and timing failures", "the most common in distributed systems"]} tone="lit" />
      </g>
    );
  }
  const fails = narrow ? ["packets dropped", "crash mid-request", "database timeout", "clicks twice"] : ["packets dropped", "crash mid-request", "database timeout", "user clicks twice"];
  const qs = narrow
    ? ["timeout: what if it fires?", "retry: what if it worked?", "breaker: what does user see?"]
    : ["before a timeout: what happens when it times out?", "before a retry: what if the first one succeeded?", "before a breaker: what does the user see when open?"];
  return (
    <g>
      <Kick s={step === 0 ? "assume everything fails" : "how does this fail?"} narrow={narrow} tone={step === 0 ? "bad" : undefined} />
      <Pipe y={step === 0 ? 70 : 60} tone={step === 0 ? "bad" : "lit"} sub={step === 0 ? "will time out" : undefined} />
      {step === 0 &&
        fails.map((f, i) => (
          <g key={f} opacity={fade(t, i * 0.15)}>
            <Box x={20 + (i % 2) * 284} y={156 + Math.floor(i / 2) * 50} w={272} h={40} label={f} tone="bad" />
          </g>
        ))}
      {step === 1 &&
        qs.map((q, i) => (
          <g key={q} opacity={fade(t, i * 0.18)}>
            <Box x={20} y={146 + i * 54} w={W - 40} h={42} label={q} tone="lit" />
          </g>
        ))}
    </g>
  );
}

function Concepts({ step, t, narrow }: SceneProps) {
  const k = Math.min(step, 5);
  const p = ease(seg(t, 0.1, 0.9));
  if (k === 0) {
    const lanes = [
      ["A", "P99 200 ms → 500 ms", 500],
      ["B", "P99 500 ms → 2 s", 2000],
      ["C", "P99 100 ms → 300 ms", 300],
    ] as const;
    const bx = 524;
    return (
      <g>
        <Kick s="2 · timeouts" narrow={narrow} />
        {lanes.map(([n, s, ms], i) => (
          <g key={n}>
            <Txt x={20} y={70 + i * 58} k="s" anchor="start">{narrow ? `${n} · ${ms} ms` : `service ${n} · ${s}`}</Txt>
            <Meter x={20} y={78 + i * 58} w={504} h={20} value={ms * p} max={4500} tone="lit" />
          </g>
        ))}
        <Wire d={`M${bx} 50V250`} tone="ok" dash />
        <Txt x={bx} y={268} k="s" tone="ok">4.5 s</Txt>
        <Wire d="M580 50V250" tone="bad" dash />
        <Txt x={W - 20} y={44} k="s" anchor="end" tone="bad">{narrow ? "SLA 5 s" : "user SLA 5 s"}</Txt>
        <Readout narrow={narrow} l={["bad: 5 s each · bad: timeout = P99", "good: budget 4.5 s · A 2.5x · B 4x · C 3x P99"]} />
      </g>
    );
  }
  if (k === 1) {
    const hit = p;
    return (
      <g>
        <Kick s="3 · retry strategies" narrow={narrow} tone="bad" />
        {Array.from({ length: 10 }, (_, i) => {
          const x = 20 + (i % 5) * 50;
          const y = 80 + Math.floor(i / 5) * 70;
          return (
            <g key={i}>
              <Box x={x} y={y} w={42} h={34} label={`S${i + 1}`} />
              {hit < 1 && [0, 1, 2].map((j) => <Token key={j} x={lerp(x + 42, 400, hit)} y={lerp(y + 17, 150, hit) + (j - 1) * 6} s={6} tone="bad" />)}
            </g>
          );
        })}
        <Wire d="M270 150H400" tone="bad" arrow />
        <Box x={400} y={104} w={180} h={92} label={narrow ? "Service" : "Struggling svc"} tone="bad" />
        <Meter x={420} y={170} w={140} h={12} value={1 + 3 * p} max={4} tone="bad" ticks={4} />
        <Txt x={490} y={222} k="s" tone="bad">{`load ${(1 + 3 * p).toFixed(0)}x`}</Txt>
        <Readout narrow={narrow} l={["no delay: 30 retries hit at once", "fix: backoff, jitter, retry budgets, idempotency"]} tone="bad" />
      </g>
    );
  }
  if (k === 2) {
    const twice = t > 0.5;
    const tok = p < 0.5 ? { x: lerp(124, 170, p * 2), y: 158 } : { x: lerp(302, 360, p * 2 - 1), y: lerp(158, twice ? 95 : 195, p * 2 - 1) };
    return (
      <g>
        <Kick s="4 · idempotency" narrow={narrow} />
        <Txt x={20} y={74} k="s" anchor="start" tone="lit">{narrow ? "key: user123-order456-…" : "Idempotency-Key: user123-order456-attempt1"}</Txt>
        <Wire d="M124 158H170" arrow />
        <Wire d="M302 158H330V95H360" arrow tone={twice ? "lit" : undefined} />
        <Wire d="M302 158H330V195H360" arrow />
        <Box x={20} y={130} w={104} h={56} label="Client" />
        <Box x={170} y={130} w={132} h={56} label="Server" tone="lit" />
        <Box x={360} y={70} w={220} h={50} label={narrow ? "Key store" : "processed_requests"} sub={twice ? (narrow ? "cached" : "cached response") : undefined} tone={twice ? "ok" : undefined} />
        <Box x={360} y={170} w={220} h={50} label="Bank" sub="charged once" tone="ok" />
        {p > 0 && p < 1 && <Token {...tok} />}
        <Readout narrow={narrow} l={["POST /payments twice = charged twice", "key seen → cached response · no second charge"]} />
      </g>
    );
  }
  if (k === 3) {
    const st = [
      ["CLOSED", "normal", "ok"],
      ["OPEN", "fail fast", "bad"],
      ["HALF-OPEN", narrow ? "one test" : "one test request", "warn"],
    ] as const;
    return (
      <g>
        <Kick s="5 · circuit breakers" narrow={narrow} />
        {!narrow && (
          <>
            <Txt x={200} y={80} k="s">failures {">"} threshold</Txt>
            <Txt x={400} y={80} k="s">timeout</Txt>
          </>
        )}
        <Wire d="M180 118H220" arrow />
        <Wire d="M380 118H420" arrow />
        <Wire d="M500 146V196H100V146" arrow tone="ok" dash />
        <Txt x={300} y={214} k="s" tone="ok">success</Txt>
        {st.map(([l, s, tone], i) => (
          <g key={l} opacity={fade(t, i * 0.2)}>
            <Box x={20 + i * 200} y={90} w={160} h={56} label={l} sub={s} tone={tone} />
          </g>
        ))}
        <Readout narrow={narrow} l={["helps: stops cascades · fails fast · lets it recover", "hurts: opens on a spike · blocks all users"]} />
      </g>
    );
  }
  if (k === 4) {
    const g = [
      ["at-most-once", "may be lost", "warn", narrow ? "" : "fire and forget"],
      ["at-least-once", "may duplicate", "lit", narrow ? "" : "retry until ACK"],
      ["exactly-once", "+ idempotency", "ok", narrow ? "" : "= at-least-once"],
    ] as const;
    return (
      <g>
        <Kick s="6 · delivery guarantees" narrow={narrow} />
        {g.map(([l, s, tone, h], i) => (
          <g key={l} opacity={fade(t, i * 0.2)}>
            <Txt x={106 + i * 194} y={78} k="s">{h}</Txt>
            <Box x={20 + i * 194} y={90} w={172} h={60} label={l} sub={s} tone={tone} />
            <Token x={86 + i * 194} y={186} tone={i === 0 ? "mute" : "ok"} opacity={i === 0 ? 0.5 : 1} />
            {i === 1 && <Token x={126 + i * 194} y={186} tone="warn" />}
            {i === 0 && <Txt x={126} y={191} k="s" tone="bad">lost</Txt>}
            {i === 1 && <Txt x={166 + 194} y={191} k="s" tone="warn">dup</Txt>}
          </g>
        ))}
        <Readout narrow={narrow} l={["exactly-once is impossible without the receiver", "build: at-least-once + idempotent receivers"]} tone="ok" />
      </g>
    );
  }
  return (
    <g>
      <Kick s="7 · leader election" narrow={narrow} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          {i === 0 && <Wire d="M190 105H330" arrow tone="lit" />}
          <Box x={20} y={80 + i * 64} w={170} h={50} label={`Node ${i + 1}`} sub={i === 0 ? "leader" : narrow ? "waits" : "follower: I'll wait"} tone={i === 0 ? "lit" : undefined} dim={i > 0 && t > 0.5} />
        </g>
      ))}
      <Box x={330} y={80} w={250} h={50} label="daily_digest" sub={narrow ? "runs once" : "9 AM · runs once"} tone="ok" />
      <Readout narrow={narrow} l={["without election: the job runs 3 times", "Raft, Paxos · lease with TTL · ZooKeeper, etcd, Redis"]} />
    </g>
  );
}

const SYS: { kick: string; l: Lines }[] = [
  { kick: "system 1 · payments · days 1–3", l: ["bank returns \"maybe\" · user clicks Pay again", "notification fails: does payment fail too?"] },
  { kick: "system 2 · webhooks · day 4", l: ["1M webhooks/hour · at-least-once delivery", "slow (10 s) · down · 200 but not processed"] },
  { kick: "system 3 · distributed cron · day 5", l: ["9am digest · hourly reports · 15-min cleanup", "leader dies mid-job: twice, once or never?"] },
];

function Systems({ step, t, narrow }: SceneProps) {
  const k = Math.min(step, 2);
  const s = SYS[k];
  const o = fade(t, 0);
  let body;
  if (k === 0) {
    const bx = [
      ["User", "Pay $99"],
      [narrow ? "Fraud" : "Fraud check", "200 ms"],
      ["Bank API", "2000 ms"],
      ["Notify", "100 ms"],
    ];
    const days = [
      ["Day 1", "timeouts"],
      ["Day 2", "idempotency"],
      ["Day 3", narrow ? "breakers" : "circuit breakers"],
    ];
    body = (
      <g>
        {bx.map(([l, sub], i) => (
          <g key={l}>
            {i > 0 && <Wire d={`M${i * 150 - 20} 98H${20 + i * 150}`} arrow />}
            <Box x={20 + i * 150} y={70} w={110} h={56} label={l} sub={sub} tone={i === 2 ? "warn" : undefined} />
          </g>
        ))}
        {days.map(([l, sub], i) => (
          <g key={l} opacity={fade(t, 0.3 + i * 0.15)}>
            <Box x={20 + i * 190} y={160} w={176} h={56} label={l} sub={sub} tone="lit" />
          </g>
        ))}
      </g>
    );
  } else if (k === 1) {
    body = (
      <g>
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <Wire d={`M144 138H220V${76 + i * 62}H300`} arrow tone={i === 2 ? "bad" : undefined} />
            <Box x={300} y={54 + i * 62} w={150} h={44} label={`customer ${i + 1}`} sub={i === 2 ? "down" : undefined} tone={i === 2 ? "bad" : "ok"} />
          </g>
        ))}
        <Box x={20} y={110} w={124} h={56} label="Queue" sub="events" tone="lit" />
        <Wire d="M450 202H470" arrow tone="bad" />
        <Box x={470} y={178} w={110} h={48} label="DLQ" sub={narrow ? "50 fails" : "failed 50x"} tone="warn" />
      </g>
    );
  } else {
    body = (
      <g>
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <Box x={20} y={54 + i * 64} w={150} h={50} label={`Node ${i + 1}`} sub={i === 0 ? "leader" : "follower"} tone={i === 0 ? "lit" : undefined} />
            <Box x={330} y={54 + i * 64} w={250} h={50} label={`Worker ${i + 1}`} sub={i === 0 ? (narrow ? "digest · 50%" : "daily_digest · 50% done") : "idle"} tone={i === 0 ? "warn" : undefined} dim={i > 0} />
          </g>
        ))}
        <Wire d="M170 79H330" arrow tone="lit" />
        {!narrow && (
          <Txt x={250} y={70} k="s">9:00 AM trigger</Txt>
        )}
      </g>
    );
  }
  return (
    <g opacity={o}>
      <Kick s={s.kick} narrow={narrow} />
      {body}
      <Readout narrow={narrow} l={s.l} />
    </g>
  );
}

const PIT: { kick: string; bad: Lines; ok: Lines }[] = [
  { kick: "pitfall 1 · \"we'll just retry\"", bad: ["retry immediately, 3 times, any error", "amplifies load · may duplicate"], ok: ["exponential backoff with jitter,", "only on retryable errors"] },
  { kick: "pitfall 2 · \"long timeout = safe\"", bad: ["30 s timeout \"just to be safe\"", "spinner for 30 s · threads exhausted"], ok: ["timeout from the SLA + small buffer", "fail fast · free the resources"] },
  { kick: "pitfall 3 · \"breaker open = down\"", bad: ["circuit opens, return 500 to all", "same as no circuit breaker"], ok: ["fallback or degraded mode:", "\"delayed, we'll email confirmation\""] },
  { kick: "pitfall 4 · \"exactly-once is simple\"", bad: ["assume exactly-once is solved", "incident on the first retry"], ok: ["at-least-once + idempotent receivers:", "exactly-once is the emergent result"] },
];

function Pitfalls({ step, t, narrow }: SceneProps) {
  const p = PIT[Math.min(step, 3)];
  const card = (y: number, tone: Tone, tag: string, l: Lines, o: number) => (
    <g opacity={o}>
      <rect className={`ax-box ${tone}`} x={20} y={y} width={W - 40} height={100} />
      <Txt x={36} y={y + 26} k="k" anchor="start" tone={tone}>{tag}</Txt>
      <Txt x={36} y={y + 56} anchor="start">{l[0]}</Txt>
      <Txt x={36} y={y + 82} anchor="start">{cut(l[1], narrow)}</Txt>
    </g>
  );
  return (
    <g>
      <Kick s={p.kick} narrow={narrow} />
      {card(52, "bad", "bad", p.bad, fade(t, 0))}
      {card(176, "ok", "good", p.ok, fade(t, 0.35))}
      {!narrow && (
        <Txt x={W - 20} y={H - 14} k="s" anchor="end">ask &quot;what happens when this fails?&quot; first</Txt>
      )}
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "concepts") return <Concepts {...p} />;
  if (p.variant === "systems") return <Systems {...p} />;
  if (p.variant === "pitfalls") return <Pitfalls {...p} />;
  return <Mindset {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "mindset",
      label: "Mindset",
      steps: [
        { caption: "This week we assume everything you built will fail: networks drop packets, services crash mid-request, databases time out, users click twice.", tween: 1400 },
        { caption: "Week 1 asked how to make it work. Week 2 asks how it fails: before a timeout, a retry or a circuit breaker, ask what happens when it fires.", tween: 1400, ms: 3600 },
        { caption: "Failures come as crash, omission, timing and byzantine. This week focuses on omission and timing, the most common in distributed systems.", tween: 1200 },
      ],
    },
    {
      id: "concepts",
      label: "Concepts",
      steps: [
        { caption: "Timeouts: with a 5 s SLA, 5 s each leaves no time for the rest, and P99 times out 1% of healthy calls. Budget 4.5 s with headroom: 500 ms, 2 s, 300 ms.", tween: 1400, ms: 3800 },
        { caption: "Retries: 10 servers each retrying 3 times with no delay multiply load up to 4x. Use exponential backoff, jitter, retry budgets and idempotency.", tween: 1400 },
        { caption: "Idempotency: the client sends an idempotency key. If the server has seen it, it returns the cached response instead of charging again.", tween: 1600 },
        { caption: "Circuit breakers: closed passes requests, open fails fast without calling, half-open lets one request test recovery. They hurt when they open on a legitimate spike.", tween: 1400, ms: 3600 },
        { caption: "Delivery guarantees: at-most-once may lose, at-least-once may duplicate. Exactly-once is really at-least-once delivery with idempotent receivers.", tween: 1400 },
        { caption: "Leader election: without it, every node runs daily_digest at 9 AM, three times. With a leader, followers wait and the job runs once.", tween: 1200 },
      ],
    },
    {
      id: "systems",
      label: "Three systems",
      steps: [
        { caption: "System 1, the payment pipeline: fraud check, bank API, notification. Day 1 sets timeouts, day 2 makes it idempotent, day 3 adds circuit breakers.", tween: 1400, ms: 3600 },
        { caption: "System 2, webhook delivery at 1M webhooks an hour to endpoints you don't control. Customer 3 is down: guarantee at-least-once, with a dead letter queue.", tween: 1400, ms: 3600 },
        { caption: "System 3, a distributed job scheduler: the leader triggers daily_digest at 9 AM. If it dies mid-job, does the job run twice, once or never?", tween: 1600 },
      ],
    },
    {
      id: "pitfalls",
      label: "Pitfalls",
      steps: [
        { caption: "\"We'll just retry\": retrying immediately on any error amplifies load. Back off with jitter, retry only retryable errors, and let idempotency absorb duplicates.", tween: 1400 },
        { caption: "\"Long timeout = safe\": a 30 s timeout leaves users at a spinner and exhausts threads. Set it from the SLA plus a small buffer and fail fast.", tween: 1400 },
        { caption: "\"Circuit breaker opens = system down\": returning 500 to everyone is no better than no breaker. Use a fallback: \"Payment processing delayed, we'll email confirmation.\"", tween: 1400 },
        { caption: "\"Exactly-once is simple\": build for at-least-once with idempotent receivers, so every operation can be replayed and exactly-once emerges.", tween: 1400, ms: 3600 },
      ],
    },
  ],
  Scene,
});
