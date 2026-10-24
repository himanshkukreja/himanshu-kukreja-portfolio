/**
 * The whole lesson, week 1 day 2 (Replication trade-offs): why replicate (availability, read
 * scaling, geography) and the wait-or-stale trade-off; leader-follower sync / async / semi-sync,
 * multi-leader conflicts and leaderless quorums; lag anomalies and choosing a consistency level;
 * and the URL shortener: the abc123 404, three fixes, failover and regional replicas.
 */
import { Box, defineExplainer, ease, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 360;
type Pt = { x: number; y: number };
const WR = { x: 16, y: 110, w: 124, h: 56 };
const RD = { x: 16, y: 232, w: 124, h: 52 };
const LD = { x: 166, y: 100, w: 140, h: 76 };
const FX = 400;
const FW = 176;
const fy = (i: number) => 40 + i * 76;
const fc = (i: number) => fy(i) + 22;

type Node = { label: string; sub?: string; tone?: Tone; dim?: boolean };
type Move = { pts: Pt[]; a: number; b: number; tone?: Tone };
type Frame = { kick: string; kt?: Tone; wr?: Node; rd?: Node; ld?: Node; fs: Node[]; moves: Move[]; l: [string, string]; nl?: [string, string]; multi?: boolean };

const write: Pt[] = [{ x: 140, y: 138 }, { x: LD.x, y: 138 }];
const ack: Pt[] = [{ x: LD.x, y: 138 }, { x: 140, y: 138 }];
const rep = (i: number): Pt[] => [{ x: 306, y: 138 }, { x: 350, y: 138 }, { x: 350, y: fc(i) }, { x: FX, y: fc(i) }];
const back = (i: number): Pt[] => [...rep(i)].reverse();
const read = (i: number): Pt[] => [{ x: 140, y: 258 }, { x: 372, y: 258 }, { x: 372, y: fc(i) }, { x: FX, y: fc(i) }];
const direct = (i: number): Pt[] => [{ x: 140, y: 138 }, { x: 350, y: 138 }, { x: 350, y: fc(i) }, { x: FX, y: fc(i) }];
const m = (pts: Pt[], a: number, b: number, tone?: Tone): Move => ({ pts, a, b, tone });
function walk(pts: Pt[], p: number): Pt {
  const n = pts.length - 1;
  const f = Math.min(n - 1e-6, Math.max(0, p * n));
  const i = Math.floor(f);
  return { x: lerp(pts[i].x, pts[i + 1].x, f - i), y: lerp(pts[i].y, pts[i + 1].y, f - i) };
}
const F3 = (a: Node, b: Node, c: Node) => [a, b, c];

function frame(v: string, s: number): Frame {
  if (v === "why") {
    if (s === 0) return { kick: "1 · high availability", kt: "ok", wr: { label: "Client" }, ld: { label: "Leader", sub: "dies", tone: "bad" }, fs: F3({ label: "Follower", sub: "takes over", tone: "ok" }, { label: "Follower" }, { label: "Follower" }), moves: [m(direct(0), 0.3, 0.9, "ok")], l: ["one server at 99.9%: ~8.7 h down a year", "two, either can serve: 99.9999%, ~31 s"], nl: ["one server: ~8.7 h down/yr", "two servers: ~31 s/yr"] };
    if (s === 1) return { kick: "2 · read scaling", kt: "sky", wr: { label: "Writes" }, rd: { label: "Reads", tone: "sky" }, ld: { label: "Leader", sub: "all writes" }, fs: F3({ label: "Replica 1", sub: "10,000 reads/s", tone: "sky" }, { label: "Replica 2", sub: "10,000 reads/s", tone: "sky" }, { label: "Replicas 3–5", sub: "10,000 reads/s each", tone: "sky" }), moves: [m(read(0), 0, 0.5, "sky"), m(read(1), 0.2, 0.7, "sky"), m(read(2), 0.4, 0.9, "sky")], l: ["5 read replicas: 50,000 reads/s", "writes still go to every replica: no write scaling"], nl: ["5 replicas: 50,000 reads/s", "no write scaling"] };
    if (s === 2) return { kick: "3 · geography", kt: "sky", rd: { label: "Tokyo user", tone: "sky" }, ld: { label: "Virginia", sub: "~55 ms each way" }, fs: F3({ label: "Tokyo replica", sub: "< 10 ms", tone: "ok" }, { label: "Europe", dim: true }, { label: "São Paulo", dim: true }), moves: [m(read(0), 0.1, 0.8, "ok")], l: ["light in fiber: ~200 km per ms", "Tokyo → Virginia ~11,000 km · local < 10 ms"], nl: ["~200 km per ms in fiber", "local replica: < 10 ms"] };
    return { kick: "the fundamental trade-off", kt: "warn", wr: { label: "Client", sub: "waiting?" }, ld: { label: "Leader", sub: "coordinating", tone: "lit" }, fs: F3({ label: "Follower", sub: "in sync", tone: "ok" }, { label: "Follower", sub: "stale?", tone: "warn" }, { label: "Follower", sub: "stale?", tone: "warn" }), moves: [m(rep(0), 0, 0.5, "lit"), m(rep(1), 0.2, 0.8, "warn"), m(rep(2), 0.3, 0.95, "warn")], l: ["in sync needs coordination: round trips", "so you wait (slower) or serve stale data"], nl: ["sync needs round trips", "wait, or serve stale"] };
  }
  if (v === "arch") {
    if (s === 0) return { kick: "leader-follower · synchronous", wr: { label: "Client", sub: "ACK" }, ld: { label: "Leader", sub: "waits", tone: "lit" }, fs: F3({ label: "Follower", sub: "confirmed", tone: "ok" }, { label: "Follower", sub: "confirmed", tone: "ok" }, { label: "Follower", sub: "confirmed", tone: "ok" }), moves: [m(write, 0, 0.2), m(rep(0), 0.2, 0.5), m(rep(1), 0.2, 0.5), m(rep(2), 0.2, 0.5), m(back(0), 0.5, 0.8, "ok"), m(ack, 0.8, 1, "ok")], l: ["followers always current · no loss on failure", "a slow or dead follower stalls every write"], nl: ["always current · no loss", "slow follower stalls writes"] };
    if (s === 1) return { kick: "leader-follower · asynchronous", kt: "warn", wr: { label: "Client", sub: "fast ACK", tone: "ok" }, ld: { label: "Leader" }, fs: F3({ label: "Follower", sub: "lagging", tone: "warn" }, { label: "Follower", sub: "lagging", tone: "warn" }, { label: "Follower", sub: "lagging", tone: "warn" }), moves: [m(write, 0, 0.2), m(ack, 0.2, 0.4, "ok"), m(rep(0), 0.4, 0.95, "warn"), m(rep(1), 0.45, 0.95, "warn"), m(rep(2), 0.5, 0.95, "warn")], l: ["fast writes · slow followers don't hurt clients", "leader dies: unreplicated writes are lost"], nl: ["fast writes", "leader dies: writes lost"] };
    if (s === 2) return { kick: "semi-synchronous", kt: "ok", wr: { label: "Client", sub: "ACK" }, ld: { label: "Leader" }, fs: F3({ label: "Follower 1", sub: "sync", tone: "ok" }, { label: "Follower 2", sub: "async" }, { label: "Follower 3", sub: "async" }), moves: [m(write, 0, 0.2), m(rep(0), 0.2, 0.45, "ok"), m(back(0), 0.45, 0.65, "ok"), m(ack, 0.65, 0.8, "ok"), m(rep(1), 0.8, 1), m(rep(2), 0.8, 1)], l: ["wait for one follower, the rest async", "a replica has every commit · wait for the fastest"], nl: ["wait for one follower", "the rest replicate async"] };
    if (s === 3) return { kick: "multi-leader · the conflict", kt: "bad", multi: true, fs: [], moves: [], l: ["both writes succeed locally; which one wins?", "last-write-wins · merge (CRDTs) · app · avoid"], nl: ["both succeed: who wins?", "LWW · merge · app · avoid"] };
    return { kick: "leaderless · N = 3, W = 2, R = 2", kt: "ok", wr: { label: "Write" }, rd: { label: "Read" }, fs: F3({ label: "Node A", sub: "write ok", tone: "ok" }, { label: "Node B", sub: "write + read", tone: "lit" }, { label: "Node C", sub: "read · pending", tone: "warn" }), moves: [m(direct(0), 0, 0.4, "ok"), m(direct(1), 0, 0.4, "ok"), m(read(1), 0.5, 0.9, "sky"), m(read(2), 0.5, 0.9, "sky")], l: ["W + R > N: read and write sets overlap", "B was in both, so the read sees the write"], nl: ["W + R > N: they overlap", "B saw the write"] };
  }
  if (v === "lag") {
    if (s === 0) return { kick: "monotonic reads", kt: "bad", rd: { label: "User", sub: "went back?", tone: "bad" }, ld: { label: "Leader", sub: "version 5" }, fs: F3({ label: "Follower A", sub: "version 5", tone: "ok" }, { label: "Follower B", sub: "version 3", tone: "bad" }, { label: "Follower", dim: true }), moves: [m(read(0), 0, 0.45, "ok"), m(read(1), 0.5, 0.95, "bad")], l: ["read 1 → A: version 5 · read 2 → B: version 3", "fix: the same replica for the whole session"], nl: ["v5, then v3: backwards", "fix: sticky sessions"] };
    if (s === 1) return { kick: "consistent prefix", kt: "bad", rd: { label: "Reader", sub: "9:02:30", tone: "bad" }, ld: { label: "Leader", sub: "A 9:00 · B 9:01" }, fs: F3({ label: "Follower 1", sub: "has B, not A", tone: "bad" }, { label: "Follower", dim: true }, { label: "Follower", dim: true }), moves: [m(rep(0), 0, 0.4, "warn"), m(read(0), 0.5, 0.95, "bad")], l: ["B (a reply to A) arrives 9:02, A at 9:03", "fix: same partition / leader, or logical clocks"], nl: ["the reply arrives first", "fix: one leader or clocks"] };
    return { kick: "choose the level", wr: { label: "App" }, fs: F3({ label: "Strong", sub: "bank · inventory", tone: "lit" }, { label: "Read-your-writes", sub: "own profile", tone: "sky" }, { label: "Eventual", sub: "feeds · counters", tone: "ok" }), moves: [], l: ["chat messages: causal", "URL shortener: reads eventual · writes strong"], nl: ["chat: causal", "URL reads eventual"] };
  }
  if (s === 0) return { kick: "URL shortener · replicas", rd: { label: "Redirects" }, wr: { label: "Creates" }, ld: { label: "Primary 1", sub: "writes" }, fs: F3({ label: "Replica 0", sub: "reads" }, { label: "Replica 1", sub: "reads" }, { label: "Cache", sub: "Redis", tone: "sky" }), moves: [m(write, 0, 0.3), m(rep(0), 0.3, 0.7), m(rep(1), 0.3, 0.7), m(read(1), 0.4, 0.9, "sky")], l: ["writes always go to the primary", "redirects can read any replica"], nl: ["writes → primary", "reads → any replica"] };
  if (s === 1) return { kick: "the 404 for abc123", kt: "bad", wr: { label: "Creator", sub: "0.000s" }, rd: { label: "Friend", sub: "404", tone: "bad" }, ld: { label: "Primary 1", sub: "has abc123", tone: "ok" }, fs: F3({ label: "Replica 0", dim: true }, { label: "Replica 1", sub: "not found", tone: "bad" }, { label: "Cache", dim: true }), moves: [m(write, 0, 0.2, "ok"), m(read(1), 0.25, 0.55, "bad"), m(rep(1), 0.6, 0.98, "warn")], l: ["created at 0.000s, clicked at 0.003s", "replica lag ~50 ms: it arrives at 0.050s"], nl: ["clicked at 0.003s", "replica lag ~50 ms"] };
  if (s === 2) return { kick: "three fixes", kt: "ok", wr: { label: "Creator" }, rd: { label: "Friend", sub: "found", tone: "ok" }, ld: { label: "Primary 1", sub: "new URL reads", tone: "ok" }, fs: F3({ label: "Replica 1", sub: "sync standby", tone: "ok" }, { label: "Replica 2", sub: "async" }, { label: "Cache", sub: "write-through", tone: "ok" }), moves: [m(rep(0), 0, 0.4, "ok"), m(rep(2), 0.3, 0.7, "ok"), m(read(2), 0.6, 0.95, "ok")], l: ["sync replica (remote_apply, ~1 ms per write)", "read new URLs from primary · cache on create"], nl: ["sync standby replica", "primary reads · cache on create"] };
  if (s === 3) return { kick: "failover", kt: "warn", wr: { label: "Creates", sub: "fail, retry", tone: "bad" }, rd: { label: "Redirects", sub: "still work", tone: "ok" }, ld: { label: "Primary", sub: "dies", tone: "bad" }, fs: F3({ label: "Replica 0", sub: "promoted", tone: "ok" }, { label: "Replica 1", sub: "serving", tone: "ok" }, { label: "Cache", sub: "serving", tone: "sky" }), moves: [m(read(1), 0.3, 0.9, "ok")], l: ["no heartbeat for 10–30 s: a replica is promoted", "writes fail for 10–60 s · reads keep working"], nl: ["10–30 s: promote a replica", "writes fail · reads work"] };
  return { kick: "regional read replicas", kt: "sky", wr: { label: "Creates", sub: "80–150 ms" }, rd: { label: "Redirects", sub: "~10 ms", tone: "ok" }, ld: { label: "us-east-1", sub: "primary" }, fs: F3({ label: "eu-west-1", sub: "replicas", tone: "sky" }, { label: "ap-northeast-1", sub: "replicas", tone: "sky" }, { label: "sa-east-1", sub: "replicas", tone: "sky" }), moves: [m(rep(0), 0, 0.6, "sky"), m(rep(1), 0.1, 0.7, "sky"), m(rep(2), 0.2, 0.8, "sky"), m(read(1), 0.4, 0.9, "ok")], l: ["reads local (~10 ms) · cross-region lag 50–200 ms", "keep one primary: a 150 ms create is fine"], nl: ["local reads ~10 ms", "one primary: 150 ms creates"] };
}

const NK: Record<string, string> = { "leader-follower · synchronous": "synchronous", "leader-follower · asynchronous": "asynchronous", "multi-leader · the conflict": "multi-leader", "leaderless · N = 3, W = 2, R = 2": "N=3 · W=2 · R=2", "1 · high availability": "availability", "2 · read scaling": "read scaling", "3 · geography": "geography", "URL shortener · replicas": "replicas" };
const NS: Record<string, string> = { "~55 ms each way": "~55 ms", "10,000 reads/s each": "10,000/s each", "10,000 reads/s": "10,000/s", "new URL reads": "new URLs" };
const NN: Record<string, string> = { "Read-your-writes": "Your writes", "ap-northeast-1": "ap-ne-1", "Tokyo replica": "Tokyo", "Replicas 3–5": "R3–R5" };

function Multi({ t }: { t: number }) {
  const p = ease(seg(t, 0, 0.5));
  const x = ease(seg(t, 0.5, 1));
  return (
    <g>
      <Box x={20} y={60} w={104} h={56} label="Phone" />
      <Box x={20} y={196} w={104} h={56} label="Laptop" />
      <Wire d="M124 88H220" arrow />
      <Wire d="M124 224H220" arrow />
      <Box x={220} y={52} w={180} h={72} label="EU leader" sub="new@eu.com" tone="sky" />
      <Box x={220} y={188} w={180} h={72} label="US leader" sub="new@us.com" tone="warn" />
      <Wire d="M310 124V188" tone="bad" dash />
      {p > 0 && p < 1 && <Token x={lerp(124, 220, p)} y={88} tone="sky" />}
      {p > 0 && p < 1 && <Token x={lerp(124, 220, p)} y={224} tone="warn" />}
      {x > 0 && x < 1 && <Token x={310} y={lerp(124, 188, x)} tone="bad" />}
      <Box x={420} y={120} w={156} h={72} label="id 123" sub="email = ?" tone={t >= 1 ? "bad" : undefined} />
    </g>
  );
}

function Scene({ variant, step, t, narrow }: SceneProps) {
  const f = frame(variant, step);
  const fade = ease(seg(t, 0, 0.4));
  const lbl = (n: Node) => (narrow ? NN[n.label] || n.label : n.label);
  const sub = (n: Node) => (narrow && n.sub ? NS[n.sub] || (n.sub.length > 12 ? n.sub.split(" · ")[0] : n.sub) : n.sub);
  const l = narrow && f.nl ? f.nl : f.l;
  return (
    <g>
      <Txt x={20} y={26} k="k" anchor="start" tone={f.kt}>
        {narrow ? NK[f.kick] || f.kick : f.kick}
      </Txt>
      <g opacity={fade}>
        {f.multi && <Multi t={t} />}
        {f.wr && <Wire d={f.ld ? `M140 138H${LD.x}` : "M140 138H350"} arrow={!!f.ld} />}
        {f.rd && <Wire d="M140 258H372" />}
        {f.wr && <Box {...WR} label={lbl(f.wr)} sub={sub(f.wr)} tone={f.wr.tone} />}
        {f.rd && <Box {...RD} label={lbl(f.rd)} sub={sub(f.rd)} tone={f.rd.tone} />}
        {f.ld && <Box {...LD} label={lbl(f.ld)} sub={sub(f.ld)} tone={f.ld.tone} />}
        {f.fs.map((n, i) => (
          <g key={i}>
            {f.ld && <Wire d={`M306 138H350V${fc(i)}H${FX}`} dash tone={n.dim ? "mute" : undefined} />}
            {!f.ld && f.wr && <Wire d={`M350 138V${fc(i)}H${FX}`} />}
            {f.rd && <Wire d={`M372 258V${fc(i)}H${FX}`} tone="mute" />}
            <Box x={FX} y={fy(i)} w={FW} h={44} label={lbl(n)} sub={sub(n)} tone={n.tone} dim={n.dim} />
          </g>
        ))}
      </g>
      {f.moves.map((mv, i) => {
        const q = seg(t, mv.a, mv.b);
        if (q <= 0 || q >= 1) return null;
        const p = walk(mv.pts, q);
        return <Token key={i} x={p.x} y={p.y} tone={mv.tone} />;
      })}
      <Txt x={20} y={H - 34} k="s" anchor="start" tone={f.kt}>
        {l[0]}
      </Txt>
      <Txt x={20} y={H - 10} k="s" anchor="start">
        {l[1]}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "why",
      label: "Why replicate",
      steps: [
        { caption: "High availability: if the leader dies, a copy takes over. One server at 99.9% is down about 8.7 hours a year; two, either of which can serve, about 31 seconds.", tween: 1600, ms: 3600 },
        { caption: "Read scaling: one database handles 10,000 reads a second, five replicas 50,000. Writes don't scale, because every write goes to every replica.", tween: 1800 },
        { caption: "Geography: Tokyo to Virginia is about 55 ms each way at the speed of light in fiber. A replica in Tokyo answers in under 10 ms.", tween: 1400 },
        { caption: "The catch: keeping copies in sync takes coordination, and coordination takes round trips. During that time you either wait or serve stale data.", tween: 1800, ms: 3400 },
      ],
    },
    {
      id: "arch",
      label: "Architectures",
      steps: [
        { caption: "Leader-follower, synchronous: the leader waits for followers to confirm before it ACKs. No data loss, but one slow follower stalls every write.", tween: 2400 },
        { caption: "Asynchronous: the leader ACKs at once and replicates in the background. Writes are fast, but followers lag, and if the leader dies unreplicated writes are lost.", tween: 2200 },
        { caption: "Most production systems are semi-synchronous: wait for one follower, replicate to the rest asynchronously.", tween: 2400 },
        { caption: "Multi-leader: a phone updates the email at the EU leader while a laptop updates it at the US leader. Both succeed, so something must resolve the conflict.", tween: 1600, ms: 3400 },
        { caption: "Leaderless, N = 3: write to A and B (W = 2), read from B and C (R = 2). Because W + R > N, B is in both and the read sees the latest write.", tween: 2000, ms: 3400 },
      ],
    },
    {
      id: "lag",
      label: "Lag, consistency",
      steps: [
        { caption: "Replication lag causes anomalies. Read 1 hits follower A and returns version 5; read 2 hits lagging follower B and returns version 3, so data goes backwards.", tween: 2000 },
        { caption: "Consistent prefix: a reply B arrives at follower 1 before message A, so a read at 9:02:30 shows a reply to a message that doesn't exist yet.", tween: 1800 },
        { caption: "So choose per use case: strong for bank balances and inventory, read-your-writes for your own profile, eventual for feeds and counters, causal for chat.", tween: 1200, ms: 3600 },
      ],
    },
    {
      id: "url",
      label: "URL shortener",
      steps: [
        { caption: "Day 1's URL shortener gets read replicas per partition: writes always go to the primary, redirects can read any replica.", tween: 1800 },
        { caption: "A user creates abc123 and shares it; the friend clicks 3 ms later, lands on Replica 1, which is ~50 ms behind, and gets a 404 for a URL that exists.", tween: 2200, ms: 3400 },
        { caption: "Three fixes: a synchronous replica (about 1 ms more per write), reading new URLs from the primary for a short window, or a write-through cache at creation.", tween: 1800, ms: 3400 },
        { caption: "Failover: after 10 to 30 seconds without heartbeats a replica is promoted. Creates fail for that window and users retry; redirects keep working from replicas.", tween: 1600, ms: 3400 },
        { caption: "Going global, replicas in eu-west-1, ap-northeast-1 and sa-east-1 serve redirects in ~10 ms. Writes stay in us-east-1: a 150 ms create is fine when redirects take 10 ms.", tween: 2000, ms: 3600 },
      ],
    },
  ],
  Scene,
});
