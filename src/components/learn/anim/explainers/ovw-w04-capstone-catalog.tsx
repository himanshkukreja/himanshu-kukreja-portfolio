/**
 * Week 4 capstone, the whole interview (global e-commerce product catalog): requirements (50M
 * products, 500M views/day, 100x flash sales), the estimate (6,000 → 600,000 req/s, ~300 GB of
 * Redis, >99% hit ratio), the tiered request path, the four deep dives (thundering herd,
 * per-type invalidation, personalization, the cache matrix) and scaling / Redis failure.
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

/* ---------------------------------------------------------------- overview engine (shared shape) */
type K = "t" | "s" | "k" | "d";
type Nd = [x: number, y: number, w: number, h: number, label: string];
type St = {
  c: string; // caption (narrated)
  k: string; // kicker, top left
  on: Record<string, string>; // visible nodes → "tone:sub|narrow sub" (tone: lit ok bad warn sky mute dim)
  w?: string[]; // wires "a>b:tone" (">" solid, "~" dashed, ")" vertical-then-horizontal, "^" horizontal-then-vertical)
  go?: string[]; // moving tokens "a>b:tone*count@delay"
  m?: [x: number, y: number, w: number, label: string, v: number, max: number, tone?: Tone];
  x?: [x: number, y: number, text: string, k?: K, anchor?: "start" | "middle" | "end"][];
  n: string; // bottom note "tone:text|narrow"
  tw?: number;
  ms?: number;
  lp?: boolean;
};
type Vr = { id: string; label: string; s: St[] };
type P = { x: number; y: number };
const TONES = ["lit", "ok", "bad", "warn", "sky", "mute", "dim"];
const nar = (s: string, n: boolean) => {
  const i = s.indexOf("|");
  return i < 0 ? s : n ? s.slice(i + 1) : s.slice(0, i);
};
const tn = (v: string): [Tone | "dim", string] => {
  const i = v.indexOf(":");
  const h = i < 0 ? v : v.slice(0, i);
  return TONES.includes(h) ? [h as Tone | "dim", i < 0 ? "" : v.slice(i + 1)] : [undefined, v];
};
const WR = /^(\w+)([>~)^])(\w+)(?::(\w+))?(?:\*(\d+))?(?:@([\d.]+))?$/;
function route(a: Nd, b: Nd, mode: string): P[] {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;
  if (mode === "^") {
    const qx = bx + bw / 2;
    const down = by > ay;
    const q = { x: qx, y: down ? by : by + bh };
    if (qx > ax && qx < ax + aw) return [{ x: qx, y: down ? ay + ah : ay }, q];
    const p = { x: qx > ax ? ax + aw : ax, y: ay + ah / 2 };
    return [p, { x: qx, y: p.y }, q];
  }
  if (mode === ")") {
    const qy = by + bh / 2;
    const p = { x: ax + aw / 2, y: qy > ay ? ay + ah : ay };
    return [p, { x: p.x, y: qy }, { x: bx > ax ? bx : bx + bw, y: qy }];
  }
  if (ax + aw <= bx || bx + bw <= ax) {
    const r = bx > ax;
    const p = { x: r ? ax + aw : ax, y: ay + ah / 2 };
    const q = { x: r ? bx : bx + bw, y: by + bh / 2 };
    const mx = (p.x + q.x) / 2;
    return p.y === q.y ? [p, q] : [p, { x: mx, y: p.y }, { x: mx, y: q.y }, q];
  }
  const d = by > ay;
  const p = { x: ax + aw / 2, y: d ? ay + ah : ay };
  const q = { x: bx + bw / 2, y: d ? by : by + bh };
  const my = (p.y + q.y) / 2;
  return p.x === q.x ? [p, q] : [p, { x: p.x, y: my }, { x: q.x, y: my }, q];
}
function along(pts: P[], f: number): P {
  const ls = pts.slice(1).map((q, i) => Math.abs(q.x - pts[i].x) + Math.abs(q.y - pts[i].y));
  let r = f * ls.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ls.length; i++) {
    if (r <= ls[i] || i === ls.length - 1) {
      const u = ls[i] ? Math.min(1, r / ls[i]) : 1;
      return { x: lerp(pts[i].x, pts[i + 1].x, u), y: lerp(pts[i].y, pts[i + 1].y, u) };
    }
    r -= ls[i];
  }
  return pts[0];
}
function Overview({ V, N, p }: { V: Vr[]; N: Record<string, Nd>; p: SceneProps }) {
  const v = V.find((x) => x.id === p.variant) ?? V[0];
  const s = v.s[Math.min(p.step, v.s.length - 1)];
  const pr = p.step > 0 ? v.s[p.step - 1] : undefined;
  const e = ease(p.t);
  const wires = [...(s.w ?? []), ...(s.go ?? [])].map((w) => WR.exec(w)).filter((m): m is RegExpExecArray => !!m && m[1] in s.on && m[3] in s.on && !!N[m[1]] && !!N[m[3]]);
  const toks = (s.go ?? []).flatMap((g, gi) => {
    const m = WR.exec(g);
    if (!m || !N[m[1]] || !N[m[3]]) return [];
    const pts = route(N[m[1]], N[m[3]], m[2]);
    const c = Number(m[5] ?? 1);
    return Array.from({ length: c }, (_, i) => {
      const d = Number(m[6] ?? 0); // start delay, as a fraction of the tween
      const u = seg(p.t, d + i * 0.1, d + (1 - d) * 0.6 + i * 0.1);
      const f = s.lp ? (p.clock * 0.5 + i / c) % 1 : 0.94 * u;
      return { ...along(pts, f), tone: (m[4] ?? "lit") as Tone, key: `${gi}-${i}`, o: s.lp || (u > 0 && u < 1) ? 1 : 0 };
    });
  });
  const mv = s.m && pr?.m && pr.m[3] === s.m[3] ? lerp(pr.m[4], s.m[4], e) : s.m?.[4] ?? 0;
  const [nt, ntext] = tn(s.n);
  return (
    <g>
      <Txt x={16} y={26} k="k" anchor="start">
        {nar(s.k, p.narrow)}
      </Txt>
      {wires.map((m, i) => {
        const pts = route(N[m[1]], N[m[3]], m[2]);
        const tone = m[4] as Tone;
        return <Wire key={i} d={`M${pts.map((q) => `${q.x} ${q.y}`).join("L")}`} tone={tone} dash={m[2] === "~"} arrow />;
      })}
      {Object.entries(s.on).map(([id, val]) => {
        const nd = N[id];
        if (!nd) return null;
        const [tone, sub] = tn(val);
        const fresh = pr && !(id in pr.on);
        const sb = sub ? nar(sub, p.narrow) : undefined;
        const thin = nd[3] < 36; // short boxes carry their state inline: "Payment · < 3 s"
        return (
          <Box key={id} x={nd[0]} y={nd[1]} w={nd[2]} h={nd[3]} label={thin && sb ? (nd[4] ? `${nar(nd[4], p.narrow)} · ${sb}` : sb) : nar(nd[4], p.narrow)} sub={thin ? undefined : sb} tone={tone === "dim" ? undefined : tone} dim={tone === "dim"} opacity={fresh ? e : undefined} />
        );
      })}
      {toks.map((k) => (
        <Token key={k.key} x={k.x} y={k.y} s={10} tone={k.tone} opacity={k.o} />
      ))}
      {s.m && (
        <g>
          <Txt x={s.m[0]} y={s.m[1] - 7} k="s" anchor="start">
            {nar(s.m[3], p.narrow)}
          </Txt>
          <Meter x={s.m[0]} y={s.m[1]} w={s.m[2]} h={10} value={mv} max={s.m[5]} tone={s.m[6]} />
        </g>
      )}
      {(s.x ?? []).map(([x, y, text, k, a], i) => {
        const [tone, body] = tn(text);
        return (
          <Txt key={i} x={x} y={y} k={k ?? "s"} anchor={a ?? "start"} tone={tone === "dim" ? "mute" : tone}>
            {nar(body, p.narrow)}
          </Txt>
        );
      })}
      <Txt x={16} y={304} anchor="start" tone={nt === "dim" ? "mute" : nt}>
        {nar(ntext, p.narrow)}
      </Txt>
    </g>
  );
}
/** regroup scenes into tabs: [["scene" | "scene.from.to", ...], id, label] */
const tabs = (V: Vr[], g: [string[], string, string][]): Vr[] =>
  g.map(([specs, id, label]) => ({
    id,
    label,
    s: specs.flatMap((sp) => {
      const [vid, a, b] = sp.split(".");
      const s = V.find((v) => v.id === vid)?.s ?? [];
      return a === undefined ? s : s.slice(Number(a), b === undefined ? undefined : Number(b));
    }),
  }));
const build = (V: Vr[], N: Record<string, Nd>) =>
  defineExplainer({
    w: 600,
    h: 320,
    variants: V.map((v) => ({ id: v.id, label: v.label, steps: v.s.map((s) => ({ caption: s.c, tween: s.tw ?? 1400, ms: s.ms ?? 3800, loop: s.lp })) })),
    Scene: (p: SceneProps) => <Overview V={V} N={N} p={p} />,
  });
/* ---------------------------------------------------------------- this lesson */

const L = (i: number, label: string): Nd => [16 + i * 116, 110, 104, 52, label];
const row = (i: number): Nd => [16, 44 + i * 44, 568, 32, ""];
const N: Record<string, Nd> = {
  br: L(0, "Browser"),
  cdn: L(1, "CDN"),
  gw: L(2, "Gateway|Gate"),
  r: L(3, "Redis"),
  db: L(4, "Postgres|DB"),
  pr: [364, 220, 104, 46, "price:{id}|price"],
  kf: [480, 220, 104, 46, "Kafka"],
  a1: [16, 64, 170, 60, "6,000/s"],
  a2: [215, 64, 170, 60, "600,000/s"],
  a3: [414, 64, 170, 60, "> 99% hits|> 99%"],
  b1: [16, 190, 170, 60, "300 GB"],
  b2: [215, 190, 170, 60, "350 GB"],
  b3: [414, 190, 170, 60, "~300 GB"],
  t0: row(0),
  t1: row(1),
  t2: row(2),
  t3: row(3),
  t4: row(4),
};
const chain = ["br>cdn", "cdn>gw", "gw>r", "r>db"];
const tiers = { br: "", cdn: "", gw: "", r: "", db: "" };

const V: Vr[] = [
  {
    id: "reqs",
    label: "Requirements",
    s: [
      {
        c: "A global product catalog: 50 million products in 10,000 categories, 500 million page views a day, and flash sales that go from normal to 100x in about 30 seconds.",
        k: "phase 1 · requirements",
        on: { t0: "lit:50M products · 10,000 categories|50M products", t1: "lit:500M page views a day|500M views/day", t2: "bad:flash sales: 100x in ~30 s|100x in 30 s", t3: "warn:Deal of the Day: 10% of all traffic|Deal: 10%", t4: "sub-200 ms pages, NA + EU + Asia|< 200 ms global" },
        n: "last Black Friday the site went down|last year: down at midnight",
      },
      {
        c: "Freshness differs by data: metadata can be an hour old, price under 5 seconds for display but current at checkout, inventory under 30 seconds for display and real-time to buy.",
        k: "bounded staleness",
        on: { t0: "metadata · 1 hour OK|metadata · 1 h", t1: "warn:price · < 5 s display, exact at checkout|price · < 5 s", t2: "warn:inventory · < 30 s display, real-time to buy|stock · < 30 s", t3: "personalization · per user, < 100 ms|personal · per user" },
        n: "one cache policy can't fit all of it|no single policy fits",
      },
    ],
  },
  {
    id: "estimate",
    label: "Estimate",
    s: [
      {
        c: "500 million views over 86,400 seconds is about 6,000 requests a second; a 100x flash sale makes 600,000.",
        k: "phase 2 · traffic",
        on: { a1: "average", a2: "bad:flash-sale peak|peak" },
        w: ["a1>a2:bad"],
        n: "60% product pages · 25% search|60% product pages",
      },
      {
        c: "Product data is 50 million times about 6 KB, 300 GB; personalization 100 million users times 3.5 KB, 350 GB. Caching the hot 20% and the daily users needs about 300 GB of Redis.",
        k: "storage and cache size",
        on: { a1: "", a2: "", b1: "product data|products", b2: "personalization|personal", b3: "lit:Redis · 10 × 32 GB|Redis" },
        w: ["a1>a2", "b1>b2", "b2>b3"],
        n: "hot products ~80 GB · users ~200 GB|80 GB + 200 GB + 10 GB",
      },
      {
        c: "The critical insight: at 600,000 requests a second even a 1% miss rate is 6,000 database queries a second, more than it can take. The hit ratio must stay above 99%.",
        k: "the critical insight",
        on: { a1: "", a2: "bad:1% miss = 6,000 q/s|1% = 6K q/s", a3: "ok:required|must" },
        w: ["a1>a2", "a2>a3:ok"],
        n: "ok:survive the peak on cache alone|cache must absorb the peak",
      },
    ],
  },
  {
    id: "arch",
    label: "Architecture",
    s: [
      {
        c: "A product page falls through the tiers: the browser, the CDN edge at 20 ms for anonymous pages, the gateway's auth and rate checks, then product:ABC123 in Redis at 2 ms, and PostgreSQL only on a miss.",
        k: "phase 3 · the request path",
        on: { br: "fresh? done|fresh?", cdn: "ok:20 ms hit|20 ms", gw: "auth · limit|auth", r: "ok:2 ms", db: "on miss" },
        w: chain,
        go: ["br>cdn:lit", "cdn>gw:lit@0.2", "gw>r:lit@0.4"],
        n: "ok:< 50 ms on a hit · < 200 ms on a miss|< 50 ms hit, < 200 ms miss",
        tw: 2200,
      },
      {
        c: "Price is a separate, uncached-at-the-edge call: price:ABC123 in Redis with a 30-second TTL plus event invalidation. Kafka events invalidate the app cache, then the gateway, then the CDN.",
        k: "price path + invalidation",
        on: { ...tiers, pr: "ok:30 s + ev.|30 s", kf: "sky:events" },
        w: chain,
        go: ["gw>pr:lit", "kf>pr:sky"],
        n: "checkout always reads the current price|checkout: current price",
      },
    ],
  },
  {
    id: "deep",
    label: "Deep dives",
    s: [
      {
        c: "Deep dive 1, the herd: at midnight the Deal of the Day key expires under 100,000 refreshes. Coalesce misses, serve stale while revalidating, refresh hot keys in the background, and pre-warm before the sale.",
        k: "deep dive 1 · thundering herd",
        on: { ...tiers, r: "ok:coalesced", db: "ok:1 query" },
        w: chain,
        go: ["cdn>gw:warn*3", "gw>r:warn*3", "r>db:ok@0.5"],
        n: "ok:100,000 refreshes, one query|100K refreshes, 1 query",
      },
      {
        c: "Deep dive 2, invalidation per data type: descriptions on a 1-hour TTL, prices by events within 5 seconds, inventory within 30, images a week. And always in order: app, gateway, CDN.",
        k: "deep dive 2 · invalidation",
        on: { t0: "description · TTL 1 hour|desc · 1 h", t1: "ok:price · event-driven, < 5 s|price · events", t2: "ok:inventory · events, < 30 s|stock · < 30 s", t3: "images · 1 week, purge on change|images · 1 wk", t4: "sky:safety-net TTL on everything|safety-net TTL" },
        n: "events for speed, TTL for safety|events + TTL",
      },
      {
        c: "Deep dive 3, personalization: caching all 100 million users is 350 GB, mostly inactive. Tier users as active, recent or dormant with different TTLs, and write recently viewed through.",
        k: "deep dive 3 · personalization",
        on: { t0: "ok:active · precomputed, short TTL|active", t1: "recent · cached on demand|recent", t2: "dim:dormant · computed when they return|dormant", t3: "ok:recently viewed · write-through|recent views" },
        n: "spend cache on users who are here|cache the active",
      },
      {
        c: "Deep dive 4, the matrix: static assets cached a year everywhere, anonymous pages 60 seconds at browser and CDN, prices and inventory only in Redis, the cart no-store, checkout never cached.",
        k: "deep dive 4 · the cache matrix",
        on: { t0: "ok:static assets · 1 year, immutable|assets · 1 yr", t1: "ok:product page (anon) · 60 s + swr 30 s|page · 60 s", t2: "warn:price, inventory · Redis 30 s only|price · Redis", t3: "warn:recently viewed · private, Redis 1 h|views · private", t4: "bad:cart no-store · checkout real-time|checkout · never" },
        n: "public at the edge, private in Redis|public edge, private Redis",
      },
    ],
  },
  {
    id: "scale",
    label: "Scale + failure",
    s: [
      {
        c: "At 10x the peak is 6 million requests a second, and even 1% misses is 60,000 queries a second, which PostgreSQL won't take: read replicas, PgBouncer, maybe DynamoDB, and 30+ Redis nodes.",
        k: "phase 5 · 10x",
        on: { ...tiers, cdn: "ok:scales out|scales", r: "warn:30+ nodes", db: "bad:60K q/s" },
        w: chain,
        go: ["r>db:bad*3"],
        n: "the database breaks first|database breaks first",
      },
      {
        c: "Redis fails mid-sale: a circuit breaker opens within a second, pages come from a local in-process cache or defaults, flash-sale purchases pause to prevent overselling, and it retries after 30 seconds.",
        k: "edge case · redis down",
        on: { ...tiers, gw: "warn:local cache|local", r: "bad:down", db: "ok:protected" },
        w: ["br>cdn", "cdn>gw", "gw>r:bad"],
        n: "ok:degrade, don't collapse|degrade, don't collapse",
      },
    ],
  },
];

export default build(
  tabs(V, [
    [["reqs", "estimate"], "estimate", "Reqs + estimate"],
    [["arch", "deep.0.2"], "design", "Design"],
    [["deep.2", "scale"], "dives", "Dives + scale"],
  ]),
  N,
);
