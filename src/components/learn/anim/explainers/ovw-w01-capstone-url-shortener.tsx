/**
 * The whole capstone, week 1 (TinyLink, a URL shortener at scale): requirements and estimates
 * (1,160 writes/s, 120,000 redirects/s viral target, ~300 TB, 62^7 codes); the architecture
 * (CDN, ALB, API and Redirect services, Redis, sharded PostgreSQL, Kafka); five deep dives (key
 * ranges, hot URLs, hybrid sharding, tiered rate limits, consistency per operation); 10x and failures.
 */
import { Box, defineExplainer, ease, lerp, seg, Meter, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 380;
type Pt = { x: number; y: number };
type R = { x: number; y: number; w: number; h: number };
const N: Record<string, R & { label: string; nl?: string }> = {
  c: { x: 16, y: 140, w: 92, h: 52, label: "Clients", nl: "Users" },
  cdn: { x: 126, y: 140, w: 84, h: 52, label: "CDN" },
  alb: { x: 228, y: 140, w: 84, h: 52, label: "ALB" },
  api: { x: 330, y: 66, w: 124, h: 56, label: "API svc", nl: "API" },
  rs: { x: 330, y: 214, w: 124, h: 56, label: "Redirect" },
  pg: { x: 470, y: 66, w: 114, h: 56, label: "PostgreSQL", nl: "Postgres" },
  rd: { x: 470, y: 214, w: 114, h: 56, label: "Redis" },
  kf: { x: 330, y: 290, w: 124, h: 40, label: "Kafka" },
};
const E: [string, string, string][] = [
  ["c", "cdn", "M108 166H126"],
  ["cdn", "alb", "M210 166H228"],
  ["alb", "api", "M312 166H322V94H330"],
  ["alb", "rs", "M312 166H322V242H330"],
  ["api", "pg", "M454 94H470"],
  ["rs", "rd", "M454 242H470"],
  ["rd", "pg", "M527 214V122"],
  ["rs", "kf", "M392 270V290"],
];
const REDIRECT: Pt[] = [{ x: 108, y: 166 }, { x: 322, y: 166 }, { x: 322, y: 242 }, { x: 470, y: 242 }, { x: 527, y: 242 }, { x: 527, y: 122 }];
const CREATE: Pt[] = [{ x: 108, y: 166 }, { x: 322, y: 166 }, { x: 322, y: 94 }, { x: 470, y: 94 }];
const CLICK: Pt[] = [{ x: 392, y: 262 }, { x: 392, y: 300 }];
function walk(pts: Pt[], p: number): Pt {
  const segs = pts.slice(1).map((q, i) => Math.abs(q.x - pts[i].x) + Math.abs(q.y - pts[i].y));
  let d = p * segs.reduce((a, b) => a + b, 0);
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i] || i === segs.length - 1) {
      const k = segs[i] ? Math.min(1, d / segs[i]) : 1;
      return { x: lerp(pts[i].x, pts[i + 1].x, k), y: lerp(pts[i].y, pts[i + 1].y, k) };
    }
    d -= segs[i];
  }
  return pts[pts.length - 1];
}

type St = { tone?: Tone; sub?: string; ns?: string; dim?: boolean };
type Row = { k: string; v: string; nv?: string; tone?: Tone; m?: number };
type Fr = { kick: string; kt?: Tone; on?: string[]; st?: Record<string, St>; rows?: Row[]; flows?: { pts: Pt[]; a: number; b: number; tone?: Tone }[]; l: [string, string]; nl?: [string, string] };
const ALL = ["c", "cdn", "alb", "api", "rs", "pg", "rd", "kf"];

function frame(v: string, s: number): Fr {
  if (v === "req") {
    if (s === 0) return { kick: "TinyLink · what it does", rows: [{ k: "shorten", v: "7 chars of 62 (a-z, A-Z, 0-9)", nv: "7 of 62 chars" }, { k: "redirect", v: "fast; 404 if unknown", nv: "fast · 404" }, { k: "analytics", v: "clicks, eventually consistent", nv: "eventual" }, { k: "manage", v: "expire after 5 years", nv: "5-year expiry" }, { k: "API", v: "keys · free tier 100 req/min", nv: "100/min free" }], l: ["100M new URLs a day · 10:1 reads to writes", "each creation gets its own unique code"], nl: ["100M URLs a day", "10:1 reads to writes"] };
    if (s === 1) return { kick: "non-functional", rows: [{ k: "redirect", v: "< 100 ms p99 · 99.99%", nv: "< 100 ms", tone: "lit" }, { k: "create", v: "< 500 ms p99 · 99.9%", nv: "< 500 ms" }, { k: "analytics", v: "< 1 s p99", nv: "< 1 s" }, { k: "codes", v: "never duplicated, never lost", nv: "unique", tone: "ok" }], l: ["the redirect is the critical path", "it must work even during partial failures"], nl: ["redirect: critical path", "works in partial failure"] };
    if (s === 2) return { kick: "traffic estimate", rows: [{ k: "writes", v: "1,160/s · peak ~2,500", nv: "1,160/s", m: 2500 }, { k: "redirects", v: "11,600/s · peak ~25,000", nv: "11,600/s", m: 25000 }, { k: "viral 10x", v: "120,000/s: design target", nv: "120,000/s", tone: "bad", m: 120000 }], l: ["100M / 86,400 s ≈ 1,160 creates a second", "design for the viral spike, not the average"], nl: ["100M / 86,400 ≈ 1,160/s", "design for the spike"] };
    return { kick: "storage and code space", kt: "ok", rows: [{ k: "per URL", v: "~500 bytes with indexes", nv: "~500 B" }, { k: "5 years", v: "182.5B URLs = 91.25 TB", nv: "91.25 TB" }, { k: "replicated", v: "3x → ~300 TB", nv: "~300 TB", tone: "warn" }, { k: "62^7", v: "3.5 trillion codes · ~5% used", nv: "3.5T · ~5%", tone: "ok" }], l: ["182.5 billion URLs over 5 years", "7 characters leave plenty of room"], nl: ["182.5B URLs in 5 years", "7 chars: plenty of room"] };
  }
  if (v === "arch") {
    if (s === 0) return { kick: "the redirect path", on: ["c", "cdn", "alb", "rs", "rd", "pg"], st: { rs: { tone: "lit", sub: "GET /{code}", ns: "GET" }, cdn: { sub: "edge cache", ns: "edge" }, rd: { sub: "hot URLs", ns: "hot" }, pg: { sub: "sharded", ns: "shards" } }, flows: [{ pts: REDIRECT, a: 0, b: 0.95 }], l: ["CDN, then Redirect Service, Redis, PostgreSQL", "each miss falls one layer deeper"], nl: ["CDN → Redis → Postgres", "a miss goes deeper"] };
    if (s === 1) return { kick: "two services", on: ["c", "cdn", "alb", "rs", "rd", "pg", "api"], st: { api: { tone: "sky", sub: "POST /api/urls", ns: "POST" }, rs: { tone: "lit", sub: "10x the traffic", ns: "10x" } }, flows: [{ pts: CREATE, a: 0, b: 0.9, tone: "sky" }], l: ["the ALB routes creates and redirects apart", "different scaling and availability needs"], nl: ["creates and redirects split", "scaled independently"] };
    return { kick: "analytics off the path", on: ALL, st: { kf: { tone: "sky", sub: "", ns: "" }, rs: { tone: "lit", sub: "302 now", ns: "302" } }, flows: [{ pts: REDIRECT.slice(0, 4), a: 0, b: 0.6 }, { pts: CLICK, a: 0.6, b: 1, tone: "sky" }], l: ["each redirect publishes a click to Kafka", "fire-and-forget: counts lag a few seconds"], nl: ["clicks go to Kafka", "counts lag seconds"] };
  }
  if (v === "deep") {
    if (s === 0) return { kick: "1 · short codes", on: ALL, st: { api: { tone: "lit", sub: "range 0–9,999", ns: "next 42" } }, flows: [{ pts: CREATE, a: 0.1, b: 0.9, tone: "ok" }], l: ["each server takes a range of 10,000 counter values", "scrambled, base-62 → 7 chars · crash loses a few"], nl: ["ranges of 10,000 values", "a crash loses a few codes"] };
    if (s === 1) return { kick: "2 · hot URLs", kt: "bad", on: ALL, st: { cdn: { tone: "ok", sub: "95%+ hit", ns: "95%+" }, rs: { tone: "lit", sub: "local LRU", ns: "LRU" }, rd: { tone: "ok", sub: "suffix keys", ns: "replicas" } }, flows: [0, 0.15, 0.3].map((a) => ({ pts: REDIRECT.slice(0, 2), a, b: a + 0.3, tone: "bad" as Tone })), l: ["a viral URL: 100,000 req/s vs 10 for a normal one", "only ~5% gets past the CDN · suffix keys in Redis"], nl: ["viral: 100,000 req/s", "~5% passes the CDN"] };
    if (s === 2) return { kick: "3 · sharding", on: ALL, st: { pg: { tone: "lit", sub: "hash ring", ns: "ring" } }, flows: [{ pts: REDIRECT, a: 0.1, b: 0.95 }], l: ["consistent hashing on short_code for redirects", "a user_urls index sharded by user_id for lists"], nl: ["hash ring on short_code", "user_urls by user_id"] };
    if (s === 3) return { kick: "4 · rate limiting", on: ALL, st: { api: { tone: "warn", sub: "sliding window", ns: "window" }, rd: { tone: "warn", sub: "counters", ns: "counters" } }, flows: [{ pts: CREATE, a: 0, b: 0.5, tone: "warn" }], l: ["free 100/min · 1,000 · 10,000 · 100,000 enterprise", "sliding window in Redis, < 5 ms overhead"], nl: ["free: 100 req/min", "Redis sliding window"] };
    return { kick: "5 · replication", kt: "ok", on: ALL, st: { pg: { tone: "ok", sub: "sync + async", ns: "1 sync" } }, l: ["creates: strong, on the primary · redirects: any replica", "user's list: read-your-writes · delete: strong + purge"], nl: ["creates strong", "redirects: any replica"] };
  }
  if (s === 0) return { kick: "10x scale", on: ALL, st: { api: { sub: "10 → 100", ns: "→ 100" }, rs: { sub: "20 → 200", ns: "→ 200" }, rd: { sub: "3 → 30 nodes", ns: "→ 30" }, pg: { sub: "5 → 50 shards", ns: "→ 50" }, kf: { sub: "", ns: "" } }, l: ["stateless services just add instances", "Redis ~100K ops/s per node · PG ~10K writes/s per shard"], nl: ["stateless: add instances", "add nodes and shards"] };
  if (s === 1) return { kick: "failures", kt: "warn", on: ALL, st: { rd: { tone: "bad", sub: "down", ns: "down" }, pg: { tone: "ok", sub: "promoted", ns: "promote" } }, flows: [{ pts: [{ x: 454, y: 242 }, { x: 462, y: 242 }, { x: 462, y: 94 }, { x: 470, y: 94 }], a: 0.1, b: 0.9, tone: "warn" }], l: ["Redis down: fail open, read the database directly", "primary down: promote the sync replica"], nl: ["Redis down: use the DB", "promote the sync replica"] };
  return { kick: "edge cases", on: ALL, st: { pg: { tone: "lit", sub: "UNIQUE, retry", ns: "UNIQUE" }, rd: { tone: "warn", sub: "has expiry", ns: "expiry" }, api: { tone: "ok", sub: "idempotency key", ns: "idem key" } }, l: ["duplicate code: UNIQUE constraint, retry up to 3", "cached values carry expiry · idempotency keys on create"], nl: ["duplicate: retry ≤ 3", "check expiry on cache hit"] };
}

function Scene({ variant, step, t, narrow }: SceneProps) {
  const f = frame(variant, step);
  const l = narrow && f.nl ? f.nl : f.l;
  const on = f.on || [];
  const fresh = (k: string) => (variant === "arch" && step > 0 && !frame("arch", step - 1).on?.includes(k)) || (variant === "arch" && step === 0);
  return (
    <g>
      <Txt x={16} y={28} k="k" anchor="start" tone={f.kt}>
        {narrow ? f.kick.replace("TinyLink · ", "") : f.kick}
      </Txt>
      {f.rows && (
        <g>
          <Box {...N.c} label={narrow ? "Users" : "Clients"} />
          <Wire d="M108 166H126" arrow />
          <rect className="ax-box lit" x={126} y={44} width={W - 142} height={276} />
          {f.rows.map((r, i) => {
            const y = 76 + i * 50;
            return (
              <g key={r.k} opacity={ease(seg(t, i * 0.12, i * 0.12 + 0.4))}>
                <Txt x={142} y={y} k="k" anchor="start" tone="mute">
                  {r.k}
                </Txt>
                <Txt x={142} y={y + 24} anchor="start" tone={r.tone}>
                  {narrow ? r.nv || r.v : r.v}
                </Txt>
                {r.m !== undefined && <Meter x={400} y={y + 12} w={164} h={14} value={r.m * ease(seg(t, 0.2, 0.9))} max={120000} tone={r.tone || "sky"} />}
              </g>
            );
          })}
        </g>
      )}
      {!f.rows && (
        <g>
          {E.filter(([a, b]) => on.includes(a) && on.includes(b)).map(([a, b, d]) => (
            <Wire key={a + b} d={d} arrow={b !== "pg" || a === "api"} />
          ))}
          {ALL.filter((k) => on.includes(k)).map((k) => {
            const n = N[k];
            const st = f.st?.[k] || {};
            return (
              <g key={k} opacity={fresh(k) ? ease(seg(t, 0, 0.4)) : 1}>
                <Box x={n.x} y={n.y} w={n.w} h={n.h} label={narrow ? n.nl || n.label : n.label} sub={narrow ? st.ns || undefined : st.sub || undefined} tone={st.tone} dim={st.dim} />
              </g>
            );
          })}
          {f.flows?.map((fl, i) => {
            const q = seg(t, fl.a, fl.b);
            if (q <= 0 || q >= 1) return null;
            const p = walk(fl.pts, ease(q));
            return <Token key={i} x={p.x} y={p.y} tone={fl.tone} />;
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
  variants: [
    {
      id: "req",
      label: "Requirements",
      steps: [
        { caption: "TinyLink: 100 million new URLs a day, ten redirects for every creation. Codes are 7 alphanumeric characters, links expire after 5 years, and the free API tier gets 100 requests a minute.", tween: 1600, ms: 3800 },
        { caption: "The redirect is the critical path: under 100 ms at p99 and 99.99% uptime. Creation can take 500 ms at 99.9%, and codes must never be duplicated or lost.", tween: 1400, ms: 3400 },
        { caption: "100 million a day over 86,400 seconds is about 1,160 creates a second and 11,600 redirects. A viral link spikes 10x, so the design target is 120,000 redirects a second.", tween: 1600, ms: 3600 },
        { caption: "At about 500 bytes each, 182.5 billion URLs over 5 years is 91.25 TB, about 300 TB replicated. 62 to the 7th is 3.5 trillion codes, so only about 5% get used.", tween: 1600, ms: 3600 },
      ],
    },
    {
      id: "arch",
      label: "Architecture",
      steps: [
        { caption: "A redirect goes through the CDN edge, the load balancer and the Redirect Service, which checks Redis and falls back to sharded PostgreSQL.", tween: 1800 },
        { caption: "Creation is a separate API service behind POST /api/urls, because redirects are 10x the traffic and need different scaling and availability.", tween: 1600 },
        { caption: "Every redirect publishes a click event to Kafka, fire-and-forget, so analytics never slow the redirect; counts arrive a few seconds later.", tween: 1800 },
      ],
    },
    {
      id: "deep",
      label: "Deep dives",
      steps: [
        { caption: "Short codes: a key service hands each API server a range of 10,000 counter values, scrambled and base-62 encoded to 7 characters. A crash wastes a few thousand codes, which is negligible.", tween: 1600, ms: 3800 },
        { caption: "Hot URLs: a viral link gets 100,000 requests a second. The CDN answers over 95% of them; local LRU caches, Redis replicas and suffixed keys absorb the rest.", tween: 1800, ms: 3600 },
        { caption: "Sharding: consistent hashing on short_code makes the redirect a direct lookup, and a user_urls index sharded by user_id lists a user's links.", tween: 1600 },
        { caption: "Rate limiting: tiers from 100 requests a minute (free) to 100,000 (enterprise), counted in a Redis sliding window that adds under 5 ms.", tween: 1200 },
        { caption: "Replication: one synchronous and two asynchronous replicas. Creates are strong on the primary, redirects read any replica, and deletes are strong plus a cache purge.", tween: 800, ms: 3600 },
      ],
    },
    {
      id: "scale",
      label: "Scale, failures",
      steps: [
        { caption: "At 10x, stateless services just add instances: 10 to 100 API servers, 20 to 200 redirect servers, 3 to 30 Redis nodes, 5 to 50 PostgreSQL shards.", tween: 800, ms: 3400 },
        { caption: "If Redis goes down, redirects fail open to the database, slower but working. If the primary goes down, the sync replica is promoted and creation resumes.", tween: 1600, ms: 3400 },
        { caption: "Edge cases: a duplicate code hits the UNIQUE constraint and retries up to 3 times; cached values carry their expiry; idempotency keys make a retried create safe.", tween: 800, ms: 3600 },
      ],
    },
  ],
  Scene,
});
