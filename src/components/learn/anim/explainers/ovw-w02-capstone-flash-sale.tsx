/**
 * The whole capstone, weeks 1–2 (MegaMart flash sale): the requirements, the estimates (150K req/s
 * peak, 2.4M notifications), the architecture walked path by path (claim, checkout, notifications,
 * scheduling), and the decisions: atomic counter over the alternatives, and what changes at 10x.
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
const grid = (cells: [string, string?, Tone?][], t: number, y = 56, h = 60) =>
  cells.map(([l, s, tone], i) => (
    <g key={l} opacity={fade(t, i * 0.12)}>
      <Box x={20 + (i % 2) * 284} y={y + Math.floor(i / 2) * (h + 14)} w={272} h={h} label={l} sub={s} tone={tone} />
    </g>
  ));

function Reqs({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    const st: [string, string][] = [["50M", "users (MAU)"], ["5M", "on one hype drop"], ["10,000", "units, 90% off"], ["10 min", "per sale"]];
    return (
      <g>
        <Kick s="design a flash sale for megamart" />
        {st.map(([v, s], i) => (
          <g key={v} opacity={fade(t, i * 0.12)}>
            <Box x={20 + i * 142} y={70} w={130} h={70} label={v} tone={i === 1 ? "lit" : "warn"} />
            <Txt x={85 + i * 142} y={166} k="s">{narrow ? ["users", "one sale", "units", "sale"][i] : s}</Txt>
          </g>
        ))}
        <Readout narrow={narrow} l={["\"Lightning Deals\" every hour · 3 minutes to check out", "pay through Stripe, notify by email and push"]} n={["a sale every hour", "Stripe · email and push"]} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Kick s="functional requirements" />
        {grid(
          narrow
            ? [["1 per user"], ["hold 3 min"], ["Stripe may fail", undefined, "warn"], ["notify millions"]]
            : [["one unit per user per sale"], ["claim held 3 min, then back"], ["Stripe may be slow or fail", undefined, "warn"], ["notify watchers + subscribers"]],
          t,
        )}
        <Readout narrow={narrow} l={["unclaimed items return to the pool for others", "exactly 10,000 successful orders, never more"]} n={["unclaimed units go back", "never more than 10,000"]} />
      </g>
    );
  }
  return (
    <g>
      <Kick s="non-functional requirements" tone="bad" />
      {grid([["no overselling", undefined, "bad"], ["no double-charging", undefined, "bad"], ["no lost orders", undefined, "bad"], [narrow ? "claim < 500 ms" : "claim < 500 ms p99", narrow ? "checkout < 3 s" : "checkout < 3 s p99", "lit"]], t)}
      <Readout narrow={narrow} l={["5M concurrent users on one sale", "push < 5 s · email < 30 s · degrade gracefully"]} n={["5M users on one sale", "push < 5 s, email < 30 s"]} />
    </g>
  );
}

function Estimate({ step, t, narrow }: SceneProps) {
  const p = ease(seg(t, 0.1, 0.9));
  if (step === 0) {
    const rows: [string, number][] = [["page views", 100000], ["claim attempts", 40000], ["stock checks", 10000], ["checkouts", 50]];
    return (
      <g>
        <Kick s="traffic per sale" />
        <Txt x={20} y={62} k="s" anchor="start">{narrow ? "5M / 600 s = 8,333/s avg" : "5M / 600 s = 8,333/s average · but 80% arrive in the first 30 s"}</Txt>
        {rows.map(([l, v], i) => (
          <g key={l}>
            <Txt x={20} y={98 + i * 36} k="s" anchor="start">{l}</Txt>
            <Meter x={170} y={86 + i * 36} w={300} h={16} value={Math.max(v, 1500) * p} max={100000} tone={i === 1 ? "lit" : "sky"} />
            <Txt x={W - 20} y={100 + i * 36} anchor="end">{v >= 1000 ? `${v / 1000}K` : `${v}`}</Txt>
          </g>
        ))}
        <Readout narrow={narrow} l={["(5M × 0.8) / 30 s = 133,333/s", "round up: 150,000 requests a second at peak"]} n={["peak: 133,333/s", "round up: 150K/s"]} tone="bad" />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Kick s="inventory and notifications" />
        {grid([["333/s", narrow ? "claims at peak" : "claims: 10,000 in 30 s"], ["56/s", narrow ? "checkouts" : "checkouts: 10,000 in 180 s"], ["2.4M", narrow ? "notifications" : "500K watchers + 2M subscribers"], ["80,000/s", narrow ? "in 30 s" : "50K push + 30K email"]], t)}
        <Readout narrow={narrow} l={["~70% check out · 3,000 timeouts refill the pool", "so about 15,000 claim operations in all"]} n={["~70% check out", "~15,000 claims in all"]} />
      </g>
    );
  }
  return (
    <g>
      <Kick s="infrastructure" />
      {grid([["60 API servers", narrow ? "5K req/s each, 2×" : "5,000 req/s each, 2× headroom", "lit"], ["Redis 3 + 3", narrow ? "primary + replica" : "3 primaries + 3 replicas", "sky"], ["PostgreSQL", narrow ? "primary + 2 RR" : "primary + 2 read replicas"], ["Kafka 6 brokers", narrow ? "~24 partitions" : "~24 partitions per topic"]], t)}
      <Readout narrow={narrow} l={["storage: ~10 MB per sale · ~90 GB a year", "notification logs: 480 MB a sale · ~4 TB a year"]} n={["~10 MB per sale", "logs: ~4 TB a year"]} />
    </g>
  );
}

type Id = "edge" | "sale" | "claim" | "co" | "redis" | "pg" | "kafka" | "stripe" | "sched";
const NODES: Record<Id, { x: number; y: number; w: number; l: string; n?: string }> = {
  edge: { x: 20, y: 98, w: 150, l: "CDN·WAF·ALB" },
  sale: { x: 205, y: 46, w: 150, l: "Sale page" },
  claim: { x: 205, y: 98, w: 150, l: "Claim API" },
  co: { x: 205, y: 150, w: 150, l: "Checkout" },
  redis: { x: 400, y: 46, w: 180, l: "Redis Cluster" },
  pg: { x: 205, y: 212, w: 120, l: "PostgreSQL", n: "Postgres" },
  kafka: { x: 335, y: 212, w: 110, l: "Kafka" },
  stripe: { x: 455, y: 212, w: 125, l: "Stripe" },
  sched: { x: 20, y: 212, w: 150, l: "Scheduler" },
};
const WIRES: [Id, Id, string][] = [
  ["edge", "sale", "M170 120H185V68H205"], ["edge", "claim", "M170 120H205"], ["edge", "co", "M170 120H185V172H205"],
  ["sale", "redis", "M355 68H400"], ["claim", "redis", "M355 120H400"], ["co", "redis", "M355 172H400"],
  ["redis", "pg", "M410 194V203H265V212"], ["redis", "kafka", "M430 194V212"], ["redis", "stripe", "M520 194V212"],
];
const DES: { kick: string; on: Id[]; sub: Partial<Record<Id, string>>; l: Lines; n: Lines }[] = [
  { kick: "high-level design", on: ["edge", "sale", "claim", "co", "redis"], sub: { sale: "60 servers", claim: "20 servers", co: "20 servers", redis: "inventory · claims" }, l: ["CDN serves 80% of traffic · read, write and critical paths split", "Redis for the hot path · PostgreSQL for orders"], n: ["CDN serves 80%", "Redis hot, Postgres orders"] },
  { kick: "claim · no database in the hot path", on: ["edge", "claim", "redis", "kafka"], sub: { claim: "rate limit 10/min", redis: "Lua: DECR + claim", kafka: "claim_events" }, l: ["claim:{sale_id}:{user_id} exists → return the same claim", "atomic Lua: no check-then-decrement race · never below 0"], n: ["same user → same claim", "atomic Lua script"] },
  { kick: "checkout · days 1, 2, 3", on: ["co", "redis", "stripe", "pg", "kafka"], sub: { co: "validate claim", redis: "idempotency:{claim}", stripe: "10 s · breaker", pg: "order txn", kafka: "order_events" }, l: ["Stripe idempotency_key=claim_{claim_id} · expired claim: 410", "timeout: verify the payment before failing it"], n: ["Stripe key claim_{id}", "timeout: verify first"] },
  { kick: "notifications · day 4", on: ["kafka", "redis", "sched"], sub: { sched: "T-10 min", redis: "24 lists × 100K", kafka: "trigger" }, l: ["recipients precomputed, not at 10:00:00 · 2.4M queued in ~10 s", "push pool ~50,000/s · email pool ~30,000/s"], n: ["precompute recipients", "push 50K/s, email 30K/s"] },
  { kick: "sale scheduling · day 5", on: ["sched", "redis", "kafka"], sub: { sched: "etcd leader", redis: "init inventory", kafka: "sale_events" }, l: ["verify the fencing token · only the leader runs", "at the end: return unclaimed inventory, write a report"], n: ["check the fencing token", "end: return inventory"] },
];

function Design({ step, t, narrow }: SceneProps) {
  const s = DES[Math.min(step, 4)];
  const on = (id: Id) => s.on.includes(id);
  const p = ease(seg(t, 0.1, 0.9));
  return (
    <g>
      <Kick s={s.kick} />
      {WIRES.map(([a, b, d]) => <Wire key={d} d={d} tone={on(a) && on(b) ? "lit" : "mute"} arrow />)}
      {(Object.keys(NODES) as Id[]).map((id) => {
        const b = NODES[id];
        const sub = narrow ? undefined : s.sub[id];
        return <Box key={id} x={b.x} y={b.y} w={b.w} h={id === "redis" ? 148 : 44} label={narrow && b.n ? b.n : b.l} sub={on(id) ? sub : undefined} tone={on(id) ? (id === "redis" ? "sky" : "lit") : undefined} dim={!on(id)} />;
      })}
      {p > 0 && p < 1 && on("edge") && <Token x={lerp(170, 400, p)} y={120} />}
      <Readout narrow={narrow} l={s.l} n={s.n} />
    </g>
  );
}

function Decision({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    const alt: [string, string][] = [["queue-based claims", narrow ? "too slow" : "adds latency to an instant claim"], ["decrement at checkout", narrow ? "looks available" : "shows stock that isn't there"], ["lock per item", narrow ? "10,000 locks" : "10,000 locks, a nightmare"]];
    return (
      <g>
        <Kick s="alternatives considered" />
        {alt.map(([l, s], i) => (
          <g key={l} opacity={fade(t, i * 0.15)}>
            <Box x={20} y={50 + i * 56} w={W - 40} h={46} label={l} sub={s} tone="bad" />
          </g>
        ))}
        <g opacity={fade(t, 0.6)}>
          <Box x={20} y={222} w={W - 40} h={40} label={narrow ? "atomic Redis counter" : "chosen: an atomic Redis counter, claim then checkout"} tone="ok" />
        </g>
        <Readout narrow={narrow} l={["", "instant answers that still never oversell"]} n={["", "instant, never oversells"]} tone="ok" />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Kick s="at 10x: 50M users, 100K units" />
        {grid(
          narrow
            ? [["1.5M req/s", "regions, edge"], ["shard inventory", "by region"], ["24M in 30 s", "pre-send hint"], ["Vitess, Cockroach", "scale the DB"]]
            : [["1.5M req/s peak", "regions, edge caching"], ["shard inventory", "regional pools"], ["24M notifications", "pre-send, progressive"], ["Vitess or CockroachDB", "single primary bottleneck"]],
          t,
        )}
        <Readout narrow={narrow} l={["display count: eventual · a claim: strong", "a stale \"units left\" is harmless, an oversell isn't"]} n={["display eventual, claim strong", "a stale count is harmless"]} tone="ok" />
      </g>
    );
  }
  const map: [string, string][] = [["timeouts", narrow ? "10 s payment" : "10 s payment, 25 s checkout"], ["idempotency", narrow ? "claim, checkout" : "claim, checkout, Stripe key"], ["breakers", narrow ? "Stripe, FCM" : "Stripe, FCM / APNs, Redis"], ["webhooks · cron", narrow ? "notify, schedule" : "notifications, sale scheduling"]];
  return (
    <g>
      <Kick s="weeks 1–2, applied" tone="ok" />
      {grid(map.map(([l, s]) => [l, s, "ok"] as [string, string, Tone]), t)}
      <Readout narrow={narrow} l={["partitioning · replication · rate limits · hot keys", "every component asked: what happens when this fails?"]} n={["week 1 + week 2", "what happens when it fails?"]} />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "estimate") return <Estimate {...p} />;
  if (p.variant === "design") return <Design {...p} />;
  if (p.variant === "decision") return <Decision {...p} />;
  return <Reqs {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "reqs",
      label: "Requirements",
      steps: [
        { caption: "MegaMart's Lightning Deals: 10,000 units at 90% off for exactly 10 minutes, every hour. 50M monthly users, up to 5M on one hype drop, 3 minutes to check out.", tween: 1400, ms: 3600 },
        { caption: "One unit per user per sale; a claim is held 3 minutes, then returns to the pool. Payments go through Stripe, which may be slow or fail, and millions get notified.", tween: 1400, ms: 3600 },
        { caption: "Never oversell, never double-charge, never lose an order. Claims answer in under 500 ms at p99 and checkout in under 3 seconds.", tween: 1200 },
      ],
    },
    {
      id: "estimate",
      label: "Estimate",
      steps: [
        { caption: "5M users over 600 seconds averages 8,333 requests a second, but 80% arrive in the first 30 seconds: 133,333, rounded to 150,000 a second at peak.", tween: 1400, ms: 3600 },
        { caption: "Claims peak at 333 a second and checkouts at 56. Notifications: 2.4M recipients in 30 seconds is 80,000 a second, 50,000 push and 30,000 email.", tween: 1400, ms: 3600 },
        { caption: "That's 60 API servers with 2× headroom, a Redis cluster of 3 primaries and 3 replicas, PostgreSQL with 2 read replicas, and 6 Kafka brokers.", tween: 1400 },
      ],
    },
    {
      id: "design",
      label: "Design",
      steps: [
        { caption: "CDN, WAF and load balancer in front; sale page, claim and checkout APIs scaled separately; Redis holds inventory and claims; PostgreSQL, Kafka and Stripe behind.", tween: 1600, ms: 3600 },
        { caption: "A claim: rate limit at 10 a minute, return any existing claim, then one atomic Lua script decrements inventory and stores the claim. No database in the hot path.", tween: 1400, ms: 3600 },
        { caption: "Checkout: validate the claim, check idempotency, charge Stripe behind a breaker with a 10-second timeout and the claim as its idempotency key, then write the order.", tween: 1400, ms: 3600 },
        { caption: "Ten minutes before the sale, 2.4M recipients are precomputed into 24 Redis lists. At start, a Kafka trigger lets 24 workers queue them all in about 10 seconds.", tween: 1400, ms: 3600 },
        { caption: "Sales are started by a leader elected in etcd. It verifies its fencing token, initializes inventory and triggers notifications, so each sale starts once.", tween: 1400 },
      ],
    },
    {
      id: "decision",
      label: "Decisions",
      steps: [
        { caption: "Rejected: queue-based claims (too slow for an instant claim), decrementing only at checkout (shows stock that isn't there), a lock per item (10,000 locks). An atomic counter wins.", tween: 1400, ms: 3600 },
        { caption: "At 10x, 1.5M requests a second: regional inventory pools, eventual consistency for the displayed count but strong consistency for claims, and a horizontally scaled database.", tween: 1400, ms: 3600 },
        { caption: "Every week 2 pattern has a job here: timeouts on payment, idempotency on claims and checkout, breakers on Stripe and push, webhooks for notifications, cron for sales.", tween: 1400, ms: 3600 },
      ],
    },
  ],
  Scene,
});
