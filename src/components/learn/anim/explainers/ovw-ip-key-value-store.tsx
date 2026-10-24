/**
 * The whole problem, interview problem bank 03 (design a distributed key-value store): requirements and
 * the estimate (1B keys × 1 KB, 3 replicas, 200,000 ops a second → 500,000 replica ops → ~25 nodes);
 * the leaderless design (hash ring, coordinator, W = 2 / R = 2, LSM storage engine); the deep dives
 * (virtual nodes, hinted handoff, LWW vs vector clocks, read repair and Merkle trees); failure modes.
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 380;
type Pt = { x: number; y: number };
type Nd = { x: number; y: number; w: number; h: number; label: string; nl?: string };
type St = { tone?: Tone; sub?: string; ns?: string; dim?: boolean };
type Row = { k: string; v: string; nv?: string; tone?: Tone; m?: number };
type Go = { r: string[]; a: number; b: number; tone?: Tone };
type Fr = { kick: string; kt?: Tone; on?: string[]; st?: Record<string, St>; rows?: Row[]; mx?: number; go?: Go[]; l: [string, string]; nl?: [string, string] };
type Sp = { c: string; f: Fr; tween?: number; ms?: number };

const N: Record<string, Nd> = {
  app: { x: 16, y: 150, w: 84, h: 52, label: "Apps" },
  co: { x: 124, y: 140, w: 120, h: 72, label: "Coordinator", nl: "Coord" },
  a: { x: 296, y: 40, w: 130, h: 52, label: "Node A" },
  b: { x: 296, y: 112, w: 130, h: 52, label: "Node B" },
  c: { x: 296, y: 184, w: 130, h: 52, label: "Node C" },
  d: { x: 296, y: 256, w: 130, h: 52, label: "Node D" },
  g: { x: 462, y: 112, w: 122, h: 124, label: "Gossip" },
};
const EDGES: [string, string, boolean?][] = [
  ["app", "co"],
  ["co", "a"],
  ["co", "b"],
  ["co", "c"],
  ["co", "d", true],
  ["b", "g", true],
];
const R3 = ["app", "co", "a", "b", "c"];
const ALLN = [...R3, "d", "g"];

const V: { id: string; label: string; steps: Sp[] }[] = [
  {
    id: "req",
    label: "Requirements",
    steps: [
      {
        c: "A key-value store has a tiny API, get, put and delete, with a consistency level per request. The hard part is everything behind it.",
        f: {
          kick: "the brief",
          rows: [
            { k: "api", v: "get · put · delete, values ≤ 1 MB", nv: "get · put · delete" },
            { k: "consistency", v: "per request: ONE, QUORUM, ALL", nv: "ONE/QUORUM/ALL" },
            { k: "never", v: "reject a write (think shopping cart)", nv: "reject a write", tone: "lit" },
            { k: "no", v: "joins, indexes, multi-key transactions", nv: "joins, transactions" },
          ],
          l: ["Dynamo-style: opaque values looked up by key", "placement and disagreement are the interview"],
          nl: ["opaque values by key", "placement + disagreement"],
        },
      },
      {
        c: "It must stay writable while replicas fail, answer in single-digit milliseconds, scale by adding nodes and keep 3 copies of everything.",
        f: {
          kick: "non-functional",
          rows: [
            { k: "writable", v: "even with some replicas down", nv: "replicas down: ok", tone: "ok" },
            { k: "latency", v: "single-digit ms at p99", nv: "< 10 ms p99" },
            { k: "scale", v: "add nodes, move a small share", nv: "add nodes" },
            { k: "durable", v: "3 copies on different machines", nv: "3 copies" },
            { k: "no leader", v: "any node serves any request", nv: "any node serves" },
          ],
          l: ["no single point of failure", "copies in different racks or zones"],
          nl: ["no single point of failure", "copies across racks"],
        },
      },
      {
        c: "200,000 ops a second becomes 500,000 replica ops: writes go to 3 nodes, reads ask 2. At 20,000 per node that is about 25 nodes.",
        f: {
          kick: "estimate",
          mx: 500000,
          rows: [
            { k: "data", v: "1B keys × 1 KB ≈ 1 TB · 3 TB with 3 copies", nv: "1 TB → 3 TB" },
            { k: "client ops", v: "200,000/s, half reads", nv: "200,000/s", m: 200000 },
            { k: "replica ops", v: "300,000 writes + 200,000 reads", nv: "500,000/s", m: 500000, tone: "lit" },
            { k: "nodes", v: "÷ 20,000 per node ≈ 25 nodes", nv: "≈ 25 nodes", tone: "ok" },
            { k: "per node", v: "3 TB ÷ 25 ≈ 120 GB", nv: "≈ 120 GB" },
          ],
          l: ["throughput, not disk, sets the node count", "three copies cost about 2.5x the work"],
          nl: ["throughput sets node count", "3 copies ≈ 2.5x work"],
        },
      },
    ],
  },
  {
    id: "design",
    label: "Design",
    steps: [
      {
        c: "Keys are hashed onto a ring. The coordinator sends each key to its preference list: the next 3 distinct nodes clockwise.",
        f: {
          kick: "the ring",
          on: R3,
          st: { co: { tone: "lit", sub: "hash(key)", ns: "hash" }, a: { sub: "replica 1", ns: "r1" }, b: { sub: "replica 2", ns: "r2" }, c: { sub: "replica 3", ns: "r3" } },
          l: ["any node can coordinate; no leader", "a smart client can skip the extra hop"],
          nl: ["any node coordinates", "smart clients skip a hop"],
        },
      },
      {
        c: "A write goes to all 3 replicas and succeeds once 2 acknowledge (W = 2). The third replica catches up a moment later.",
        f: {
          kick: "write · W = 2",
          on: R3,
          st: { co: { tone: "lit", sub: "put", ns: "put" }, a: { tone: "ok", sub: "ack", ns: "ack" }, b: { tone: "ok", sub: "ack", ns: "ack" }, c: { tone: "warn", sub: "slow", ns: "slow" } },
          go: [{ r: ["app", "co", "a"], a: 0, b: 0.7, tone: "lit" }, { r: ["app", "co", "b"], a: 0, b: 0.75, tone: "lit" }, { r: ["app", "co", "c"], a: 0, b: 0.98, tone: "warn" }],
          l: ["success after 2 of 3 acknowledgements", "the slow replica does not hold the write up"],
          nl: ["2 of 3 acks = success", "slow replica catches up"],
        },
      },
      {
        c: "A read asks 2 replicas (R = 2). Because R + W = 4 is more than 3, the read always overlaps the latest write on at least one node.",
        f: {
          kick: "read · R = 2 · R + W > N",
          kt: "ok",
          on: R3,
          st: { co: { tone: "lit", sub: "newest wins", ns: "newest" }, b: { tone: "ok", sub: "v7", ns: "v7" }, c: { tone: "ok", sub: "v7", ns: "v7" }, a: { dim: true, sub: "not asked", ns: "—" } },
          go: [{ r: ["co", "b"], a: 0.1, b: 0.6, tone: "sky" }, { r: ["co", "c"], a: 0.1, b: 0.6, tone: "sky" }],
          l: ["W = 1: fast, lossy writes · R = 1: fast, maybe stale", "ALL: strongest, least available"],
          nl: ["W/R = 1: fast, weaker", "ALL: least available"],
        },
      },
      {
        c: "Inside a node, a write appends to a commit log and a memtable. Full memtables flush to sorted SSTables, merged later by compaction.",
        f: {
          kick: "the storage engine (LSM)",
          rows: [
            { k: "commit log", v: "append first: survives a crash", nv: "append: durable" },
            { k: "memtable", v: "sorted, in memory", nv: "in memory" },
            { k: "sstables", v: "immutable sorted files on flush", nv: "immutable files" },
            { k: "bloom filter", v: "skip files that lack the key", nv: "skip files", tone: "ok" },
            { k: "compaction", v: "merge files in the background", nv: "merge later" },
          ],
          l: ["writes are sequential appends: fast", "reads check memtable, then SSTables"],
          nl: ["writes: sequential, fast", "reads: memtable, then files"],
        },
      },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      {
        c: "With modulo, a 26th node moves almost every key. On a ring with 128 virtual nodes each, it takes small slices from everyone, about 1/26.",
        f: {
          kick: "1 · placement",
          rows: [
            { k: "hash % 25", v: "add 1 node → almost every key moves", nv: "almost all move", tone: "bad" },
            { k: "ring, 1 token", v: "uneven arcs, one neighbour unloads", nv: "uneven", tone: "warn" },
            { k: "128 vnodes", v: "even load, ~1/26 of data moves", nv: "~1/26 moves", tone: "ok" },
            { k: "replicas", v: "next 3 distinct machines, racks", nv: "3 distinct machines" },
          ],
          l: ["rebalancing streams only the moved ranges", "in the background"],
          nl: ["only moved ranges stream", "in the background"],
        },
      },
      {
        c: "If replica C is down, the write goes to D with a hint (a sloppy quorum). D hands it back when gossip says C has returned.",
        f: {
          kick: "2 · hinted handoff",
          kt: "warn",
          on: ALLN,
          st: { c: { tone: "bad", sub: "down", ns: "down" }, d: { tone: "warn", sub: "hint for C", ns: "hint" }, a: { tone: "ok", sub: "ack", ns: "ack" }, b: { tone: "ok", sub: "ack", ns: "ack" }, g: { sub: "C is down", ns: "C down" } },
          go: [{ r: ["co", "a"], a: 0.05, b: 0.6, tone: "lit" }, { r: ["co", "b"], a: 0.05, b: 0.6, tone: "lit" }, { r: ["co", "d"], a: 0.05, b: 0.7, tone: "warn" }],
          l: ["W = 2 is still met, so the write succeeds", "writes stay available through the failure"],
          nl: ["W = 2 still met", "writes stay available"],
        },
      },
      {
        c: "Concurrent writes can disagree. Last write wins keeps one and can drop the other; vector clocks detect the conflict and return both.",
        f: {
          kick: "2 · concurrent writes",
          rows: [
            { k: "phone 1", v: "cart + milk", nv: "+ milk" },
            { k: "phone 2", v: "cart + bread, at the same moment", nv: "+ bread" },
            { k: "last write wins", v: "one item silently lost; skew matters", nv: "one item lost", tone: "bad" },
            { k: "vector clocks", v: "both returned, client merges: milk + bread", nv: "merge: both", tone: "ok" },
          ],
          l: ["carts: vector clocks and a client merge", "a profile photo URL: last write wins is fine"],
          nl: ["carts: vector clocks", "photo URL: LWW is fine"],
        },
      },
      {
        c: "Replicas converge two ways: read repair fixes stale copies a read notices, and Merkle trees find differing key ranges in the background.",
        f: {
          kick: "2 · converging",
          kt: "ok",
          on: R3,
          st: { co: { tone: "ok", sub: "read repair", ns: "repair" }, a: { tone: "warn", sub: "stale v6", ns: "v6" }, b: { tone: "ok", sub: "v7", ns: "v7" }, c: { tone: "ok", sub: "v7", ns: "v7" } },
          go: [{ r: ["co", "a"], a: 0.3, b: 0.9, tone: "ok" }],
          l: ["Merkle trees: equal roots = identical range", "a mismatch narrows down to the differing keys"],
          nl: ["equal roots = same range", "only diffs are sent"],
        },
      },
    ],
  },
  {
    id: "fail",
    label: "Trade-offs",
    steps: [
      {
        c: "In a network partition, sloppy quorums keep both sides writable and reconcile later; strict quorums reject writes on the minority side.",
        f: {
          kick: "partition: the CAP choice",
          rows: [
            { k: "sloppy quorum", v: "both sides accept writes, merge later", nv: "available", tone: "ok" },
            { k: "strict quorum", v: "minority side rejects writes", nv: "consistent", tone: "warn" },
            { k: "per request", v: "chosen through the consistency level", nv: "per request" },
          ],
          l: ["availability or consistency, per call", "the shopping cart chooses availability"],
          nl: ["choose per call", "carts choose availability"],
        },
      },
      {
        c: "Nodes gossip membership and heartbeats with a few random peers, so failures are detected and the ring is known without a master.",
        f: {
          kick: "gossip",
          on: ALLN,
          st: { g: { tone: "sky", sub: "heartbeats", ns: "beats" }, b: { sub: "peer", ns: "peer" } },
          go: [{ r: ["b", "g"], a: 0.1, b: 0.7, tone: "sky" }],
          l: ["every node learns the ring and who looks dead", "no central coordinator to fail"],
          nl: ["every node knows the ring", "no master to fail"],
        },
      },
      {
        c: "Watch three more traps: tombstones purged too early resurrect deletes, one hot key always lands on 3 nodes, and compaction steals disk.",
        f: {
          kick: "more failure modes",
          kt: "warn",
          rows: [
            { k: "tombstones", v: "keep longer than the longest outage", nv: "keep them long", tone: "warn" },
            { k: "hot key", v: "cache in front, or split into sub-keys", nv: "cache or split", tone: "warn" },
            { k: "compaction", v: "throttle it; full repairs off-peak", nv: "throttle it" },
            { k: "new node", v: "stream small ranges gradually", nv: "stream slowly" },
          ],
          l: ["a delete is a tombstone, not an erase", "background work competes with live traffic"],
          nl: ["delete = tombstone", "background work competes"],
        },
      },
    ],
  },
];

const ALL = Object.keys(N);
/** orthogonal wire from box a to box b: an elbow when they sit side by side, straight when stacked */
function pts(a: string, b: string): Pt[] {
  const p = N[a];
  const q = N[b];
  const pc = p.y + p.h / 2;
  const qc = q.y + q.h / 2;
  if (q.x >= p.x + p.w) {
    const m = Math.round((p.x + p.w + q.x) / 2);
    return [{ x: p.x + p.w, y: pc }, { x: m, y: pc }, { x: m, y: qc }, { x: q.x, y: qc }];
  }
  if (q.x + q.w <= p.x) {
    const m = Math.round((q.x + q.w + p.x) / 2);
    return [{ x: p.x, y: pc }, { x: m, y: pc }, { x: m, y: qc }, { x: q.x + q.w, y: qc }];
  }
  const x = Math.round((Math.max(p.x, q.x) + Math.min(p.x + p.w, q.x + q.w)) / 2);
  return q.y >= p.y + p.h ? [{ x, y: p.y + p.h }, { x, y: q.y }] : [{ x, y: p.y }, { x, y: q.y + q.h }];
}
const path = (ps: Pt[]) => "M" + ps.map((p) => `${p.x} ${p.y}`).join("L");
function walk(ps: Pt[], k: number): Pt {
  const lens = ps.slice(1).map((q, i) => Math.abs(q.x - ps[i].x) + Math.abs(q.y - ps[i].y));
  let d = k * lens.reduce((s, v) => s + v, 0);
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const u = lens[i] ? Math.min(1, d / lens[i]) : 1;
      return { x: lerp(ps[i].x, ps[i + 1].x, u), y: lerp(ps[i].y, ps[i + 1].y, u) };
    }
    d -= lens[i];
  }
  return ps[ps.length - 1];
}

function Scene({ variant, step, t, narrow }: SceneProps) {
  const v = V.find((x) => x.id === variant) || V[0];
  const i = Math.min(step, v.steps.length - 1);
  const f = v.steps[i].f;
  const before = i > 0 ? v.steps[i - 1].f.on || [] : [];
  const on = f.on || [];
  const l = narrow && f.nl ? f.nl : f.l;
  return (
    <g>
      <Txt x={16} y={28} k="k" anchor="start" tone={f.kt}>
        {f.kick}
      </Txt>
      {f.rows ? (
        <g>
          <rect className="ax-box lit" x={16} y={44} width={W - 32} height={Math.min(270, 24 + f.rows.length * 50)} />
          {f.rows.map((r, j) => {
            const y = 76 + j * 50;
            return (
              <g key={r.k} opacity={ease(seg(t, j * 0.12, j * 0.12 + 0.4))}>
                <Txt x={32} y={y} k="k" anchor="start" tone="mute">
                  {r.k}
                </Txt>
                <Txt x={32} y={y + 24} anchor="start" tone={r.tone}>
                  {narrow ? r.nv || r.v : r.v}
                </Txt>
                {r.m !== undefined && <Meter x={420} y={y + 12} w={148} h={14} value={r.m * ease(seg(t, 0.2, 0.9))} max={f.mx || r.m} tone={r.tone || "sky"} />}
              </g>
            );
          })}
        </g>
      ) : (
        <g>
          {EDGES.filter(([a, b]) => on.includes(a) && on.includes(b)).map(([a, b, dash]) => (
            <Wire key={a + b} d={path(pts(a, b))} arrow dash={dash} />
          ))}
          {ALL.filter((k) => on.includes(k)).map((k) => {
            const n = N[k];
            const s = f.st?.[k] || {};
            const sub = narrow ? (s.ns ?? s.sub) : s.sub;
            return (
              <g key={k} opacity={before.includes(k) ? 1 : ease(seg(t, 0, 0.4))}>
                <Box x={n.x} y={n.y} w={n.w} h={n.h} label={narrow ? n.nl || n.label : n.label} sub={sub || undefined} tone={s.tone} dim={s.dim} />
              </g>
            );
          })}
          {f.go?.map((g, j) => {
            const q = seg(t, g.a, g.b);
            if (q <= 0 || q >= 1) return null;
            const p = walk(g.r.slice(1).flatMap((b, n) => pts(g.r[n], b)), ease(q));
            return <Token key={j} x={p.x} y={p.y} tone={g.tone} />;
          })}
        </g>
      )}
      <Txt x={16} y={H - 34} k="s" anchor="start" tone={f.kt}>
        {l[0]}
      </Txt>
      <Txt x={16} y={H - 10} k="s" anchor="start">
        {l[1]}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  variants: V.map((v) => ({ id: v.id, label: v.label, steps: v.steps.map((s) => ({ caption: s.c, tween: s.tween ?? 1400, ms: s.ms ?? 3600 })) })),
  Scene,
});
