/**
 * The whole lesson, week 1 day 4 (Hot keys and skew): Zipf's law and what a hot key does to
 * latency; detecting it (sliding-window counts, count-min sketch, external signals); five
 * mitigations (cache, replicas, key splitting, local cache, coalescing); and the URL shortener's
 * four layers (CDN 80%, app 15%, Redis 4%, DB 1%), Instagram's push/pull, write-heavy counters.
 */
import { Box, defineExplainer, ease, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 350;
const BX0 = 44;
const BW = 40;
const GAP = 12;
const BASE = 272;
const BMAX = 104;
const bx = (i: number) => BX0 + i * (BW + GAP);
const LX = (i: number) => 20 + i * 116;
const LY = 52;
const LW = 96;
const LH = 56;

type Lay = { label: string; sub?: string; tone?: Tone; dim?: boolean };
type Bars = { v: number[]; max: number; tags?: (string | undefined)[]; names?: string[]; hot?: number[]; tone?: Tone; thr?: number };
type Fr = { kick: string; kt?: Tone; lay?: Lay[]; chips?: { label: string; sub: string; tone?: Tone }[]; bars: Bars; l: [string, string]; nl?: [string, string]; flow?: number[] };

const PN = Array.from({ length: 10 }, (_, i) => `P${i}`);
const ZIPF = Array.from({ length: 10 }, (_, i) => 1000 / (i + 1));
const L5 = (subs: (string | undefined)[], lit: number[] = [], dim: number[] = []): Lay[] =>
  ["Users", "CDN", "App", "Redis", "DB"].map((label, i) => ({ label, sub: subs[i], tone: lit.includes(i) ? "lit" : undefined, dim: dim.includes(i) }));
const even = (x: number) => PN.map(() => x);
const hotP = (a: number, b: number, rest: number) => PN.map((_, i) => (i === 3 ? a : i === 7 ? b : rest));

function frame(v: string, s: number): Fr {
  if (v === "skew") {
    if (s === 0) return { kick: "Zipf's law", bars: { v: ZIPF, max: 1000, names: ZIPF.map((_, i) => `#${i + 1}`), tags: ["1000", "500", "333", "250"], hot: [0] }, l: ["the nth key gets ~1/n of #1's traffic", "1,000 keys: top 1% ~40% · top 10% ~70%"], nl: ["nth key: ~1/n of #1", "top 10% get ~70%"] };
    if (s === 1) return { kick: "viral: the extreme case", kt: "bad", bars: { v: [920, 12, 10, 9, 8, 8, 7, 7, 6, 6], max: 1000, names: ZIPF.map((_, i) => `#${i + 1}`), tags: [">90%"], hot: [0], tone: "bad" }, l: ["top 0.01% of keys: >90% of traffic", "a celebrity tweet: 10 million views in an hour"], nl: ["top 0.01%: >90%", "10M views in an hour"] };
    return { kick: "what a hot key does", kt: "bad", chips: [{ label: "normal key", sub: "p99 20 ms", tone: "ok" }, { label: "hot key", sub: "p99 500 ms", tone: "bad" }, { label: "its neighbours", sub: "p99 100 ms", tone: "warn" }], bars: { v: hotP(1000, 200, 200), max: 1000, names: PN, tags: [undefined, undefined, undefined, "hot"], hot: [3], tone: "bad" }, l: ["one partition overloads, health checks fail", "traffic moves to replicas, which overload too"], nl: ["health checks fail", "then the replicas: cascade"] };
  }
  if (v === "detect") {
    if (s === 0) return { kick: "count per key", lay: L5(["", "", "detector", "", ""], [2]), bars: { v: [140, 90, 60, 980, 70, 50, 40, 80, 30, 60], max: 1000, names: ["k0", "k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8", "k9"], tags: [undefined, undefined, undefined, "HOT"], hot: [3], tone: "bad", thr: 600 }, l: ["count each key in a sliding window", "over the threshold: hot · storing it all is costly"], nl: ["over threshold: hot", "storing every hit is costly"] };
    if (s === 1) return { kick: "count-min sketch", kt: "ok", lay: L5(["", "", "sketch", "", ""], [2]), bars: { v: [150, 100, 60, 980, 90, 50, 40, 220, 30, 60], max: 1000, names: ["k0", "k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8", "k9"], tags: [undefined, undefined, undefined, "HOT", undefined, undefined, undefined, "≈"], hot: [3], tone: "bad", thr: 600 }, l: ["fixed memory: width × depth, any key count", "some false positives, no false negatives"], nl: ["fixed memory", "no false negatives"] };
    return { kick: "predict it", kt: "sky", chips: [{ label: "social", sub: "Twitter, Reddit", tone: "sky" }, { label: "news", sub: "mentions", tone: "sky" }, { label: "schedules", sub: "launches, sales", tone: "sky" }], bars: { v: [60, 80, 50, 70, 60, 50, 400, 70, 40, 60], max: 1000, names: ["k0", "k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8", "k9"], tags: [undefined, undefined, undefined, undefined, undefined, undefined, "warm up"], hot: [6], tone: "sky", thr: 600 }, l: ["don't just react: watch external signals", "pre-optimize a key before the spike"], nl: ["watch external signals", "prepare before the spike"] };
  }
  if (v === "mitigate") {
    if (s === 0) return { kick: "1 · caching", kt: "ok", lay: L5(["", "", "", "hot key", "misses"], [3]), bars: { v: hotP(150, 150, 150), max: 1000, names: PN, tags: [undefined, undefined, undefined, "cached"], hot: [3], tone: "ok" }, flow: [3], l: ["serve from cache: the DB never sees it", "expiry stampede: probabilistic early refresh"], nl: ["the DB never sees it", "refresh early, randomly"] };
    if (s === 1) return { kick: "2 · read replicas", lay: L5(["", "", "", "", "+ replicas"], [4]), bars: { v: hotP(400, 200, 200), max: 1000, names: PN, tags: [undefined, undefined, undefined, "+R"], hot: [3], tone: "sky" }, flow: [4], l: ["dedicated replicas for a hot partition", "for predictable keys, or when cache won't do"], nl: ["replicas for hot partitions", "for predictable keys"] };
    if (s === 2) return { kick: "3 · key splitting", kt: "warn", lay: L5(["", "", "", "abc:0–9", ""], [3]), bars: { v: even(300), max: 1000, names: PN.map((_, i) => `:${i}`), tone: "warn" }, flow: [3], l: ["viral_url_abc:0 … :9 on ten partitions", "reads pick one; every write goes to all 10"], nl: ["abc:0 … :9, ten partitions", "writes go to all 10"] };
    if (s === 3) return { kick: "4 · local caching", lay: L5(["", "", "in memory", "pub/sub", ""], [2]), bars: { v: hotP(150, 200, 200), max: 1000, names: PN, tags: [undefined, undefined, undefined, "local"], hot: [3], tone: "ok" }, flow: [2], l: ["hot keys in each app server's memory", "changes invalidate every copy via pub/sub"], nl: ["in app memory", "pub/sub invalidation"] };
    return { kick: "5 · request coalescing", kt: "ok", lay: L5(["A · B · C", "", "1 query", "", "1 read"], [2]), bars: { v: hotP(250, 200, 200), max: 1000, names: PN, tags: [undefined, undefined, undefined, "1 query"], hot: [3], tone: "ok" }, flow: [2, 4], l: ["A, B and C miss together: one DB query", "the result returns to all three"], nl: ["three misses, one query", "one result for all three"] };
  }
  if (s === 0) return { kick: "URL shortener · 10 partitions", kt: "bad", lay: L5(["10K req/s", "", "", "", "p99 500 ms"], [], [1, 2, 3]), bars: { v: hotP(3500, 4500, 250), max: 4500, names: PN, tags: [undefined, undefined, undefined, "3,500", undefined, undefined, undefined, "4,500"], hot: [3, 7], tone: "bad" }, l: ["0.01% of URLs get 90% of 10,000 req/s", "P3 and P7 overloaded · others ~250 req/s"], nl: ["0.01% of URLs: 90%", "P3, P7 overloaded"] };
  if (s === 1) return { kick: "layers 1 and 2", kt: "ok", lay: L5(["10K req/s", "~7,200", "~1,350", "", ""], [1, 2], [3, 4]), bars: { v: hotP(800, 900, 200), max: 4500, names: PN, hot: [3, 7], tone: "warn" }, flow: [1, 2], l: ["CDN edge: 80% of hot traffic, ~7,200 req/s", "app memory: 15%, ~1,350 req/s"], nl: ["CDN: ~7,200 req/s", "app memory: ~1,350"] };
  if (s === 2) return { kick: "layers 3 and 4", kt: "ok", lay: L5(["10K req/s", "~7,200", "~1,350", "~360", "~90 + cold"], [3, 4]), bars: { v: even(110), max: 4500, names: PN, tone: "ok" }, flow: [3, 4], l: ["Redis 4% on split keys · DB 1% plus cold misses", "~2,800 past the edge · p99 500 → 20 ms"], nl: ["~2,800 past the edge", "p99 500 → 20 ms"] };
  if (s === 3) return { kick: "Instagram: push or pull", kt: "sky", chips: [{ label: "< 10K followers", sub: "push on write", tone: "ok" }, { label: "celebrity", sub: "pull on read", tone: "sky" }, { label: "the feed", sub: "merge both", tone: "lit" }], bars: { v: [], max: 1000 }, l: ["600M+ followers: no write fan-out for them", "differentiate by popularity · accept approximation"], nl: ["celebrities: pull on read", "approximate like counts"] };
  return { kick: "write-heavy hot keys", kt: "warn", chips: [{ label: "1M viewers", sub: "1M writes/s", tone: "bad" }, { label: "buffer", sub: "flush in batches", tone: "warn" }, { label: "shards", sub: "sum on read", tone: "ok" }], bars: { v: even(500), max: 1000, names: PN.map((_, i) => `s${i}`), tone: "ok" }, l: ["you can't cache writes: buffer locally, flush", "or shard the counter: reads cost one per shard"], nl: ["buffer and batch", "or shard the counter"] };
}

const NS: Record<string, string> = { "in memory": "memory", "A · B · C": "A, B, C", "+ replicas": "+replicas", "p99 500 ms": "500 ms", "10K req/s": "10K/s", "~90 + cold": "~90+", "hot key": "hot", "< 10K followers": "< 10K", "its neighbours": "neighbours", "Twitter, Reddit": "Reddit", "flush in batches": "batches", "launches, sales": "launches", "push on write": "push", "pull on read": "pull", "merge both": "merge", "sum on read": "sum" };
const ns = (x: string) => NS[x] || x;
const NK: Record<string, string> = { "URL shortener · 10 partitions": "10 partitions", "Instagram: push or pull": "push or pull", "viral: the extreme case": "viral" };

function Scene({ variant, step, t, narrow }: SceneProps) {
  const f = frame(variant, step);
  const g = ease(seg(t, 0, 0.7));
  const prev = variant === "mitigate" ? { v: hotP(1000, 200, 200), max: 1000 } : step > 0 ? frame(variant, step - 1).bars : f.bars;
  const same = prev.max === f.bars.max && prev.v.length === f.bars.v.length;
  const l = narrow && f.nl ? f.nl : f.l;
  const p = seg(t, 0.1, 0.9);
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start" tone={f.kt}>
        {narrow ? NK[f.kick] || f.kick : f.kick}
      </Txt>
      {f.lay &&
        f.lay.map((b, i) => (
          <g key={i}>
            {i > 0 && <Wire d={`M${LX(i - 1) + LW} ${LY + LH / 2}H${LX(i)}`} arrow tone={f.flow?.includes(i) ? "lit" : undefined} />}
            <Box x={LX(i)} y={LY} w={LW} h={LH} label={b.label} sub={narrow ? undefined : b.sub || undefined} tone={b.tone} dim={b.dim} />
            {narrow && b.sub && <Txt x={LX(i) + LW / 2} y={LY + LH + 20} k="s" tone={b.tone}>{ns(b.sub)}</Txt>}
          </g>
        ))}
      {f.lay && f.flow && p > 0 && p < 1 && <Token x={lerp(LX(0) + LW, LX(Math.max(...f.flow)), p)} y={LY + LH / 2} />}
      {f.chips &&
        f.chips.map((c, i) => (
          <g key={i} opacity={ease(seg(t, i * 0.15, i * 0.15 + 0.4))}>
            <Box x={20 + i * 192} y={LY} w={176} h={LH} label={narrow ? ns(c.label) : c.label} sub={narrow ? ns(c.sub) : c.sub} tone={c.tone} />
          </g>
        ))}
      {f.bars.thr !== undefined && <line className="hk-thr" x1={BX0 - 8} x2={bx(9) + BW + 8} y1={BASE - (BMAX * f.bars.thr) / f.bars.max} y2={BASE - (BMAX * f.bars.thr) / f.bars.max} />}
      {f.bars.v.map((val, i) => {
        const from = same ? prev.v[i] : 0;
        const h = (BMAX * lerp(from, val, g)) / f.bars.max;
        const hot = f.bars.hot?.includes(i);
        const tag = f.bars.tags?.[i];
        return (
          <g key={i}>
            <rect className={`ax-fill ${hot ? f.bars.tone || "" : f.bars.hot ? "mute" : f.bars.tone || ""}`} x={bx(i)} y={BASE - h} width={BW} height={h} />
            {tag && (
              <Txt x={bx(i) + BW / 2} y={BASE - h - 8} k="s" tone={hot ? f.bars.tone : undefined}>
                {tag}
              </Txt>
            )}
            {(!narrow || i % 2 === 0 || hot) && (
              <Txt x={bx(i) + BW / 2} y={BASE + 18} k="s" tone={hot ? f.bars.tone : undefined}>
                {f.bars.names?.[i]}
              </Txt>
            )}
          </g>
        );
      })}
      {f.bars.v.length > 0 && <line className="hk-base" x1={BX0 - 8} x2={bx(9) + BW + 8} y1={BASE} y2={BASE} />}
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
  css: `.ax-fill.mute{fill:var(--ax-fg4)}.hk-base{stroke:var(--ax-fg4);stroke-width:1.5}.hk-thr{stroke:var(--ax-amber);stroke-width:1.5;stroke-dasharray:6 4}`,
  variants: [
    {
      id: "skew",
      label: "Skew",
      steps: [
        { caption: "Traffic follows Zipf's law: the nth most popular key gets about 1/n of the top key's traffic, so 1,000, 500, 333, 250 requests a second, and so on.", tween: 1600 },
        { caption: "With viral content it's extreme: the top 0.01% of keys receive more than 90% of the traffic.", tween: 1400 },
        { caption: "A hot key's p99 goes from 20 ms to 500 ms, and its neighbours on the same partition suffer too. Health checks fail, replicas overload, and failures cascade.", tween: 1400, ms: 3600 },
      ],
    },
    {
      id: "detect",
      label: "Detect",
      steps: [
        { caption: "You can't fix what you can't see. Count requests per key in a sliding window and flag any key over the threshold; storing every hit is expensive, though.", tween: 1400 },
        { caption: "A count-min sketch counts approximately in fixed memory, whatever the number of keys. It can give false positives, but never misses a hot key.", tween: 1200 },
        { caption: "Better still, predict: social media mentions, news, campaigns and scheduled launches warn you before a key turns hot.", tween: 1400 },
      ],
    },
    {
      id: "mitigate",
      label: "Mitigate",
      steps: [
        { caption: "Caching is the most common and effective defense: served from cache, the database never sees the hot key. Refresh early, probabilistically, to avoid a stampede at expiry.", tween: 1400, ms: 3400 },
        { caption: "Read replicas dedicated to a hot partition work when hot keys are predictable or the cache isn't enough.", tween: 1200 },
        { caption: "Key splitting stores viral_url_abc as :0 through :9 on ten partitions. Reads pick one at random; writes must update all ten.", tween: 1400 },
        { caption: "Local caching keeps hot keys in each app server's memory, with pub/sub invalidation so every copy drops a changed value.", tween: 1200 },
        { caption: "Request coalescing merges concurrent misses: A starts the database query, B and C wait for it, and all three get the same result.", tween: 1600 },
      ],
    },
    {
      id: "url",
      label: "URL shortener",
      steps: [
        { caption: "Back to the URL shortener: 0.01% of URLs get 90% of 10,000 requests a second. Partitions 3 and 7 take 3,500 and 4,500 while the rest see about 250, and p99 hits 500 ms.", tween: 1400, ms: 3600 },
        { caption: "Layer 1, the CDN edge, serves 80% of hot traffic, about 7,200 requests a second. Layer 2, each app server's memory, serves 15%, about 1,350.", tween: 1600, ms: 3400 },
        { caption: "Layer 3, Redis with split keys, takes 4%, about 360; the database sees about 90 plus cold-key misses. p99 drops from 500 ms to 20 ms.", tween: 1600, ms: 3400 },
        { caption: "Instagram's lesson: push posts from accounts under 10K followers into feeds, pull celebrity posts at read time, and accept approximate like counts.", tween: 1400, ms: 3400 },
        { caption: "Write-heavy hot keys are harder: 1 million viewers send 1M writes a second to one counter. Buffer locally and flush in batches, or shard the counter and sum on read.", tween: 1400, ms: 3600 },
      ],
    },
  ],
  Scene,
});
