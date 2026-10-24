/**
 * The whole side quest, Twitter/X: the mission and scale (~500M posts a day, 300K timeline reads
 * a second, < 5 s delivery), the fan-out math (4.2M timeline writes a second; one 100M-follower
 * post ≈ 17 minutes; a ~4 TB ID-only cache), the hybrid architecture (store first, push to most
 * timelines with LPUSH/LTRIM 800, ZADD for celebrities, merge and MGET on read), the deep dives
 * (push vs pull, the two-way social graph, trending, hot keys) and scale and edge cases (sharding,
 * the Super Bowl, returning users, deletes).
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
  author: { x: 16, y: 48, w: 92, h: 44, l: "Author" },
  reader: { x: 16, y: 152, w: 92, h: 44, l: "Reader" },
  tweet: { x: 140, y: 48, w: 112, h: 44, l: "Tweet svc", n: "Tweet" },
  tl: { x: 140, y: 152, w: 112, h: 44, l: "Timeline", n: "Read" },
  fan: { x: 284, y: 48, w: 120, h: 44, l: "Fan-out" },
  store: { x: 284, y: 100, w: 120, h: 44, l: "Tweet store", n: "Store" },
  graph: { x: 436, y: 48, w: 148, h: 44, l: "Social graph", n: "Graph" },
  cache: { x: 436, y: 100, w: 148, h: 44, l: "Timeline cache", n: "Cache" },
  celeb: { x: 436, y: 152, w: 148, h: 44, l: "Celeb tweets", n: "Celebs" },
};
const E: [string, string][] = [
  ["author", "tweet"],
  ["tweet", "fan"],
  ["tweet", "store"],
  ["fan", "graph"],
  ["fan", "cache"],
  ["fan", "celeb"],
  ["reader", "tl"],
  ["tl", "store"],
  ["tl", "cache"],
  ["tl", "celeb"],
];
const ALL = { author: 1, reader: 1, tweet: 1, tl: 1, fan: 1, store: 1, graph: 1, cache: 1, celeb: 1 } as const;
const READ: [string, string, Tone?][] = [
  ["reader", "tl"],
  ["tl", "cache"],
  ["tl", "celeb", "warn"],
  ["tl", "store", "sky"],
];

const F: Record<string, Fr[]> = {
  why: [
    { k: "X · the scale", on: { author: 1, reader: "lit" }, figs: [["~500M", "posts a day"], ["300K", ["timeline reads/s", "reads/s"], "lit"], ["< 5 s", ["to every follower", "delivery"]]], note: ["reads outnumber writes 50 to 1", "50 reads per write"] },
    {
      k: "requirements",
      on: ALL,
      chips: [["deliver in < 5 s, p99", "deliver < 5 s"], ["read in < 200 ms, p99", "read < 200 ms"], ["post confirms < 500 ms", "post < 500 ms"], ["99.99% for reads", "99.99% reads"], ["100M+ follower accounts", "100M+ fans"], ["timelines eventual", "eventual"]],
      ctn: ["lit", "lit", undefined, "ok", "warn"],
    },
    { k: "what fan-out costs", kt: "bad", on: { author: 1, tweet: 1, fan: "bad", cache: "bad" }, fl: [["fan", "cache", "bad"]], figs: [["4.2M", ["timeline writes/s", "writes/s"]], ["100M", ["followers, 1 post", "followers"]], ["~17 min", ["at 100K writes/s", "at 100K/s"], "bad"]], note: ["6,000 posts/s × ~700 followers each", "6,000/s × 700 followers"] },
    { k: "precompute, but store IDs", on: { cache: "lit" }, sub: { cache: ["IDs only", "IDs"] }, figs: [["800", ["IDs per timeline", "IDs each"]], ["~4 TB", ["250M × 16 KB", "250M users"]], ["12 TB", ["3 replicas, Redis", "replicated"], "ok"]], note: ["full tweets would need ~200 TB", "full tweets: ~200 TB"] },
  ],
  arch: [
    { k: "1 · store first", on: { author: 1, tweet: "lit", store: "lit" }, sub: { store: ["Manhattan", "KV"] }, fl: [["author", "tweet"], ["tweet", "store"]], note: ["the author waits only for this: under 500 ms", "author waits < 500 ms"] },
    { k: "2 · push to most", on: { tweet: 1, fan: "lit", graph: 1, cache: "lit" }, sub: { fan: ["1,000 a batch", "batch"], cache: ["LPUSH, LTRIM 800", "LTRIM"] }, fl: [["tweet", "fan"], ["fan", "graph"], ["fan", "cache"]], note: ["an author with 1,000 followers: one batch of 1,000 IDs", "1,000 followers: 1 batch"] },
    { k: "3 · not celebrities", kt: "warn", on: { tweet: 1, fan: "lit", celeb: "warn" }, sub: { celeb: ["one ZADD", "ZADD"] }, fl: [["tweet", "fan"], ["fan", "celeb", "warn"]], note: ["above 10,000 followers: one write, not 100 million", "> 10K: one write"], nt: "warn" },
    { k: "4 · merge on read", kt: "ok", on: { reader: "ok", tl: "lit", cache: 1, celeb: 1, store: 1 }, sub: { tl: ["merge", "merge"], cache: ["LRANGE", "LRANGE"], celeb: ["ZREVRANGE", "ZREV"], store: ["MGET", "MGET"] }, fl: READ, note: ["merge newest first, then hydrate in one MGET", "merge, then one MGET"] },
  ],
  deep: [
    { k: "1 · push, pull or both", on: { fan: "lit", cache: 1, tl: "lit", celeb: 1 }, cols: 3, chips: [["push: fast reads", "push"], ["pull: cheap writes", "pull"], ["hybrid: per author", "hybrid"]], ctn: ["sky", "warn", "ok"], note: ["decided per author, by follower count", "per author, by followers"] },
    { k: "2 · the social graph", on: { fan: 1, graph: "lit", tl: 1 }, sub: { graph: ["both ways", "2 ways"] }, fl: [["fan", "graph"]], figs: [["~420B", "follow edges"], ["× 2", ["stored both ways", "both ways"]], ["~7 TB", "in all", "lit"]], note: ["followers for fan-out, following for reads · big lists paged", "big lists paged"] },
    { k: "3 · trending", on: { tweet: "lit", author: 1 }, fl: [["author", "tweet"]], chips: [["1-minute buckets", "1-min buckets"], ["log10(volume) × velocity", "log × velocity"], ["≥ 100 tweets to qualify", "≥ 100 tweets"], ["growth beats size", "growth wins"]] },
    { k: "4 · hot keys", kt: "warn", on: { reader: 1, tl: 1, celeb: "bad", store: "warn" }, sub: { celeb: ["millions read", "hot"], store: ["viral likes", "likes"] }, fl: [["tl", "celeb", "bad"]], chips: [["replicate celebrity lists", "replicate"], ["shard like counters", "shard counters"]], ct: "ok" },
  ],
  scale: [
    { k: "shard the cache", on: { reader: 1, tl: 1, cache: "lit" }, sub: { cache: ["by user_id", "user_id"] }, fl: [["reader", "tl"], ["tl", "cache"]], chips: [["shard by user_id", "by user_id"], ["~10M users a shard", "10M a shard"], ["25 shards × 3", "25 × 3"], ["≈ 75 Redis nodes", "75 nodes"]] },
    { k: "the Super Bowl", kt: "warn", on: { ...ALL, fan: "warn", tl: "ok" }, sub: { fan: ["queue backs up", "backlog"] }, fl: [["tweet", "fan", "warn"], ["reader", "tl", "ok"]], chips: [["pre-scale from the calendar", "pre-scale"], ["reads come first", "reads first"], ["10–30 s delivery is OK", "10–30 s OK"], ["slightly stale timelines", "stale is OK"]], ctn: [undefined, "ok", "warn", "warn"] },
    { k: "misses and orphans", on: { reader: 1, tl: "lit", store: 1, cache: "warn" }, sub: { cache: ["miss", "miss"] }, fl: [["reader", "tl"], ["tl", "store", "sky"]], chips: [["30 days away → rebuild", "rebuild on miss"], ["reply first → fetch parent", "fetch parent"]] },
    { k: "delete it everywhere", kt: "bad", on: { author: 1, tweet: 1, store: "bad", tl: "ok", reader: 1, cache: 1 }, sub: { store: ["tombstone", "tomb"], tl: ["filter", "filter"] }, fl: [["tweet", "store", "bad"], ["tl", "store", "ok"]], note: ["dropped at hydration; stale IDs age out past 800", "dropped at hydration"] },
    { k: "the takeaway", kt: "ok", on: { ...ALL, cache: "ok", celeb: "warn" }, fl: [["tweet", "fan"], ["fan", "cache", "ok"], ["tl", "celeb", "warn"]], chips: [["push to most", "push most"], ["pull the few", "pull the few"]], ctn: ["ok", "warn"], note: ["no post should cost 100 million writes", "no 100M-write posts"] },
  ],
};

const V: Variant[] = [
  {
    id: "why",
    label: "The problem",
    steps: [
      { caption: "X: about 500 million posts a day, 300,000 timeline reads a second, and every post in its followers' timelines within 5 seconds.", tween: 1400 },
      { caption: "Deliver in under 5 s, read a timeline in under 200 ms, confirm a post in under 500 ms, and survive accounts with 100 million+ followers.", tween: 1400 },
      { caption: "6,000 posts a second × 700 followers is 4.2 million timeline writes a second. One 100M-follower post at 100,000 a second takes ~17 minutes.", tween: 1400, loop: true },
      { caption: "Reads win 50 to 1, so precompute. 800 tweet IDs of ~20 bytes for 250 million users is ~4 TB, 12 TB replicated: it fits in Redis.", tween: 1400 },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    steps: [
      { caption: "Posting stores the tweet first, in Manhattan, the source of truth. The author waits only for that; fan-out happens asynchronously.", tween: 1200, loop: true },
      { caption: "An author with 1,000 followers is pushed: workers take a batch of 1,000 follower IDs, LPUSH into each timeline and LTRIM it to 800.", tween: 1400, loop: true },
      { caption: "Above 10,000 followers nothing is pushed: one ZADD to the author's celebrity tweets set, so a post costs one write, not 100 million.", tween: 1200, loop: true },
      { caption: "Reading: LRANGE the pushed IDs, ZREVRANGE the followed celebrities' recent IDs, merge newest first, and one MGET hydrates the tweets.", tween: 1400, loop: true },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      { caption: "Push gives fast reads but celebrity write storms; pull gives cheap writes but slow reads. The hybrid decides per author, by follower count.", tween: 1200 },
      { caption: "The social graph stores each of ~420 billion edges both ways, followers and following, so each question is one list; huge lists are paged.", tween: 1400, loop: true },
      { caption: "Trending is about change: count hashtags in 1-minute buckets and score log volume × velocity, so a sudden riser beats an all-day giant.", tween: 1400, loop: true },
      { caption: "Celebrity tweet lists are hot keys read by millions, so replicate them widely; a viral tweet's like counter is split across several keys.", tween: 1200, loop: true },
    ],
  },
  {
    id: "scale",
    label: "Scale & edge cases",
    steps: [
      { caption: "The timeline cache is sharded by user_id, so a read hits one shard: ~10 million users each, 25 shards × 3 replicas, about 75 Redis nodes.", tween: 1400, loop: true },
      { caption: "At 10x during the Super Bowl, fan-out queues back up. Keep reads fast and accept 10 to 30 second delivery, pre-scaled from the calendar.", tween: 1400, loop: true },
      { caption: "A user back after 30 days has no cached timeline: rebuild it from followed accounts. A reply that lands first fetches its parent on read.", tween: 1200, loop: true },
      { caption: "Deleting a fanned-out tweet: tombstone it in the store, and hydration drops it from every timeline at once. The stale IDs age out later.", tween: 1200, loop: true },
      { caption: "The lesson: precompute for the 50-to-1 reads, but never let one account turn a post into 100 million writes. Push most, pull the few.", tween: 1200, loop: true },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
