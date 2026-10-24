/**
 * The whole lesson, week 1 preview (Data at Scale): one PostgreSQL meets 100M records and
 * 10,000 req/s; the week's five concepts grow it into partitions and replicas; the three systems
 * (URL shortener, rate limiter, session store); and the four pitfalls, wrong vs right.
 */
import { Box, defineExplainer, ease, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 330;
type R = { x: number; y: number; w: number; h: number };
const CL: R = { x: 20, y: 132, w: 104, h: 56 };
const SV: R = { x: 150, y: 132, w: 132, h: 56 };
const DB: R = { x: 330, y: 132, w: 240, h: 56 };
const P = [0, 1, 2, 3].map((i) => ({ x: 320, y: 50 + i * 52, w: 104, h: 40 }));
const RP = P.map((p) => ({ ...p, x: 466 }));
const D1: R = { x: 330, y: 70, w: 240, h: 56 };
const D2: R = { x: 330, y: 160, w: 240, h: 56 };

const rc = (b: R) => ({ x: b.x + b.w, y: b.y + b.h / 2 });
/** fade-in of something that appears at step k */
const show = (step: number, t: number, k: number) => (step > k ? 1 : step === k ? ease(seg(t, 0, 0.6)) : 0);
const fork = (b: R) => `M${SV.x + SV.w} ${SV.y + SV.h / 2}H${SV.x + SV.w + 20}V${b.y + b.h / 2}H${b.x}`;

type Lines = [string, string];
function Readout({ l, narrow, tone }: { l: Lines; narrow: boolean; tone?: Tone }) {
  return (
    <g>
      <Txt x={20} y={H - 38} k="s" anchor="start" tone={tone}>
        {narrow ? l[0].split(" · ")[0] : l[0]}
      </Txt>
      <Txt x={20} y={H - 14} k="s" anchor="start">
        {narrow ? l[1].split(" · ")[0] : l[1]}
      </Txt>
    </g>
  );
}

function Problem({ step, t, narrow }: SceneProps) {
  const p = ease(seg(t, 0, 0.9));
  const tok = step === 0 && p < 1 ? (p < 0.5 ? { x: lerp(rc(CL).x, SV.x, p * 2), y: 160 } : { x: lerp(rc(SV).x, DB.x, p * 2 - 1), y: 160 }) : null;
  const stats = [
    ["100M", "records"],
    ["10,000", "req/s"],
    ["3", "continents"],
    ["99.99%", "uptime"],
  ];
  const qs = narrow ? ["access?", "consistency?", "growth?", "node fails?"] : ["access patterns?", "consistency needed?", "how will it grow?", "a node fails?"];
  const dbTone: Tone = step === 0 ? "ok" : step === 1 ? "warn" : step === 2 ? "bad" : "lit";
  const dbSub = step === 0 ? "one database" : step === 1 ? "under load" : step === 2 ? (narrow ? "100 questions" : "a hundred questions") : narrow ? "design it" : "design the storage";
  const kick = ["where does the data live?", "the scale arrives", "\"just use PostgreSQL\"?", "the mindset shift"][Math.min(step, 3)];
  return (
    <g>
      <Txt x={20} y={30} k="k" anchor="start" tone={step === 2 ? "bad" : undefined}>
        {kick}
      </Txt>
      <Wire d={`M${rc(CL).x} 160H${SV.x}`} arrow />
      <Wire d={`M${rc(SV).x} 160H${DB.x}`} arrow />
      <Box {...CL} label="Users" />
      <Box {...SV} label="Service" />
      <Box {...DB} label="PostgreSQL" sub={dbSub} tone={dbTone} />
      {tok && <Token {...tok} />}
      {stats.map(([v, s], i) => (
        <g key={s} opacity={step === 1 || step === 2 ? show(step, t, 1) : 0}>
          <Box x={20 + i * 142} y={222} w={130} h={56} label={v} sub={s} tone={step === 2 ? "bad" : "warn"} />
        </g>
      ))}
      {step >= 3 &&
        qs.map((q, i) => (
          <g key={q} opacity={seg(t, i * 0.15, i * 0.15 + 0.4)}>
            <Box x={20 + (i % 2) * 284} y={214 + Math.floor(i / 2) * 50} w={272} h={40} label={q} tone="lit" />
          </g>
        ))}
      {step === 0 && <Readout narrow={narrow} l={["Every backend: where does the data live?", "and how do you access it efficiently?"]} />}
    </g>
  );
}

const CONCEPT: { kick: string; l: Lines; tone?: Tone }[] = [
  { kick: "1 · partitioning", l: ["hash: even spread · breaks on range queries", "range: time-series · directory: lookup hop"] },
  { kick: "2 · replication", l: ["sync: one slow replica slows everyone", "async: fast writes · stale replicas"] },
  { kick: "3 · consistency", l: ["strong · eventual · read-your-writes", "\"eventual\" is often fine"] },
  { kick: "4 · hot keys", l: ["0.01% of URLs get 90% of traffic", "one viral key · one hot partition"], tone: "bad" },
  { kick: "5 · consistent hashing", l: ["modulo: massive data movement", "consistent hashing: minimal resharding"], tone: "ok" },
];

function Concepts({ step, t, narrow }: SceneProps) {
  const c = CONCEPT[Math.min(step, 4)];
  const rows = step >= 4 ? 4 : 3;
  const rep = show(step, t, 1);
  const flow = ease(seg(t, 0.2, 0.9));
  const toks: { x: number; y: number; tone?: Tone }[] = [];
  if (step === 1 && flow < 1) [0, 1, 2].forEach((i) => toks.push({ x: lerp(P[i].x + P[i].w, RP[i].x, flow), y: P[i].y + 20, tone: "sky" }));
  if (step === 2 && flow < 1) toks.push(flow < 0.5 ? { x: lerp(rc(SV).x, P[0].x, flow * 2), y: lerp(160, 70, flow * 2) } : { x: lerp(P[0].x + P[0].w, RP[0].x, flow * 2 - 1), y: 70, tone: "sky" });
  if (step === 3) [0, 0.15, 0.3, 0.45, 0.6].forEach((o) => { const q = seg(t, o, o + 0.35); if (q > 0 && q < 1) toks.push({ x: lerp(rc(SV).x, P[1].x, q), y: lerp(160, 122, q), tone: "bad" }); });
  if (step === 4 && flow < 1) toks.push({ x: P[2].x + 52, y: lerp(P[2].y + 40, P[3].y, flow), tone: "ok" });
  const stale = step === 2 && t < 0.85;
  return (
    <g>
      <Txt x={20} y={30} k="k" anchor="start" tone={c.tone}>
        {c.kick}
      </Txt>
      <Wire d={`M${rc(CL).x} 160H${SV.x}`} arrow />
      <Box {...CL} label="Users" />
      <Box {...SV} label="Service" />
      {P.slice(0, rows).map((b, i) => {
        const hot = step === 3 && i === 1;
        const add = i === 3;
        return (
          <g key={i} opacity={add ? show(step, t, 4) : step === 0 ? ease(seg(t, i * 0.2, i * 0.2 + 0.4)) : 1}>
            <Wire d={fork(b)} tone={hot ? "bad" : undefined} dash={add} />
            <Box {...b} label={`P${i + 1}`} sub={hot ? "hot key" : add ? "new" : undefined} tone={hot ? "bad" : add ? "ok" : step === 3 ? undefined : "lit"} dim={step === 3 && !hot} />
            {i < 3 && (
              <g opacity={rep}>
                <Wire d={`M${b.x + b.w} ${b.y + 20}H${RP[i].x}`} dash />
                <Box {...RP[i]} label={`R${i + 1}`} sub={i === 0 && step === 2 ? (stale ? "stale" : "caught up") : undefined} tone={i === 0 && step === 2 ? (stale ? "warn" : "ok") : "sky"} dim={step === 3} />
              </g>
            )}
          </g>
        );
      })}
      {toks.map((k, i) => (
        <Token key={i} {...k} />
      ))}
      <Readout narrow={narrow} l={c.l} tone={c.tone} />
    </g>
  );
}

const SYS: { kick: string; cl: string; sv: string; d1: string; d2: string; l: Lines; d2t: Tone }[] = [
  { kick: "system 1 · days 1, 2, 4", cl: "Client", sv: "Shortener", d1: "Partition cluster", d2: "Cache · Redis", l: ["100M creates/day · 1B redirects/day", "viral: 1M hits/sec on one short code"], d2t: "sky" },
  { kick: "system 2 · day 3", cl: "Requests", sv: "Limiter", d1: "Redis Cluster", d2: "allow / deny", l: ["10,000 req/s across 50 servers", "a Redis node dies: over- or under-allow?"], d2t: "warn" },
  { kick: "system 3 · day 5", cl: "LB", sv: "App 1–3", d1: "Session store", d2: "Redis · Dynamo · custom", l: ["10M concurrent sessions", "datacenter failover: the user experience?"], d2t: "lit" },
];

function Systems({ step, t, narrow }: SceneProps) {
  const s = SYS[Math.min(step, 2)];
  const p = ease(seg(t, 0.1, 0.9));
  const tok = p > 0 && p < 1 ? (p < 0.4 ? { x: lerp(rc(CL).x, SV.x, p / 0.4), y: 160 } : { x: lerp(rc(SV).x, D1.x, (p - 0.4) / 0.6), y: lerp(160, 98, (p - 0.4) / 0.6) }) : null;
  const d2 = narrow && step === 2 ? "Redis · Dynamo?" : s.d2;
  return (
    <g opacity={ease(seg(t, 0, 0.3))}>
      <Txt x={20} y={30} k="k" anchor="start">
        {s.kick}
      </Txt>
      <Wire d={`M${rc(CL).x} 160H${SV.x}`} arrow />
      <Wire d={fork(D1)} arrow />
      <Wire d={fork(D2)} arrow />
      <Box {...CL} label={s.cl} />
      <Box {...SV} label={s.sv} tone="lit" />
      <Box {...D1} label={s.d1} />
      <Box {...D2} label={d2} tone={s.d2t} />
      {tok && <Token {...tok} />}
      <Readout narrow={narrow} l={s.l} />
    </g>
  );
}

const PIT: { kick: string; bad: Lines; ok: Lines }[] = [
  { kick: "pitfall 1 · jumping to solutions", bad: ["\"We'll use Redis Cluster.\"", ""], ok: ["access pattern X, consistency Y, scale Z:", "given that, Redis Cluster makes sense"] },
  { kick: "pitfall 2 · ignoring failures", bad: ["\"It's replicated, so we're good.\"", ""], ok: ["when the leader fails, these requests fail;", "our SLA allows for that"] },
  { kick: "pitfalls 3, 4 · over / under", bad: ["\"Consistent hashing + virtual nodes now.\"", "\"Just one big PostgreSQL instance.\""], ok: ["modulo works at our scale today;", "here's the trigger to partition"] },
];

function Pitfalls({ step, t, narrow }: SceneProps) {
  const p = PIT[Math.min(step, 2)];
  const card = (y: number, tone: Tone, tag: string, l: Lines, o: number) => (
    <g opacity={o}>
      <rect className={`ax-box ${tone}`} x={20} y={y} width={W - 40} height={100} />
      <Txt x={36} y={y + 26} k="k" anchor="start" tone={tone}>
        {tag}
      </Txt>
      <Txt x={36} y={y + 56} anchor="start">
        {l[0]}
      </Txt>
      <Txt x={36} y={y + 82} anchor="start">
        {l[1]}
      </Txt>
    </g>
  );
  const kick = narrow ? p.kick.split(" · ")[0] : p.kick;
  return (
    <g>
      <Txt x={20} y={30} k="k" anchor="start">
        {kick}
      </Txt>
      {card(52, "bad", "wrong", p.bad, ease(seg(t, 0, 0.4)))}
      {card(176, "ok", "right", p.ok, ease(seg(t, 0.35, 0.8)))}
      {!narrow && (
        <Txt x={W - 20} y={H - 14} k="s" anchor="end">
          access patterns → consistency → scale → failures
        </Txt>
      )}
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "concepts") return <Concepts {...p} />;
  if (p.variant === "systems") return <Systems {...p} />;
  if (p.variant === "pitfalls") return <Pitfalls {...p} />;
  return <Problem {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "problem",
      label: "Big picture",
      steps: [
        { caption: "Every backend system has one fundamental problem: where does the data live, and how do you access it efficiently?", tween: 1600 },
        { caption: "That sounds simple until you have 100 million records, 10,000 requests per second, users on three continents and 99.99% uptime.", tween: 1200 },
        { caption: "Suddenly \"just use PostgreSQL\" isn't an answer. It's the beginning of a hundred questions.", tween: 900 },
        { caption: "So stop asking PostgreSQL or MongoDB. Ask about access patterns, consistency, growth and node failure, then decide how to store and partition.", tween: 1400, ms: 3600 },
      ],
    },
    {
      id: "concepts",
      label: "Five concepts",
      steps: [
        { caption: "Partitioning splits data across machines. Hash spreads it evenly but loses range queries; range suits time-series but makes hot spots; directory adds a lookup.", tween: 1400, ms: 3600 },
        { caption: "Replication adds copies for availability and read scaling. Synchronous is strongly consistent but one slow replica slows everyone; asynchronous replicas can serve stale data.", tween: 1600, ms: 3600 },
        { caption: "Consistency means different things: strong, eventual, or read-your-writes, where you see your own writes at once. Eventual is often fine.", tween: 1800 },
        { caption: "Data isn't uniform: 0.01% of URLs get 90% of traffic. You'll design systems that don't fall over when one key goes viral.", tween: 1800 },
        { caption: "Adding a server: naive modulo hashing causes massive data movement, and consistent hashing minimizes the resharding pain.", tween: 1600 },
      ],
    },
    {
      id: "systems",
      label: "Three systems",
      steps: [
        { caption: "System 1, a URL shortener: 100 million creations and 1 billion redirects a day. What if one short URL gets 1M hits a second?", tween: 1600 },
        { caption: "System 2, a distributed rate limiter: 10,000 requests per second across 50 servers. When a Redis node dies, do you over-allow or under-allow?", tween: 1600 },
        { caption: "System 3, a session store for 10 million concurrent sessions with datacenter failover, ending in a decision: Redis Cluster, DynamoDB or custom.", tween: 1600, ms: 3600 },
      ],
    },
    {
      id: "pitfalls",
      label: "Pitfalls",
      steps: [
        { caption: "Don't jump to solutions. State the access pattern, consistency requirement and scale first; then say why Redis Cluster fits.", tween: 1400 },
        { caption: "Don't ignore failures. \"It's replicated\" isn't a plan; say what fails during leader failover and why the SLA allows it.", tween: 1400 },
        { caption: "Don't over- or under-engineer. Simple modulo hashing may work today; name the scale that triggers partitioning and the key you'd use.", tween: 1400, ms: 3600 },
      ],
    },
  ],
  Scene,
});
