/**
 * The whole lesson, week 1 day 1 (Partitioning deep-dive): the single-node ceiling (1,000 → 10,000
 * req/s), hash / range / directory partitioning and how each breaks, resharding (modulo moves ~80%,
 * consistent hashing one arc, virtual nodes), and the URL shortener: hash by short_code, a viral
 * code at 1M hits/s, a 99.99% cache, and starting with simple modulo.
 */
import { Box, defineExplainer, ease, lerp, seg, Meter, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 350;
type Pt = { x: number; y: number };
const APP = { x: 20, y: 126, w: 100, h: 60 };
const RT = { x: 140, y: 126, w: 164, h: 60 };
const DIR = { x: 140, y: 40, w: 164, h: 52 };
const CACHE = { x: 140, y: 220, w: 164, h: 52 };
const PX = 330;
const PW = 112;
const rowY = (i: number) => 54 + i * 50;
const cy = (i: number) => rowY(i) + 20;

type Part = { label: string; sub?: string; tone?: Tone; dim?: boolean; load?: number; lv?: string; mt?: Tone };
type Move = { pts: Pt[]; a: number; b: number; tone?: Tone };
type Frame = { kick: string; kt?: Tone; rt: string; rs?: string; rtone?: Tone; parts?: Part[]; single?: Part; dir?: Tone; cache?: Tone; moves: Move[]; l: [string, string]; nl?: [string, string] };

const toPart = (i: number, a = 0.05, b = 0.9, tone?: Tone): Move => ({ pts: [{ x: 120, y: 156 }, { x: 140, y: 156 }, { x: 304, y: 156 }, { x: 316, y: 156 }, { x: 316, y: cy(i) }, { x: PX, y: cy(i) }], a, b, tone });
const hop = (i: number, j: number, x: number, a: number, b: number, tone: Tone = "warn"): Move => ({ pts: [{ x, y: cy(i) }, { x, y: cy(j) }], a, b, tone });
function walk(pts: Pt[], p: number): Pt {
  const n = pts.length - 1;
  const f = Math.min(n - 1e-6, Math.max(0, p * n));
  const i = Math.floor(f);
  return { x: lerp(pts[i].x, pts[i + 1].x, f - i), y: lerp(pts[i].y, pts[i + 1].y, f - i) };
}
const ps = (labels: string[], f: (i: number) => Partial<Part>): Part[] => labels.map((label, i) => ({ label, ...f(i) }));
const P4 = ["P0", "P1", "P2", "P3"];
const P5 = ["P0", "P1", "P2", "P3", "P4"];

function frame(v: string, s: number): Frame {
  if (v === "ceiling") {
    if (s === 0) return { kick: "one machine, one disk", rt: "App code", single: { label: "PostgreSQL", sub: "1,000 req/s", tone: "ok", load: 0.15, lv: "10 ms queries" }, moves: [{ ...toPart(1), pts: [{ x: 120, y: 156 }, { x: 330, y: 156 }] }], l: ["1,000 req/s without breaking a sweat", "then your startup grows"] };
    if (s === 1) return { kick: "the single-node ceiling", kt: "bad", rt: "App code", single: { label: "PostgreSQL", sub: "10,000 req/s", tone: "bad", load: 1, lv: "500 ms queries", mt: "bad" }, moves: [0, 0.2, 0.4, 0.6].map((a) => ({ pts: [{ x: 120, y: 156 }, { x: 330, y: 156 }], a, b: a + 0.35, tone: "bad" as Tone })), l: ["CPU pegged at 100% · disk I/O bottleneck", "queries: 10 ms → 500 ms"] };
    return { kick: "partitioning scales writes", kt: "ok", rt: "which partition?", rtone: "lit", parts: ps(P4, () => ({ tone: "ok", load: 0.25, lv: "own subset" })), moves: [0, 1, 2, 3].map((i) => toPart(i, i * 0.12, i * 0.12 + 0.55)), l: ["bigger machine: limits · replicas: reads only", "partitioning: each machine owns a subset"] };
  }
  if (v === "strategies") {
    if (s === 0) return { kick: "hash partitioning", rt: "hash(key) % 4", rtone: "lit", parts: ps(P4, (i) => ({ load: 0.4, lv: i === 3 ? "user_123, user_456" : i === 0 ? "user_789" : "even", mt: "ok" })), moves: [toPart(3, 0, 0.3), toPart(3, 0.3, 0.6), toPart(0, 0.6, 0.9)], l: ["even spread · O(1) lookup", "\"URLs from the last hour\": query every partition"], nl: ["even spread · O(1) lookup", "a range: every partition"] };
    if (s === 1) return { kick: "range partitioning", kt: "bad", rt: "by month", rtone: "lit", parts: ps(["Sep", "Oct", "Nov", "Dec"], (i) => (i === 3 ? { tone: "bad", load: 1, lv: "all writes", mt: "bad" } : { dim: true, load: 0, lv: "read-only" })), moves: [0, 0.25, 0.5].map((a) => toPart(3, a, a + 0.4, "bad")), l: ["range queries: one partition", "December: every write hits one partition"], nl: ["range query: one partition", "December: one hot partition"] };
    if (s === 2) return { kick: "directory-based", rt: "look up first", rtone: "lit", dir: "sky", parts: ps(P4, (i) => ({ load: 0.4, lv: i === 1 ? "1001-5000" : "any keys", mt: "ok" })), moves: [{ pts: [{ x: 222, y: 126 }, { x: 222, y: 92 }], a: 0, b: 0.3, tone: "sky" }, toPart(1, 0.35, 0.9)], l: ["any key to any partition · easy rebalancing", "every request pays a directory lookup"], nl: ["any key, any partition", "every request: a lookup"] };
    return { kick: "the directory fails", kt: "bad", rt: "no route", rtone: "bad", dir: "bad", parts: ps(P4, () => ({ dim: true, load: 0, lv: "unreachable", mt: "bad" })), moves: [{ pts: [{ x: 222, y: 126 }, { x: 222, y: 92 }], a: 0, b: 0.4, tone: "bad" }], l: ["a single Redis directory dies", "no one can find any data: complete outage"], nl: ["single Redis directory dies", "complete outage"] };
  }
  if (v === "reshard") {
    if (s === 0) return { kick: "hash % N: 4 → 5", kt: "bad", rt: "hash(key) % 5", rtone: "warn", parts: ps(P5, (i) => ({ tone: "warn", load: 0.8, lv: i === 4 ? "new" : "~80% leave", mt: "warn" })), moves: [hop(0, 2, 360, 0, 0.5), hop(1, 4, 380, 0.1, 0.7), hop(2, 0, 400, 0.2, 0.8), hop(3, 1, 420, 0.3, 0.9), hop(4, 3, 350, 0.35, 0.95)], l: ["4 → 5 partitions: ~80% of data moves", "100 → 101: ~99% · doubling: ~50%"], nl: ["4 → 5: ~80% moves", "100 → 101: ~99%"] };
    if (s === 1) return { kick: "consistent hashing", kt: "ok", rt: "ring: clockwise", rtone: "ok", parts: ps(["P0", "P1", "P2", "P4", "P3"], (i) => (i === 3 ? { tone: "ok", load: 0.2, lv: "arc (P2, P4]", mt: "ok" } : i === 4 ? { tone: "sky", load: 0.25, lv: "gave one arc" } : { dim: true, load: 0.45, lv: "unchanged" })), moves: [hop(4, 3, 386, 0.1, 0.8, "ok")], l: ["only keys in arc (P2, P4] move", "~1/(N+1) of data, from one neighbor"], nl: ["only arc (P2, P4] moves", "from one neighbor"] };
    return { kick: "virtual nodes", kt: "ok", rt: "150 points each", rtone: "ok", parts: ps(P5, () => ({ tone: "ok", load: 0.4, lv: "even", mt: "ok" })), moves: [], l: ["one point per node: uneven gaps, uneven load", "many virtual nodes: even spread · more to run"], nl: ["one point each: uneven", "virtual nodes: even"] };
  }
  if (s === 0) return { kick: "URL shortener", rt: "hash(short_code)", rtone: "lit", parts: ps(P4, () => ({ load: 0.3, lv: "even", mt: "ok" })), moves: [toPart(2, 0, 0.8)], l: ["100M creates/day (~1,150/s) · 1B redirects/day", "~11,500 redirects/s · p99 < 50 ms"], nl: ["1B redirects/day", "p99 < 50 ms"] };
  if (s === 1) return { kick: "one viral short_code", kt: "bad", rt: "hash(short_code)", parts: ps(P4, (i) => (i === 2 ? { tone: "bad", load: 1, lv: "1M req/s", mt: "bad" } : { load: 0.1, lv: "10K req/s" })), moves: [0, 0.15, 0.3, 0.45].map((a) => toPart(2, a, a + 0.45, "bad")), l: ["a celebrity tweets one link", "its partition: 1M req/s · others: 10K"], nl: ["a celebrity tweets a link", "1M req/s on one partition"] };
  if (s === 2) return { kick: "cache: the first defense", kt: "ok", rt: "hash(short_code)", cache: "ok", parts: ps(P4, (i) => (i === 2 ? { tone: "ok", load: 0.05, lv: "~100 req/s", mt: "ok" } : { load: 0.1, lv: "10K req/s" })), moves: [{ pts: [{ x: 222, y: 186 }, { x: 222, y: 220 }], a: 0, b: 0.4, tone: "ok" }], l: ["99.99% cache hit rate", "the partition sees only ~100 misses/s"], nl: ["99.99% cache hits", "~100 misses/s reach it"] };
  return { kick: "fallbacks · then the verdict", rt: "hash % N", rtone: "lit", cache: "ok", parts: ps(P4, (i) => ({ tone: "ok", load: 0.35, lv: `viral_url:${i}…`, mt: "ok" })), moves: [], l: ["cache fails? read replicas or key splitting", "start with simple modulo; consistent: later"], nl: ["replicas or key splitting", "start with simple modulo"] };
}

const NR: Record<string, string> = { "hash(key) % 4": "hash % 4", "hash(key) % 5": "hash % 5", "hash(short_code)": "hash(code)", "which partition?": "partition?", "ring: clockwise": "ring", "150 points each": "150 vnodes", "look up first": "lookup" };

function Scene({ variant, step, t, narrow }: SceneProps) {
  const f = frame(variant, step);
  const e = ease(seg(t, 0, 0.6));
  const l = narrow && f.nl ? f.nl : f.l;
  const parts = f.parts || [];
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start" tone={f.kt}>
        {f.kick}
      </Txt>
      <Wire d={`M120 156H${RT.x}`} arrow />
      <Box {...APP} label="App" sub={narrow ? undefined : "requests"} />
      <Box {...RT} label={narrow ? NR[f.rt] || f.rt : f.rt} sub={narrow ? undefined : "router"} tone={f.rtone} />
      {f.dir && (
        <g opacity={step === 2 ? e : 1}>
          <Wire d="M222 126V92" tone={f.dir === "bad" ? "bad" : undefined} />
          <Box {...DIR} label="Directory" sub={narrow ? undefined : "single Redis"} tone={f.dir} />
        </g>
      )}
      {f.cache && (
        <g opacity={variant === "url" && step === 2 ? e : 1}>
          <Wire d="M222 186V220" />
          <Box {...CACHE} label="Redis cache" sub={narrow ? undefined : "hit 99.99%"} tone={f.cache} />
        </g>
      )}
      {f.single && (
        <g>
          <Wire d={`M304 156H${PX}`} arrow />
          <Box x={PX} y={106} w={246} h={100} label={f.single.label} sub={f.single.sub} tone={f.single.tone} />
          <Txt x={PX} y={232} k="s" anchor="start" tone={f.single.mt}>
            {f.single.lv}
          </Txt>
          <Meter x={PX} y={240} w={246} h={12} value={f.single.load || 0} max={1} tone={f.single.mt} />
        </g>
      )}
      {parts.map((p, i) => {
        const fresh = (variant === "ceiling" || (variant === "reshard" && step === 0 && i === 4) || (variant === "reshard" && step === 1 && i === 3)) ? e : 1;
        return (
          <g key={i} opacity={fresh}>
            <Wire d={`M304 156H316V${cy(i)}H${PX}`} tone={p.tone === "bad" ? "bad" : undefined} />
            <Box x={PX} y={rowY(i)} w={PW} h={40} label={p.label} tone={p.tone} dim={p.dim} />
            <Txt x={PX + PW + 14} y={rowY(i) + 14} k="s" anchor="start" tone={p.mt === "bad" ? "bad" : undefined}>
              {narrow && (p.lv || "").length > 12 ? (p.lv || "").split(/[ ,]/)[0] : p.lv}
            </Txt>
            <Meter x={PX + PW + 14} y={rowY(i) + 22} w={W - 20 - (PX + PW + 14)} h={12} value={p.load || 0} max={1} tone={p.mt} />
          </g>
        );
      })}
      {f.moves.map((m, i) => {
        const q = seg(t, m.a, m.b);
        if (q <= 0 || q >= 1) return null;
        const p = walk(m.pts, ease(q));
        return <Token key={i} x={p.x} y={p.y} tone={m.tone} />;
      })}
      <Txt x={20} y={H - 36} k="s" anchor="start" tone={f.kt}>
        {l[0]}
      </Txt>
      <Txt x={20} y={H - 12} k="s" anchor="start">
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
      id: "ceiling",
      label: "The ceiling",
      steps: [
        { caption: "Every database starts simple: one machine, one disk. A PostgreSQL instance handles 1,000 requests per second without breaking a sweat.", tween: 1200 },
        { caption: "Then it's 10,000 requests per second. CPU is pegged at 100%, disk I/O is the bottleneck, and 10 ms queries take 500 ms.", tween: 1600 },
        { caption: "A bigger machine has limits, and read replicas don't fix writes. Partitioning splits the data so each machine owns a subset: that's how you truly scale writes.", tween: 1600, ms: 3600 },
      ],
    },
    {
      id: "strategies",
      label: "Strategies",
      steps: [
        { caption: "Hash partitioning: hash(key) % 4 sends user_123 and user_456 to partition 3 and user_789 to 0. Even spread, but \"URLs from the last hour\" means querying every partition.", tween: 2000, ms: 3600 },
        { caption: "Range partitioning keeps ranges on one partition. But with a partition per month, every December write hits December while the other 11 sit read-only.", tween: 1600 },
        { caption: "Directory-based partitioning looks each key up in a separate table first. Any key can go anywhere, at the price of a lookup on every request.", tween: 1600 },
        { caption: "And if that directory is a single Redis instance and it fails, no service can find any data: a complete outage.", tween: 1200 },
      ],
    },
    {
      id: "reshard",
      label: "Resharding",
      steps: [
        { caption: "Add a fifth partition to hash(key) % N and the modulo changes: about 80% of the data moves. Going from 100 to 101 partitions, about 99%.", tween: 2000 },
        { caption: "Consistent hashing puts keys and partitions on a ring; a key belongs to the next partition clockwise. Add P4 between P2 and P3 and only the arc (P2, P4] moves, from P3.", tween: 1600, ms: 3600 },
        { caption: "With one point per partition the gaps are uneven, so each partition gets many virtual nodes (150 in the lesson's code) and load evens out. The cost: a ring to maintain.", tween: 1200, ms: 3400 },
      ],
    },
    {
      id: "url",
      label: "URL shortener",
      steps: [
        { caption: "The design: 100 million creations and 1 billion redirects a day, under 50 ms at p99. Every redirect carries its short_code, so hash-partition by short_code.", tween: 1400, ms: 3400 },
        { caption: "A celebrity tweets a link and one short_code gets 1 million hits a second. Its partition takes 1M requests a second while the others sit at 10K.", tween: 1800 },
        { caption: "Caching is the first line of defense: at a 99.99% hit rate, that partition sees only about 100 requests a second.", tween: 1400 },
        { caption: "If the cache fails, use read replicas or key splitting. And start with simple modulo hashing: scaling here is rare and planned, so consistent hashing can wait.", tween: 1000, ms: 3600 },
      ],
    },
  ],
  Scene,
});
