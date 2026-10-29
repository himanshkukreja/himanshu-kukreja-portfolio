/**
 * Whole-lesson overview (week 11, day 2 · embeddings and vector search). Two misses (Hinglish vs
 * keywords, RTN-4471 vs vectors, a Hindi filter returning 3); embeddings as a bi-encoder; exact
 * search cost (~35 ms over 171K chunks, ~0.6 s over 3M tickets). HNSW layers (~12,500 / ~200,000 /
 * 3.2M) and costs, IVF (65,536 lists, nprobe 64, ~0.1%), PQ (64 B, 72 B with IVF) with rescoring.
 * Sizing: ~3.2M vectors, ~13.5 GB today; the 100M growth case at 422 / 117 / 27 / 7.2 GB; hash
 * shards. recall@k, the post-filter Hindi example (4 instead of 10), filter strategies, RRF (B, A,
 * C), quiet failures and versioned model migrations.
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
  cust: nd(0, 0, "Customer", "Cust"),
  assist: nd(1, 0, "Assist"),
  ret: nd(2, 0, "Retrieval", "Retrieve"),
  emb: nd(3, 0, "Embedding model", "Embedder"),
  corp: nd(1, 1, "Corpus"),
  bm25: nd(2, 1, "BM25 index", "BM25"),
  vec: nd(3, 1, "Vector index", "Vectors"),
  rr: nd(1, 2, "Rerank"),
  fuse: nd(2, 2, "RRF fusion", "RRF"),
  ssd: nd(3, 2, "SSD floats", "SSD"),
};
const E: Ed[] = [
  ["cust", "assist"],
  ["assist", "ret"],
  ["ret", "emb"],
  ["emb", "vec"],
  ["ret", "bm25"],
  ["corp", "bm25"],
  ["bm25", "fuse"],
  ["vec", "fuse"],
  ["vec", "ssd"],
  ["fuse", "rr"],
];

const F: Record<string, Fr[]> = {
  miss: [
    {
      k: ["a week live: search keeps missing", "search keeps missing"],
      kt: "warn",
      on: { cust: "lit", assist: 1, ret: 1, bm25: "bad", vec: "warn" },
      sub: { bm25: "no \"toota\"", vec: "RTN-4471: 40th" },
      fl: [
        ["cust", "assist"],
        ["assist", "ret"],
      ],
      chips: [
        ["10:02 · Hinglish: keywords miss", "10:02 · Hinglish missed"],
        ["10:05 · vector search finds it", "10:05 · vectors find it"],
        ["11:40 · RTN-4471 ranks 40th", "11:40 · ranks 40th"],
        ["14:15 · Hindi filter: 3, or 0", "14:15 · 3 results, or 0"],
      ],
      ctn: ["bad", "ok", "bad", "bad"],
      note: ["keywords miss meaning, vectors miss exact tokens, filters drop results", "meaning, tokens, filters"],
    },
    {
      k: ["embeddings: meaning as vectors", "embeddings"],
      on: { assist: 1, ret: "lit", emb: "lit", vec: "lit", corp: 1 },
      sub: { emb: "voyage-4 · 1,024 dims", vec: "cosine" },
      fl: [
        ["ret", "emb"],
        ["emb", "vec"],
      ],
      chips: [
        ["close vectors, close meaning", "close = similar"],
        ["keyword: exact on IDs, codes", "keyword: exact IDs"],
        ["vector: RTN-4471 ≈ RTN-4472", "RTN-4471 ≈ RTN-4472"],
        ["docs embedded once, ahead", "docs: embedded once"],
        ["query: one call + a lookup", "query: one call"],
        ["same metric at index and query", "same metric both ends"],
      ],
      ctn: ["ok", "sky", "warn", "lit", "lit", "sky"],
    },
    {
      k: ["can you just scan?", "exact search"],
      kt: "warn",
      on: { ret: "lit", vec: "warn" },
      sub: { vec: "every vector, 4 KB" },
      fl: [["ret", "emb"]],
      figs: [
        ["~35 ms", ["171K doc chunks, 0.7 GB", "171K chunks"], "ok"],
        ["~0.6 s", ["3M tickets, 12 GB", "3M tickets"], "bad"],
        ["~180", ["GB/s needed at 15/s", "GB/s at 15/s"], "bad"],
      ],
      note: ["exact search is a memory-bandwidth problem, and still the ground truth", "a bandwidth problem"],
    },
  ],
  ann: [
    {
      k: ["HNSW: descend the layers", "HNSW layers"],
      on: { ret: 1, vec: "lit" },
      sub: { vec: "M = 16 · ef = 40" },
      fl: [["emb", "vec"]],
      bars: [
        [["layer 2 · 1 in 256 · ~12,500", "layer 2 · ~12,500"], 12500, 3200000, "lit"],
        [["layer 1 · 1 in 16 · ~200,000", "layer 1 · ~200,000"], 200000, 3200000, "lit"],
        [["layer 0 · all 3.2M, list ef", "layer 0 · all 3.2M"], 3200000, 3200000, "sky"],
      ],
      note: ["long jumps on top, fine search at the bottom; ef is the recall dial", "ef: the recall dial"],
    },
    {
      k: ["what HNSW costs", "HNSW's costs"],
      kt: "warn",
      on: { vec: "warn" },
      sub: { vec: "4,224 B a vector" },
      chips: [
        ["4,096 B vector + 128 B links", "4,096 + 128 B"],
        ["all of it in RAM", "all in RAM"],
        ["build: slow, memory hungry", "slow build"],
        ["inserts: incremental", "inserts: incremental"],
        ["deletes: tombstones, rebuild", "deletes: rebuild"],
        ["pgvector ef_search: 40", "ef_search: 40"],
      ],
      ctn: ["sky", "warn", "warn", "ok", "bad", "sky"],
    },
    {
      k: ["IVF: clusters you can skip", "IVF clusters"],
      on: { vec: "lit" },
      sub: { vec: "65,536 lists" },
      figs: [
        ["65,536", ["lists (centroids)", "lists"], "lit"],
        ["64", ["probed per query", "probed"], "sky"],
        ["~0.1%", ["of vectors scanned", "scanned"], "ok"],
      ],
      note: ["cheap appends (Airbnb chose IVF); centroids fixed at training drift", "fixed centroids drift"],
    },
    {
      k: ["product quantisation + rescoring", "PQ + rescoring"],
      kt: "ok",
      on: { ret: 1, vec: "ok", ssd: "lit", fuse: 1 },
      sub: { vec: "IVF-PQ · 72 B", ssd: "top 200 rescored" },
      fl: [
        ["vec", "ssd"],
        ["vec", "fuse", "ok"],
      ],
      chips: [
        ["64 sub-vectors × 256 centroids", "64 × 256 centroids"],
        ["4,096 B → 64 B: 64× smaller", "4,096 → 64 B"],
        ["ADC: 64 table lookups a vector", "64 lookups each"],
        ["IVF-PQ: 64 B code + 8 B id", "IVF-PQ: 72 B"],
        ["top 200, floats from SSD", "top 200 from SSD"],
        ["exact rescore, return top 10", "rescore → top 10"],
      ],
      ctn: ["lit", "ok", "sky", "ok", "lit", "ok"],
    },
  ],
  size: [
    {
      k: ["MegaMart today", "today"],
      kt: "ok",
      on: { assist: 1, ret: "lit", vec: "ok", emb: 1 },
      sub: { vec: "HNSW, float32" },
      fl: [
        ["assist", "ret"],
        ["ret", "emb"],
        ["emb", "vec"],
      ],
      figs: [
        ["3.2M", ["vectors, 1,024 dims", "vectors"], "lit"],
        ["13.5 GB", ["of RAM, with links", "RAM"], "ok"],
        ["15/s", ["retrievals at peak", "at peak"], "sky"],
      ],
      note: ["171,000 doc chunks + 3M ticket summaries: one node plus a replica", "one node + a replica"],
    },
    {
      k: ["growth case: 100M vectors", "100M vectors"],
      kt: "warn",
      on: { vec: "warn", ssd: "lit" },
      sub: { vec: "100M, 4 years", ssd: "rescore ~12 MB/s" },
      bars: [
        [["A · HNSW float32 · 422 GB", "A · float32 · 422 GB"], 422, 422, "bad"],
        [["B · HNSW int8 · 117 GB", "B · int8 · 117 GB"], 117, 422, "warn"],
        [["C · 1-bit BBQ · 27 GB", "C · BBQ · 27 GB"], 27, 422, "sky"],
        [["D · IVF-PQ · 7.2 GB", "D · IVF-PQ · 7.2 GB"], 7.2, 422, "ok"],
      ],
    },
    {
      k: ["shard for memory, replicate for load", "shard for memory"],
      on: { ret: "lit", emb: 1, vec: "lit" },
      sub: { vec: "4 shards × 25M" },
      fl: [
        ["ret", "emb"],
        ["emb", "vec"],
      ],
      chips: [
        ["hash by id: 4 shards × 25M", "hash: 4 × 25M"],
        ["every query hits every shard", "query all shards"],
        ["merge, keep the global top 10", "merge → top 10"],
        ["slowest shard sets latency", "slowest shard wins"],
        ["by category: electronics 45%", "category: 45% skew"],
        ["category is a filter, not a key", "category = filter"],
      ],
      ctn: ["lit", "sky", "ok", "warn", "bad", "ok"],
    },
  ],
  filter: [
    {
      k: ["recall@k: measure what you miss", "recall@k"],
      on: { ret: "lit", vec: "lit" },
      sub: { vec: "vs exact top 10" },
      figs: [
        ["0.95", ["recall@10: 9.5 of 10", "9.5 of 10"], "ok"],
        ["0.96", ["an average…", "average"], "ok"],
        ["0.80", ["…hiding Hindi", "Hindi"], "bad"],
      ],
      note: ["sweep ef on real, filtered queries; re-run after every change", "real, filtered queries"],
    },
    {
      k: ["the Hindi filter: 4 instead of 10", "4 instead of 10"],
      kt: "bad",
      on: { ret: 1, vec: "bad" },
      sub: { vec: "filter after the scan" },
      fl: [["emb", "vec", "bad"]],
      figs: [
        ["40", ["ef_search candidates", "candidates"], "sky"],
        ["10%", ["of tickets are Hindi", "are Hindi"], "warn"],
        ["~4", ["rows back, not 10", "back, not 10"], "bad"],
      ],
      note: ["fix: iterative scan, higher ef_search, partial index or partition", "iterative scan, partial index"],
    },
    {
      k: ["where the filter runs", "where filters run"],
      on: { ret: "lit", vec: "lit", bm25: 1 },
      cols: 1,
      chips: [
        ["post-filter: drop after the ANN scan · fewer than k, maybe 0", "post: fewer than k, maybe 0"],
        ["pre-filter: matching ids first · exact for a few thousand", "pre: exact if selective"],
        ["in-filter: count only passing nodes during the walk", "in: filter during the walk"],
      ],
      ctn: ["bad", "ok", "ok"],
      note: ["Instacart's stock pre-filter cut zero-result searches by 6%", "Instacart: −6% zero results"],
    },
    {
      k: ["hybrid: fuse ranks with RRF", "hybrid + RRF"],
      kt: "ok",
      on: { ret: "lit", emb: 1, vec: "lit", bm25: "lit", fuse: "ok", rr: 1 },
      sub: { bm25: "RTN-4471: 1st", fuse: "k = 60", rr: "150 for Day 3" },
      fl: [
        ["ret", "bm25"],
        ["ret", "emb"],
        ["emb", "vec"],
        ["bm25", "fuse"],
        ["vec", "fuse"],
        ["fuse", "rr", "ok"],
      ],
      bars: [
        [["B · 3rd + 3rd · 0.0317", "B · 0.0317"], 317, 317, "ok"],
        [["A · 1st + 10th · 0.0307", "A · 0.0307"], 307, 317, "lit"],
        [["C · vector 1st only · 0.0164", "C · 0.0164"], 164, 317, "warn"],
      ],
      note: ["BM25 and cosine aren't on one scale: add 1 ÷ (60 + rank), pass 150 on", "1 ÷ (60 + rank) · pass 150"],
    },
  ],
  quiet: [
    {
      k: ["the index lies quietly", "fails quietly"],
      kt: "warn",
      on: { ret: 1, vec: "warn" },
      chips: [
        ["short results: 3 instead of 10", "3 instead of 10"],
        ["no good match: results anyway", "no match, results"],
        ["outgrew RAM: reads hit disk", "reads hit disk"],
        ["deleted rows linger: vacuum", "dead tuples"],
        ["indexing at peak: kNN spikes", "indexing spikes kNN"],
        ["an erased ticket still shapes", "erased, still there"],
      ],
      ctn: ["bad", "warn", "bad", "warn", "warn", "bad"],
      note: ["every query still returns k results: alert on counts, not errors", "alert on result counts"],
    },
    {
      k: ["the half-finished upgrade", "v2 query, v1 index"],
      kt: "bad",
      on: { ret: 1, emb: "bad", vec: "bad" },
      sub: { emb: "now v2", vec: "still v1, 3.2M" },
      fl: [
        ["ret", "emb", "bad"],
        ["emb", "vec", "bad"],
      ],
      figs: [
        ["v2", ["query vectors", "queries"], "bad"],
        ["v1", ["3.2M stored vectors", "stored"], "warn"],
        ["0", ["errors: just noise", "errors"], "bad"],
      ],
      note: ["both 1,024 dims, so nothing fails: the spaces just don't line up", "same dims, no error, noise"],
    },
    {
      k: ["migrate it like a schema", "model migration"],
      kt: "ok",
      on: { ret: "lit", emb: "lit", vec: "ok" },
      sub: { vec: "alias: v1 → v2", emb: "model_id on each" },
      fl: [
        ["ret", "emb"],
        ["emb", "vec", "ok"],
      ],
      chips: [
        ["version every vector: model_id", "model_id per vector"],
        ["build v2 beside v1: ~27 GB", "v2 beside v1: ~27 GB"],
        ["evaluate recall and relevance", "evaluate"],
        ["flip the alias, keep v1", "flip; keep v1"],
      ],
      ctn: ["sky", "lit", "sky", "ok"],
      note: ["only one compatible family (Voyage's 4 series) skips the rebuild", "voyage-4 family: compatible"],
    },
  ],
};

const V: Variant[] = [
  {
    id: "miss",
    label: "Two misses",
    steps: [
      {
        caption:
          "An illustrative first week: Kavya's Hinglish \"paisa wapas\" matches no keyword, vector search then finds her article, Rohit's return code RTN-4471 ranks 40th by meaning, and a Hindi filter turns 10 results into 3, sometimes 0. Each is a retrieval decision, not a model bug.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "An embedding model turns text into a fixed-length vector, so \"parcel arrived broken\" lands near \"item damaged in delivery\". Assist uses voyage-4 at 1,024 dimensions. It's a bi-encoder: documents are embedded once, ahead of time, and a query costs one embedding call plus a lookup.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Exact search compares the query with every vector. At an assumed 20 GB/s of memory bandwidth, 171,000 document chunks (0.7 GB) take ~35 ms, but 3M ticket summaries (12 GB) take ~0.6 s, and 15 queries a second would need ~180 GB/s. It stays the ground truth for recall.",
        tween: 1400,
      },
    ],
  },
  {
    id: "ann",
    label: "ANN indexes",
    steps: [
      {
        caption:
          "HNSW links each vector to near neighbours and stacks sparser copies on top: with M = 16, layer 1 keeps ~200,000 of the 3.2M vectors and layer 2 ~12,500. A search hops greedily down the layers, then keeps a list of size ef in layer 0; ef is the recall-versus-latency dial.",
        tween: 1400,
      },
      {
        caption:
          "FAISS puts HNSW at the vector plus M × 2 × 4 bytes of links: 4,096 + 128 bytes for 1,024 dims at M = 16, all in RAM. Builds are slow and memory hungry, inserts are incremental, and deletes leave tombstones until a vacuum or rebuild.",
        tween: 1400,
      },
      {
        caption:
          "IVF runs k-means to find centroids and files each vector under its nearest. With 65,536 lists and nprobe = 64 a query scans ~0.1% of the vectors. Appends are cheap (Airbnb chose IVF for its update rate), but centroids are fixed at training, so recall drifts as the data does.",
        tween: 1400,
      },
      {
        caption:
          "Product quantisation splits each vector into 64 sub-vectors and replaces each with one of 256 learned centroids: 64 bytes instead of 4,096. With IVF it's 72 bytes a vector; distances are approximate, so the top 200 are rescored with full floats from SSD before returning the top 10.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "size",
    label: "Size it",
    steps: [
      {
        caption:
          "Today's corpus is 171,000 document chunks plus 3M ticket summaries, ~3.2M vectors. At 4,224 bytes each with HNSW links that's ~13.5 GB of RAM: full-precision HNSW on one node plus a replica, serving ~15 retrievals a second at the peak. PQ would only cost recall.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Keep every conversation for four years and it's ~100M vectors. Full-precision HNSW needs ~422 GB of RAM per replica, int8 ~117 GB, 1-bit BBQ ~27 GB and IVF-PQ ~7.2 GB. At 15 queries a second it's a memory problem, not a throughput one; rescoring 200 candidates costs ~12 MB/s from SSD.",
        tween: 1400,
      },
      {
        caption:
          "Past one node's RAM, hash-shard by id: 4 shards of 25M, every query scatters to all of them, and the slowest sets the latency; replicas add throughput. Sharding by category gives electronics 45% of the tickets and still fans out, so category is a filter in the search, not the shard key.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "filter",
    label: "Filters & hybrid",
    steps: [
      {
        caption:
          "An ANN index can't tell you what it missed: recall@k is the overlap with exact search's top k, so 0.95 at k = 10 means 9.5 of the true 10 came back. Measure on real queries with their filters, sliced by language: an average of 0.96 can hide Hindi at 0.80.",
        tween: 1400,
      },
      {
        caption:
          "In pgvector, filtering on an approximate index happens after the scan: HNSW returns its ef_search = 40 candidates, 10% are Hindi, so ~4 rows come back instead of 10, with no error. Turn on iterative scans, raise ef_search, or use a partial index or partition per language.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "A post-filter drops rows after the ANN scan and can return fewer than k, even zero. A pre-filter finds matching ids first and suits selective filters, like one customer's few thousand tickets. An in-filter walk counts only passing nodes. Instacart's stock pre-filter cut zero-result searches 6%.",
        tween: 1400,
      },
      {
        caption:
          "BM25 finds RTN-4471, vectors find \"paisa wapas\", and their scores aren't on one scale, so reciprocal rank fusion adds 1 ÷ (60 + rank) per list. B (3rd and 3rd) beats A (1st and 10th), and C, found only by vectors, scores about half, so 150 candidates go on to Day 3's reranker.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "quiet",
    label: "Quiet failures",
    steps: [
      {
        caption:
          "Vector search fails without errors. Filtered queries come back short, weak matches are returned anyway, an index that outgrows RAM reads from disk, deleted rows and heavy indexing slow it, and an erased ticket's vector keeps shaping answers unless it's deleted in the same workflow.",
        tween: 1400,
      },
      {
        caption:
          "A deploy embeds queries with a new model v2 while the 3.2M stored vectors are still v1. Both are 1,024 dims, so nothing errors, but the two spaces don't line up: every query returns 10 results of noise. Store the model version with every vector and refuse a mismatch.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Treat a model change like a schema migration: a model_id on every vector, a v2 index built beside v1 (~27 GB for the overlap today), recall and relevance evaluated, then the alias flipped with v1 kept for rollback. Only a compatible family, like Voyage's 4 series, skips the rebuild.",
        tween: 1400,
        loop: true,
      },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
