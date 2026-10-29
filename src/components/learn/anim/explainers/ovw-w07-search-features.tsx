/**
 * Whole-lesson overview (week 7, day 4 · typeahead at scale: autocomplete, spelling and facets).
 * Keystrokes: the 21:00 sale night, ~100 ms per keystroke with ≤ 15 ms for the server, one search
 * ≈ 12 requests (~2,800 searches/s become ~33,000 requests/s), the client's half (debounce, local
 * filter, tab cache, abort and sequence) and the CDN (~11,000/s reach it, ~4,400/s the origin).
 * Top-k trie: a plain trie walks subtrees, so every node stores its top-k; costs move to build time;
 * the engine's options. Build: query logs counted by distinct users, a 14-day half-life, filters
 * (≥ 20 users, PII, blocklists, policy, a serve-time kill switch), the trending overlay, versioned
 * snapshots. Serve and after Enter: ~11 GB fits, so replicate; hot prefixes; private history;
 * the noisy channel for "did you mean"; post_filter facets.
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
  cdn: nd(1, 0, "CDN edge", "CDN"),
  api: nd(2, 0, "Suggest API", "Suggest"),
  ta: nd(3, 0, "Typeahead", "Typeahead", 2),
  srch: nd(0, 1, "Search"),
  strm: nd(1, 1, "Stream"),
  trend: nd(2, 1, "Trending"),
  logs: nd(0, 2, "Logs"),
  batch: nd(1, 2, "Batch"),
  filt: nd(2, 2, "Filters"),
  blk: nd(3, 2, "Blocklist"),
};
const E: Ed[] = [
  ["app", "cdn"],
  ["cdn", "api"],
  ["api", "ta", 0, -30],
  ["app", "srch"],
  ["logs", "strm", -8, 0],
  ["strm", "trend"],
  ["trend", "ta", 0, 28],
  ["logs", "batch"],
  ["batch", "filt"],
  ["filt", "ta", 0, 44],
  ["blk", "ta"],
];

const F: Record<string, Fr[]> = {
  keys: [
    {
      k: ["21:00 · the festive sale opens", "21:00 · the sale opens"],
      kt: "warn",
      on: { app: "warn", srch: "bad" },
      sub: { app: "kale j", srch: "90% CPU" },
      fl: [["app", "srch", "warn"]],
      chips: [
        ["21:00:04 · kal replaces kale j", "kal replaces kale j"],
        ["21:00:05 · kale joote: nothing", "kale joote: nothing"],
        ["21:02 · rebuilt only at 02:00", "rebuilt only at 02:00"],
        ["21:05 · 98 → a phone number", "98 → a phone number"],
      ],
      ctn: ["warn", "warn", "warn", "bad"],
      note: ["an illustrative sale night: the box people type into broke, not ranking", "illustrative: the box broke"],
    },
    {
      k: ["the budget per keystroke", "per keystroke"],
      on: { app: "lit", cdn: 1, api: 1, ta: "lit" },
      fl: [
        ["app", "cdn"],
        ["cdn", "api"],
        ["api", "ta"],
      ],
      figs: [
        ["~100 ms", ["keystroke to paint", "to paint"]],
        ["~50 ms", ["phone to edge, 4G", "4G round trip"]],
        ["≤ 15 ms", ["for the server, p99", "server p99"], "lit"],
      ],
      note: ["past 100 ms it stutters (Facebook, 2010): a lookup, not a query", "a lookup, not a query"],
    },
    {
      k: ["one search, twelve requests", "12 requests a search"],
      kt: "warn",
      on: { app: "warn", srch: "bad" },
      fl: [["app", "srch", "warn"]],
      figs: [
        ["~2,800", ["searches/s at peak", "searches/s"]],
        ["×12", ["keystrokes a search", "keystrokes"], "warn"],
        ["~33,000", ["requests/s", "requests/s"], "bad"],
      ],
      note: ["over three times the cluster built for 10,000 searches a second", "3× the 10,000/s search cluster"],
    },
    {
      k: ["the client's half", "the client's half"],
      on: { app: "lit" },
      sub: { app: "120 ms" },
      chips: [
        ["debounce: send after 100–150 ms", "debounce 100–150 ms"],
        ["filter the last list locally", "filter locally"],
        ["cache per prefix in the tab", "tab cache"],
        ["abort, and sequence answers", "abort + sequence"],
      ],
      ctn: ["lit", "sky", "ok", "warn"],
      note: ["the sequence check alone fixes kalonji seeds: old answers never render", "old answers never render"],
    },
    {
      k: ["the CDN answers most of the rest", "the CDN"],
      kt: "ok",
      on: { app: 1, cdn: "lit", api: 1, ta: 1 },
      sub: { cdn: "10 min TTL" },
      fl: [
        ["app", "cdn"],
        ["cdn", "api"],
      ],
      bars: [
        [["no debounce · ~33,000/s", "raw · ~33,000/s"], 33, 33, "bad"],
        [["reach the CDN · ~11,000/s", "CDN · ~11,000/s"], 11, 33, "warn"],
        [["reach the origin · ~4,400/s", "origin · ~4,400/s"], 4.4, 33, "ok"],
      ],
      note: ["the same list for everyone: key on prefix + locale, never a user id", "never a user id in the key"],
    },
  ],
  trie: [
    {
      k: ["a plain trie: quick to find, slow to list", "a plain trie"],
      kt: "warn",
      on: { api: 1, ta: "warn" },
      sub: { ta: ["walks the subtree", "walks subtrees"] },
      fl: [["api", "ta", "warn"]],
      cols: 1,
      chips: [
        ["find the node for sam: 3 steps", "find sam: 3 steps"],
        ["list: visit and rank every query below it", "list: rank the whole subtree"],
        ["below s: millions, and short prefixes are typed most", "short prefixes: biggest subtrees"],
      ],
      ctn: ["ok", "warn", "bad"],
      note: ["the work is largest exactly where the traffic is highest", "most work where most traffic"],
    },
    {
      k: ["store the answer: top-k at every node", "top-k per node"],
      kt: "ok",
      on: { api: 1, ta: "ok" },
      sub: { ta: ["top-k per node", "top-k"] },
      fl: [["api", "ta", "ok"]],
      cols: 1,
      chips: ["s → saree · samsung s24 · shoes", "sa → saree · samsung s24 · samsung tv", "sam → samsung s24 · samsung tv"],
      ctn: ["lit", "lit", "ok"],
      note: ["serving is walk the prefix, return the list: O(prefix length)", "O(prefix length), no subtree"],
    },
    {
      k: ["the cost moves to build time", "cost at build time"],
      on: { ta: "lit" },
      chips: [
        ["memory: k entries, 4-byte ids", "k ids per node"],
        ["score changes: rebuild, swap", "rebuild in batch"],
        ["fixed k: top 10 can't do top 20", "fixed k"],
        ["serve it as a prefix → list map", "a prefix → list map"],
      ],
      ctn: ["sky", "warn", "warn", "ok"],
      note: ["an FST shares suffixes too: 9.8M terms in 69 MB, but it's immutable", "an FST: smaller, immutable"],
    },
    {
      k: ["or ask the search engine", "engine options"],
      on: { app: 1, srch: "lit", ta: 1 },
      fl: [["app", "srch"]],
      chips: [
        ["prefix query: resource-heavy", "prefix: costly"],
        ["edge n-grams: nike → n, ni, nik", "edge n-grams"],
        ["search_as_you_type: any order", "search_as_you_type"],
        ["completion: an FST in memory", "completion: FST"],
      ],
      ctn: ["bad", "sky", "sky", "lit"],
      note: ["usually two lists: precomputed completions + a few instant results", "completions + instant results"],
    },
  ],
  build: [
    {
      k: ["from what people searched", "from query logs"],
      on: { logs: "lit", batch: "lit" },
      sub: { logs: "90 days", batch: "nightly" },
      fl: [["logs", "batch"]],
      chips: [
        ["normalize: NFKC, lowercase", "normalize"],
        ["count distinct users", "distinct users"],
        ["count successful searches", "successful searches"],
        ["collapse Samsung S24 variants", "collapse variants"],
      ],
      ctn: ["sky", "ok", "ok", "sky"],
      note: ['a trailing space matters: "nike " should never suggest nikon', '"nike " never suggests nikon'],
    },
    {
      k: ["decay, with a half-life", "decay"],
      on: { logs: 1, batch: "lit" },
      sub: { batch: "half-life" },
      fl: [["logs", "batch"]],
      figs: [
        ["90 days", ["of daily partitions", "of logs"]],
        ["14 days", ["half-life, illustrative", "half-life"], "lit"],
      ],
      note: ["all-time counts never forget: last year's phone outranks this year's", "all-time counts never forget"],
    },
    {
      k: ["filter: a suggestion is the system speaking", "filters"],
      kt: "warn",
      on: { batch: 1, filt: "lit", blk: "lit", ta: 1 },
      sub: { filt: "PII, policy", blk: "updates in seconds" },
      fl: [
        ["batch", "filt"],
        ["blk", "ta"],
      ],
      chips: [
        ["≥ 20 distinct users (privacy)", "≥ 20 users"],
        ["PII: phones, emails, ids: drop", "PII: drop"],
        ["blocklists + a classifier", "blocklists"],
        ["policy: names, health", "policy lists"],
        ["serve-time blocklist: seconds", "kill switch: seconds"],
        ["one user's 40 searches: out", "1 user, 40 searches: out"],
      ],
      ctn: ["ok", "bad", "warn", "warn", "lit", "bad"],
    },
    {
      k: ["trending, without waiting for 02:00", "trending overlay"],
      on: { logs: 1, strm: "lit", trend: "lit", ta: 1 },
      sub: { strm: "5-min windows", trend: "TTL: hours" },
      fl: [
        ["logs", "strm"],
        ["strm", "trend"],
        ["trend", "ta"],
      ],
      chips: [
        ["5-min counts vs a baseline", "5-min vs baseline"],
        ["from enough distinct users", "distinct users"],
        ["merged into 1 or 2 slots", "1 or 2 slots"],
        ["stricter filters, not looser", "stricter filters"],
      ],
      ctn: ["sky", "ok", "lit", "warn"],
      note: ["a rumour from 40,000 users passes the crowd test; policy holds it back", "rumours: held for review"],
    },
    {
      k: ["ship a versioned snapshot", "ship a snapshot"],
      kt: "ok",
      on: { batch: 1, filt: 1, ta: "ok" },
      sub: { ta: ["snapshot v1042", "v1042"] },
      fl: [
        ["batch", "filt"],
        ["filt", "ta", "ok"],
      ],
      chips: [
        ["validate: counts, golden set", "validate"],
        ["load beside the old one, warm", "load and warm"],
        ["swap a pointer; keep yesterday's", "swap; keep yesterday's"],
        ["build fails: last good snapshot", "fails: last good one"],
      ],
      ctn: ["sky", "sky", "ok", "warn"],
      note: ['"sa" must contain "saree"; stale for a day is fine, empty is an outage', "stale is fine, empty isn't"],
    },
  ],
  serve: [
    {
      k: ["sizing it: one copy fits", "it fits in memory"],
      kt: "ok",
      on: { api: 1, ta: "ok" },
      sub: { ta: ["a full copy each", "full copy"] },
      fl: [["api", "ta", "ok"]],
      figs: [
        ["~120M", ["prefix keys", "prefix keys"]],
        ["~11 GB", ["10 GB map + 1 GB table", "whole index"], "ok"],
        ["1", ["replica serves 4,400/s", "replica needed"], "lit"],
      ],
      note: ["so don't shard: every replica holds a full copy, 3 per region", "replicate, 3 per region"],
    },
    {
      k: ["hot prefixes", "hot prefixes"],
      kt: "warn",
      on: { app: 1, cdn: "lit", api: 1, ta: "warn" },
      fl: [
        ["app", "cdn"],
        ["cdn", "api", "warn"],
        ["api", "ta", "warn"],
      ],
      chips: [
        ["26 shards by first letter: skew", "first letter: skew"],
        ['a launch: every "iph…" on one', "one hot shard"],
        ["hash the whole prefix", "hash the prefix"],
        ["coalesce: one fetch per key", "coalesce misses"],
      ],
      ctn: ["bad", "bad", "ok", "ok"],
      note: ["best, when it fits: don't shard; the CDN and replicas take hot keys", "best: don't shard"],
    },
    {
      k: ["personal, but never in a shared cache", "personalization"],
      on: { app: "lit", cdn: 1, api: 1, ta: 1 },
      sub: { app: "history" },
      fl: [
        ["app", "cdn"],
        ["cdn", "api"],
      ],
      chips: [
        ["global list: public, at the CDN", "global: at the CDN"],
        ["history: private, behind login", "history: private"],
        ["merge on the client", "merge on the client"],
        ["cap the personal slots", "cap personal slots"],
      ],
      ctn: ["ok", "warn", "lit", "sky"],
      note: ['cache a blended "pr" list and one user\'s history reaches everyone', "blended + cached = a leak"],
    },
    {
      k: ["after Enter: did you mean", "did you mean"],
      on: { app: 1, srch: "lit" },
      sub: { srch: "spelling" },
      fl: [["app", "srch"]],
      chips: [
        ["noisy channel: P(c) · P(w | c)", "P(c) · P(w | c)"],
        ["P(c) from your own query logs", "P(c): your logs"],
        ["nothing found: auto-correct", "none: auto-correct"],
        ["both find results: suggest", "both: suggest"],
      ],
      ctn: ["lit", "ok", "warn", "sky"],
      note: ["a new brand that looks like a typo: whitelist it, correct neither", "new brands: never corrected"],
    },
    {
      k: ["facets: counts beside the results", "facets"],
      on: { app: 1, srch: "lit" },
      sub: { srch: "facets" },
      fl: [["app", "srch"]],
      chips: [
        ["each facet is an aggregation", "facets = aggregations"],
        ["selections go in post_filter", "post_filter"],
        ["a facet ignores its own filter", "ignores its own filter"],
        ["counts approximate across shards", "approximate counts"],
      ],
      ctn: ["sky", "lit", "ok", "warn"],
      note: ["tick Nike and the brand facet still counts Adidas, so she can add it", "Adidas still counted"],
    },
  ],
};

const V: Variant[] = [
  {
    id: "keys",
    label: "Keystrokes",
    steps: [
      {
        caption:
          "An illustrative sale night: at 21:00 typeahead traffic jumps ninefold, and every keystroke is a prefix query on the 50-million-product cluster, which hits 90% CPU. Stale answers, missing Hinglish, nightly-only rebuilds and a leaked phone number follow.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "A suggestion that arrives after the next keystroke is useless: past 100 ms the typeahead stutters. With ~50 ms for the 4G round trip and ~10 ms to render, the server gets about 15 ms: a lookup, not a query that scores millions of documents.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Typeahead sends a request per keystroke, not per search. 10M users × 8 searches a day is ~2,800 searches a second at a 3× peak; at 12 keystrokes each that's ~33,000 requests a second, over three times a cluster built for 10,000 searches.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Half of typeahead runs in the app: debounce for 100–150 ms, show the last list filtered locally, cache each prefix in the tab, abort the old request and never let an older answer overwrite a newer one. That last check alone fixes \"kalonji seeds\".",
        tween: 1400,
      },
      {
        caption:
          "The global list is the same for everyone with a prefix and locale, so the CDN caches it for about ten minutes, keyed on the normalized prefix plus locale. Debouncing leaves ~11,000 requests a second; at a 60% hit ratio ~4,400 reach the origin.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "trie",
    label: "Top-k trie",
    steps: [
      {
        caption:
          "A trie finds the node for \"sam\" in 3 steps however many queries it stores, but listing completions means visiting and ranking every query below it. Below \"s\" there may be millions, so the work is largest on the short prefixes people type most.",
        tween: 1400,
        loop: true,
      },
      {
        caption: "Store the answer, not the means to compute it: at build time every node keeps its own top-k list. Serving becomes \"walk the prefix, return the list\", O(prefix length), with no subtree walk.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "The costs move to build time: k entries per node (store 4-byte ids), a rebuild and swap when scores change, and a fixed k. With every list precomputed, a prefix → list map answers in one lookup. An FST shares suffixes too: 9.8M terms in 69 MB, but immutable.",
        tween: 1400,
      },
      {
        caption:
          "A search engine offers prefix queries (too costly for a public box), edge n-grams, search_as_you_type and the in-memory completion suggester. The usual production answer is two lists in one dropdown: precomputed completions plus a few instant results.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "build",
    label: "Build",
    steps: [
      {
        caption:
          "Suggestions come from what people searched. A nightly batch over 90 days of logs normalizes each query, counts searches, distinct users (so one bot can't make a suggestion) and successful searches, and collapses variants like \"Samsung S24\".",
        tween: 1400,
        loop: true,
      },
      {
        caption: "All-time counts never forget, so each day's count is weighted by its age with a half-life: 14 days in this lesson's illustrative setup, which lets seasonal queries like \"diwali lights\" rise again each year.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "A suggestion is the system speaking. The build drops queries from fewer than 20 distinct users (the key privacy filter: the \"98\" number came from one person), PII patterns, blocklisted and policy terms; a serve-time blocklist removes misses in seconds.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "A nightly batch can't know about the 20:00 launch. A stream job counts 5-minute windows against each query's baseline; a spike from enough distinct users enters a trending overlay with a TTL of hours, capped at 1 or 2 slots and filtered more strictly.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "The batch writes a versioned, immutable snapshot per locale. It's validated (\"sa\" must contain \"saree\"), loaded beside the old one and swapped by pointer, with yesterday's kept for rollback. If the build fails, the last good snapshot keeps serving.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "serve",
    label: "Serve & after Enter",
    steps: [
      {
        caption:
          "Sized for the store: ~120 million prefixes × ~80 B is ~10 GB, plus a ~1 GB suggestion table. One replica handles the ~4,400 lookups a second that reach the origin, so every replica gets a full copy, 3 per region, and nothing is sharded.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Sharding by first letter is the classic wrong answer: letters are skewed and a launch puts every \"iph…\" on one shard. Hash the whole prefix if you must split; a hot prefix is then one hot key for the CDN, replicas and request coalescing.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Personal history travels separately: the CDN only ever sees the global list, history comes from a private call behind login, and the two merge on the client with capped personal slots. Cache a blended list and one user's history reaches everyone.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "After Enter, spelling correction picks the candidate c that maximises P(c) · P(w | c), with your own query logs as the language model. Auto-correct when the original finds nothing; suggest when both find results; never correct a new brand.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Facets are aggregations computed with the hits. Selections go in a post_filter and each facet ignores its own selection, so ticking Nike still shows Adidas's count. Across shards, terms counts are approximate.",
        tween: 1400,
        loop: true,
      },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
