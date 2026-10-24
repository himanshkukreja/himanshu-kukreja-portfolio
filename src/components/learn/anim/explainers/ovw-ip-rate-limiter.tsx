/**
 * The whole problem, interview problem bank 02 (design a rate limiter): requirements and the estimate
 * (150,000 checks a second, ~100,000 ops a second per Redis shard → 4 shards, ~2 GB of counters);
 * the gateway design (limiter middleware, Redis Cluster, pushed rules, 429 + Retry-After); the deep dives
 * (fixed window's 2x burst, sliding window counter, token bucket, one atomic Lua script); failure modes.
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
  c: { x: 16, y: 150, w: 84, h: 52, label: "Clients", nl: "Users" },
  lb: { x: 116, y: 150, w: 60, h: 52, label: "LB" },
  rules: { x: 200, y: 44, w: 132, h: 48, label: "Rules" },
  gw: { x: 200, y: 138, w: 132, h: 76, label: "Gateway" },
  rd: { x: 200, y: 254, w: 132, h: 56, label: "Redis" },
  be: { x: 486, y: 138, w: 98, h: 76, label: "Services", nl: "APIs" },
  rej: { x: 370, y: 254, w: 96, h: 56, label: "429" },
};
const EDGES: [string, string, boolean?][] = [
  ["c", "lb"],
  ["lb", "gw"],
  ["rules", "gw", true],
  ["gw", "rd"],
  ["gw", "be"],
  ["gw", "rej"],
];
const BASE = ["c", "lb", "gw", "rd", "be"];
const ALLN = [...BASE, "rej", "rules"];

const V: { id: string; label: string; steps: Sp[] }[] = [
  {
    id: "req",
    label: "Requirements",
    steps: [
      {
        c: "A rate limiter decides on every request whether a client is within its limit, like 100 a minute on the free plan, and answers 429 if not.",
        f: {
          kick: "the brief",
          rows: [
            { k: "keys", v: "user, API key, IP, endpoint group", nv: "user, key, IP" },
            { k: "rule", v: "e.g. free plan: 100 requests a minute", nv: "free: 100/min" },
            { k: "reply", v: "429 + Retry-After + remaining", nv: "429 + Retry-After", tone: "bad" },
            { k: "rules", v: "change without a deploy", nv: "no deploy" },
          ],
          l: ["server side, in the API gateway", "per user, per key, per IP, per endpoint group"],
          nl: ["in the API gateway", "per user, key or IP"],
        },
      },
      {
        c: "It runs on every request, so it must add under 2 ms, stay accurate across 40 gateways, and never take the API down with it.",
        f: {
          kick: "non-functional",
          rows: [
            { k: "latency", v: "< 2 ms added at p99", nv: "< 2 ms p99", tone: "lit" },
            { k: "accuracy", v: "a few % over is fine; 2x is not", nv: "2x is not ok" },
            { k: "availability", v: "a limiter failure ≠ an API outage", nv: "never the outage", tone: "ok" },
            { k: "shared state", v: "40 gateways enforce one limit", nv: "40 gateways, 1 limit" },
          ],
          l: ["the limiter sits on the hot path of every call", "it protects the API; it must not become its weak spot"],
          nl: ["on every request's path", "must not be the weak spot"],
        },
      },
      {
        c: "At 150,000 checks a second and about 100,000 per Redis shard you need at least 2 shards; run 4. The counters fit in about 2 GB.",
        f: {
          kick: "estimate",
          mx: 150000,
          rows: [
            { k: "peak", v: "150,000 checks/s (assumed)", nv: "150,000/s", m: 150000, tone: "lit" },
            { k: "per shard", v: "~100,000 ops/s → run 4 shards", nv: "→ 4 shards", m: 100000 },
            { k: "memory", v: "10M × 2 rules × 100 B ≈ 2 GB", nv: "≈ 2 GB", tone: "ok" },
            { k: "cost", v: "one atomic call per request", nv: "1 call/request" },
          ],
          l: ["memory is easy; the operation rate sets the shard count", "4 shards leaves headroom for peaks and failover"],
          nl: ["op rate sets shard count", "4 shards for headroom"],
        },
      },
    ],
  },
  {
    id: "design",
    label: "Design",
    steps: [
      {
        c: "Each gateway builds a key like user:8812:search, makes one atomic call to Redis, and forwards the request if it is allowed.",
        f: {
          kick: "allowed",
          on: BASE,
          st: { gw: { tone: "lit", sub: "limiter", ns: "limiter" }, rd: { sub: "counters", ns: "counters" }, be: { tone: "ok", sub: "allowed", ns: "ok" } },
          go: [{ r: ["c", "lb", "gw", "rd"], a: 0, b: 0.6, tone: "lit" }, { r: ["gw", "be"], a: 0.65, b: 0.98, tone: "ok" }],
          l: ["key = who + what: user:8812:search", "Redis Cluster shards the keys across nodes"],
          nl: ["key: user:8812:search", "keys spread over shards"],
        },
      },
      {
        c: "Over the limit, the gateway answers 429 with Retry-After and the remaining quota, and the backend never sees the request.",
        f: {
          kick: "rejected",
          kt: "bad",
          on: [...BASE, "rej"],
          st: { gw: { tone: "lit", sub: "over limit", ns: "over" }, rej: { tone: "bad", sub: "Retry-After", ns: "retry" } },
          go: [{ r: ["c", "lb", "gw", "rd"], a: 0, b: 0.55, tone: "lit" }, { r: ["gw", "rej"], a: 0.6, b: 0.98, tone: "bad" }],
          l: ["429 Too Many Requests · Retry-After: 41", "X-RateLimit-Limit / Remaining / Reset headers"],
          nl: ["429 · Retry-After: 41", "limit, remaining, reset"],
        },
      },
      {
        c: "Rules live in a rules service and are pushed to gateways on change, so the request path never reads them and no deploy is needed.",
        f: {
          kick: "rules, pushed",
          on: ALLN,
          st: { rules: { tone: "sky", sub: "push", ns: "push" }, gw: { sub: "local rules", ns: "local" } },
          go: [{ r: ["rules", "gw"], a: 0.1, b: 0.8, tone: "sky" }],
          l: ["free.search: sliding window, 100 per 60 s", "a new plan or an emergency limit, no deploy"],
          nl: ["free.search: 100 / 60 s", "no deploy needed"],
        },
      },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    steps: [
      {
        c: "A fixed window lets a client send 100 at 12:00:59 and 100 more at 12:01:00: 200 requests in two seconds, double the limit.",
        f: {
          kick: "1 · the fixed window's edge",
          kt: "bad",
          mx: 200,
          rows: [
            { k: "12:00:59", v: "100 requests · window 1 full", nv: "100 · window 1", m: 100 },
            { k: "12:01:00", v: "100 more · window 2 fresh", nv: "100 · window 2", m: 100 },
            { k: "2 seconds", v: "200 requests: 2x the limit", nv: "200: 2x", m: 200, tone: "bad" },
          ],
          l: ["both windows look fine; the backend does not", "sliding windows remove this edge"],
          nl: ["both windows look fine", "sliding windows fix it"],
        },
      },
      {
        c: "A sliding window counter weights last window's count: 80 × 0.75 + 30 = 90, under 100, so allow. Two integers per key.",
        f: {
          kick: "1 · sliding window counter",
          kt: "ok",
          mx: 100,
          rows: [
            { k: "last window", v: "80 requests × (1 − 0.25)", nv: "80 × 0.75", m: 60 },
            { k: "this window", v: "30 so far, 15 s in", nv: "30, 15 s in", m: 30 },
            { k: "estimate", v: "60 + 30 = 90 < 100 → allow", nv: "90 → allow", m: 90, tone: "ok" },
          ],
          l: ["approximate: assumes last window was evenly spread", "the usual default for API quotas"],
          nl: ["approximate, small error", "default for API quotas"],
        },
      },
      {
        c: "A token bucket allows a burst up to its capacity, say 20, then the refill rate of 10 a second. It suits clients with legitimate bursts.",
        f: {
          kick: "1 · token bucket",
          mx: 20,
          rows: [
            { k: "capacity", v: "20 tokens: the biggest burst", nv: "20 burst", m: 20 },
            { k: "refill", v: "10 tokens a second, steady", nv: "10/s", m: 10 },
            { k: "state", v: "tokens left + last refill time", nv: "2 numbers" },
            { k: "fits", v: "a mobile app syncing on launch", nv: "bursty clients", tone: "ok" },
          ],
          l: ["sliding log is exact but stores every timestamp", "leaky bucket smooths, but adds queueing delay"],
          nl: ["sliding log: exact, costly", "leaky bucket: adds delay"],
        },
      },
      {
        c: "Two gateways doing GET, compare, SET can both read 99 and allow. One atomic Lua script per check makes the second caller see the first.",
        f: {
          kick: "2 · counting across 40 gateways",
          rows: [
            { k: "the race", v: "GET 99, GET 99 → both allow: 101", nv: "both read 99", tone: "bad" },
            { k: "the fix", v: "one Lua script: check + INCR", nv: "atomic script", tone: "ok" },
            { k: "hash tag", v: "{user:8812:search} → one shard", nv: "one shard" },
            { k: "clocks", v: "NTP; ms of skew shifts a window edge", nv: "NTP, small skew" },
          ],
          l: ["scripts run without interleaving", "both window keys must live on the same shard"],
          nl: ["scripts don't interleave", "both keys on one shard"],
        },
      },
    ],
  },
  {
    id: "fail",
    label: "Trade-offs",
    steps: [
      {
        c: "If Redis is unreachable, fail open for ordinary limits: allow, log and alert. Fail closed only for flows like login or OTP sends.",
        f: {
          kick: "redis unreachable",
          kt: "warn",
          on: BASE,
          st: { rd: { tone: "bad", sub: "timeout", ns: "down" }, gw: { tone: "warn", sub: "fail open", ns: "open" }, be: { tone: "ok", sub: "still up", ns: "up" } },
          go: [{ r: ["c", "lb", "gw", "be"], a: 0.05, b: 0.95, tone: "ok" }],
          l: ["a few-ms timeout on the Redis call", "login and OTP: a conservative local limit instead"],
          nl: ["few-ms timeout", "login/OTP: local limit"],
        },
      },
      {
        c: "One client at 50,000 requests a second would hammer one shard. A local deny cache answers 429 in the gateway until the reset.",
        f: {
          kick: "the noisy client",
          kt: "bad",
          on: [...BASE, "rej"],
          st: { gw: { tone: "ok", sub: "deny cache", ns: "deny" }, rd: { sub: "1 call/reset", ns: "quiet" }, rej: { tone: "bad", sub: "local", ns: "local" } },
          go: [0, 0.15, 0.3, 0.45].map((a) => ({ r: ["c", "lb", "gw", "rej"], a, b: a + 0.5, tone: "bad" as Tone })),
          l: ["50,000/s on one key = one hot shard", "coarse per-IP limits at the edge drop floods first"],
          nl: ["one key, one hot shard", "edge limits drop floods"],
        },
      },
      {
        c: "Across regions, split the limit (4 regions × 25) or enforce locally and reconcile asynchronously, accepting a short overshoot.",
        f: {
          kick: "multi-region",
          rows: [
            { k: "global counter", v: "a cross-region call per request: too slow", nv: "too slow", tone: "bad" },
            { k: "split", v: "4 regions × 25 = 100 a minute", nv: "4 × 25 = 100", tone: "ok" },
            { k: "reconcile", v: "local counts, synced asynchronously", nv: "sync async", tone: "warn" },
            { k: "clients", v: "Retry-After + backoff with jitter", nv: "backoff + jitter" },
          ],
          l: ["validate and roll out rule changes gradually", "watch the reject rate per rule"],
          nl: ["roll out rules gradually", "watch rejects per rule"],
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
