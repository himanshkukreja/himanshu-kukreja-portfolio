/**
 * Week 4 preview, the whole lesson: the caching paradox ("just add Redis" vs invalidation, miss
 * storms and stale data), the week's five days on one request path (patterns, invalidation,
 * thundering herd, feeds, tiers), and the Week 3 → Week 4 product-update flow.
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

const N: Record<string, Nd> = {
  u: [16, 124, 88, 52, "Client"],
  cdn: [122, 124, 88, 52, "CDN"],
  gw: [228, 124, 88, 52, "Gateway|Gate"],
  app: [334, 124, 88, 52, "App"],
  r: [452, 40, 132, 52, "Redis"],
  db: [452, 208, 132, 52, "Database|DB"],
  adm: [16, 124, 96, 52, "Admin"],
  odb: [130, 124, 112, 52, "DB+outbox|DB"],
  kf: [260, 124, 88, 52, "Kafka"],
  inv: [362, 124, 116, 52, "Invalidator|Inval."],
  r2: [490, 50, 94, 46, "Redis"],
  c2: [490, 204, 94, 46, "CDN"],
};
const base = ["u>app", "app>r", "app>db"];

const V: Vr[] = [
  {
    id: "paradox",
    label: "The paradox",
    s: [
      {
        c: "Everyone knows the answer: just add Redis, it'll be fast. A hit is served from memory and the database relaxes.",
        k: "\"just add redis\"",
        on: { u: "", app: "", r: "ok:hit", db: "idle" },
        w: ["u>app", "app>db"],
        go: ["app>r:ok*2"],
        n: "ok:fast, until it isn't|fast, until it isn't",
        lp: true,
      },
      {
        c: "The reality starts with two questions. When do you invalidate? Too early wastes the cache, too late serves stale data. What do you cache? Everything explodes memory; nothing gives no benefit.",
        k: "what makes caching hard",
        on: { u: "", app: "", r: "warn:stale?", db: "" },
        w: ["u>app", "app>r:warn", "app>db"],
        n: "when to invalidate, what to cache|when? what?",
      },
      {
        c: "Then misses and consistency: one miss is one database hit, but 10,000 misses crash it. And a user updates a profile, then still sees the old one. Cache strategically, not reflexively.",
        k: "miss storms, stale reads",
        on: { u: "warn:stale", app: "", r: "warn:stale", db: "bad:10K misses" },
        w: ["u>app", "app>r:warn"],
        go: ["app>db:bad*4"],
        n: "cache strategically, not reflexively|strategically, not reflexively",
      },
    ],
  },
  {
    id: "week",
    label: "The week",
    s: [
      {
        c: "Day 1, patterns: cache-aside, read-through, write-through, write-behind. Cache-aside checks Redis, and on a miss reads the database and fills the cache.",
        k: "day 1 · caching patterns",
        on: { u: "", app: "lit:aside", r: "ok:filled", db: "read on miss|on miss" },
        w: ["u>app"],
        go: ["app>r:warn", "app>db:lit", "db>r:ok"],
        n: "only what's needed gets cached|caches only what's read",
        tw: 2000,
      },
      {
        c: "Day 2, invalidation: the cache still shows $99 while the database says $79. TTL, event-driven or versioned keys; in reality, events plus a short TTL as a safety net.",
        k: "day 2 · invalidation",
        on: { u: "warn:sees $99|$99", app: "", r: "bad:$99 (old)|$99", db: "ok:$79" },
        w: base,
        go: ["db>r:lit"],
        n: "hybrid: events + short TTL|events + short TTL",
      },
      {
        c: "Day 3, the thundering herd: the homepage key expires and all 50,000 requests a second hit the database at once. Locks, early expiry, coalescing, background refresh.",
        k: "day 3 · thundering herd",
        on: { u: "50K/s", app: "", r: "bad:expired", db: "bad:10 → 10,000 ms|overloaded" },
        w: ["u>app", "app>r:bad"],
        go: ["app>db:bad*5"],
        n: "bad:one key expired, the site fell over|one key, site down",
      },
      {
        c: "Day 4, feeds: push each post into followers' cached feeds, except for celebrities: 300 million followers would mean 300 million writes for one post, so they are pulled on read.",
        k: "day 4 · feed caching",
        on: { u: "", app: "lit:merge", r: "ok:feed:user", db: "sky:celebs pulled|celebs" },
        w: ["u>app"],
        go: ["app>r:ok", "app>db:sky"],
        n: "push < 10K followers · pull above|push small, pull celebs",
      },
      {
        c: "Day 5, tiers: CDN, then API gateway, then Redis, then the database. What belongs at each layer, and how do you invalidate across all of them?",
        k: "day 5 · multi-tier",
        on: { u: "", cdn: "ok:public", gw: "ok:tokens", app: "", r: "ok:objects", db: "" },
        w: ["u>cdn", "cdn>gw", "gw>app", "app>r", "app>db"],
        go: ["u>cdn:ok", "cdn>gw:ok", "gw>app:ok"],
        n: "the first layer that hits answers|first hit answers",
      },
    ],
  },
  {
    id: "flow",
    label: "Update flow",
    s: [
      {
        c: "Week 3 meets week 4: an admin updates a price, and the update and its event are written to the database and the outbox together.",
        k: "steps 1–2 · outbox",
        on: { adm: "lit:new price|price", odb: "ok:one txn" },
        go: ["adm>odb:lit"],
        n: "guaranteed delivery|guaranteed delivery",
      },
      {
        c: "The event is published to Kafka, and a cache invalidation consumer receives it, like any other consumer group.",
        k: "steps 3–4 · kafka",
        on: { adm: "", odb: "", kf: "sky:event", inv: "lit:consumes" },
        w: ["adm>odb"],
        go: ["odb>kf:sky", "kf>inv:sky"],
        n: "invalidation is just another consumer|another consumer",
      },
      {
        c: "It invalidates the Redis entry and purges the CDN through its API, and the next request reads the fresh price through cache-aside.",
        k: "steps 5–7 · invalidate",
        on: { adm: "", odb: "", kf: "", inv: "", r2: "ok:invalidated|deleted", c2: "ok:purged" },
        w: ["adm>odb", "odb>kf", "kf>inv"],
        go: ["inv>r2:ok", "inv>c2:ok"],
        n: "ok:next request: fresh data|next read: fresh",
      },
    ],
  },
];

export default build(
  tabs(V, [
    [["paradox"], "paradox", "The paradox"],
    [["week"], "week", "The week"],
    [["flow"], "flow", "Update flow"],
  ]),
  N,
);
