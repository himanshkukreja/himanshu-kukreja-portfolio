/**
 * Week 4, day 3, the whole lesson (thundering herd): the Black Friday expiry, what triggers a herd
 * and its math (1 miss = N queries), the five protections (locking, coalescing, probabilistic early
 * expiration, background refresh, stale-while-revalidate), how to choose and combine them, and the
 * edge cases: a crashed lock holder, coalesced timeouts, failing refreshes.
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

const row = (i: number): Nd => [16, 44 + i * 44, 568, 32, ""];
const N: Record<string, Nd> = {
  rq: [16, 124, 104, 52, "Requests|Reqs"],
  c: [150, 124, 130, 52, "Cache"],
  lk: [316, 124, 104, 52, "Lock"],
  sf: [316, 124, 104, 52, "In-flight|Flight"],
  db: [456, 124, 128, 52, "Database|DB"],
  bg: [316, 30, 104, 46, "Refresher|Job"],
  t0: row(0),
  t1: row(1),
  t2: row(2),
  t3: row(3),
  t4: row(4),
};
const via = (g: string) => ["rq>c", `c>${g}`, `${g}>db`];

const V: Vr[] = [
  {
    id: "herd",
    label: "The herd",
    s: [
      {
        c: "Black Friday, 12:00:00: the homepage TTL expires as 50,000 users refresh. Every request misses, and the database, built for 5,000 queries a second, is down by 12:00:05.",
        k: "12:00:00 · one key expires",
        on: { rq: "bad:50,000", c: "bad:EMPTY", db: "bad:5,000 q/s max|5K q/s" },
        w: ["rq>c:bad"],
        go: ["c>db:bad*5"],
        m: [456, 200, 128, "load|load", 1, 1, "bad"],
        n: "bad:50 ms → 5,000 ms → pool exhausted|site down in 5 s",
      },
      {
        c: "Herds start five ways: a popular key expires, a cold start after a restart, the cache fails, a bulk invalidation, or brand-new viral content that isn't cached yet.",
        k: "what triggers a herd",
        on: { t0: "bad:cache expiration · popular key|expiry", t1: "bad:cold start · empty after restart|cold start", t2: "bad:cache failure · Redis down|cache down", t3: "warn:invalidation storm · sale start|inval. storm", t4: "warn:hot key creation · viral content|viral key" },
        n: "same result: misses arrive together|misses arrive together",
      },
      {
        c: "The math: 10,000 requests a second at 99% hits is 100 misses. If a key with half the traffic expires, that's 5,100 queries against a capacity of 1,000: 5x overload.",
        k: "the amplification factor",
        on: { rq: "10,000/s", c: "warn:hot key gone|hot key", db: "bad:5,100 vs 1,000|5,100" },
        w: ["rq>c"],
        go: ["c>db:bad*4"],
        n: "1 miss = N queries · protected: 1 = 1|1 miss = N queries",
      },
    ],
  },
  {
    id: "protect",
    label: "Protections",
    s: [
      {
        c: "Locking: the first miss takes a lock, queries and fills the cache; the others wait for the lock, then read the cache. One query, but waiters block and poll.",
        k: "1 · locking (mutex)",
        on: { rq: "", c: "warn:miss", lk: "lit:A holds|A", db: "ok:1 query" },
        w: via("lk"),
        go: ["lk>db:ok", "c>lk:warn*3"],
        n: "warn:simple, but waiters add latency|waiters add latency",
      },
      {
        c: "Request coalescing, single flight: concurrent requests join the in-flight fetch and all get its result at the same moment. No polling, lower latency.",
        k: "2 · request coalescing",
        on: { rq: "", c: "ok:refilled", sf: "ok:N joined|joined", db: "ok:1 query" },
        w: via("sf"),
        go: ["sf>db:ok", "sf>c:ok"],
        n: "ok:1000 queries become 1|1000 become 1",
      },
      {
        c: "Probabilistic early expiration: with a 60-second TTL, a request at 55 seconds happens to refresh early, so at 60 seconds the entry is already fresh. No synchronized expiry.",
        k: "3 · probabilistic early expiry",
        on: { rq: "", c: "ok:fresh at T=60|fresh", db: "ok:1 early refresh|1 refresh" },
        w: ["rq>c", "c>db"],
        go: ["c>db:ok"],
        x: [[150, 112, "ok:T=55 s: one request refreshes|T=55: 1 refresh"]],
        n: "jitter spreads refreshes out|spread the refreshes",
      },
      {
        c: "Background refresh: a job refreshes registered keys at 45 seconds, before the 60-second TTL, so users never miss. It needs the keys known in advance.",
        k: "4 · background refresh",
        on: { rq: "ok:always hit|hit", c: "ok:never expires|warm", bg: "lit:every 45 s|45 s", db: "steady" },
        w: ["rq>c:ok"],
        go: ["bg>db:lit", "bg>c:lit"],
        n: "no herd possible, but not for millions of keys|known hot keys only",
      },
      {
        c: "Stale-while-revalidate: past expiry the stale value is served at once while one background refresh runs; the next user gets fresh data. CDNs do this with Cache-Control.",
        k: "5 · stale-while-revalidate",
        on: { rq: "ok:fast", c: "warn:stale, served|stale", bg: "lit:revalidating|refresh", db: "1 query" },
        w: ["rq>c:ok"],
        go: ["c>rq:warn", "bg>db:lit", "bg>c:ok"],
        n: "fast, briefly stale|fast, briefly stale",
      },
    ],
  },
  {
    id: "choose",
    label: "Choosing",
    s: [
      {
        c: "Choose by asking: hot keys known in advance? Background refresh. Stale OK briefly? Stale-while-revalidate. Over 10,000 a second per key? Coalescing, else locking. Distributed? Add probabilistic expiry.",
        k: "decision framework",
        on: { t0: "lit:known hot keys → background refresh|known → background", t1: "lit:stale OK → stale-while-revalidate|stale OK → SWR", t2: "lit:> 10K/s per key → coalescing|> 10K/s → coalesce", t3: "lit:moderate → locking|moderate → lock", t4: "sky:distributed → + probabilistic|+ probabilistic" },
        n: "answer the questions in order|in order",
      },
      {
        c: "In production they combine: the homepage gets background refresh plus stale-while-revalidate, product pages coalescing plus jittered TTLs, user data locking plus a short TTL.",
        k: "combined approach",
        on: { t0: "ok:homepage · background + SWR|home: bg + SWR", t1: "ok:product pages · coalescing + probabilistic|products: coalesce", t2: "ok:user data · locking + short TTL|user: lock + TTL" },
        n: "different keys, different protection|per-key protection",
      },
    ],
  },
  {
    id: "edges",
    label: "Edge cases",
    s: [
      {
        c: "The lock holder crashes, and its waiters wait until the 10-second lock TTL. Add a 5-second wait timeout: then fetch yourself. Some duplicates, but bounded.",
        k: "edge case · lock holder crashes",
        on: { rq: "warn:waiting", c: "", lk: "bad:holder died|died", db: "" },
        w: via("lk"),
        x: [[316, 210, "lock TTL 10 s · wait timeout 5 s|TTL 10 s · wait 5 s"]],
        n: "never wait forever|bounded waits",
      },
      {
        c: "A slow fetch: three coalesced waiters time out at 5 seconds and each starts its own fetch, so 4 queries instead of 1. Shield the shared fetch and fall back to stale data.",
        k: "edge case · coalesced timeout",
        on: { rq: "", c: "warn:stale fallback|stale", sf: "warn:slow fetch|slow", db: "bad:4 queries" },
        w: via("sf"),
        go: ["c>db:bad*3"],
        n: "shield the future, serve stale|shield + serve stale",
      },
      {
        c: "Refreshes keep failing while the database struggles; when the 300-second stale window ends, every request hits it. Extend the stale TTL on failure instead. And warm hot keys when the cluster topology changes.",
        k: "edge case · refresh keeps failing",
        on: { rq: "ok:served stale|stale", c: "ok:stale extended|extended", bg: "bad:failing", db: "warn:struggling" },
        w: ["rq>c:ok", "bg>db:bad"],
        n: "ok:protect the database when it's weakest|protect the weak DB",
      },
    ],
  },
];

export default build(
  tabs(V, [
    [["herd"], "herd", "The herd"],
    [["protect"], "protect", "Protections"],
    [["choose", "edges"], "choose", "Choose + edges"],
  ]),
  N,
);
