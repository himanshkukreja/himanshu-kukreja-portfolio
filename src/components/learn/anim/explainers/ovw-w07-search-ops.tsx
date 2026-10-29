/**
 * Whole-lesson overview (week 7, day 5 · location search and search at scale). Launch night: four
 * location bugs; a B-tree on (lat, lng) reads a ~600 km latitude strip, ~150× the box; cells,
 * coverings, refine. Grids: geohash (5 bits a character, tdr1w6, the 43 m edge between tdr1xf and
 * tdr384, cell + 8 neighbours), quadtrees and S2 (Hilbert-ordered 64-bit ids), H3 hexagons (one
 * neighbour distance, inexact nesting, res 8: 531 m, 0.737 km²). Radius & kNN: PostGIS GiST zones,
 * "milk" via cell → stores 41 and 57, candidates read for 2 km (geohash 5 ~12,000 vs H3 res 8
 * ~1,560), growing rings with a stopping bound. Moving partners: 75,000 writes/s, 1 ping in 45
 * changes res-8 cell (~1,700/s), overwrite in memory with a TTL, shards by load, the 20:31 hot cell.
 * Operate: three masters, 32 primaries of ~29 GB, ~21 data nodes, reindexing behind an alias.
 */
import { Box, defineExplainer, ease, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone, type Variant } from "../kit";

const W = 600;
const H = 340;
/** a label with an optional shorter form for narrow stages: "both" or ["wide", "narrow"] */
type Two = string | [string, string];
type Nd = { x: number; y: number; w: number; h: number; l: string; n?: string };
/** an edge: from, to, and optional port offsets (y for side-by-side boxes, x for stacked ones) */
type Ed = [string, string, number?, number?];
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

/* the stage grid: four columns, three rows of boxes above the figures */
const CX = [16, 124, 260, 404];
const CW = [88, 116, 124, 180];
const RY = [40, 96, 156];
const RH = [44, 48, 40];
const nd = (c: number, r: number, l: string, n?: string, rows = 1): Nd => ({ x: CX[c], y: RY[r], w: CW[c], h: RY[r + rows - 1] + RH[r + rows - 1] - RY[r], l, n });

/** a soft orthogonal curve from one box to the next, picked by their relative position */
function geo(a: Nd, b: Nd, oa = 0, ob = 0): P[] {
  if (b.x >= a.x + a.w - 2 || b.x + b.w <= a.x + 2) {
    const r = b.x >= a.x + a.w - 2;
    const p0 = { x: r ? a.x + a.w : a.x, y: a.y + a.h / 2 + oa };
    const p3 = { x: r ? b.x : b.x + b.w, y: b.y + b.h / 2 + ob };
    const m = (p0.x + p3.x) / 2;
    return [p0, { x: m, y: p0.y }, { x: m, y: p3.y }, p3];
  }
  const d = b.y > a.y;
  const p0 = { x: a.x + a.w / 2 + oa, y: d ? a.y + a.h : a.y };
  const p3 = { x: b.x + b.w / 2 + ob, y: d ? b.y : b.y + b.h };
  const m = (p0.y + p3.y) / 2;
  return [p0, { x: p0.x, y: m }, { x: p3.x, y: m }, p3];
}
const bz = (g: P[], u: number): P => {
  const v = 1 - u;
  const c = [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u];
  return { x: g.reduce((s, p, i) => s + p.x * c[i], 0), y: g.reduce((s, p, i) => s + p.y * c[i], 0) };
};
const path = (g: P[]) => `M${g[0].x} ${g[0].y}C${g[1].x} ${g[1].y} ${g[2].x} ${g[2].y} ${g[3].x} ${g[3].y}`;
const ends = (e: Ed) => geo(N[e[0]], N[e[1]], e[2], e[3]);

function Scene({ variant, step, t, clock, narrow: nr }: SceneProps) {
  const f = (F[variant] || F[Object.keys(F)[0]])[Math.min(step, (F[variant] || F[Object.keys(F)[0]]).length - 1)];
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
      {E.map((e) => {
        const [a, b] = e;
        const live = a in on && b in on;
        const fl = f.fl?.find((x) => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a));
        return <Wire key={a + b} d={path(ends(e))} tone={fl ? fl[2] || "lit" : undefined} arrow={live} opacity={live ? 1 : 0.3} />;
      })}
      {Object.entries(N).map(([id, n]) => {
        const s = on[id];
        return <Box key={id} x={n.x} y={n.y} w={n.w} h={n.h} label={nr ? n.n || n.l : n.l} sub={(nr ? undefined : pick(f.sub?.[id], nr)) || undefined} tone={s === 1 ? undefined : s} dim={!(id in on)} />;
      })}
      {f.fl?.map(([a, b, tone], i) => {
        const e = E.find((x) => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a));
        if (!e) return null;
        const u = ((((t - 1) * 0.5 + clock * 0.55 + 0.5 + i * 0.17) % 1) + 1) % 1;
        const p = bz(ends(e), e[0] === a ? u : 1 - u);
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
  app: nd(0, 0, "App"),
  api: nd(1, 0, "Search API", "API"),
  zone: nd(2, 0, "Zone index", "Zones"),
  prod: nd(3, 0, "Product index", "Products"),
  places: nd(0, 1, "Places"),
  router: nd(1, 1, "Geo router", "Router"),
  live: nd(2, 1, "Live index", "Live"),
  repl: nd(3, 1, "Read replicas", "Replicas"),
  ptn: nd(0, 2, "Partners", "Riders"),
  gw: nd(1, 2, "Ingest"),
  kafka: nd(2, 2, "Kafka"),
  lake: nd(3, 2, "History"),
};
const E: Ed[] = [
  ["app", "api"],
  ["api", "zone"],
  ["zone", "prod"],
  ["api", "places", 8, 0],
  ["api", "router"],
  ["router", "live"],
  ["live", "repl"],
  ["ptn", "gw"],
  ["gw", "live", -8, 10],
  ["gw", "kafka"],
  ["kafka", "lake"],
];

const F: Record<string, Fr[]> = {
  near: [
    {
      k: ["Saturday 19:58 · Now launches", "launch night"],
      kt: "warn",
      on: { app: "lit", api: 1, places: "warn", prod: "bad", ptn: "warn", router: "bad" },
      sub: { app: "milk" },
      fl: [["app", "api"]],
      chips: [
        ["20:03 · (lat, lng) reads a strip", "20:03 · reads a strip"],
        ["20:09 · pings: p99 120 → 900 ms", "20:09 · p99 900 ms"],
        ["20:14 · 43 m away, not found", "20:14 · 43 m, missed"],
        ["20:31 · one shard at 100% CPU", "20:31 · 100% CPU"],
      ],
      ctn: ["warn", "bad", "warn", "bad"],
      note: ["an illustrative launch; none of these is a text-search bug", "none is a text-search bug"],
    },
    {
      k: ["a B-tree sorts by one key", "a B-tree on (lat, lng)"],
      kt: "bad",
      on: { api: 1, places: "bad" },
      sub: { places: "lat, lng" },
      fl: [["api", "places", "bad"]],
      figs: [
        ["4 km", ["box asked for", "box asked"]],
        ["~600 km", ["latitude strip read", "strip read"], "warn"],
        ["~150×", ["the box's area", "the box"], "bad"],
      ],
      note: ["two indexes: two strips to intersect. Nearby places need nearby keys", "fix: nearby places, nearby keys"],
    },
    {
      k: ["cells, coverings, refine", "cover, then refine"],
      kt: "ok",
      on: { api: "lit", zone: 1, live: 1 },
      cols: 1,
      chips: [
        ["1 · map 2-D to 1-D: nearby cells get nearby ids", "1 · 2-D → 1-D cell ids"],
        ["2 · cover the radius with a few cells or ranges", "2 · cover with cells"],
        ["3 · refine: exact distance, throw away the corners", "3 · refine by distance"],
      ],
      ctn: ["sky", "lit", "ok"],
      note: ["big cells: few lookups, many wasted candidates; cell size is the knob", "cell size is the knob"],
    },
  ],
  grids: [
    {
      k: ["geohash: a prefix is a region", "geohash"],
      on: { zone: "lit", live: "lit" },
      sub: { zone: "geohash", live: "geohash" },
      chips: [
        ["5 bits a character, ÷32 a cell", "5 bits a character"],
        ["tdr1w6 · Koramangala", "tdr1w6 · Koramangala"],
        ["length 6 · 1.2 km × 609 m", "6 · 1.2 km × 609 m"],
        ["length 5 · 4.9 km × 4.9 km", "5 · 4.9 × 4.9 km"],
      ],
      ctn: ["lit", "sky", "sky", "sky"],
      note: ["a shared prefix is a shared cell, so a prefix search is a range scan", "prefix search = range scan"],
    },
    {
      k: ["the edge: 43 metres, no shared prefix", "the edge problem"],
      kt: "warn",
      on: { live: "warn" },
      sub: { live: "9 cells" },
      chips: [
        ["12.9352, 77.6951 → tdr1xf", "77.6951 → tdr1xf"],
        ["12.9352, 77.6955 → tdr384", "77.6955 → tdr384"],
        ["shared prefix: tdr only", "shared: tdr"],
        ["search the cell + 8 neighbours", "cell + 8 neighbours"],
      ],
      ctn: ["sky", "sky", "bad", "ok"],
      note: ["a longer shared prefix means closer, never the reverse; then refine", "then refine by distance"],
    },
    {
      k: ["quadtrees, then S2", "quadtree, S2"],
      on: { places: 1, router: "lit", live: 1 },
      sub: { router: "S2 ranges" },
      chips: [
        ["quadtree: split past N points", "split past N"],
        ["dense city, tiny cells", "dense: tiny cells"],
        ["S2: cube faces, levels 0–30", "S2: levels 0–30"],
        ["64-bit ids in Hilbert order", "Hilbert-ordered ids"],
        ["a cell's children: one id range", "children: one range"],
        ["Uber, 2015: S2 cells as shard key", "Uber: S2 shard key"],
      ],
      ctn: ["sky", "sky", "lit", "lit", "ok", "warn"],
    },
    {
      k: ["H3: hexagons", "H3 hexagons"],
      kt: "ok",
      on: { live: "ok" },
      sub: { live: "H3 res 8" },
      chips: [
        ["6 neighbours, one distance", "6 neighbours, 1 distance"],
        ["rings ≈ circles: 3k(k+1) + 1", "rings ≈ circles"],
        ["16 resolutions, each 1/7 area", "16 resolutions"],
        ["children don't nest exactly", "inexact nesting"],
      ],
      ctn: ["ok", "ok", "sky", "warn"],
      note: ["res 8: 531 m edges, 0.737 km²; Uber measures surge in hexagons", "res 8: 531 m, 0.737 km²"],
    },
  ],
  query: [
    {
      k: ["shapes: PostGIS and GiST", "delivery zones"],
      on: { api: 1, places: "lit", zone: "lit" },
      sub: { places: "GiST", zone: "res-9 cells" },
      fl: [["api", "places"]],
      chips: [
        ["an R-tree of bounding boxes", "R-tree of boxes"],
        ["ST_DWithin: radius, indexed", "ST_DWithin"],
        ["<-> in ORDER BY: k-nearest", "<->: k-nearest"],
        ["ST_Intersects: whose zone?", "whose zone?"],
      ],
      ctn: ["sky", "lit", "lit", "ok"],
      note: ["a river or a flyover turns 800 m on the map into 3 km on the road", "zones are drawn, not circles"],
    },
    {
      k: ['"milk", within reach', "milk within reach"],
      on: { app: "lit", api: "lit", zone: "lit", prod: "lit", router: 1, live: 1 },
      sub: { zone: "stores 41, 57", prod: "23 products", live: "6 and 2 free" },
      fl: [
        ["app", "api"],
        ["api", "zone"],
        ["zone", "prod"],
        ["api", "router"],
        ["router", "live"],
      ],
      chips: [
        ["point → an H3 res-9 cell", "point → res-9 cell"],
        ["cell → stores 41 and 57", "stores 41, 57"],
        ["milk, in stock at 41 or 57", "milk at 41 or 57"],
        ["free partners: 6 and 2", "partners: 6 and 2"],
      ],
      ctn: ["sky", "lit", "lit", "ok"],
      note: ['geo_point gotcha: "lat,lon" as a string, [lon, lat] as an array', '"lat,lon" vs [lon, lat]'],
    },
    {
      k: ["cell size: 2 km in Bengaluru", "pick the cell size"],
      on: { router: 1, live: "lit" },
      fl: [["router", "live"]],
      bars: [
        [["geohash 5 · 9 cells · ~12,000", "geohash 5 · ~12,000"], 12000, 12000, "bad"],
        [["H3 res 8 · 37 cells · ~1,560", "H3 res 8 · ~1,560"], 1560, 12000, "ok"],
        [["really inside 2 km · ~720", "inside · ~720"], 720, 12000, "sky"],
      ],
      note: ["candidates read: the coarse 9-cell search reads 17×, res 8 about 2.2×", "17× vs 2.2× the answer"],
    },
    {
      k: ["k-nearest: grow rings, prove you're done", "k-nearest"],
      kt: "warn",
      on: { router: 1, live: "lit" },
      sub: { live: "ring by ring" },
      fl: [["router", "live"]],
      chips: [
        ["scan the cell, ring 1, ring 2…", "ring by ring"],
        ["ring 1 has 5: not done yet", "5 in ring 1: not done"],
        ["stop: k-th ≤ bound on the rest", "stop: k-th ≤ bound"],
        ["cap it: max_rings, COUNT", "cap: max_rings"],
      ],
      ctn: ["sky", "bad", "ok", "warn"],
      note: ["straight-line distance picks candidates; dispatch re-ranks by road ETA", "then re-rank by road ETA"],
    },
  ],
  moving: [
    {
      k: ["partners are not stores", "two workloads"],
      kt: "bad",
      on: { places: 1, prod: "bad", ptn: "warn", gw: 1 },
      fl: [["ptn", "gw", "warn"]],
      chips: [
        ["stores: a few writes a second", "stores: few writes"],
        ["partners: a write every 4 s", "partners: every 4 s"],
        ["each ping reindexes a document", "a ping = a reindex"],
        ["Bengaluru: 10,000 updates/s", "10,000 updates/s"],
      ],
      ctn: ["ok", "warn", "bad", "bad"],
      note: ["in the product cluster, search p99 went from 120 ms to 900 ms", "p99: 120 → 900 ms"],
    },
    {
      k: ["the write path, in numbers", "the write path"],
      on: { ptn: "lit", gw: "lit", live: "lit" },
      sub: { live: "H3 res 8" },
      fl: [
        ["ptn", "gw"],
        ["gw", "live"],
      ],
      figs: [
        ["75,000", ["position writes/s", "writes/s"], "warn"],
        ["1 in 45", ["pings change cell", "change cell"], "lit"],
        ["~1,700", ["cell moves/s", "moves/s"], "ok"],
      ],
      note: ["300,000 partners every 4 s at 15 km/h: ~17 m a ping, ~0.73 km per cell", "17 m a ping, 0.73 km a cell"],
    },
    {
      k: ["overwrite in place, move rarely", "overwrite in place"],
      kt: "ok",
      on: { ptn: 1, gw: "lit", live: "ok", kafka: "lit", lake: 1 },
      sub: { live: "TTL 30 s", kafka: "the trail", lake: "trips, disputes" },
      fl: [
        ["ptn", "gw"],
        ["gw", "live", "ok"],
        ["gw", "kafka"],
        ["kafka", "lake"],
      ],
      chips: [
        ["every ping: overwrite position", "every ping: overwrite"],
        ["new cell: move between sets", "new cell: move sets"],
        ["no ping for 30 s: not nearby", "30 s TTL"],
        ["the trail: Kafka → history", "trail → Kafka"],
      ],
      ctn: ["lit", "ok", "warn", "sky"],
      note: ["or Redis GEO: COUNT n ANY is cheap; members have no TTL", "or Redis GEO, with ZREM"],
    },
    {
      k: ["shard by load, not by area", "shard by load"],
      on: { api: 1, router: "lit", live: "lit", repl: 1 },
      sub: { router: "by cell" },
      fl: [
        ["api", "router"],
        ["router", "live"],
      ],
      chips: [
        ["by city: simple, uneven", "by city: uneven"],
        ["S2 cell ranges, sized by load", "cell ranges by load"],
        ["Uber Eats: hex shards on H3", "Uber Eats: H3 hexes"],
        ["near an edge: query both shards", "edges: both shards"],
      ],
      ctn: ["warn", "ok", "sky", "lit"],
      note: ["or index boundary documents in both shards, as Uber Eats does", "or index edges in both"],
    },
    {
      k: ["20:31 · the match ends", "20:31 · a hot cell"],
      kt: "bad",
      on: { app: "bad", api: 1, router: "bad", live: "bad", repl: "ok" },
      sub: { live: "100% CPU", repl: "hot shard reads" },
      fl: [
        ["app", "api", "bad"],
        ["api", "router", "bad"],
        ["router", "live", "bad"],
        ["live", "repl", "ok"],
      ],
      chips: [
        ["30,000 people, 2 res-8 cells", "30,000 in 2 cells"],
        ["one shard per city: all slow", "city shard: all slow"],
        ["cache per cell for seconds", "cache per cell"],
        ["cap the work: COUNT 20 ANY", "COUNT 20 ANY"],
        ["read replicas for the hot shard", "read replicas"],
        ["degrade: the cell's average ETA", "degrade: average ETA"],
      ],
      ctn: ["bad", "bad", "ok", "ok", "ok", "warn"],
    },
  ],
  ops: [
    {
      k: ["cluster topology", "topology"],
      on: { api: 1, prod: "lit" },
      sub: { prod: ["masters, coord, data", "roles"] },
      chips: [
        ["3 dedicated masters", "3 masters"],
        ["coordinating: route, merge", "coordinators merge"],
        ["≥ 2 copies, in different zones", "copies across zones"],
        ["heap ≤ 50% of RAM, ~26 GB", "heap ≤ 50%, ~26 GB"],
      ],
      ctn: ["lit", "sky", "ok", "warn"],
      note: ["four master-eligible nodes tolerate no more failures than three", "4 masters ≈ 3"],
    },
    {
      k: ["shard sizing", "shard sizing"],
      on: { prod: "lit" },
      sub: { prod: ["32 primaries", "32 primaries"] },
      figs: [
        ["~930 GB", ["620 GB × 1.5 growth", "with growth"]],
        ["32", ["primaries, ~29 GB", "primaries"], "lit"],
        ["~21", ["data nodes at 50K/s", "data nodes"], "ok"],
      ],
      note: ["10–50 GB a shard; geo-partition local queries (Tinder: CPU ÷ 4)", "10–50 GB a shard"],
    },
    {
      k: ["reindex behind an alias", "alias swap"],
      kt: "ok",
      on: { api: 1, zone: 1, prod: "ok" },
      sub: { prod: ["alias products-now", "alias"] },
      fl: [
        ["api", "zone"],
        ["zone", "prod", "ok"],
      ],
      chips: [
        ["clients use products-now only", "alias only"],
        ["build v2, backfill, dual-write", "v2: backfill"],
        ["verify counts, sample queries", "verify"],
        ["swap in one atomic request", "atomic swap"],
      ],
      ctn: ["sky", "lit", "sky", "ok"],
      note: ["keep v1: rolling back is the same swap the other way", "v1 kept for rollback"],
    },
  ],
};

const V: Variant[] = [
  {
    id: "near",
    label: "Launch night",
    steps: [
      {
        caption:
          "An illustrative Saturday in Bengaluru: \"Now\" launches, and within half an hour location breaks it. A (lat, lng) B-tree reads a strip of the country, partner pings slow product search, a partner 43 m away is missed, and one shard hits 100% CPU.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "A B-tree sorts by one key, so an index on (lat, lng) can use only the latitude range. A 4 km box around the customer reads a strip about 600 km wide, ~150× the box. Two separate indexes give two strips to intersect.",
        tween: 1400,
        loop: true,
      },
      {
        caption: "Every technique does three steps: map 2-D to 1-D so nearby cells get nearby ids, cover the query with a few cells, then refine by exact distance. Big cells mean few lookups and many wasted candidates; cell size is the knob.",
        tween: 1400,
      },
    ],
  },
  {
    id: "grids",
    label: "Grids",
    steps: [
      {
        caption: "Geohash halves the world again and again; every character adds 5 bits and divides the cell by 32. Koramangala is tdr1w6, a length-6 cell of 1.2 km × 609 m, and a shared prefix is a shared cell, so a prefix search is a range scan.",
        tween: 1400,
      },
      {
        caption:
          "The reverse isn't guaranteed: two points 43 m apart in east Bengaluru are tdr1xf and tdr384, sharing only tdr. The fix is to search the point's cell plus its 8 neighbours, at a precision where a cell is at least as wide as the radius, then refine.",
        tween: 1400,
      },
      {
        caption:
          "A quadtree splits a square into four when it holds more than N points, so dense centres get tiny cells; but it's a tree, not a key. S2 numbers a quadtree on a cube's faces with 64-bit ids in Hilbert order, so a cell's descendants are one range. Uber sharded on it in 2015.",
        tween: 1400,
      },
      {
        caption:
          "H3 tiles the Earth with hexagons (and 12 pentagons) at 16 resolutions, each 1/7 the area of the last. All 6 neighbours are equidistant, so rings approximate circles; the cost is that children don't nest exactly. Res 8 has 531 m edges and 0.737 km².",
        tween: 1400,
      },
    ],
  },
  {
    id: "query",
    label: "Radius & kNN",
    steps: [
      {
        caption:
          "Delivery zones are shapes, so they live in PostGIS with a GiST (R-tree) index: ST_DWithin for a radius, <-> in ORDER BY for k-nearest, and ST_Intersects for the real question, which stores' zones contain this customer. A river turns 800 m into 3 km on the road.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "\"Milk\" end to end: the point becomes an H3 resolution-9 cell, the zone index says stores 41 and 57 deliver there, the product index matches milk in stock at 41 or 57 (23 products), and the live index finds 6 and 2 free partners for a delivery-time promise.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Cell size decides how much you read. For free partners within 2 km of a store, about 720 are really inside; geohash 5 plus 8 neighbours reads ~12,000 candidates (17×), while H3 res 8 with k = 3 reads 37 cells and ~1,560 (2.2×).",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "\"The 5 nearest\" has no radius, so you grow rings. Stopping at the first ring with 5 is wrong: part of ring 2 can be closer. Stop only when the k-th result is no farther than a lower bound on anything unscanned, and cap the search.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "moving",
    label: "Moving & hot cells",
    steps: [
      {
        caption:
          "Stores take a few writes a second; partners send a position every 4 s. In Elasticsearch each ping reindexes a whole document, and 10,000 updates a second in Bengaluru pushed product search p99 from 120 ms to 900 ms.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "300,000 partners every 4 seconds is 75,000 position writes a second. At 15 km/h a partner moves ~17 m a ping and ~0.73 km through an H3 res-8 cell, so only about 1 ping in 45 changes cell: ~1,700 cell moves a second.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "So every ping overwrites the position in memory and only a cell change moves the partner between sets. Positions are hints that expire: no ping for 30 s means not nearby. The trail goes to Kafka and history; Redis GEO is the ready-made version.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "The shard key is a cell: by city is simple but uneven, S2 cell ranges can be sized by load (Uber, 2015), and Uber Eats shards on H3 hexagons. A search near a boundary queries both shards, or boundary documents are indexed in both.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "20:31: 30,000 people open the app in two res-8 cells round the stadium, and the one Bengaluru shard slows Whitefield too, 15 km away. Hot cells are hot keys: split by load, cache per cell for seconds, replicate reads, cap the work, degrade.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "ops",
    label: "Operate",
    steps: [
      {
        caption:
          "The cluster itself: three dedicated master-eligible nodes so two still form a majority, coordinating nodes that fan out and merge, data nodes holding at least two copies of each shard in different zones, and a heap of at most 50% of RAM and about 26 GB.",
        tween: 1400,
      },
      {
        caption:
          "Aim for shards of 10–50 GB. The product index is ~620 GB, ~930 GB with growth: 32 primaries of ~29 GB. Peak 50,000 queries a second needs ~21 data nodes; geo-partitioned indices keep local searches on local shards (Tinder's CPU fell 4×).",
        tween: 1400,
      },
      {
        caption:
          "A new geo field or shard count means a reindex: clients only use the products-now alias, v2 is built and backfilled while the pipeline writes to both, verified, then swapped in one atomic request. Rolling back is the same swap the other way.",
        tween: 1400,
        loop: true,
      },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
