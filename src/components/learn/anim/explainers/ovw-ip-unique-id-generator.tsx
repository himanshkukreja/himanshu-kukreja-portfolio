/**
 * The whole problem, interview problem bank 04 (design a unique ID generator): requirements (64-bit,
 * roughly time-ordered, 1M a second, no network hop) and why not a UUID (80 GB per index at 10B rows);
 * the Snowflake-style layout (1 + 41 + 10 + 12 bits: ~69 years, 1,024 workers, 4,096 per ms); the design
 * (library in every instance, etcd leases, NTP); and the ways to get duplicates and other failure modes.
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
  etcd: { x: 16, y: 150, w: 100, h: 56, label: "etcd" },
  ntp: { x: 150, y: 40, w: 140, h: 40, label: "NTP" },
  os: { x: 150, y: 100, w: 140, h: 60, label: "Order svc" },
  cs: { x: 150, y: 214, w: 140, h: 60, label: "Chat svc" },
  db: { x: 440, y: 150, w: 144, h: 56, label: "Database" },
};
const EDGES: [string, string, boolean?][] = [
  ["os", "etcd"],
  ["cs", "etcd"],
  ["ntp", "os", true],
  ["os", "db"],
  ["cs", "db"],
];
const SVC = ["os", "cs", "db"];
const ALLN = ["etcd", "ntp", "os", "cs", "db"];
const W17 = { os: { sub: "worker 17", ns: "w17" }, cs: { sub: "worker 18", ns: "w18" } };

const V: { id: string; label: string; steps: Sp[] }[] = [
  {
    id: "req",
    label: "Requirements",
    steps: [
      {
        c: "Many services need IDs at high volume across data centres: unique forever, 64-bit numbers, and roughly in creation-time order.",
        f: {
          kick: "the brief",
          rows: [
            { k: "api", v: "next() · next(n) for a batch", nv: "next() · next(n)" },
            { k: "unique", v: "across every generator, forever", nv: "forever", tone: "ok" },
            { k: "format", v: "64-bit integer for a BIGINT column", nv: "64-bit BIGINT" },
            { k: "order", v: "roughly by time; strict per generator", nv: "roughly by time" },
          ],
          l: ["auto-increment breaks with many databases", "and with a million writes a second"],
          nl: ["auto-increment breaks", "at many DBs, 1M/s"],
        },
      },
      {
        c: "Assume 1 million IDs a second across the fleet. Each ID should cost microseconds, with no network call and no central service to fail.",
        f: {
          kick: "non-functional",
          rows: [
            { k: "throughput", v: "~1M IDs/s fleet-wide (assumed)", nv: "~1M/s", tone: "lit" },
            { k: "latency", v: "microseconds · no network hop", nv: "no network hop" },
            { k: "availability", v: "no single central dependency", nv: "no central SPOF", tone: "ok" },
            { k: "ordering", v: "across hosts: within clock skew", nv: "within clock skew" },
          ],
          l: ["generation happens inside each service", "coordination only at startup, never per ID"],
          nl: ["generated in each service", "no per-ID coordination"],
        },
      },
      {
        c: "Why not a random UUID? It is 128 bits: 8 extra bytes per row per index, 80 GB per index at 10 billion rows, and inserts scatter.",
        f: {
          kick: "why not a uuid",
          kt: "warn",
          rows: [
            { k: "uuidv4", v: "128 bits, random, no coordination", nv: "128-bit random" },
            { k: "size", v: "10B rows × 8 B = 80 GB per index", nv: "80 GB per index", tone: "bad" },
            { k: "locality", v: "random keys scatter B-tree inserts", nv: "scattered inserts", tone: "bad" },
            { k: "uuidv7", v: "time-ordered (RFC 9562), still 128", nv: "ordered, still 128" },
          ],
          l: ["time-ordered keys append at the index's right edge", "the brief asked for 64 bits"],
          nl: ["ordered keys append", "the brief says 64 bits"],
        },
      },
    ],
  },
  {
    id: "bits",
    label: "Bit layout",
    steps: [
      {
        c: "Split 64 bits four ways: 1 sign bit, 41 bits of milliseconds since a custom epoch, 10 bits of worker ID and 12 of sequence.",
        f: {
          kick: "64 bits",
          mx: 41,
          rows: [
            { k: "sign", v: "1 bit, always 0: stays positive", nv: "1 bit · 0", m: 1 },
            { k: "timestamp", v: "41 bits of ms since the epoch", nv: "41 bits · ms", m: 41, tone: "lit" },
            { k: "worker", v: "10 bits: which generator", nv: "10 bits · worker", m: 10, tone: "sky" },
            { k: "sequence", v: "12 bits: count within the ms", nv: "12 bits · seq", m: 12, tone: "ok" },
          ],
          l: ["timestamp first, so IDs sort by time", "the layout Twitter's Snowflake popularised in 2010"],
          nl: ["time first: sorts by time", "the Snowflake layout"],
        },
      },
      {
        c: "41 bits of milliseconds last about 69 years. 10 bits allow 1,024 generators, and 12 bits give 4,096 IDs per millisecond each.",
        f: {
          kick: "what the bits buy",
          rows: [
            { k: "2^41 ms", v: "≈ 2.2 trillion ms ≈ 69 years", nv: "≈ 69 years", tone: "lit" },
            { k: "2^10", v: "1,024 worker IDs", nv: "1,024 workers", tone: "sky" },
            { k: "2^12", v: "4,096 per ms ≈ 4.1M IDs/s each", nv: "≈ 4.1M/s each", tone: "ok" },
            { k: "need", v: "1M/s: worker IDs are the real limit", nv: "workers: the limit" },
          ],
          l: ["one generator could serve 1M/s on paper", "but you run one per service instance"],
          nl: ["one could serve 1M/s", "you run one per instance"],
        },
      },
      {
        c: "The 4,097th request in a millisecond waits for the next millisecond, at most 1 ms. A custom epoch starts the 69 years at launch.",
        f: {
          kick: "the sequence",
          rows: [
            { k: "same ms", v: "sequence + 1", nv: "seq + 1" },
            { k: "4,097th", v: "wait ≤ 1 ms, sequence back to 0", nv: "wait ≤ 1 ms", tone: "warn" },
            { k: "new ms", v: "sequence resets to 0", nv: "seq = 0" },
            { k: "epoch", v: "2025-01-01, not 1970", nv: "2025, not 1970", tone: "ok" },
          ],
          l: ["overflow is a throughput ceiling, never a duplicate", "across workers: ordered to within clock skew"],
          nl: ["a ceiling, not a duplicate", "ordered within skew"],
        },
      },
    ],
  },
  {
    id: "design",
    label: "Design",
    steps: [
      {
        c: "Each service instance embeds the library and builds IDs from its clock, its worker ID and a counter: no network call per ID.",
        f: {
          kick: "a library in every instance",
          on: SVC,
          st: { ...W17, os: { tone: "lit", sub: "worker 17", ns: "w17" }, db: { sub: "index on id", ns: "id index" } },
          go: [{ r: ["os", "db"], a: 0.1, b: 0.9, tone: "lit" }, { r: ["cs", "db"], a: 0.3, b: 0.98, tone: "lit" }],
          l: ["new rows append near the index's right edge", "an ID service exists for callers that can't embed it"],
          nl: ["rows append at the edge", "ID service for the rest"],
        },
      },
      {
        c: "Worker IDs come from etcd as leases, renewed every 10 seconds. An instance that loses its lease stops issuing IDs.",
        f: {
          kick: "worker-id leases",
          on: [...SVC, "etcd"],
          st: { ...W17, etcd: { tone: "lit", sub: "leases", ns: "leases" } },
          go: [{ r: ["os", "etcd"], a: 0.1, b: 0.6, tone: "lit" }, { r: ["cs", "etcd"], a: 0.3, b: 0.8, tone: "lit" }],
          l: ["a live lease is the right to generate", "never hard-code worker IDs in config"],
          nl: ["lease = right to generate", "no worker IDs in config"],
        },
      },
      {
        c: "NTP keeps the clocks close, so IDs from different instances sort to within a few milliseconds of their real order.",
        f: {
          kick: "clock sync",
          on: ALLN,
          st: { ...W17, ntp: { tone: "sky", sub: "", ns: "" } },
          go: [{ r: ["ntp", "os"], a: 0.1, b: 0.8, tone: "sky" }],
          l: ["slew the clock gradually; don't step it", "IDs as JSON strings: JS is exact only to 2^53"],
          nl: ["slew, don't step", "JSON: IDs as strings"],
        },
      },
    ],
  },
  {
    id: "fail",
    label: "Failure modes",
    steps: [
      {
        c: "The first way to get duplicates: two instances that both think they are worker 17, from copied config or a VM waking after its lease ended.",
        f: {
          kick: "duplicate 1 · shared worker id",
          kt: "bad",
          on: ALLN,
          st: { os: { tone: "bad", sub: "worker 17", ns: "w17" }, cs: { tone: "bad", sub: "worker 17 too", ns: "w17 too" }, etcd: { tone: "warn", sub: "lease lost", ns: "lost" } },
          l: ["stop generating when the lease may have expired", "after re-acquiring, wait out the maximum clock skew"],
          nl: ["no lease, no IDs", "then wait out the skew"],
        },
      },
      {
        c: "The second way: a clock steps backwards and reuses a millisecond. Wait out a small step; refuse and alert on a large one.",
        f: {
          kick: "duplicate 2 · clock goes back",
          kt: "bad",
          rows: [
            { k: "cause", v: "NTP step, VM migration, a manual fix", nv: "NTP step, VM move" },
            { k: "small step", v: "wait until the clock passes the last ms", nv: "wait it out", tone: "ok" },
            { k: "large step", v: "refuse to generate and alert", nv: "refuse + alert", tone: "bad" },
            { k: "prevent", v: "slewing NTP · remember the last ms", nv: "slew · remember" },
          ],
          l: ["never silently issue from a reused millisecond", "and never wait for minutes without alerting"],
          nl: ["never reuse a millisecond", "alert on long waits"],
        },
      },
      {
        c: "Time-ordered IDs all land at the end of the key space, so range-partitioning a table by ID makes the newest partition hot.",
        f: {
          kick: "hot partitions",
          kt: "warn",
          on: SVC,
          st: { ...W17, db: { tone: "bad", sub: "last range hot", ns: "hot" } },
          go: [0, 0.2, 0.4].map((a) => ({ r: ["os", "db"], a, b: a + 0.5, tone: "warn" as Tone })),
          l: ["every insert targets the newest range", "hash-partition by ID instead"],
          nl: ["inserts hit the newest range", "hash-partition instead"],
        },
      },
      {
        c: "IDs reveal creation time and rough volume, and JavaScript rounds them above 2^53. Use a separate public ID and send IDs as strings.",
        f: {
          kick: "leaks and limits",
          rows: [
            { k: "leak", v: "time + volume: use a random public ID", nv: "random public ID", tone: "warn" },
            { k: "js", v: "precision lost above 2^53 − 1: strings", nv: "send as strings", tone: "warn" },
            { k: "bits", v: "big fleet: 5 data centre + 5 worker", nv: "5 + 5 bits" },
            { k: "etcd down", v: "lease holders continue; new can't start", nv: "holders continue" },
          ],
          l: ["precision loss doesn't error: it changes the ID", "keep leases long enough to ride out short outages"],
          nl: ["rounding changes the ID", "long enough leases"],
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
