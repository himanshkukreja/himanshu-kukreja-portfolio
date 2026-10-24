/**
 * The whole side quest, AWS S3: the mission and scale (500T+ objects, 11 nines, 200M+ requests a
 * second), the estimate (~5,000 objects a year lost at exactly 11 nines; ~250 EB of data, ~400 EB
 * with 10+6 coding vs ~750 EB with 3 copies), the layers (front end, index, storage across three
 * AZs; PUT → encode → bracketing → commit), the deep dives (erasure coding and AZ loss, strong
 * consistency, index partitioning, storage classes) and scale and edge cases (503s and prefixes,
 * correlated failures, concurrent writes, stolen keys).
 */
import { at, Box, defineExplainer, ease, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone, type Variant } from "../kit";

const W = 600;
const H = 340;
/** a label with an optional shorter form for narrow stages: "both" or ["wide", "narrow"] */
type Two = string | [string, string];
type Nd = { x: number; y: number; w: number; h: number; l: string; n?: string };
type Fr = {
  /** kicker (top left) */
  k: Two;
  kt?: Tone;
  /** nodes in play (plain 1 or a tone); every other node is dimmed */
  on?: Record<string, Tone | 1>;
  sub?: Record<string, Two>;
  /** wires carrying traffic in this frame: [from, to, tone]; a reversed pair runs a wire backwards */
  fl?: [string, string, Tone?][];
  /** big figures: [figure, label, tone] */
  figs?: [string, Two, Tone?][];
  chips?: Two[];
  cols?: number;
  ct?: Tone;
  /** per-chip tones (override ct) */
  ctn?: Tone[];
  /** meters: [label, value, max, tone] */
  bars?: [Two, number, number, Tone?][];
  note?: Two;
  nt?: Tone;
};
type P = { x: number; y: number };
const pick = (v: Two | undefined, nr: boolean) => (v === undefined ? undefined : typeof v === "string" ? v : v[nr ? 1 : 0]);

/** a soft orthogonal curve from one box to the next, picked by their relative position */
function geo(a: Nd, b: Nd): P[] {
  const ay = a.y + a.h / 2;
  const by = b.y + b.h / 2;
  if (b.x >= a.x + a.w - 2 || b.x + b.w <= a.x + 2) {
    const r = b.x >= a.x + a.w - 2;
    const p0 = { x: r ? a.x + a.w : a.x, y: ay };
    const p3 = { x: r ? b.x : b.x + b.w, y: by };
    const m = (p0.x + p3.x) / 2;
    return [p0, { x: m, y: p0.y }, { x: m, y: p3.y }, p3];
  }
  const d = b.y > a.y;
  const p0 = { x: a.x + a.w / 2, y: d ? a.y + a.h : a.y };
  const p3 = { x: b.x + b.w / 2, y: d ? b.y : b.y + b.h };
  const m = (p0.y + p3.y) / 2;
  return [p0, { x: p0.x, y: m }, { x: p3.x, y: m }, p3];
}
const bz = (g: P[], u: number): P => {
  const v = 1 - u;
  const c = [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u];
  return { x: g.reduce((s, p, i) => s + p.x * c[i], 0), y: g.reduce((s, p, i) => s + p.y * c[i], 0) };
};
const path = (g: P[]) => `M${g[0].x} ${g[0].y}C${g[1].x} ${g[1].y} ${g[2].x} ${g[2].y} ${g[3].x} ${g[3].y}`;

function Scene({ variant, step, t, clock, narrow: nr }: SceneProps) {
  const f = at(step, F[variant] || F[Object.keys(F)[0]]);
  const on = f.on || {};
  /** staggered fade-in for item i of n, always fully in by t = 1 */
  const fade = (i: number, n: number) => {
    const k = n > 1 ? Math.min(0.15, 0.5 / (n - 1)) : 0;
    return ease(seg(t, i * k, i * k + 0.5));
  };
  const xs = [[300], [160, 440], [100, 300, 500]][(f.figs?.length || 1) - 1] || [];
  const cols = f.cols || 2;
  const cw = (552 - (cols - 1) * 8) / cols;
  return (
    <g>
      <Txt x={16} y={26} k="k" anchor="start" tone={f.kt}>
        {pick(f.k, nr)}
      </Txt>
      {E.map(([a, b]) => {
        const live = a in on && b in on;
        const fl = f.fl?.find((x) => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a));
        return <Wire key={a + b} d={path(geo(N[a], N[b]))} tone={fl ? fl[2] || "lit" : undefined} arrow={live} opacity={live ? 1 : 0.3} />;
      })}
      {Object.entries(N).map(([id, n]) => {
        const s = on[id];
        return <Box key={id} x={n.x} y={n.y} w={n.w} h={n.h} label={nr ? n.n || n.l : n.l} sub={(nr && n.h < 40 ? undefined : pick(f.sub?.[id], nr)) || undefined} tone={s === 1 ? undefined : s} dim={!(id in on)} />;
      })}
      {f.fl?.map(([a, b, tone], i) => {
        const u = ((((t - 1) * 0.5 + clock * 0.55 + 0.5 + i * 0.17) % 1) + 1) % 1;
        const fwd = E.some((e) => e[0] === a && e[1] === b);
        const p = fwd ? bz(geo(N[a], N[b]), u) : bz(geo(N[b], N[a]), 1 - u);
        return <Token key={a + b} x={p.x} y={p.y} s={9} tone={tone || "lit"} />;
      })}
      {f.figs?.map(([d, l, tone], i) => (
        <g key={d + i} opacity={fade(i, f.figs?.length || 1)}>
          <Txt x={xs[i]} y={254} k="d" tone={tone}>
            {d}
          </Txt>
          <Txt x={xs[i]} y={278} k="s">
            {pick(l, nr)}
          </Txt>
        </g>
      ))}
      {f.chips?.map((c, i) => {
        const x = 24 + (i % cols) * (cw + 8);
        const y = 214 + Math.floor(i / cols) * 34;
        const tone = f.ctn?.[i] || f.ct || "lit";
        return (
          <g key={i} opacity={fade(i, f.chips?.length || 1)}>
            <rect className={`ax-box ${tone}`} x={x} y={y} width={cw} height={26} />
            <Txt x={x + cw / 2} y={y + 18} k="s" tone={tone}>
              {pick(c, nr)}
            </Txt>
          </g>
        );
      })}
      {f.bars?.map(([l, v, m, tone], i) => (
        <g key={i} opacity={fade(i, f.bars?.length || 1)}>
          <Txt x={24} y={232 + i * 28} k="s" anchor="start" tone={tone}>
            {pick(l, nr)}
          </Txt>
          <Meter x={nr ? 330 : 300} y={222 + i * 28} w={nr ? 246 : 276} h={12} value={v * ease(seg(t, 0.1, 0.8))} max={m} tone={tone || "sky"} />
        </g>
      ))}
      {f.note && (
        <Txt x={16} y={f.figs || f.chips || f.bars ? H - 12 : 244} k="s" anchor="start" tone={f.nt} opacity={ease(seg(t, 0.3, 0.8))}>
          {pick(f.note, nr)}
        </Txt>
      )}
    </g>
  );
}

const N: Record<string, Nd> = {
  client: { x: 16, y: 96, w: 88, h: 52, l: "Client" },
  fe: { x: 132, y: 96, w: 108, h: 52, l: "Front end", n: "Front" },
  idx: { x: 272, y: 40, w: 124, h: 48, l: "Index" },
  store: { x: 272, y: 148, w: 124, h: 48, l: "Storage", n: "Store" },
  az1: { x: 432, y: 40, w: 152, h: 44, l: "AZ-1" },
  az2: { x: 432, y: 96, w: 152, h: 44, l: "AZ-2" },
  az3: { x: 432, y: 152, w: 152, h: 44, l: "AZ-3" },
};
const E: [string, string][] = [
  ["client", "fe"],
  ["fe", "idx"],
  ["fe", "store"],
  ["store", "idx"],
  ["store", "az1"],
  ["store", "az2"],
  ["store", "az3"],
];
const ALL = { client: 1, fe: 1, idx: 1, store: 1, az1: 1, az2: 1, az3: 1 } as const;
const SPREAD: [string, string, Tone?][] = [
  ["store", "az1"],
  ["store", "az2"],
  ["store", "az3"],
];

const F: Record<string, Fr[]> = {
  why: [
    { k: "S3 · the scale", on: { store: "lit", az1: 1, az2: 1, az3: 1 }, figs: [["500T+", "objects"], ["11 nines", "durability", "ok"], ["200M+", ["requests/s", "req/s"]]], note: ["hundreds of exabytes, on drives that fail every day", "drives fail every day"] },
    {
      k: "requirements",
      on: ALL,
      chips: [["11 nines durability", "11 nines"], ["strong read-after-write", "read-after-write"], ["first byte 100–200 ms", "100–200 ms"], ["99.99% for Standard", "99.99%"], ["3,500 PUT/s per prefix", "3,500 PUT/s"], ["5,500 GET/s per prefix", "5,500 GET/s"]],
      ctn: ["ok", "lit"],
    },
    { k: "what 11 nines buys", kt: "bad", on: { store: 1, az1: "bad", az2: 1, az3: 1 }, figs: [["10⁻¹¹", ["per object a year", "per object"]], ["~5,000", ["lost a year", "lost/yr"], "bad"], ["1–2%", ["drives fail yearly", "drives/yr"]]], note: ["11 nines is a floor to beat; fast repair beats it", "a floor, not a margin"] },
    { k: "how much disk", on: { store: 1, az1: 1, az2: 1, az3: 1 }, figs: [["~250 EB", "of data"], ["~400 EB", ["with 10+6 coding", "10+6 code"], "ok"], ["~750 EB", ["with 3 copies", "3 copies"], "bad"]], note: ["500 trillion objects × ~500 KB", "500T × ~500 KB"] },
  ],
  arch: [
    { k: "three layers", on: ALL, sub: { fe: ["auth, route", "auth"], idx: ["key → shards", "map"], store: ["10 + 6", "10+6"] }, note: ["metadata and bytes scale separately", "metadata apart from bytes"] },
    { k: "PUT: encode and spread", on: { client: 1, fe: 1, store: "lit", az1: "lit", az2: "lit", az3: "lit" }, sub: { store: ["encode", "encode"], az1: ["6 shards", "6"], az2: ["5 shards", "5"], az3: ["5 shards", "5"] }, fl: [["client", "fe"], ["fe", "store"], ...SPREAD], note: ["16 shards of ~100 KB · at most 6 in any one AZ", "at most 6 per AZ"] },
    { k: "verify, then commit", kt: "ok", on: { client: "ok", fe: 1, idx: "lit", store: "ok" }, sub: { store: ["bracketed", "checked"], idx: ["commit", "commit"], client: ["200 OK", "200 OK"] }, fl: [["store", "idx"], ["fe", "client", "ok"]], note: ["the shards must decode to the original checksum", "shards must decode"], nt: "ok" },
    { k: "GET", on: ALL, sub: { idx: ["where?", "where"], store: ["any 10 of 16", "10 of 16"] }, fl: [["client", "fe"], ["fe", "idx"], ["fe", "store"]], note: ["read any 10 shards and decode", "any 10 shards decode"] },
  ],
  deep: [
    { k: "1 · erasure coding", on: { store: "lit", az1: 1, az2: 1, az3: 1 }, sub: { store: ["Reed-Solomon", "RS"] }, fl: SPREAD, bars: [[["3 full copies: 3x", "3 copies: 3x"], 3, 3, "bad"], [["10 + 6 shards: 1.6x", "10+6: 1.6x"], 1.6, 3, "ok"]], note: ["any 10 of 16 rebuild the object, data or parity alike", "any 10 of 16 rebuild it"] },
    { k: "an AZ loses power", kt: "warn", on: { store: "warn", az1: "bad", az2: "ok", az3: "ok" }, sub: { az1: ["6 shards gone", "down"], az2: ["5 left", "5"], az3: ["5 left", "5"], store: ["repairing", "repair"] }, fl: [["store", "az2", "ok"], ["store", "az3", "ok"]], note: ["10 survive · one more lost drive would leave 9", "10 left · 9 would fail"], nt: "warn" },
    {
      k: "2 · strong consistency",
      kt: "ok",
      on: { client: 1, fe: 1, idx: "lit" },
      sub: { idx: ["witness", "witness"] },
      fl: [["client", "fe"], ["fe", "idx"]],
      chips: [["pre-2020: PUT, then 404", "old: stale 404"], ["metadata synced to a majority", "sync metadata"], ["every read checks the witness", "witness check"], ["same throughput", "no penalty"]],
      ctn: ["bad", undefined, "lit", "ok"],
    },
    { k: "3 · index partitions", on: { fe: 1, idx: "lit" }, sub: { idx: ["by prefix", "prefix"] }, fl: [["fe", "idx"]], chips: [["hash bucket → partition", "bucket hash"], ["keys sorted by prefix", "sorted keys"], ["split past 5,500 GET/s", "auto split"], ["spread over prefixes", "more prefixes"]] },
    { k: "4 · storage classes", on: { store: "lit" }, sub: { store: ["lifecycle", "lifecycle"] }, figs: [["$0.023", ["Standard, GB-month", "Standard"]], ["$0.0125", "Standard-IA"], ["$0.00099", ["Deep Archive", "Deep"], "ok"]], note: ["Glacier Deep Archive is 23x cheaper than Standard", "Deep Archive: 23x cheaper"] },
  ],
  scale: [
    { k: "503: slow down", kt: "warn", on: { client: "warn", fe: "warn", idx: 1 }, sub: { fe: ["503", "503"], client: ["backoff", "backoff"] }, fl: [["client", "fe", "warn"]], chips: [["back off from 100 ms", "backoff 100 ms"], ["double, up to 5 retries", "×2, ≤ 5 tries"], ["part-00 … part-15", "many prefixes"], ["multipart uploads", "multipart"]] },
    { k: "correlated failures", kt: "warn", on: { store: "lit", az1: "warn", az2: 1, az3: 1 }, sub: { az1: ["heat wave", "heat"] }, fl: [["store", "az2"], ["store", "az3"]], chips: [["watch health, migrate early", "migrate early"], ["spare space on every disk", "spare space"], ["parallel repair", "parallel repair"], ["hot object: cache + CDN", "cache hot ones"]] },
    { k: "two PUTs, one key", on: { client: "warn", fe: 1, idx: "lit" }, fl: [["client", "fe", "warn"], ["fe", "idx"]], cols: 3, chips: [["last writer wins", "LWW"], ["versioning", "versions"], ["If-Match writes", "If-Match"]], ctn: ["warn", "ok", "ok"] },
    { k: "stolen keys", kt: "bad", on: { client: "bad", fe: 1, idx: "lit" }, sub: { client: ["DELETEs", "DELETE"] }, fl: [["client", "fe", "bad"]], chips: [["versioning, delete markers", "versioning"], ["MFA Delete", "MFA Delete"], ["Object Lock (compliance)", "Object Lock"], ["copy in another account", "other account"]], ct: "ok", note: ["durability can't stop a valid delete", "durability ≠ protection"], nt: "bad" },
    { k: "the takeaway", kt: "ok", on: { ...ALL, store: "ok", idx: "ok" }, fl: [["fe", "store"], ...SPREAD], chips: [["split metadata from bytes", "metadata ≠ bytes"], ["verify, then acknowledge", "verify first"], ["erasure-code across AZs", "code across AZs"], ["repair faster than failure", "repair fast"]], ct: "ok" },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "S3 stores 500 trillion+ objects at 200 million+ requests a second, on drives that fail every day, designed for 11 nines of durability.", tween: 1400 },
      { caption: "Never lose an object, make every read see the latest write, first byte in 100 to 200 ms, and 3,500 PUTs or 5,500 GETs a second per prefix.", tween: 1400 },
      { caption: "At exactly 11 nines, 500 trillion objects would lose ~5,000 a year. So 11 nines is a floor to beat, and fast repair is what beats it.", tween: 1400 },
      { caption: "~250 EB of data at ~500 KB an object. Erasure coding at 1.6x needs ~400 EB of disk; three full copies would need ~750 EB.", tween: 1400 },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "Three layers: a front end that authenticates and routes, an index that maps every key to its shards, and storage nodes over three AZs.", tween: 1000 },
      { caption: "A PUT is erasure-coded into 10 data and 6 parity shards of ~100 KB, written across three AZs, at most 6 in any one.", tween: 1400, loop: true },
      { caption: "Before 200 OK, bracketing checks the shards decode to the original checksum, then the index commits the key. Only then is it findable.", tween: 1200, loop: true },
      { caption: "A GET asks the index where the shards are, then reads any 10 of the 16 and decodes them.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "Three copies cost 3x. Reed-Solomon 10 + 6 costs 1.6x, and any 10 of the 16 shards rebuild the object, data or parity alike.", tween: 1400, loop: true },
      { caption: "AZ-1 loses power: its 6 shards vanish, but 10 survive in AZ-2 and AZ-3, and the repair service starts rebuilding at once.", tween: 1200, loop: true },
      { caption: "Since 2020 reads are strong: metadata replicates synchronously, and every read checks a witness of the latest write, at the same throughput.", tween: 1400, loop: true },
      { caption: "The index hashes the bucket, then keeps keys sorted by prefix for fast LISTs; a partition busier than 5,500 GETs a second splits itself.", tween: 1400, loop: true },
      { caption: "Lifecycle rules move cooling data down the classes: Standard at $0.023 a GB-month, then Standard-IA, then Deep Archive, 23x cheaper.", tween: 1400 },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "A hot partition answers 503: back off from 100 ms, doubling, up to 5 retries, and spread heavy workloads across many prefixes.", tween: 1200, loop: true },
      { caption: "Correlated failures, like a heat wave: watch drive health, migrate early, and keep spare space so repairs run on thousands of drives.", tween: 1400, loop: true },
      { caption: "Two PUTs to one key: last writer wins by default. Versioning keeps every version, and If-Match conditional writes stop silent overwrites.", tween: 1200, loop: true },
      { caption: "Stolen keys delete everything, validly. Durability can't help; versioning, MFA Delete, Object Lock and a copy in another account can.", tween: 1400, loop: true },
      { caption: "The lesson: split metadata from bytes, erasure-code across AZs, verify before you acknowledge, and repair faster than drives fail.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
