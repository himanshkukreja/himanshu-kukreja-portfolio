/**
 * The whole lesson, week 0 part 6 (terminology and theory): the trade-offs (CAP, PACELC, ACID vs
 * BASE), scaling (vertical vs horizontal, sharding, consistent hashing, replication and quorums),
 * data and messaging (cache stampede, queue vs stream, idempotency, sagas) and reliability.
 */
import { Box, defineExplainer, ease, lerp, Meter, polar, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 330;
type Lines = [string, string];
const fade = (t: number, a = 0, b = 0.55) => ease(seg(t, a, b));
const nw = (narrow: boolean, a: string, b: string) => (narrow ? b : a);
/** "wide|narrow", or the first " · " part when narrow */
const nl = (s: string, narrow: boolean) => (s.includes("|") ? s.split("|")[narrow ? 1 : 0] : narrow ? s.split(" · ")[0] : s);
const Kick = ({ s, tone }: { s: string; tone?: Tone }) => <Txt x={20} y={30} k="k" anchor="start" tone={tone}>{s}</Txt>;
function Readout({ l, narrow, tone }: { l: Lines; narrow: boolean; tone?: Tone }) {
  return (
    <g>
      <Txt x={20} y={H - 38} k="s" anchor="start" tone={tone}>{nl(l[0], narrow)}</Txt>
      <Txt x={20} y={H - 14} k="s" anchor="start">{nl(l[1], narrow)}</Txt>
    </g>
  );
}
function Card({ x, y, w, h, title, lines, tone, o = 1 }: { x: number; y: number; w: number; h: number; title: string; lines: string[]; tone?: Tone; o?: number }) {
  return (
    <g opacity={o}>
      <rect className={`ax-box ${tone || ""}`} x={x} y={y} width={w} height={h} />
      <Txt x={x + 12} y={y + 24} k="k" anchor="start" tone={tone}>{title}</Txt>
      {lines.map((l, i) => <Txt key={i} x={x + 12} y={y + 52 + i * 26} anchor="start">{l}</Txt>)}
    </g>
  );
}
const el = (x1: number, y1: number, x2: number, y2: number, tone?: Tone, dash?: boolean) => <Wire d={`M${x1} ${y1}H${(x1 + x2) / 2}V${y2}H${x2}`} tone={tone} dash={dash} arrow />;
const go = (p: number, x1: number, y1: number, x2: number, y2: number, tone?: Tone) => (p > 0 && p < 1 ? <Token x={lerp(x1, x2, p)} y={lerp(y1, y2, p)} tone={tone} /> : null);

/* ---------------------------------------------------------------- 1 · trade-offs */
function Tradeoffs({ step, t, narrow }: SceneProps) {
  const p = ease(seg(t, 0.1, 0.8));
  if (step === 0)
    return (
      <g>
        <Kick s="CAP · during a partition" />
        <Box x={20} y={50} w={120} h={44} label="write 100" />
        <Box x={460} y={50} w={120} h={44} label="read ?" />
        <Wire d="M80 94V120" arrow />
        <Wire d="M520 94V120" arrow />
        <Box x={20} y={120} w={120} h={56} label="Node A" sub="100" tone="lit" />
        <Box x={460} y={120} w={120} h={56} label="Node B" sub="old value" tone="sky" />
        <Wire d="M140 148H460" tone="bad" dash />
        <Txt x={300} y={140} k="s" tone="bad">{nw(narrow, "network partition", "partition")}</Txt>
        <Box x={250} y={196} w={160} h={48} label="CP: error" sub={narrow ? undefined : "ZooKeeper, etcd"} tone="warn" opacity={fade(t, 0.3, 0.7)} />
        <Box x={420} y={196} w={160} h={48} label="AP: stale" sub={narrow ? undefined : "Cassandra, DNS"} tone="ok" opacity={fade(t, 0.5, 0.9)} />
        <Readout narrow={narrow} l={["partitions will happen: P is a given, so choose C or A|P is given: choose C or A", "payments choose CP · profiles and feeds choose AP|payments CP, feeds AP"]} />
      </g>
    );
  if (step === 1) {
    const r = [70, 130, 190];
    return (
      <g>
        <Kick s="PACELC · else, latency or consistency" />
        <Box x={20} y={102} w={110} h={56} label="Client" />
        <Box x={190} y={102} w={120} h={56} label="Leader" tone="lit" />
        <Wire d="M130 130H190" arrow />
        {r.map((y, i) => <g key={y}>{el(310, 130, 420, y + 18, i === 2 ? "warn" : undefined)}<Box x={420} y={y} w={160} h={36} label={`Replica ${i + 1}`} tone={i === 2 ? "warn" : "ok"} /></g>)}
        <Txt x={470} y={242} k="s" tone="warn">{nw(narrow, "slowest replica sets the pace", "slowest one")}</Txt>
        {go(p, 310, 130, 420, 208, "warn")}
        <Readout narrow={narrow} l={["no partition, still a trade-off: coordination adds latency|coordination adds latency", "DynamoDB, Cassandra: PA/EL · HBase: PC/EC|Dynamo PA/EL, HBase PC/EC"]} />
      </g>
    );
  }
  if (step === 2) {
    const L: [string, string, string][] = [["A", "atomicity", "all or nothing"], ["C", "consistency", "valid → valid"], ["I", "isolation", "no interference"], ["D", "durability", "survives crashes"]];
    return (
      <g>
        <Kick s="ACID · transfer $100" />
        <Box x={20} y={50} w={170} h={50} label="Account A" sub="− $100" tone="lit" opacity={fade(t, 0, 0.3)} />
        <Box x={215} y={50} w={170} h={50} label="Account B" sub="+ $100" tone="lit" opacity={fade(t, 0.15, 0.45)} />
        <Box x={410} y={50} w={170} h={50} label="COMMIT" sub={nw(narrow, "both or neither", "both/neither")} tone="ok" opacity={fade(t, 0.3, 0.6)} />
        {L.map(([a, b, c], i) => (
          <g key={a} opacity={fade(t, 0.4 + i * 0.1, 0.7 + i * 0.1)}>
            <Txt x={20 + i * 145} y={160} k="d" anchor="start" tone="lit">{a}</Txt>
            {!narrow && <Txt x={48 + i * 145} y={150} k="s" anchor="start">{b}</Txt>}
            <Txt x={20 + i * 145} y={188} k="s" anchor="start">{narrow ? b : c}</Txt>
          </g>
        ))}
        <Readout narrow={narrow} l={["guarantees for database transactions · pessimistic: lock early|transaction guarantees", "isolation levels trade safety for concurrency|isolation levels vary"]} />
      </g>
    );
  }
  return (
    <g>
      <Kick s="ACID vs BASE" />
      <Card x={20} y={50} w={270} h={176} tone="sky" title="ACID · strong" o={fade(t)} lines={narrow ? ["payments", "inventory", "accounts"] : ["financial transactions", "inventory", "user accounts"]} />
      <Card x={310} y={50} w={270} h={176} tone="ok" title="BASE · eventual" o={fade(t, 0.3, 0.8)} lines={narrow ? ["social feeds", "catalogs", "sessions"] : ["social media feeds", "product catalogs", "session stores"]} />
      <Txt x={300} y={252} k="s" opacity={fade(t, 0.6, 1)}>{nw(narrow, "linearizable → sequential → causal → eventual", "strong → eventual")}</Txt>
      <Readout narrow={narrow} l={["BASE: basically available · soft state · eventually consistent|BASE: eventually consistent", "different parts of one system can choose differently|mix them per feature"]} />
    </g>
  );
}

/* ---------------------------------------------------------------- 2 · scaling */
function Scaling({ step, t, narrow }: SceneProps) {
  if (step === 0)
    return (
      <g>
        <Kick s="vertical vs horizontal" />
        <g opacity={fade(t)}>
          <Box x={20} y={60} w={250} h={120} label={nw(narrow, "64 cores · 512 GB", "64 cores")} sub={nw(narrow, "was 4 cores · 16 GB", "was 4")} tone="warn" />
          <Txt x={145} y={206} k="s">{nw(narrow, "scale up: simple, but limited", "scale up")}</Txt>
        </g>
        <g opacity={fade(t, 0.35, 0.85)}>
          <Box x={300} y={100} w={80} h={40} label="LB" tone="lit" />
          {[0, 1, 2].map((i) => <g key={i}>{el(380, 120, 460, 76 + i * 44)}<Box x={460} y={58 + i * 44} w={120} h={36} label={`S${i + 1}`} tone="ok" /></g>)}
          <Txt x={440} y={206} k="s">{nw(narrow, "scale out: near-infinite", "scale out")}</Txt>
        </g>
        <Readout narrow={narrow} l={["up: no code changes · hardware limits, single point of failure|up: limits, one SPOF", "out: fault tolerant, commodity hardware · distributed complexity|out: distributed complexity"]} />
      </g>
    );
  if (step === 1)
    return (
      <g>
        <Kick s="sharding · hash(user_id) % 4" />
        {["A", "B", "C", "D"].map((s, i) => <Box key={s} x={20 + i * 145} y={120} w={125} h={56} label={`Shard ${s}`} sub={narrow ? `% 4 = ${i}` : `hash % 4 = ${i}`} tone="sky" opacity={fade(t, i * 0.12, i * 0.12 + 0.35)} />)}
        {[1, 2, 3, 4].map((k, i) => <Token key={k} x={82 + (k % 4) * 145} y={lerp(60, 112, fade(t, 0.3 + i * 0.1, 0.6 + i * 0.1))} label={`user ${k}`} />)}
        <Readout narrow={narrow} l={["hash: even spread · but range queries hit every shard|hash: even spread", "range: fast ranges, but new users hammer the latest shard|range: hot spots"]} />
      </g>
    );
  if (step === 2) {
    const srv: [number, string, Tone][] = [[45, "a", undefined], [120, "b", undefined], [150, "e", "lit"], [200, "c", undefined], [300, "d", undefined]];
    return (
      <g>
        <Kick s="consistent hashing" tone="ok" />
        <circle className="ax-wire" cx={150} cy={150} r={80} />
        {srv.map(([d, s, tone]) => {
          const q = polar(150, 150, 80, d);
          return <g key={s} opacity={s === "e" ? fade(t, 0.2, 0.6) : 1}><Token x={q.x} y={q.y} s={14} tone={tone ?? "sky"} /><Txt x={polar(150, 150, 104, d).x} y={polar(150, 150, 104, d).y + 5} k="s" tone={tone}>{s}</Txt></g>;
        })}
        <Txt x={300} y={74} k="s" anchor="start">{nw(narrow, "modulo, N = 4 → 5: keys moved", "modulo 4 → 5")}</Txt>
        <Meter x={300} y={84} w={280} h={14} value={0.95 * fade(t, 0.3, 0.8)} max={1} tone="bad" />
        <Txt x={300} y={146} k="s" anchor="start">{nw(narrow, "ring: only keys b → e move", "ring: b → e only")}</Txt>
        <Meter x={300} y={156} w={280} h={14} value={0.2 * fade(t, 0.5, 1)} max={1} tone="ok" />
        <Txt x={440} y={204} k="s" tone="ok" opacity={fade(t, 0.6, 1)}>≈ 1/N of keys</Txt>
        <Readout narrow={narrow} tone="ok" l={["each key goes to the next server clockwise|next server clockwise", "virtual nodes even out the spread · Dynamo, Cassandra, CDNs|virtual nodes even it out"]} />
      </g>
    );
  }
  const fl = [60, 120, 180];
  return (
    <g>
      <Kick s="replication · quorum" />
      <Box x={20} y={102} w={110} h={56} label="Client" />
      <Wire d="M130 130H190" tone="lit" arrow />
      <Box x={190} y={102} w={120} h={56} label="write x=5" sub="W = 2" tone="lit" />
      {fl.map((y, i) => <g key={y}>{el(310, 130, 420, y + 20, i < 2 ? "lit" : undefined, i === 2)}<Box x={420} y={y} w={160} h={40} label={`Node ${"ABC"[i]}`} tone={i < 2 ? "ok" : "warn"} /></g>)}
      <Txt x={500} y={242} k="s" tone="warn">{nw(narrow, "C missed it: x=1", "C: stale")}</Txt>
      <Txt x={250} y={210} tone="ok" opacity={fade(t, 0.5, 1)}>R + W &gt; N</Txt>
      <Txt x={250} y={236} k="s" opacity={fade(t, 0.5, 1)}>2 + 2 &gt; 3</Txt>
      <Readout narrow={narrow} l={["read R = 2 nodes: one always has x=5 · highest version wins|any 2 reads see x=5", "sync: consistent but slow · async: fast, can lose acked writes|async can lose writes"]} />
    </g>
  );
}

/* ---------------------------------------------------------------- 3 · data and messaging */
function Messaging({ step, t, narrow }: SceneProps) {
  const p = ease(seg(t, 0.1, 0.9));
  if (step === 0)
    return (
      <g>
        <Kick s="cache stampede" tone="bad" />
        <Box x={20} y={60} w={130} h={170} label={nw(narrow, "100 requests", "100 reqs")} />
        <Box x={235} y={60} w={130} h={60} label="Cache" sub={nw(narrow, "key expired", "expired")} tone="warn" />
        <Box x={450} y={150} w={130} h={80} label="Database" sub={t > 0.6 ? "overwhelmed" : undefined} tone={t > 0.6 ? "bad" : undefined} />
        <Wire d="M150 90H235" dash arrow />
        <Wire d="M150 190H450" tone="bad" arrow />
        {[0, 1, 2, 3, 4].map((i) => <g key={i}>{go(seg(p, i * 0.1, 0.6 + i * 0.1), 150, 170 + i * 10, 450, 170 + i * 10, "bad")}</g>)}
        <Txt x={300} y={256} k="s" tone="ok" opacity={fade(t, 0.7, 1)}>{nw(narrow, "fix: one request rebuilds under a lock, the rest wait", "fix: lock, one rebuilds")}</Txt>
        <Readout narrow={narrow} l={["penetration: fake keys always miss · cache nulls, Bloom filter|penetration: cache nulls", "hot key: one key, one node · local cache, replicate the key|hot key: replicate it"]} />
      </g>
    );
  if (step === 1)
    return (
      <g>
        <Kick s="queue vs stream" />
        <g opacity={fade(t, 0, 0.4)}>
          <Box x={20} y={56} w={130} h={56} label="Queue" sub="A B C D" tone="lit" />
          {el(150, 84, 190, 66)}
          {el(150, 84, 190, 104)}
          <Box x={190} y={48} w={100} h={36} label="C1: A, C" />
          <Box x={190} y={88} w={100} h={36} label="C2: B, D" />
          <Txt x={155} y={150} k="s">{nw(narrow, "consumed once, then gone", "then gone")}</Txt>
        </g>
        <g opacity={fade(t, 0.35, 0.8)}>
          <Box x={310} y={56} w={130} h={56} label="Stream" sub="offsets" tone="sky" />
          {el(440, 84, 470, 66, "sky")}
          {el(440, 84, 470, 104, "sky")}
          <Box x={470} y={48} w={110} h={36} label="group A" />
          <Box x={470} y={88} w={110} h={36} label="group B" />
          <Txt x={445} y={150} k="s">{nw(narrow, "each group reads all · replay", "all, replayable")}</Txt>
        </g>
        <Readout narrow={narrow} l={["queue: task distribution · RabbitMQ, SQS", "stream: event sourcing, analytics, audit logs · Kafka, Kinesis|stream: Kafka, Kinesis"]} />
      </g>
    );
  if (step === 2)
    return (
      <g>
        <Kick s="at-least-once + idempotent" tone="ok" />
        <Box x={20} y={100} w={130} h={60} label="Producer" sub={nw(narrow, "retry, same ID", "same ID")} />
        <Box x={450} y={100} w={130} h={60} label="Consumer" sub={nw(narrow, "seen msg 42?", "seen 42?")} tone="ok" />
        <Wire d="M150 120H450" tone="lit" arrow />
        <Wire d="M150 144H450" dash arrow />
        {go(p, 150, 120, 450, 120)}
        {go(seg(t, 0.4, 1), 150, 144, 450, 144, "mute")}
        <Txt x={300} y={112} k="s">msg 42</Txt>
        <Txt x={300} y={170} k="s">{nw(narrow, "msg 42 again (ACK was lost)", "duplicate")}</Txt>
        <Txt x={515} y={196} k="s" tone="ok" opacity={fade(t, 0.8, 1)}>ignored</Txt>
        <Readout narrow={narrow} l={["at-most-once: may lose · at-least-once: may duplicate|at-least-once may duplicate", "exactly-once is very hard: dedupe IDs or transactions|dedupe by message ID"]} />
      </g>
    );
  const sg: [string, Tone][] = [["order", "ok"], ["payment", "ok"], ["inventory", "bad"], ["shipping", undefined]];
  return (
    <g>
      <Kick s="saga · order placement" />
      {sg.map(([s, tone], i) => (
        <g key={s} opacity={fade(t, i * 0.12, i * 0.12 + 0.3)}>
          {i > 0 && <Wire d={`M${i * 145} 100H${20 + i * 145}`} arrow />}
          <Box x={20 + i * 145} y={72} w={125} h={56} label={s} sub={i === 2 ? nw(narrow, "out of stock", "no stock") : i === 3 ? nw(narrow, "never runs", "skipped") : "done"} tone={tone} dim={i === 3} />
        </g>
      ))}
      <g opacity={fade(t, 0.55, 0.9)}>
        <Wire d="M372 128V170H228V150" tone="bad" dash arrow />
        <Wire d="M228 170V190H82V150" tone="bad" dash arrow />
        <Txt x={300} y={210} k="s" tone="bad">{nw(narrow, "compensate: refund payment, then cancel order", "refund, then cancel")}</Txt>
      </g>
      <Readout narrow={narrow} l={["local transactions plus compensations, instead of ACID", "choreography: services react to events · or an orchestrator|or an orchestrator"]} />
    </g>
  );
}

/* ---------------------------------------------------------------- 4 · reliability */
function Reliability({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    const R: [string, number, number][] = [["N+1", 3, 1], ["N+2", 3, 2], ["2N", 3, 3]];
    return (
      <g>
        <Kick s="redundancy · need 3 nodes" />
        {R.map(([a, n, x], r) => (
          <g key={a} opacity={fade(t, r * 0.2, r * 0.2 + 0.4)}>
            <Txt x={20} y={88 + r * 60} anchor="start" tone="lit">{a}</Txt>
            {Array.from({ length: n + x }, (_, i) => <Box key={i} x={110 + i * 56} y={64 + r * 60} w={46} h={36} label={i < n ? "" : "+"} tone={i < n ? "ok" : "sky"} />)}
            <Txt x={580} y={88 + r * 60} k="s" anchor="end">{[nw(narrow, "1 can fail", "1 fails"), nw(narrow, "fail + patch", "fail+patch"), nw(narrow, "half can fail", "half fails")][r]}</Txt>
          </g>
        ))}
        <Readout narrow={narrow} l={["failures: crash · omission · timing · byzantine|crash, omission, timing", "active-passive: standby takes over · active-active: both serve|or active-active"]} />
      </g>
    );
  }
  if (step === 1) {
    const st: [string, string, Tone, number, number][] = [["CLOSED", "requests pass", "ok", 20, 70], ["OPEN", "fail fast", "bad", 400, 70], ["HALF-OPEN", "one test call", "warn", 210, 170]];
    return (
      <g>
        <Kick s="circuit breaker" />
        <Wire d="M200 92H400" tone="bad" arrow />
        <Wire d="M540 114V200H390" dash arrow />
        <Wire d="M390 180H460V114" tone="bad" arrow />
        <Wire d="M210 198H110V114" tone="ok" arrow />
        <Txt x={300} y={84} k="s" tone="bad">{nw(narrow, "5 failures (threshold)", "5 failures")}</Txt>
        <Txt x={580} y={236} k="s" anchor="end">{nw(narrow, "after a 30s timeout", "30s later")}</Txt>
        <Txt x={100} y={236} k="s" tone="ok">{nw(narrow, "test succeeds", "test ok")}</Txt>
        {st.map(([a, b, tone, x, y], i) => <Box key={a} x={x} y={y} w={180} h={44} label={a} sub={b} tone={tone} opacity={fade(t, i * 0.2, i * 0.2 + 0.4)} />)}
        <Txt x={452} y={150} k="s" anchor="end" tone="bad" opacity={fade(t, 0.5, 0.9)}>{nw(narrow, "test fails", "fails")}</Txt>
        <Readout narrow={narrow} l={["fail fast so one slow dependency can't cascade|stops cascading failures", "bulkhead: separate pools per dependency · X slow, Y still works|bulkheads isolate pools"]} />
      </g>
    );
  }
  const used = 25 * fade(t, 0.2, 0.9);
  return (
    <g>
      <Kick s="SLO · error budget" />
      <Box x={20} y={48} w={170} h={50} label="SLI" sub={nw(narrow, "p99 is 85ms", "85ms")} tone="sky" />
      <Box x={215} y={48} w={170} h={50} label="SLO" sub={nw(narrow, "aim: < 100ms", "< 100ms")} tone="lit" />
      <Box x={410} y={48} w={170} h={50} label="SLA" sub={nw(narrow, "promise: < 200ms", "< 200ms")} tone="warn" />
      <Txt x={20} y={142} k="s" anchor="start">{nw(narrow, "99.9% a month: 43.2 min of downtime allowed", "43.2 min / month")}</Txt>
      <Meter x={20} y={152} w={560} h={18} value={used} max={43.2} tone={used > 20 ? "warn" : "ok"} />
      <Txt x={20} y={196} k="s" anchor="start">{nw(narrow, "deploy failure 15 min + database issue 10 min", "15 + 10 min used")}</Txt>
      <Txt x={580} y={232} anchor="end" tone="ok" opacity={fade(t, 0.8, 1)}>{nw(narrow, "18.2 min left · 42%", "18.2 min left")}</Txt>
      <Readout narrow={narrow} l={["budget left: ship fast · budget gone: freeze features|budget gone = freeze", "the SLA is looser than the SLO, as a buffer|SLA looser than SLO"]} />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "scaling") return <Scaling {...p} />;
  if (p.variant === "messaging") return <Messaging {...p} />;
  if (p.variant === "reliability") return <Reliability {...p} />;
  return <Tradeoffs {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    { id: "tradeoffs", label: "Trade-offs", steps: [
      { caption: "CAP: in a distributed system partitions will happen, so during one you choose. Node B either refuses to answer, consistent like ZooKeeper, or serves its last value, available like Cassandra.", tween: 1400, ms: 3800 },
      { caption: "PACELC adds the else: even with no partition, strong consistency needs coordination. With synchronous replication, every write waits for the slowest replica.", tween: 1600 },
      { caption: "ACID guarantees transactions. Moving $100 from account A to B, the debit and the credit both happen or neither does, isolated from other transfers and durable once committed.", tween: 1600, ms: 3600 },
      { caption: "BASE is the distributed alternative: basically available, soft state, eventually consistent. Use ACID for money, inventory and accounts; BASE for feeds, catalogs and sessions.", tween: 1400, ms: 3600 },
    ] },
    { id: "scaling", label: "Scaling", steps: [
      { caption: "Scale up with a bigger machine: simple, but there are hardware limits and one point of failure. Scale out with more machines behind a load balancer: near-infinite, but distributed.", tween: 1400, ms: 3600 },
      { caption: "Sharding splits rows across databases. Hash partitioning spreads users evenly, but range queries hit every shard; range partitioning makes the newest shard a hot spot.", tween: 1600 },
      { caption: "With hash modulo N, growing from 4 to 5 shards moves almost every key. On a consistent-hashing ring, adding server e moves only the keys between b and e, about 1 in N.", tween: 1600, ms: 3600 },
      { caption: "Replication keeps copies. In a leaderless quorum with 3 nodes, write to 2 and read from 2: since R plus W is greater than N, every read overlaps the latest write.", tween: 1400, ms: 3600 },
    ] },
    { id: "messaging", label: "Data & messaging", steps: [
      { caption: "Caches have failure modes. When a popular key expires, 100 requests miss at once and all hit the database: a stampede. Let one request rebuild it under a lock.", tween: 1600 },
      { caption: "A queue gives each message to one consumer and deletes it. A stream like Kafka keeps messages with offsets, so each consumer group reads everything and can replay.", tween: 1400 },
      { caption: "At-least-once delivery retries when an ACK is lost, so a message can arrive twice. The consumer tracks processed IDs and ignores the duplicate.", tween: 1800 },
      { caption: "A saga replaces a distributed transaction with local steps and compensations. If inventory is out of stock, refund the payment, then cancel the order.", tween: 1600 },
    ] },
    { id: "reliability", label: "Reliability", steps: [
      { caption: "Plan for failure with redundancy. If you need 3 nodes, N+1 deploys 4 so one can fail; N+2 deploys 5 to survive a failure during maintenance; 2N deploys 6.", tween: 1400 },
      { caption: "A circuit breaker fails fast. After 5 failures it opens and rejects calls; after a 30-second timeout it lets one test through, closing again if it succeeds.", tween: 1400, ms: 3600 },
      { caption: "SLIs measure, SLOs set the target, SLAs promise with penalties. A 99.9% monthly SLO allows 43.2 minutes down; after 25 minutes of incidents, 18.2 minutes of budget remain.", tween: 1600, ms: 3800 },
    ] },
  ],
  Scene,
});
