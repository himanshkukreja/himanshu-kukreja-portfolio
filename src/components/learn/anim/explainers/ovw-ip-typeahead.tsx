/**
 * The whole problem, interview problem bank 09 (design typeahead / autocomplete): requirements and the
 * estimate (~70,000 requests a second, ~100M prefixes ≈ 10 GB in memory, ~10 servers a region); the online
 * path (debounced client, CDN for short prefixes, in-memory suggest servers) and the offline path (logs,
 * Kafka, batch + trending counts, builder, S3 snapshots); the deep dives (top-10 per trie node, sharding by
 * measured ranges, decay, distinct users, trending); and failure modes (bad snapshots, staleness, typos).
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
  cl: { x: 16, y: 56, w: 88, h: 56, label: "Client" },
  cdn: { x: 128, y: 56, w: 80, h: 56, label: "CDN" },
  sg: { x: 232, y: 50, w: 120, h: 68, label: "Suggest" },
  s3: { x: 500, y: 150, w: 84, h: 52, label: "S3" },
  lg: { x: 16, y: 250, w: 88, h: 52, label: "Logs" },
  kf: { x: 128, y: 250, w: 80, h: 52, label: "Kafka" },
  ag: { x: 232, y: 250, w: 120, h: 52, label: "Counts" },
  bd: { x: 376, y: 250, w: 100, h: 52, label: "Builder" },
};
const EDGES: [string, string, boolean?][] = [
  ["cl", "cdn"],
  ["cdn", "sg"],
  ["cl", "lg", true],
  ["lg", "kf"],
  ["kf", "ag"],
  ["ag", "bd"],
  ["bd", "s3"],
  ["s3", "sg", true],
];
const ON = ["cl", "cdn", "sg"];
const OFF = ["lg", "kf", "ag", "bd", "s3"];
const ALLN = [...ON, ...OFF];

const V: { id: string; label: string; steps: Sp[] }[] = [
  {
    id: "req",
    label: "Requirements",
    steps: [
      {
        c: "Typeahead shows up to ten suggested queries for the prefix typed so far, ranked by popularity, with trending terms within the hour.",
        f: {
          kick: "the brief",
          rows: [
            { k: "suggest", v: "prefix → up to 10 completions", nv: "prefix → top 10" },
            { k: "rank", v: "popularity, favouring recent", nv: "popular, recent" },
            { k: "trending", v: "appears within about an hour", nv: "within an hour", tone: "lit" },
            { k: "blocklist", v: "offensive or harmful never shown", nv: "blocklisted", tone: "bad" },
          ],
          l: ["two systems: an online lookup", "and an offline pipeline that decides the answers"],
          nl: ["an online lookup", "and an offline pipeline"],
        },
      },
      {
        c: "Suggestions must render within 100 ms of a keystroke, which leaves the server 10 to 20 ms. Every keystroke is a request.",
        f: {
          kick: "non-functional",
          rows: [
            { k: "latency", v: "< 100 ms keystroke to screen", nv: "< 100 ms", tone: "lit" },
            { k: "server", v: "~10–20 ms of that", nv: "~10–20 ms" },
            { k: "throughput", v: "every keystroke is a request", nv: "per keystroke" },
            { k: "freshness", v: "minutes to hours behind is fine", nv: "minutes-hours", tone: "ok" },
          ],
          l: ["the online part can't compute anything", "it must look up a ready answer"],
          nl: ["online can't compute", "it looks up answers"],
        },
      },
      {
        c: "About 70,000 requests a second. Roughly 100M prefixes with their top 10 come to about 10 GB, which fits in memory on one server.",
        f: {
          kick: "estimate",
          mx: 140000,
          rows: [
            { k: "requests", v: "6B a day ≈ 70,000/s · peak 140,000", nv: "≈ 70,000/s", m: 140000, tone: "lit" },
            { k: "queries", v: "10M popular, ~20 chars each", nv: "10M queries" },
            { k: "data", v: "~100M prefixes × 100 B ≈ 10 GB", nv: "≈ 10 GB", tone: "ok" },
            { k: "servers", v: "20,000/s each → ~10 a region", nv: "~10 a region" },
            { k: "short prefixes", v: "~18,000 of 1–3 letters: cacheable", nv: "~18,000: cacheable" },
          ],
          l: ["10 GB fits in RAM: replicate, don't shard", "every request is one in-memory lookup"],
          nl: ["replicate, don't shard", "one lookup per request"],
        },
      },
    ],
  },
  {
    id: "design",
    label: "Design",
    steps: [
      {
        c: "The client waits for a ~100 ms pause before asking, cancels stale requests, and caches answers so deleting a letter costs nothing.",
        f: {
          kick: "the keystroke path",
          on: ON,
          st: { cl: { tone: "lit", sub: "debounce", ns: "wait" }, sg: { sub: "in memory", ns: "memory" } },
          go: [{ r: ["cl", "cdn", "sg"], a: 0.05, b: 0.95, tone: "lit" }],
          l: ["GET /v1/suggest?q=sys&limit=10", "an in-memory lookup, nothing computed"],
          nl: ["GET /suggest?q=sys", "one in-memory lookup"],
        },
      },
      {
        c: "Short prefixes are few and very popular, so the CDN answers most of them from a 5-minute cache before they reach a server.",
        f: {
          kick: "the edge cache",
          kt: "ok",
          on: ON,
          st: { cdn: { tone: "ok", sub: "5 min", ns: "5 min" }, cl: { sub: "\"s\", \"sy\"", ns: "short" } },
          go: [0, 0.2, 0.4].map((a) => ({ r: ["cl", "cdn"], a, b: a + 0.45, tone: "ok" as Tone })),
          l: ["~18,000 prefixes of one to three letters", "Cache-Control: public, max-age=300"],
          nl: ["~18,000 short prefixes", "max-age=300"],
        },
      },
      {
        c: "Offline, searches go to Kafka. A batch job counts long-term popularity, a stream job counts the last hour, and a builder ranks and filters.",
        f: {
          kick: "the offline pipeline",
          on: ALLN,
          st: { ag: { tone: "sky", sub: "daily + hourly", ns: "day + hour" }, bd: { tone: "lit", sub: "top 10", ns: "top 10" }, s3: { sub: "snapshot", ns: "snap" } },
          go: [{ r: ["cl", "lg", "kf", "ag", "bd", "s3"], a: 0.02, b: 0.98, tone: "sky" }],
          l: ["Spark: daily counts with decay · Flink: last hour", "blocklist applied before publishing"],
          nl: ["daily + last-hour counts", "blocklist first"],
        },
      },
      {
        c: "Suggest servers load each new snapshot in the background and swap a pointer once it's complete, so no request sees half old, half new.",
        f: {
          kick: "snapshot swap",
          kt: "ok",
          on: ALLN,
          st: { sg: { tone: "ok", sub: "swap", ns: "swap" }, s3: { tone: "sky", sub: "v42", ns: "v42" } },
          go: [{ r: ["s3", "sg"], a: 0.1, b: 0.9, tone: "sky" }],
          l: ["a full snapshot daily, a trending delta hourly", "keep the previous version to roll back"],
          nl: ["daily full, hourly delta", "keep the last version"],
        },
      },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      {
        c: "A plain trie finds 'sys' in three steps but would then walk millions of nodes for the top 10. So each node stores its own top-10 list.",
        f: {
          kick: "1 · a trie with stored answers",
          rows: [
            { k: "walk the subtree", v: "millions of nodes for 's'", nv: "millions of nodes", tone: "bad" },
            { k: "top 10 per node", v: "one step per character, then done", nv: "1 step per char", tone: "ok" },
            { k: "or flatten", v: "hash map: prefix → 10 query IDs", nv: "prefix → 10 IDs" },
            { k: "ids, not strings", v: "each query string stored once", nv: "strings once" },
          ],
          l: ["cost grows with the prefix length, ≤ 20", "not with the number of queries"],
          nl: ["cost ∝ prefix length", "not query count"],
        },
      },
      {
        c: "If the data outgrows one machine, shard by prefix ranges measured by traffic, not by first letter: far more queries start with 's' than 'x'.",
        f: {
          kick: "1 · when it stops fitting",
          kt: "warn",
          mx: 100,
          rows: [
            { k: "by first letter", v: "'s' shard ≫ 'x' shard: skewed", nv: "skewed", m: 100, tone: "bad" },
            { k: "by measured range", v: "e.g. 'sa–sh' is its own shard", nv: "'sa–sh' alone", m: 40, tone: "ok" },
            { k: "routing", v: "a small table at the load balancer", nv: "routing table" },
          ],
          l: ["more languages and markets grow the data", "split where the traffic is, not the alphabet"],
          nl: ["markets grow the data", "split by traffic"],
        },
      },
      {
        c: "Rank by counts with time decay, say a 7-day half-life, counting distinct users so a bot can't promote a phrase. Trending adds a boost.",
        f: {
          kick: "2 · ranking",
          rows: [
            { k: "long-term", v: "daily counts, 7-day half-life", nv: "7-day half-life" },
            { k: "distinct users", v: "one bot repeating = one user", nv: "bots count once", tone: "ok" },
            { k: "trending", v: "last hour vs normal rate → boost", nv: "hourly boost", tone: "lit" },
            { k: "minimum users", v: "rare queries may be private: drop", nv: "drop rare queries", tone: "warn" },
          ],
          l: ["a term trending at 9 AM appears within the hour", "score = long-term + trending boost"],
          nl: ["trending: within an hour", "long-term + boost"],
        },
      },
      {
        c: "Keep suggestions global so they cache well, and mix in the user's own recent searches on the client, which already has them.",
        f: {
          kick: "2 · personalisation, cheaply",
          kt: "ok",
          on: ON,
          st: { cl: { tone: "ok", sub: "+ recent", ns: "+ mine" }, cdn: { tone: "ok", sub: "shared", ns: "shared" }, sg: { sub: "global", ns: "global" } },
          go: [{ r: ["cl", "cdn"], a: 0.1, b: 0.6, tone: "ok" }],
          l: ["per-user server responses can't be cached", "the client merges locally"],
          nl: ["per-user = uncacheable", "merge on the client"],
        },
      },
    ],
  },
  {
    id: "fail",
    label: "Trade-offs",
    steps: [
      {
        c: "A builder bug could publish bad suggestions everywhere. Validate each snapshot, roll it out to a few servers first, and keep the last one.",
        f: {
          kick: "a bad snapshot",
          kt: "bad",
          on: ALLN,
          st: { bd: { tone: "bad", sub: "bug", ns: "bug" }, s3: { tone: "warn", sub: "validate", ns: "check" }, sg: { tone: "ok", sub: "previous", ns: "prev" } },
          l: ["check size, sample lookups, the blocklist", "canary first; roll back in one step"],
          nl: ["check before publishing", "canary, then roll back"],
        },
      },
      {
        c: "A dead suggest server just leaves the pool, since every server holds everything. A new one loads the latest snapshot before taking traffic.",
        f: {
          kick: "a server dies",
          kt: "warn",
          on: ALLN,
          st: { sg: { tone: "warn", sub: "1 of 10 down", ns: "1 down" }, s3: { tone: "sky", sub: "latest", ns: "latest" } },
          go: [{ r: ["s3", "sg"], a: 0.1, b: 0.9, tone: "sky" }],
          l: ["full replicas: no data is lost", "warm before joining the load balancer"],
          nl: ["full replicas: no loss", "warm, then join"],
        },
      },
      {
        c: "Freshness is hourly, not per search; the edge cache can lag a trend by 5 minutes; typos get extra keys, since fuzzy matching is costly.",
        f: {
          kick: "freshness, staleness, typos",
          rows: [
            { k: "freshness", v: "hourly deltas + daily builds", nv: "hourly + daily", tone: "ok" },
            { k: "cdn", v: "up to 5 min behind: purge or accept", nv: "≤ 5 min behind", tone: "warn" },
            { k: "typos", v: "\"sytem\" → add misspelling keys", nv: "misspelling keys" },
            { k: "fuzzy", v: "much costlier per request", nv: "costly", tone: "bad" },
          ],
          l: ["real-time updates would write on every read server", "rarely worth it for suggestions"],
          nl: ["real-time: costly writes", "rarely worth it"],
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
