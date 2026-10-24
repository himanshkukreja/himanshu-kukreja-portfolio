/**
 * Week 4, day 2, the whole lesson (cache invalidation): the $99 / $79 flash-sale incident, the
 * three strategies (TTL, event-driven, versioned keys), write-invalidate vs write-update and the
 * race, the hybrid safety net and decomposed keys, and the edge cases: invalidating before commit,
 * a herd after invalidation, partial failures.
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
  app: [16, 124, 100, 52, "App"],
  c: [150, 40, 130, 52, "Redis"],
  db: [150, 208, 130, 52, "Database|DB"],
  kf: [320, 208, 100, 52, "Kafka"],
  inv: [320, 40, 130, 52, "Invalidator|Inval."],
  ra: [16, 50, 130, 52, "Request A|Req A"],
  rb: [16, 200, 130, 52, "Request B|Req B"],
  rc: [440, 50, 144, 52, "Redis"],
  rd: [440, 200, 144, 52, "Database|DB"],
  k0: row(0, "product:123|product"),
  k1: row(1, "product_page:123|page"),
  k2: row(2, "category:456|category"),
  k3: row(3, "search:results|search"),
  k4: row(4, "deals:page|deals"),
  t0: row(0, ""),
  t1: row(1, ""),
  t2: row(2, ""),
  t3: row(3, ""),
  t4: row(4, ""),
};
const ev = ["app>db", "db>kf", "kf>inv", "inv>c"];

const V: Vr[] = [
  {
    id: "incident",
    label: "The incident",
    s: [
      {
        c: "10:00 AM, a flash sale: the database price drops from $99 to $79, but the cache still holds $99 with a 1-hour TTL. For an hour users see $99 and are charged $79.",
        k: "monday · 147 tickets",
        on: { app: "warn:shows $99|$99", c: "bad:$99 · TTL 1 h|$99", db: "ok:$79" },
        w: ["app>db"],
        go: ["app>c:bad*2"],
        n: "bad:the cache did exactly what it was told|nobody told the cache",
        lp: true,
      },
      {
        c: "A cache is a copy, and it doesn't know the original changed. Pick two of freshness, simplicity and performance, and match the strategy to how much staleness the data can take.",
        k: "why it's hard",
        on: { t0: "stock prices · < 1 s|stock · < 1 s", t1: "inventory count · < 30 s|stock count · 30 s", t2: "product price · < 5 min|price · < 5 min", t3: "description · hours|text · hours", t4: "static content · days|static · days" },
        n: "staleness tolerance sets the strategy|tolerance sets strategy",
      },
    ],
  },
  {
    id: "strategies",
    label: "Strategies",
    s: [
      {
        c: "Strategy 1, TTL: the entry expires on its own, say after 300 seconds, and stays stale until then. Pick it from staleness: tolerate 5 minutes, times a 0.8 safety factor, set 4.",
        k: "1 · time-to-live",
        on: { app: "", c: "warn:TTL 300 s|300 s", db: "$79" },
        w: ["app>c", "app>db"],
        n: "simple, self-healing, stale up to the TTL|stale up to the TTL",
      },
      {
        c: "Strategy 2, event-driven: update the database, publish product.updated, and an invalidator deletes the key. Fresh in about 100 to 500 ms, but it needs event infrastructure.",
        k: "2 · event-driven",
        on: { app: "", c: "ok:deleted", db: "ok:$79", kf: "sky:updated", inv: "lit:DEL" },
        go: ev.map((w) => `${w}:sky`),
        n: "ok:near real-time, only what changed|~100–500 ms",
        tw: 2200,
      },
      {
        c: "Strategy 3, versioned keys: cache product:123:v5; on a change bump to v6, so reads miss and reload, and the old key just expires. One global version invalidates everything.",
        k: "3 · versioned keys",
        on: { app: "reads v6", c: "ok:key :v6|v6", db: "version 6|v6" },
        w: ["app>db"],
        go: ["app>c:ok"],
        n: "atomic switch, extra storage|atomic switch",
      },
    ],
  },
  {
    id: "race",
    label: "Delete vs update",
    s: [
      {
        c: "Write-update races: A writes $90, B writes $80 and B commits last, so the database holds $80. B sets the cache to $80, then A's slower set lands: the cache says $90.",
        k: "write-update · the race",
        on: { ra: "$90 (slower)|$90", rb: "$80 (last)|$80", rc: "bad:$90 (stale)|$90", rd: "ok:$80" },
        w: ["ra>rd", "rb>rd:ok", "rb>rc"],
        go: ["ra>rc:bad"],
        n: "bad:database $80, cache $90|DB $80, cache $90",
      },
      {
        c: "Write-invalidate just deletes: doing it twice is harmless, and the next read loads $80. That's the default. A reader can still refill an old value, so a TTL or a lease bounds it.",
        k: "write-invalidate · the default",
        on: { ra: "DEL", rb: "DEL", rc: "ok:empty → $80|→ $80", rd: "ok:$80" },
        w: ["ra>rd", "rb>rd:ok"],
        go: ["ra>rc:ok", "rb>rc:ok"],
        n: "ok:delete is idempotent|delete is idempotent",
      },
    ],
  },
  {
    id: "hybrid",
    label: "Hybrid",
    s: [
      {
        c: "The safety net: events invalidate in about 100 ms almost every time, and when an event is lost, a short TTL expires the entry within 5 minutes anyway.",
        k: "events + ttl",
        on: { app: "", c: "ok:TTL 5 min|5 min", db: "", kf: "bad:event lost|lost", inv: "idle" },
        w: ["app>db", "db>kf:bad"],
        x: [[150, 120, "ok:worst case = the TTL|worst case = TTL"]],
        n: "ok:fresh 99% of the time, bounded always|fresh, and bounded",
      },
      {
        c: "Decompose each product so data changes independently: details for 24 hours, price 5 minutes plus events, inventory 30 seconds plus events, reviews 1 hour.",
        k: "decomposed caching",
        on: { t0: "product:123:details · 24 h|details · 24 h", t1: "ok:product:123:price · 5 min + events|price · 5 min+ev", t2: "ok:product:123:inventory · 30 s + events|stock · 30 s+ev", t3: "product:123:reviews · 1 h|reviews · 1 h" },
        n: "a stock change never evicts the description|stock ≠ description",
      },
    ],
  },
  {
    id: "edges",
    label: "Edge cases",
    s: [
      {
        c: "Invalidate inside the transaction and another request reads the old row before commit and caches it again. Always invalidate after the transaction commits.",
        k: "edge case · before commit",
        on: { app: "bad:DEL first", c: "bad:old value|old", db: "warn:not committed|uncommitted" },
        w: ["app>c:bad"],
        go: ["db>c:bad"],
        n: "ok:commit first, then delete|commit, then delete",
      },
      {
        c: "Invalidating a hot key during a flash sale sends 10,000 concurrent requests to the database at once. Popular items need protection: request coalescing, or a soft invalidation refreshed async.",
        k: "edge case · herd after invalidation",
        on: { app: "10,000 req|10K", c: "warn:key deleted|gone", db: "bad:overwhelmed|swamped" },
        w: ["app>c:warn"],
        go: ["app>db:bad*5"],
        n: "tomorrow: thundering herd|see day 3",
      },
      {
        c: "Five keys to invalidate and two time out. Invalidation is idempotent, since deleting a missing key succeeds, so just retry the failures with backoff.",
        k: "edge case · partial failure",
        on: { k0: "ok:DEL ok|ok", k1: "ok:DEL ok|ok", k2: "bad:timeout → retry|retry", k3: "bad:timeout → retry|retry", k4: "ok:DEL ok|ok" },
        n: "ok:default: events + 5 min TTL, delete on change|events + TTL, delete",
      },
    ],
  },
];

export default build(
  tabs(V, [
    [["incident", "strategies"], "strategies", "Strategies"],
    [["race", "hybrid"], "race", "Race + hybrid"],
    [["edges"], "edges", "Edge cases"],
  ]),
  N,
);
