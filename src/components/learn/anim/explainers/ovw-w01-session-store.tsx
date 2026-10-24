/**
 * The whole lesson, week 1 day 5 (Session store design): what a session is and the targets
 * (< 5 ms p99, 99.99%, 10M × 2 KB = 20 GB, 2–3M req/s, 80/15/5); sticky vs store vs JWT vs the
 * hybrid; the Redis design (session:{id}, TTL 24 h, 6 shards × 2 = 12 nodes, async failover, local
 * cache); regions (sess_east_…), US-East going dark, and Redis vs DynamoDB vs custom.
 */
import { Box, defineExplainer, ease, lerp, seg, Meter, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 350;
type Lines = [string, string];
type Pt = { x: number; y: number };
const BR = { x: 20, y: 120, w: 116, h: 60 };
const AP = { x: 166, y: 120, w: 130, h: 60 };
const RX = 330;
const RW = 250;
const show = (t: number, a = 0, b = 0.5) => ease(seg(t, a, b));
function walk(pts: Pt[], p: number): Pt {
  const n = pts.length - 1;
  const f = Math.min(n - 1e-6, Math.max(0, p * n));
  const i = Math.floor(f);
  return { x: lerp(pts[i].x, pts[i + 1].x, f - i), y: lerp(pts[i].y, pts[i + 1].y, f - i) };
}

type Card = { y: number; h: number; label: string; sub?: string; tone?: Tone; dim?: boolean };
type Fr = { kick: string; kt?: Tone; br: [string, string?, Tone?]; ap: [string, string?, Tone?]; cards?: Card[]; grid?: { bad?: number; promoted?: boolean }; rows?: [string, Tone?][]; mix?: boolean; path?: Pt[]; ptone?: Tone; l: Lines; nl?: Lines };

const TO = (y: number): Pt[] => [{ x: 136, y: 150 }, { x: 166, y: 150 }, { x: 296, y: 150 }, { x: 312, y: 150 }, { x: 312, y }, { x: RX, y }];

function frame(v: string, s: number): Fr {
  if (v === "req") {
    if (s === 0) return { kick: "what a session is", br: ["Browser", "cookie: id"], ap: ["App server", "looks it up"], cards: [{ y: 70, h: 160, label: "session data", sub: "auth · prefs · cart · CSRF", tone: "lit" }], path: TO(150), l: ["the cookie carries only a session ID", "the server fetches the data on every request"], nl: ["the cookie: just an ID", "data fetched per request"] };
    if (s === 1) return { kick: "the targets", br: ["Browser"], ap: ["App server"], rows: [["latency < 5 ms p99", "lit"], ["availability 99.99%", "ok"], ["read-your-writes", "sky"], ["durability: best effort", "warn"]], l: ["unavailable store = user logged out", "a lost session only means logging in again"], nl: ["store down = logged out", "lost = log in again"] };
    return { kick: "10M concurrent users", br: ["Browser", "~1 req/s"], ap: ["App servers"], cards: [{ y: 60, h: 70, label: "10M × 2 KB = 20 GB", sub: "fits in a few servers' memory", tone: "ok" }], mix: true, l: ["peak 2–3M req/s (20–30% of sessions active)", "80% reads · 15% updates · 5% create/delete"], nl: ["peak 2–3M req/s", "80% reads · 15% updates"] };
  }
  if (v === "appr") {
    if (s === 0) return { kick: "sticky vs a shared store", br: ["User"], ap: ["App server", "any server"], cards: [{ y: 52, h: 88, label: "sticky: in memory", sub: "server dies → logged out", tone: "bad" }, { y: 160, h: 88, label: "distributed store", sub: "+1–2 ms · new dependency", tone: "ok" }], path: TO(204), ptone: "ok", l: ["sticky: no dependency, but failures log users out", "a distributed store is the standard approach"], nl: ["sticky: failures log out", "a store: the standard"] };
    if (s === 1) return { kick: "client-side sessions", kt: "warn", br: ["Browser", "JWT ≤ 4 KB", "warn"], ap: ["App server", "checks signature"], cards: [{ y: 90, h: 120, label: "no session store", sub: "nothing to run", dim: true }], path: [{ x: 136, y: 150 }, { x: 166, y: 150 }], ptone: "warn", l: ["no storage, scales without limit", "can't invalidate before expiry · 4 KB cookies"], nl: ["no storage at all", "can't invalidate early"] };
    return { kick: "the hybrid we'll design", kt: "ok", br: ["Browser", "user_id, roles", "ok"], ap: ["App server", "local cache", "ok"], cards: [{ y: 90, h: 120, label: "distributed store", sub: "the full session", tone: "sky" }], path: TO(150), ptone: "sky", l: ["the encrypted cookie answers most requests", "fetch the full session only when needed"], nl: ["the cookie answers most", "the store only when needed"] };
  }
  if (v === "design") {
    if (s === 0) return { kick: "data model", br: ["Browser"], ap: ["App server"], cards: [{ y: 70, h: 160, label: "session:{session_id}", sub: "JSON · TTL 24 h, extended", tone: "lit" }], path: TO(150), l: ["Redis Cluster hashes the key into 16,384 slots", "every access pushes the 24-hour TTL out again"], nl: ["16,384 hash slots", "TTL extended on access"] };
    if (s === 1) return { kick: "capacity: 12 nodes", kt: "ok", br: ["Browser"], ap: ["App servers"], grid: {}, l: ["20 GB / 5 GB per shard = 4 minimum → 6 shards", "6 shards × (primary + replica) = 12 nodes"], nl: ["4 shards min → 6", "× 2 = 12 nodes"] };
    if (s === 2) return { kick: "a primary fails", kt: "warn", br: ["Browser"], ap: ["App servers"], grid: { bad: 2, promoted: true }, l: ["cluster-node-timeout 15 s · the replica is promoted", "async: the last few writes may be lost (ok here)"], nl: ["15 s, replica promoted", "may lose a few writes"] };
    return { kick: "local cache", kt: "sky", br: ["Browser"], ap: ["App server", "hot sessions", "sky"], grid: {}, l: ["cache hot sessions in the app: no network hop", "stale for up to local_ttl: fine for sessions"], nl: ["hot sessions in memory", "stale up to local_ttl"] };
  }
  if (s === 0) return { kick: "session affinity by region", br: ["User", "sess_east_…"], ap: ["Router", "home region"], cards: [{ y: 52, h: 88, label: "US-East", sub: "sess_east_abc123", tone: "ok" }, { y: 160, h: 88, label: "US-West", sub: "its own sessions" }], path: TO(96), ptone: "ok", l: ["the session ID encodes its home region", "every request goes back to that region"], nl: ["the ID encodes the region", "requests go home"] };
  if (s === 1) return { kick: "US-East goes offline", kt: "bad", br: ["User", "logged out", "bad"], ap: ["Router"], cards: [{ y: 52, h: 88, label: "US-East", sub: "offline", tone: "bad" }, { y: 160, h: 88, label: "US-West", sub: "can't read them" }], path: TO(96), ptone: "bad", l: ["its sessions are inaccessible from other regions", "those users re-authenticate"], nl: ["sessions inaccessible", "users log in again"] };
  if (s === 2) return { kick: "three options", kt: "ok", br: ["User", "still in", "ok"], ap: ["Router"], cards: [{ y: 52, h: 88, label: "US-East", sub: "offline", tone: "bad", dim: true }, { y: 160, h: 88, label: "US-West backup", sub: "async copy", tone: "ok" }], path: TO(204), ptone: "ok", l: ["A: accept loss · B: replicate · C: rebuild from cookie", "for 99.99%: async backup, read local, then backup"], nl: ["accept · replicate · rebuild", "99.99%: a backup region"] };
  return { kick: "the decision", kt: "ok", br: ["Browser"], ap: ["App servers"], rows: [["Redis Cluster: sub-ms, TTL", "ok"], ["DynamoDB: 5–10 ms", "warn"], ["PostgreSQL + cache", undefined], ["12 nodes ≈ $1,800 / month", "ok"]], l: ["sessions are ephemeral: latency beats durability", "DynamoDB Global Tables if every region must write"], nl: ["Redis Cluster wins", "Dynamo if all regions write"] };
}

const NR: Record<string, string> = { "latency < 5 ms p99": "< 5 ms p99", "availability 99.99%": "99.99% up", "durability: best effort": "best effort", "Redis Cluster: sub-ms, TTL": "Redis: sub-ms", "DynamoDB: 5–10 ms": "Dynamo: 5–10 ms", "PostgreSQL + cache": "PG + cache", "12 nodes ≈ $1,800 / month": "~$1,800/mo", "read-your-writes": "your writes" };
const NC: Record<string, string> = { "auth · prefs · cart · CSRF": "auth · cart", "fits in a few servers' memory": "fits in RAM", "server dies → logged out": "dies → logout", "+1–2 ms · new dependency": "+1–2 ms", "session:{session_id}": "session:{id}", "JSON · TTL 24 h, extended": "TTL 24 h", "sess_east_abc123": "sess_east_…", "its own sessions": "own sessions", "can't read them": "can't read", "US-West backup": "US-West", "sticky: in memory": "sticky", "distributed store": "shared store", "10M × 2 KB = 20 GB": "20 GB" };

function Scene({ variant, step, t, narrow }: SceneProps) {
  const f = frame(variant, step);
  const n = (x?: string) => (narrow && x ? NC[x] || x : x);
  const l = narrow && f.nl ? f.nl : f.l;
  const p = seg(t, 0.1, 0.9);
  const tok = f.path && p > 0 && p < 1 ? walk(f.path, ease(p)) : null;
  const o = show(t, 0, 0.5);
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start" tone={f.kt}>
        {f.kick}
      </Txt>
      <Wire d={`M136 150H${AP.x}`} arrow />
      <Box {...BR} label={f.br[0]} sub={narrow && (f.br[1] || "").length > 9 ? undefined : f.br[1]} tone={f.br[2]} />
      <Box {...AP} label={narrow && f.ap[0].length > 8 ? f.ap[0].split(" ")[0] : f.ap[0]} sub={narrow ? undefined : f.ap[1]} tone={f.ap[2] || "lit"} />
      <g opacity={o}>
        {f.cards?.map((c, i) => (
          <g key={i}>
            <Wire d={`M296 150H312V${c.y + c.h / 2}H${RX}`} dash={c.dim} tone={c.tone === "bad" ? "bad" : undefined} />
            <Box x={RX} y={c.y} w={RW} h={c.h} label={n(c.label)} sub={n(c.sub)} tone={c.tone} dim={c.dim} />
          </g>
        ))}
        {f.rows?.map(([r, tone], i) => (
          <g key={i} opacity={seg(t, i * 0.15, i * 0.15 + 0.4)}>
            <Box x={RX} y={44 + i * 56} w={RW} h={44} label={narrow ? NR[r] || r : r} tone={tone} />
          </g>
        ))}
        {f.mix && (
          <g>
            <Txt x={RX} y={176} k="s" anchor="start">{narrow ? "the mix" : "operation mix"}</Txt>
            <Meter x={RX} y={186} w={RW * 0.8} h={20} value={1} max={1} tone="sky" />
            <rect className="ax-fill warn" x={RX + RW * 0.8} y={186} width={RW * 0.15} height={20} />
            <rect className="ax-fill ok" x={RX + RW * 0.95} y={186} width={RW * 0.05} height={20} />
            <Txt x={RX + 4} y={226} k="s" anchor="start" tone="sky">80% reads</Txt>
            <Txt x={RX + RW} y={226} k="s" anchor="end" tone="warn">15% · 5%</Txt>
          </g>
        )}
        {f.grid &&
          Array.from({ length: 6 }, (_, i) => {
            const x = RX + i * 42;
            const bad = f.grid?.bad === i;
            const promo = bad && f.grid?.promoted && t > 0.6;
            return (
              <g key={i}>
                <Txt x={x + 18} y={70} k="s">{`S${i + 1}`}</Txt>
                <Box x={x} y={80} w={36} h={56} label="P" tone={bad ? "bad" : "lit"} dim={bad && promo} />
                <Box x={x} y={150} w={36} h={56} label={promo ? "P" : "R"} tone={promo ? "ok" : "sky"} />
              </g>
            );
          })}
        {f.grid && <Wire d={`M296 150H312V143H${RX}`} />}
        {f.grid && (
          <Txt x={RX + RW} y={232} k="s" anchor="end">
            {narrow ? "~1.7M each" : "~1.7M sessions · ~3.3 GB per shard"}
          </Txt>
        )}
      </g>
      {tok && <Token x={tok.x} y={tok.y} tone={f.ptone} />}
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
      id: "req",
      label: "Requirements",
      steps: [
        { caption: "A session is server-side data for one user: auth, preferences, cart, CSRF tokens. The browser's cookie carries only the session ID, sent with every request.", tween: 1400, ms: 3400 },
        { caption: "Every request reads the session, so it must answer in under 5 ms at p99 and be up 99.99% of the time. Losing one only means logging in again.", tween: 1400 },
        { caption: "10 million sessions at 2 KB each is 20 GB, small enough for memory. Peak is 2 to 3 million requests a second: 80% reads, 15% updates, 5% logins and logouts.", tween: 1400, ms: 3600 },
      ],
    },
    {
      id: "appr",
      label: "Approaches",
      steps: [
        { caption: "Sticky sessions keep sessions in one server's memory, so a dead server logs its users out. A distributed store lets any server answer, for a 1 to 2 ms hop.", tween: 1600, ms: 3400 },
        { caption: "Client-side sessions put everything in a signed JWT or encrypted cookie: no storage at all, but you can't invalidate one before it expires, and cookies cap at 4 KB.", tween: 1200, ms: 3400 },
        { caption: "The hybrid, which this lesson designs: the encrypted cookie answers most requests, and the full session comes from the distributed store only when needed.", tween: 1600 },
      ],
    },
    {
      id: "design",
      label: "The design",
      steps: [
        { caption: "Each session is a Redis key, session:{session_id}, holding JSON with a 24-hour TTL that's extended on every access. Redis Cluster spreads keys over 16,384 hash slots.", tween: 1600, ms: 3400 },
        { caption: "Capacity: 20 GB at 5 GB per shard needs at least 4 shards; the design uses 6, each with a primary and a replica, so 12 nodes.", tween: 1200 },
        { caption: "When a primary fails, the cluster notices after cluster-node-timeout, 15 seconds by default, and promotes its replica. Replication is asynchronous, so the last few writes may be lost.", tween: 1600, ms: 3600 },
        { caption: "Hot sessions can also be cached in each app server, skipping the network hop, at the cost of being stale for up to local_ttl seconds.", tween: 1000 },
      ],
    },
    {
      id: "regions",
      label: "Regions, choice",
      steps: [
        { caption: "Across datacenters, the recommended approach is affinity by region: the session ID encodes its home, like sess_east_abc123, and requests go back there.", tween: 1600 },
        { caption: "The challenge question: US-East goes offline. Its sessions are inaccessible from other regions, so those users have to log in again.", tween: 1600 },
        { caption: "Option A accepts the loss, B replicates sessions to another region, C rebuilds them from an encrypted cookie. For 99.99%, write locally, copy to a backup region asynchronously, and read local then backup.", tween: 1600, ms: 3800 },
        { caption: "The decision: Redis Cluster, about $1,800 a month for 12 nodes, because sessions are ephemeral and latency matters on every request. DynamoDB Global Tables if every region must take writes.", tween: 1400, ms: 3800 },
      ],
    },
  ],
  Scene,
});
