/**
 * The whole side quest, Google Search: the mission and scale (~14B searches a day, ~400B
 * documents), the design targets and estimate (50B → 500B pages, 100K QPS, < 500 ms; 25T
 * postings, ~180 TB index; ~10,000 candidates in ~100 ms), the three pipelines (crawl, index,
 * serve: scatter to every shard, gather, rank), the deep dives (inverted index and sharding,
 * PageRank, tail latency, stage budgets) and scale and edge cases (10x, breaking news, hot
 * queries, spam and crawl traps).
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
  front: { x: 16, y: 48, w: 100, h: 44, l: "Frontier", n: "URLs" },
  crawl: { x: 132, y: 48, w: 100, h: 44, l: "Crawlers", n: "Crawl" },
  idx: { x: 248, y: 48, w: 104, h: 44, l: "Indexer", n: "Index" },
  user: { x: 16, y: 148, w: 100, h: 44, l: "User" },
  qp: { x: 132, y: 148, w: 100, h: 44, l: "Query", n: "Query" },
  root: { x: 248, y: 148, w: 104, h: 44, l: "Root", n: "Root" },
  s1: { x: 392, y: 48, w: 92, h: 40, l: "Shard 1", n: "Sh 1" },
  s2: { x: 392, y: 100, w: 92, h: 40, l: "Shard 2", n: "Sh 2" },
  s3: { x: 392, y: 152, w: 92, h: 40, l: "Shard N", n: "Sh N" },
  rank: { x: 508, y: 100, w: 76, h: 40, l: "Rank" },
};
const E: [string, string][] = [
  ["front", "crawl"],
  ["crawl", "idx"],
  ["idx", "s1"],
  ["user", "qp"],
  ["qp", "root"],
  ["root", "s1"],
  ["root", "s2"],
  ["root", "s3"],
  ["s1", "rank"],
  ["s2", "rank"],
  ["s3", "rank"],
];
const BUILD = { front: 1, crawl: 1, idx: 1 } as const;
const SERVE = { user: 1, qp: 1, root: 1, s1: 1, s2: 1, s3: 1, rank: 1 } as const;
const SCATTER: [string, string, Tone?][] = [
  ["root", "s1"],
  ["root", "s2"],
  ["root", "s3"],
];
const GATHER: [string, string, Tone?][] = [
  ["s1", "rank", "ok"],
  ["s2", "rank", "ok"],
  ["s3", "rank", "ok"],
];

const F: Record<string, Fr[]> = {
  why: [
    { k: "Google Search · the scale", on: { user: "lit", s1: 1, s2: 1, s3: 1 }, figs: [["~14B", "searches a day"], ["~160K", ["searches/s average", "per second"], "lit"], ["~400B", ["documents (2020)", "documents"]]], note: ["answered in a few hundred milliseconds", "in a few hundred ms"] },
    {
      k: "design targets",
      on: { ...BUILD, ...SERVE },
      chips: [["50B → 500B pages", "50B → 500B"], ["100,000 QPS at peak", "100K QPS"], ["< 500 ms p99", "< 500 ms"], ["breaking news < 15 min", "news < 15 min"], ["most content < 24 h", "most < 24 h"], ["99.99% uptime", "99.99%"]],
      ctn: [undefined, "lit", "lit", "warn"],
    },
    { k: "will the index fit?", kt: "warn", on: { idx: 1, s1: "warn", s2: "warn", s3: "warn" }, figs: [["25T", "postings"], ["300 TB", "raw index"], ["~180 TB", ["compressed, 3 copies", "3 copies"], "warn"]], note: ["50B pages × ~500 terms × 12 bytes · raw pages ~2.5 PB", "50B pages × ~500 terms"] },
    { k: "the scoring budget", on: SERVE, fl: SCATTER, figs: [["~10,000", ["candidates a query", "candidates"]], ["~10 μs", ["to score each", "each"]], ["~100 ms", "of scoring", "lit"]], note: ["retrieval must cap what reaches the scorer", "cap the candidates"] },
  ],
  arch: [
    { k: "1 · crawl", on: { front: 1, crawl: "lit", idx: 1 }, sub: { front: ["priority", "prio"], crawl: ["1/s a domain", "polite"] }, fl: [["front", "crawl"], ["crawl", "idx"], ["crawl", "front", "sky"]], note: ["new links feed back into the frontier · robots.txt respected", "new links go back in"] },
    { k: "2 · index", on: { idx: "lit", s1: 1, s2: 1, s3: 1 }, sub: { idx: ["postings", "terms"] }, fl: [["idx", "s1"]], note: ["term → postings list · PageRank from incoming links", "term → postings · PageRank"] },
    { k: "3 · serve: scatter", on: SERVE, sub: { qp: ["piza→pizza", "spell"], root: ["fan out", "fan out"] }, fl: [["user", "qp"], ["qp", "root"], ...SCATTER], note: ["every shard is asked in parallel", "every shard, in parallel"] },
    { k: "gather and rank", kt: "ok", on: { ...SERVE, rank: "ok" }, sub: { rank: ["top 10", "top 10"] }, fl: GATHER, note: ["~10,000 candidates merged · ~400 ms of a 500 ms target", "~400 ms of 500"], nt: "ok" },
    { k: "only serving is on the clock", on: { front: "warn", crawl: "warn", idx: "warn", ...SERVE, root: "ok" }, sub: { crawl: ["hours late", "late"] }, fl: [["qp", "root"], ...SCATTER], note: ["a slow crawl makes results staler, never slower", "staler, never slower"] },
  ],
  deep: [
    { k: "1 · inverted index", on: { root: 1, s1: "lit", s2: "lit", s3: "lit" }, sub: { s1: ["docs 0–1M", "0–1M"], s2: ["docs 1–2M", "1–2M"] }, fl: SCATTER, chips: [["“quick” → Doc1, Doc3", "quick → 1, 3"], ["“fox” → Doc1, Doc3", "fox → 1, 3"], ["intersect, rarest first", "intersect"], ["shard by document", "by document"]], ctn: [undefined, undefined, undefined, "ok"] },
    { k: "2 · PageRank", on: { crawl: 1, idx: "lit" }, sub: { idx: ["link votes", "links"] }, figs: [["0.85", "follow a link"], ["0.15", "random jump"], ["÷ links", ["split across out-links", "split"], "lit"]], note: ["a link from a selective page counts for more", "selective links count more"] },
    { k: "3 · the slowest shard", kt: "bad", on: { root: 1, s1: "ok", s2: "ok", s3: "bad", rank: 1 }, sub: { s3: ["slow", "slow"] }, fl: [["root", "s3", "bad"], ["s1", "rank", "ok"], ["s2", "rank", "ok"]], figs: [["1,000", "shards"], ["99%", "each fast"], ["0.004%", "all fast", "bad"]], note: ["deadlines · partial results · hedge to a replica", "deadline + hedge"] },
    {
      k: "4 · stage budgets",
      on: SERVE,
      fl: [["qp", "root"], ...SCATTER],
      cols: 3,
      chips: [["understand 20 ms", "parse 20"], ["retrieve 100 ms", "fetch 100"], ["score 200 ms", "score 200"], ["snippets 50 ms", "snippet 50"], ["respond 30 ms", "reply 30"]],
      ctn: [undefined, "lit", "lit"],
      ct: "mute",
      note: ["BM25 relevance + PageRank + freshness + location + clicks", "BM25 + PageRank + more"],
    },
  ],
  scale: [
    { k: "10x", on: { ...BUILD, ...SERVE }, sub: { s1: ["+ replicas", "+rep"], s2: ["+ replicas", "+rep"], s3: ["+ replicas", "+rep"], root: ["result cache", "cache"] }, chips: [["queries: more replicas", "more replicas"], ["result cache ~30% hits", "cache ~30%"], ["docs: 10x more shards", "10x shards"], ["tiered hot/warm/cold", "tiered storage"]] },
    { k: "breaking news", kt: "warn", on: { ...BUILD, ...SERVE, s1: "warn" }, sub: { s1: ["fresh tier", "fresh"], crawl: ["news first", "news"] }, fl: [["front", "crawl"], ["crawl", "idx"], ["idx", "s1", "warn"], ["s1", "rank"]], note: ["in-memory tier takes writes in seconds, merged later", "searchable in minutes"], nt: "warn" },
    { k: "one query explodes", kt: "warn", on: { user: "warn", qp: 1, root: "ok", s1: 1, s2: 1, s3: 1 }, sub: { root: ["TTL cache", "cache"] }, fl: [["user", "qp", "warn"], ["qp", "root", "warn"]], note: ["repeats share one answer and never fan out", "repeats never fan out"], nt: "ok" },
    { k: "keep the junk out", on: { ...BUILD, idx: "lit" }, sub: { crawl: ["depth limit", "limits"] }, chips: [["link-farm detection", "link farms"], ["content fingerprints", "fingerprints"], ["ML spam classifiers", "ML spam"], ["crawl-trap limits", "trap limits"]], ct: "warn" },
    { k: "the takeaway", kt: "ok", on: { ...BUILD, ...SERVE, root: "ok", rank: "ok" }, fl: [["crawl", "idx"], ...SCATTER, ...GATHER], chips: [["async pipelines build the index", "async build"], ["scatter, gather, on a budget", "scatter-gather"]], ctn: ["sky", "ok"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "Google answers ~14 billion searches a day, ~160,000 a second, against ~400 billion documents, in a few hundred milliseconds.", tween: 1400 },
      { caption: "The design target: 50 billion pages growing to 500 billion, 100,000 queries a second, under 500 ms at p99, news in under 15 minutes.", tween: 1400 },
      { caption: "50 billion pages × ~500 terms is 25 trillion postings: 300 TB raw, ~60 TB compressed, ~180 TB replicated. Far too big for one machine.", tween: 1400 },
      { caption: "Each query scores ~10,000 candidates at ~10 microseconds each, about 100 ms, so retrieval must cap what reaches the scorer.", tween: 1400, loop: true },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "Crawling: a URL frontier ordered by importance and freshness feeds crawler workers, politely, at most 1 request a second per domain.", tween: 1200, loop: true },
      { caption: "Indexing: pages are tokenized into an inverted index, each term pointing to its postings, and PageRank scores pages by their incoming links.", tween: 1200, loop: true },
      { caption: "Serving: the query is parsed, spell-checked and expanded, then sent to every index shard in parallel.", tween: 1200, loop: true },
      { caption: "Each shard returns its local best; ~10,000 candidates are merged, ranked and given snippets: ~400 ms against a 500 ms target.", tween: 1200, loop: true },
      { caption: "Only serving is on the user's clock. If crawling falls hours behind, searches stay just as fast; results are only less fresh.", tween: 1200, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "To find “quick fox”, intersect the two posting lists, rarest first. Shards split by document: each holds every term for its slice of pages.", tween: 1400, loop: true },
      { caption: "PageRank is a random surfer: follow a link with probability 0.85, jump anywhere with 0.15. A page's rank is split across its out-links.", tween: 1400 },
      { caption: "With 1,000 shards each fast 99% of the time, only 0.004% of queries avoid a slow one. Use deadlines, partial results and hedged requests.", tween: 1400, loop: true },
      { caption: "The 500 ms is split into budgets: 20 to understand, 100 to retrieve, 200 to score with BM25 and PageRank, 50 for snippets, 30 to respond.", tween: 1400, loop: true },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "To 100,000 QPS, add replicas, since every query hits every shard, plus a result cache (~30% hits). To 500 billion docs, add shards.", tween: 1400 },
      { caption: "Breaking news in 15 minutes: priority-crawl trusted sources into a small in-memory fresh tier, queried alongside the main index.", tween: 1400, loop: true },
      { caption: "When one query explodes, a short-TTL result cache answers the repeats, so most of the spike never fans out to the shards.", tween: 1200, loop: true },
      { caption: "Keep quality: detect link farms and duplicate content, classify spam, and cap crawl depth so infinite URL traps can't eat the crawlers.", tween: 1400 },
      { caption: "The shape of search: async pipelines build the index, and serving scatters to every shard and gathers inside strict stage budgets.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
