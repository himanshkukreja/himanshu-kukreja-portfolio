/**
 * The whole problem, interview problem bank 05 (design a web crawler): requirements and the estimate
 * (1B pages a month ≈ 400 a second, ~100 TB raw, ~320 Mbit/s, a ~12 GB Bloom filter for 10B URLs);
 * the crawl loop (frontier, fetchers, S3, parser, dedupe, URL filter, Kafka to the indexer); the deep dives
 * (priority and per-host queues, politeness, normalisation, Bloom filter, SimHash, spider traps); failures.
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
  fl: { x: 360, y: 44, w: 116, h: 58, label: "URL filter", nl: "Filter" },
  fr: { x: 16, y: 44, w: 130, h: 58, label: "Frontier" },
  fe: { x: 16, y: 152, w: 130, h: 58, label: "Fetchers" },
  web: { x: 16, y: 262, w: 130, h: 50, label: "Web" },
  pa: { x: 196, y: 152, w: 120, h: 58, label: "Parser" },
  st: { x: 196, y: 262, w: 120, h: 50, label: "S3" },
  dd: { x: 360, y: 152, w: 116, h: 58, label: "Dedupe" },
  kf: { x: 500, y: 152, w: 84, h: 58, label: "Kafka" },
};
const EDGES: [string, string, boolean?][] = [
  ["fr", "fe"],
  ["fe", "web"],
  ["fe", "pa"],
  ["fe", "st"],
  ["pa", "dd"],
  ["pa", "fl"],
  ["fl", "fr"],
  ["dd", "kf"],
];
const LOOP = ["fr", "fe", "web"];
const ALLN = ["fr", "fe", "web", "pa", "st", "dd", "fl", "kf"];

const V: { id: string; label: string; steps: Sp[] }[] = [
  {
    id: "req",
    label: "Requirements",
    steps: [
      {
        c: "A crawler for search: start from seeds, follow links, store HTML for the indexer, obey robots.txt, and recrawl pages that change.",
        f: {
          kick: "the brief",
          rows: [
            { k: "discover", v: "seeds → links → new URLs", nv: "seeds → links" },
            { k: "store", v: "raw HTML + metadata, to the indexer", nv: "HTML → indexer" },
            { k: "obey", v: "robots.txt and crawl delays", nv: "robots.txt", tone: "ok" },
            { k: "recrawl", v: "news-like in hours, most in weeks", nv: "hours to weeks" },
          ],
          l: ["HTML only, no JavaScript rendering", "a simple loop with four hard problems behind it"],
          nl: ["HTML only, no rendering", "four hard problems"],
        },
      },
      {
        c: "It must be polite, at most one request a second per host, scale to a billion pages a month, and survive broken HTML and traps.",
        f: {
          kick: "non-functional",
          rows: [
            { k: "polite", v: "≤ 1 request/s per host", nv: "≤ 1/s per host", tone: "lit" },
            { k: "scalable", v: "1B pages a month, growing", nv: "1B a month" },
            { k: "robust", v: "bad HTML, slow servers, traps", nv: "bad HTML, traps" },
            { k: "efficient", v: "no refetch, no duplicate storage", nv: "no duplicates", tone: "ok" },
          ],
          l: ["the sites never agreed to be crawled", "politeness is a hard requirement"],
          nl: ["sites never agreed", "politeness is a must"],
        },
      },
      {
        c: "A billion pages a month is about 400 a second: ~100 TB of raw HTML and ~320 Mbit/s. A Bloom filter holds 10B seen URLs in ~12 GB.",
        f: {
          kick: "estimate",
          rows: [
            { k: "pages", v: "~400/s average · ~800/s peak", nv: "~400/s" },
            { k: "storage", v: "100 KB each → ~100 TB a month raw", nv: "~100 TB/month" },
            { k: "bandwidth", v: "~40 MB/s ≈ 320 Mbit/s", nv: "≈ 320 Mbit/s" },
            { k: "seen set", v: "10B URLs: exact ~1 TB, Bloom ~12 GB", nv: "Bloom ≈ 12 GB", tone: "ok" },
            { k: "in flight", v: "~400–800 fetches across many hosts", nv: "400–800 fetches", tone: "lit" },
          ],
          l: ["bandwidth and storage are ordinary", "scheduling under politeness is the hard part"],
          nl: ["bytes are ordinary", "scheduling is hard"],
        },
      },
    ],
  },
  {
    id: "design",
    label: "Design",
    steps: [
      {
        c: "The crawl loop starts at the frontier, which hands a due URL to a fetcher. The fetcher checks robots.txt and DNS caches, then downloads.",
        f: {
          kick: "fetch",
          on: LOOP,
          st: { fr: { tone: "lit", sub: "what + when", ns: "next URL" }, fe: { sub: "async HTTP", ns: "async" } },
          go: [{ r: ["fr", "fe", "web"], a: 0.05, b: 0.95, tone: "lit" }],
          l: ["hundreds of connections per fetcher machine", "strict timeouts and a size cap per page"],
          nl: ["many connections each", "timeouts + size caps"],
        },
      },
      {
        c: "Raw HTML is saved to S3, and the parser pulls out the text and the links, tolerating broken markup.",
        f: {
          kick: "store and parse",
          on: [...LOOP, "pa", "st"],
          st: { pa: { tone: "lit", sub: "links + text", ns: "links" }, st: { sub: "raw pages", ns: "raw" } },
          go: [{ r: ["fe", "st"], a: 0.05, b: 0.8, tone: "sky" }, { r: ["fe", "pa"], a: 0.2, b: 0.95, tone: "lit" }],
          l: ["~100 TB a month raw, ~25 TB compressed", "parsing is tolerant, never strict"],
          nl: ["~25 TB compressed", "tolerant parsing"],
        },
      },
      {
        c: "Links are normalised, filtered and checked against the seen set. Only URLs never seen before go back into the frontier.",
        f: {
          kick: "close the loop",
          on: ["fr", "fe", "web", "pa", "st", "dd", "fl"],
          st: { fl: { tone: "lit", sub: "seen?", ns: "seen?" }, dd: { sub: "hash", ns: "hash" } },
          go: [{ r: ["pa", "fl", "fr"], a: 0.05, b: 0.95, tone: "ok" }],
          l: ["normalise, drop unwanted, check the Bloom filter", "the frontier only ever grows by new URLs"],
          nl: ["normalise, filter, check", "only new URLs return"],
        },
      },
      {
        c: "New or changed pages are published to Kafka for the indexer, so a slow indexer never stalls the fetchers.",
        f: {
          kick: "hand off",
          on: ALLN,
          st: { kf: { tone: "sky", sub: "pages", ns: "pages" }, dd: { tone: "ok", sub: "new page", ns: "new" } },
          go: [{ r: ["dd", "kf"], a: 0.1, b: 0.9, tone: "sky" }],
          l: ["crawling and indexing scale separately", "lag grows? slow the crawl, don't drop pages"],
          nl: ["crawl and index decoupled", "lag? slow the crawl"],
        },
      },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      {
        c: "The frontier has two layers: priority queues decide what to fetch, and one queue per host decides when, using a heap of due times.",
        f: {
          kick: "1 · the frontier",
          rows: [
            { k: "front queues", v: "by priority: importance, change rate", nv: "by priority" },
            { k: "back queues", v: "one per host, only that host's URLs", nv: "one per host", tone: "lit" },
            { k: "heap", v: "each host's next allowed time", nv: "next allowed time" },
            { k: "partition", v: "hash(host) → one crawler machine", nv: "hash(host)", tone: "ok" },
          ],
          l: ["the Mercator design, still the standard answer", "one host's queue and robots.txt live in one place"],
          nl: ["the Mercator design", "one host, one machine"],
        },
      },
      {
        c: "Politeness: cache robots.txt per host for up to 24 hours, honour Disallow and crawl delays, default to one request a second, and back off.",
        f: {
          kick: "1 · politeness",
          kt: "ok",
          rows: [
            { k: "robots.txt", v: "per host, cached ≤ 24 h (RFC 9309)", nv: "cached ≤ 24 h" },
            { k: "rules", v: "Disallow + crawl delay", nv: "Disallow, delay" },
            { k: "default", v: "1 request a second per host", nv: "1/s per host", tone: "lit" },
            { k: "back off", v: "on slow answers, 429 or 503", nv: "on 429 / 503" },
          ],
          l: ["identify with a clear User-Agent and contact URL", "a polite crawler is a crawler sites don't block"],
          nl: ["clear User-Agent", "polite = not blocked"],
        },
      },
      {
        c: "Dedupe three ways: normalise URL spellings, check a Bloom filter for URLs seen before, and fingerprint content to catch copies.",
        f: {
          kick: "2 · seen before?",
          rows: [
            { k: "normalise", v: "HTTP://Example.org:80/a/../b → /b", nv: "one spelling" },
            { k: "bloom filter", v: "~1% of new URLs skipped, none refetched", nv: "~1% skipped", tone: "ok" },
            { k: "exact hash", v: "identical pages: hash of the text", nv: "exact copies" },
            { k: "simhash", v: "near-duplicates: ≤ 3 bits apart", nv: "≤ 3 bits apart" },
          ],
          l: ["no false negatives: nothing seen is refetched", "mirrors, print views, session IDs"],
          nl: ["no false negatives", "mirrors, print views"],
        },
      },
      {
        c: "Spider traps, like an endless calendar, break no rule and never end. Cap URL length and depth, budget pages per host, spot repeats.",
        f: {
          kick: "2 · spider traps",
          kt: "bad",
          rows: [
            { k: "trap", v: "next month → next month → forever", nv: "endless calendar", tone: "bad" },
            { k: "caps", v: "max URL length and path depth", nv: "length, depth" },
            { k: "budget", v: "pages per host per crawl cycle", nv: "per-host budget", tone: "ok" },
            { k: "patterns", v: "repeating segments /a/b/a/b/", nv: "/a/b/a/b/" },
          ],
          l: ["also: session IDs appended to every link", "deprioritise hosts that yield near-duplicates"],
          nl: ["session-ID links too", "deprioritise dup hosts"],
        },
      },
    ],
  },
  {
    id: "fail",
    label: "Trade-offs",
    steps: [
      {
        c: "Fetchers lease URLs with a timeout. If one crashes, unfinished URLs return to their host queue; repeat offenders go to a dead-letter queue.",
        f: {
          kick: "a fetcher crashes",
          kt: "warn",
          on: ALLN,
          st: { fe: { tone: "bad", sub: "crashed", ns: "crashed" }, fr: { tone: "warn", sub: "lease expires", ns: "re-queue" } },
          go: [{ r: ["fr", "fe"], a: 0.1, b: 0.5, tone: "warn" }],
          l: ["a lease, not a hand-off: nothing is lost", "parser-crashing pages → dead-letter queue"],
          nl: ["leases: nothing lost", "poison pages → DLQ"],
        },
      },
      {
        c: "Every recrawl costs a new page. Recrawl by observed change rate, and use If-Modified-Since or ETag so unchanged pages cost a 304.",
        f: {
          kick: "freshness vs coverage",
          rows: [
            { k: "changed last time", v: "come back sooner", nv: "sooner", tone: "lit" },
            { k: "rarely changes", v: "come back later", nv: "later" },
            { k: "conditional GET", v: "unchanged → 304, no body", nv: "304, no body", tone: "ok" },
          ],
          l: ["news-like pages in hours, most in weeks", "the budget is shared with discovery"],
          nl: ["news: hours · rest: weeks", "budget shared"],
        },
      },
      {
        c: "If robots.txt returns 404, the site may be crawled; if it is unreachable (5xx), assume everything is disallowed for now and retry later.",
        f: {
          kick: "robots.txt and hostile servers",
          kt: "warn",
          rows: [
            { k: "robots 4xx", v: "may crawl the site (RFC 9309)", nv: "may crawl", tone: "ok" },
            { k: "robots 5xx", v: "assume all disallowed, retry later", nv: "assume disallow", tone: "bad" },
            { k: "slow servers", v: "timeouts, size cap, redirect cap", nv: "timeouts, caps" },
            { k: "indexer lag", v: "Kafka absorbs it; slow the crawl", nv: "slow the crawl" },
          ],
          l: ["a server dripping one byte a second", "must not hold a fetcher slot"],
          nl: ["byte-a-second servers", "must not hold a slot"],
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
