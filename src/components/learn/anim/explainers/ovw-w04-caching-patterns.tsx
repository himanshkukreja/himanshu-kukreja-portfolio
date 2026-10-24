/**
 * Week 4, day 1, the whole lesson (caching patterns): the flash sale that sent 50,000 queries/s at
 * a 5,000 q/s database, why a cache helps, the four patterns (cache-aside, read-through,
 * write-through, write-behind), how one store mixes them with different TTLs, and the failure
 * cases: Redis down, a failed invalidation, a cold start.
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

const row = (i: number, label: string): Nd => [16, 44 + i * 44, 568, 32, label];
const N: Record<string, Nd> = {
  u: [16, 124, 92, 52, "User"],
  app: [136, 124, 110, 52, "App"],
  c: [290, 40, 140, 52, "Redis"],
  db: [290, 208, 140, 52, "Database|DB"],
  q: [470, 124, 114, 52, "Queue"],
  h0: row(0, "Product catalog|Catalog"),
  h1: row(1, "Inventory"),
  h2: row(2, "Price"),
  h3: row(3, "Shopping cart|Cart"),
  h4: row(4, "View count|Views"),
};

const V: Vr[] = [
  {
    id: "why",
    label: "Why cache",
    s: [
      {
        c: "Monday, a flash sale: traffic spikes 10x. Every product page makes 5 database queries, so 10,000 requests a second become 50,000 queries against a capacity of 5,000.",
        k: "09:00 · flash sale",
        on: { u: "bad:10,000/s|10K/s", app: "5 queries|×5", db: "bad:50,000 q/s|50K q/s" },
        w: ["u>app"],
        go: ["app>db:bad*5"],
        m: [450, 234, 134, "db load|load", 1, 1, "bad"],
        n: "bad:10x overload: 200 ms → 5,000 ms, site down|10x overload, site down",
      },
      {
        c: "A cache keeps copies in faster storage: Redis answers in 0.5 to 2 ms against 10 to 100 ms for the database, and takes 100,000+ operations a second against 5,000.",
        k: "latency, throughput, cost",
        on: { u: "", app: "", c: "ok:0.5–2 ms", db: "10–100 ms" },
        w: ["u>app", "app>db"],
        go: ["app>c:ok*3"],
        n: "ok:the fridge before the grocery store|fridge before the store",
        lp: true,
      },
    ],
  },
  {
    id: "patterns",
    label: "Four patterns",
    s: [
      {
        c: "Cache-aside, the most common: the app checks the cache; on a miss it queries the database, stores the result, and returns it. If Redis fails, the app still works.",
        k: "1 · cache-aside",
        on: { u: "", app: "lit:manages both|both", c: "ok:stored", db: "on miss" },
        w: ["u>app"],
        go: ["app>c:warn", "app>db:lit", "app>c:ok"],
        n: "only what's used is cached; first read is slow|first read is slow",
        tw: 2000,
      },
      {
        c: "Read-through: the app only talks to the cache, and the cache loads from the database on a miss. Simpler app code, but the cache becomes a critical dependency.",
        k: "2 · read-through",
        on: { u: "", app: "cache only|", c: "lit:loads on miss|loads", db: "" },
        w: ["u>app"],
        go: ["app>c:lit", "c>db:lit"],
        n: "e.g. ORM second-level caches, CDNs|ORM caches, CDNs",
      },
      {
        c: "Write-through: a write goes to the cache, which writes the database synchronously, and succeeds only when both have. Fresh after writes, at a higher write latency.",
        k: "3 · write-through",
        on: { u: "", app: "write", c: "ok:updated", db: "ok:sync write|sync" },
        w: ["u>app"],
        go: ["app>c:lit", "c>db:ok"],
        n: "balances, inventory: stale reads cost money|for critical data",
      },
      {
        c: "Write-behind: the write returns as soon as the cache has it; a background process batches it to the database later. Fastest writes, but lost if the cache dies first.",
        k: "4 · write-behind",
        on: { u: "", app: "ok:returns now|fast", c: "ok:", q: "warn:batched", db: "later" },
        w: ["u>app", "app>c:ok"],
        go: ["c>q:warn*3", "q>db:warn"],
        n: "bad:data-loss risk · use for likes, view counts|loss risk: counters only",
      },
    ],
  },
  {
    id: "choose",
    label: "Choosing",
    s: [
      {
        c: "Real systems mix them. In one store: the catalog is cache-aside, inventory write-through, prices cache-aside with event invalidation, the cart write-through, view counts write-behind.",
        k: "one store, five patterns",
        on: { h0: "sky:cache-aside|aside", h1: "ok:write-through|w-through", h2: "sky:aside + events|+ events", h3: "ok:write-through|w-through", h4: "warn:write-behind|w-behind" },
        n: "match the pattern to the data|pattern per data type",
      },
      {
        c: "TTL follows acceptable staleness: product details 1 hour, prices 5 minutes plus events for flash sales, inventory 30 seconds or no cache. Checkout always reads the database.",
        k: "ttl = acceptable staleness",
        on: { h0: "1 hour", h1: "warn:30 s or skip|30 s", h2: "5 min + events|5 min", h3: "ok:checkout: DB|DB", h4: "approximate|approx." },
        n: "the product page can approximate; checkout can't|checkout reads the DB",
      },
    ],
  },
  {
    id: "fail",
    label: "Failures",
    s: [
      {
        c: "Redis goes down. Without handling, the exception reaches the user as a 500. With a circuit breaker, reads skip the cache and go to the database: slower, but working.",
        k: "edge case · cache down",
        on: { u: "ok:works", app: "warn:breaker open|breaker", c: "bad:down", db: "warn:all reads|all" },
        w: ["u>app", "app>c:bad"],
        go: ["app>db:warn*2"],
        n: "ok:degrade, don't fail|degrade, don't fail",
        lp: true,
      },
      {
        c: "A price drops from $100 to $90 in the database, but the invalidation times out, so the next read gets $100 from the cache. A TTL is the safety net: stale data still expires.",
        k: "edge case · invalidation fails",
        on: { u: "warn:sees $100|$100", app: "", c: "bad:$100 (stale)|$100", db: "ok:$90" },
        w: ["u>app", "app>db:ok", "app>c:bad"],
        n: "TTL = the acceptable staleness window|TTL as safety net",
      },
      {
        c: "After a restart the hit ratio drops from 99% to 0%, so the database goes from 10 to 1,000 requests a second. Warm the top 10,000 products first, about 80% of traffic, and shift traffic in gradually.",
        k: "edge case · cold start",
        on: { u: "1,000/s", app: "", c: "warn:warming", db: "bad:1,000/s" },
        w: ["u>app"],
        go: ["app>db:bad*4", "db>c:ok"],
        m: [450, 234, 134, "hit ratio|hits", 0.1, 1, "warn"],
        n: "warm first · 1% traffic · coalesce|warm, shift, coalesce",
      },
    ],
  },
];

export default build(
  tabs(V, [
    [["why", "patterns"], "patterns", "Four patterns"],
    [["choose", "fail"], "practice", "In practice"],
  ]),
  N,
);
